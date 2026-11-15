"""Offline mesh integration contracts: synthetic adapter, never RF transmission."""
from __future__ import annotations

from http.client import HTTPConnection
import json
from pathlib import Path
import tempfile
import threading
import unittest

from openrf.mesh import MeshError, MeshManager, validate_port, validate_send
from openrf.server import create_server
from openrf.storage import Repository


class FakeBridge:
    connections = []

    def __init__(self, port, on_text):
        self.port, self.on_text = port, on_text
        self.sent, self.closed = [], False
        FakeBridge.connections.append(self)

    def send(self, text, destination, channel):
        self.sent.append((text, destination, channel))
        return 7782

    def close(self):
        self.closed = True


def fake_manager():
    return MeshManager(bridge_factory=FakeBridge, port_provider=lambda: ['ttyUSB2', 'ttyACM3'],
                       sdk_available=lambda: True)


class MeshValidationTests(unittest.TestCase):
    def test_strict_port_and_message_validation(self):
        self.assertEqual(validate_port('/dev/ttyUSB2'), '/dev/ttyUSB2')
        for value in ('ttyUSB2', '/dev/ttyUSB2/../passwd', '/dev/ttyS0', '/tmp/ttyACM0',
                      '/dev/ttyUSB9999', '', None, 42):
            with self.subTest(value=value), self.assertRaises(MeshError):
                validate_port(value)
        good={'text':'Hi 🛰', 'destination':'!abcdef12','channel':1}
        self.assertEqual(validate_send(good),good)
        for invalid in ({'text':'', 'destination':'^all', 'channel':0},
                        {'text':'💠'*50, 'destination':'^all', 'channel':0},
                        {'text':'hi\x00', 'destination':'^all','channel':0},
                        {'text':'hello','destination':'invalid','channel':0},
                        {'text':'hello','destination':'^all','channel':8},
                        {'text':'hello','destination':'^all','channel':False},
                        {'text':'hello','destination':'^all','channel':0,'retransmit':True}):
            with self.subTest(invalid=invalid), self.assertRaises(MeshError):
                validate_send(invalid)

    def test_unconnected_send_relay_only_and_receive_provenance(self):
        manager=fake_manager()
        self.assertFalse(manager.status()['connected'])
        self.assertFalse(manager.status()['device_role_modified'])
        self.assertEqual(manager.status()['available_serial_ports'],['/dev/ttyUSB2','/dev/ttyACM3'])
        self.assertEqual(manager.messages()['messages'],[])
        payload={'text':'A test','destination':'^all','channel':0}
        with self.assertRaises(MeshError):manager.send(payload)
        with self.assertRaises(MeshError):manager.connect({'port':'/dev/ttyUSB99'})
        connected=manager.connect({'port':'/dev/ttyUSB2'})
        self.assertEqual(connected['delivery'],'HARDWARE_LINK_ESTABLISHED_NOT_RF_VERIFIED')
        self.assertEqual(manager.status()['rebroadcast_owner'],'MESHTASTIC_FIRMWARE')
        b=FakeBridge.connections[-1]
        b.on_text({'fromId':'!aabbccdd','decoded':{'text':'real decoded text'},'channel':0,
                   'position':{'latitudeI':123456789}})
        self.assertEqual(manager.messages()['messages'][0]['source'],'MESHTASTIC_RADIO')
        self.assertNotIn('position',str(manager.messages()))
        manager.set_mode({'mode':'relay_only'})
        self.assertTrue(manager.status()['connected'])
        with self.assertRaises(MeshError) as ctx:manager.send(payload)
        self.assertEqual(ctx.exception.code,'mesh_relay_only')
        self.assertEqual(b.sent,[])
        self.assertFalse(manager.set_mode({'mode':'normal'})['device_role_modified'])
        receipt=manager.send(payload)
        self.assertTrue(receipt['submitted_to_radio'])
        self.assertFalse(receipt['delivered_to_destination'])
        self.assertEqual(b.sent,[('A test','^all',0)])
        self.assertEqual(manager.messages()['messages'][-1]['delivery'],'SUBMITTED_TO_RADIO_NOT_DELIVERED')
        manager.disconnect()
        self.assertTrue(b.closed)
        self.assertEqual(manager.messages()['messages'],[])
        b.on_text({'fromId':'!aabbccdd','decoded':{'text':'late'}})
        self.assertEqual(manager.messages()['messages'],[])
        manager.close()
        with self.assertRaises(MeshError):manager.connect({'port':'/dev/ttyUSB2'})

    def test_bounded_memory_only_inbox_and_bad_packets(self):
        m=fake_manager();m.connect({'port':'/dev/ttyACM3'})
        bridge=FakeBridge.connections[-1]
        for bad in ({'decoded':{'payload':'hi'}},
                    {'decoded':{'text':'x'*1100}}, {'decoded':None},
                    {'decoded':{'text':3}}, 'no packet'):
            bridge.on_text(bad)
        self.assertEqual(m.messages()['messages'],[])
        for i in range(121):
            bridge.on_text({'decoded':{'text':f'hello {i}'},'fromId':'!abcdef12'})
        self.assertEqual(len(m.messages()['messages']),100)
        self.assertEqual(m.messages()['messages'][0]['text'],'hello 21')
        m.close()


class MeshApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.repo=Repository(Path(self.temp.name)/'openrf.sqlite3')
        self.server=create_server(self.repo,port=0)
        self.server.mesh_manager=fake_manager()
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)
        self.temp.cleanup()

    def call(self,method,path,payload=None,origin=None):
        port=self.server.server_address[1]
        conn=HTTPConnection('127.0.0.1',port,timeout=4)
        body=json.dumps(payload) if payload is not None else None
        headers={'Host':f'localhost:{port}'}
        if body is not None:headers['Content-Type']='application/json'
        if origin:headers['Origin']=origin
        conn.request(method,path,body,headers)
        response=conn.getresponse();data=response.read();status=response.status;conn.close()
        return status,json.loads(data) if data and response.getheader('Content-Type','').startswith('application/json') else data

    def test_explicit_link_required_and_same_origin(self):
        for resource in ('/static/navigation_health.js','/static/mesh.js'):
            status,content=self.call('GET',resource)
            self.assertEqual(status,200)
            self.assertTrue(content)
        status,info=self.call('GET','/api/mesh/status')
        self.assertEqual(status,200);self.assertFalse(info['connected'])
        self.assertEqual(self.call('GET','/api/mesh/messages')[1]['messages'],[])
        data={'text':'Hello','destination':'^all','channel':0}
        code,error=self.call('POST','/api/mesh/send',data)
        self.assertEqual(code,409);self.assertEqual(error['error_code'],'mesh_disconnected')
        self.assertEqual(self.call('POST','/api/mesh/connect',{'port':'/dev/ttyUSB2'},origin='https://example.com')[0],403)
        self.assertEqual(self.call('POST','/api/mesh/connect',{'port':'/dev/ttyUSB2'})[0],200)
        self.assertEqual(self.call('POST','/api/mesh/mode',{'mode':'relay_only'})[0],200)
        self.assertEqual(self.call('POST','/api/mesh/send',data)[0],409)
        self.assertEqual(self.call('POST','/api/mesh/mode',{'mode':'normal'})[0],200)
        code,result=self.call('POST','/api/mesh/send',data)
        self.assertEqual(code,202);self.assertFalse(result['delivered_to_destination'])
        self.assertEqual(self.call('GET','/api/mesh/messages')[1]['messages'][-1]['source'],'LOCAL_OPERATOR')
        status,result=self.call('POST','/api/mesh/disconnect',{})
        self.assertEqual(status,200);self.assertTrue(result['messages_cleared'])
        self.assertEqual(self.call('GET','/api/mesh/messages')[1]['messages'],[])


if __name__=='__main__':
    unittest.main()
