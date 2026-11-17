"""v0.2.97: local connection overview has no implicit RF or USB actions."""
import json
from http.client import HTTPConnection
from pathlib import Path
import tempfile
import threading
import unittest

from openrf.mesh_connections import connection_report
from openrf.reticulum_lan import ReticulumError
from openrf.server import create_server
from openrf.storage import Repository


class FakeMesh:
    def __init__(self, connected=False, port=None):
        self.connected,self.port=connected,port
        self.calls=0

    def status(self):
        self.calls+=1
        return {'connected':self.connected,'port':self.port,'sdk_available':True,'mode':'normal'}


class FakeReticulum:
    def __init__(self, enabled=False, ports=None, diagnostics=None):
        self.enabled,self.ports=enabled,ports or []
        self.report=diagnostics
        self.status_calls=0
        self.diagnostics_calls=0

    def status(self):
        self.status_calls+=1
        return {'enabled':self.enabled,'rnode_ports':self.ports,
                'tcp_enabled':False,'transport_forwarding_requested':False,
                'dependencies_available':True}

    def diagnostics(self):
        self.diagnostics_calls+=1
        if isinstance(self.report,Exception):
            raise self.report
        return self.report or {'active':True,'available':False,'interfaces':[]}


class MeshConnectionsTests(unittest.TestCase):
    def test_idle_report_never_calls_worker_or_claims_rf(self):
        mesh=FakeMesh()
        ret=FakeReticulum()
        result=connection_report(mesh,ret,port_inventory=lambda:[
            {'path':'/dev/ttyUSB0','status':'ready_to_probe',
             'usb':{'serial':'must-not-be-exported'}}])
        self.assertEqual(mesh.calls,1)
        self.assertEqual(ret.status_calls,1)
        self.assertEqual(ret.diagnostics_calls,0)
        self.assertFalse(result['meshtastic']['connected'])
        self.assertFalse(result['reticulum']['enabled'])
        self.assertFalse(result['reticulum']['rf_link_verified'])
        self.assertFalse(result['ports'][0]['rnode_firmware_verified'])
        self.assertEqual(result['ports'][0]['owner'],'NOT_CLAIMED_BY_OPENRF')
        self.assertEqual(result['wifi_halow'],'NOT_VERIFIED')
        self.assertNotIn('must-not-be-exported',json.dumps(result))

    def test_two_rnode_claims_and_usb_session_are_distinct(self):
        mesh=FakeMesh(True,'/dev/ttyACM3')
        ret=FakeReticulum(True,['/dev/ttyUSB0','/dev/ttyUSB1'],diagnostics={
            'available':True,'active':True,'interfaces':[
                {'name':'OpenRF Optional USB RNode','up':True,
                 'reachable_peers':0,'rx_bytes':500,'tx_bytes':20}]})
        result=connection_report(mesh,ret,port_inventory=lambda:[
            {'path':'/dev/ttyUSB0','status':'ready_to_probe'},
            {'path':'/dev/ttyACM3','status':'permission_denied'}])
        self.assertEqual(ret.diagnostics_calls,1)
        ownership={item['path']:item['owner'] for item in result['ports']}
        self.assertEqual(ownership['/dev/ttyACM3'],'MESHTASTIC_USB_SESSION')
        self.assertEqual(ownership['/dev/ttyUSB0'],'RETICULUM_RNODE_REQUESTED')
        self.assertEqual(ownership['/dev/ttyUSB1'],'RETICULUM_RNODE_REQUESTED')
        missing=next(item for item in result['ports'] if item['path']=='/dev/ttyUSB1')
        self.assertEqual(missing['linux_status'],'not_visible_in_linux_inventory')
        self.assertEqual(result['reticulum']['interfaces'][0]['local_up'],True)
        self.assertEqual(result['reticulum']['interfaces'][0]['rx_bytes'],500)
        self.assertFalse(result['reticulum']['interfaces'][0]['over_air_link_verified'])

    def test_failed_diagnostics_is_unknown_not_disconnected(self):
        ret=FakeReticulum(True,['/dev/ttyUSB1'],ReticulumError('timeout'))
        result=connection_report(FakeMesh(),ret,port_inventory=lambda:[])
        self.assertTrue(result['reticulum']['enabled'])
        self.assertFalse(result['reticulum']['diagnostics_available'])
        self.assertEqual(result['reticulum']['interfaces'],[])
        self.assertIn('could not be retrieved',result['reticulum']['diagnostics_note'])

    def test_get_endpoint_does_not_start_private_reticulum(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            server=create_server(Repository(root/'openrf.sqlite3'),port=0)
            runner=threading.Thread(target=server.serve_forever,daemon=True)
            runner.start()
            try:
                def fetch(path):
                    conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=3)
                    conn.request('GET',path)
                    response=conn.getresponse()
                    code,payload=response.status,response.read()
                    conn.close()
                    return code,payload
                code,data=fetch('/api/mesh/connections')
                self.assertEqual(code,200)
                report=json.loads(data)
                self.assertFalse(report['reticulum']['enabled'])
                self.assertFalse(report['reticulum']['rf_link_verified'])
                self.assertFalse((root/'reticulum').exists())
                status,script=fetch('/static/mesh_connections.js')
                self.assertEqual(status,200)
                self.assertIn(b'LOCAL',script.upper())
            finally:
                server.shutdown()
                server.server_close()
                runner.join(timeout=3)


if __name__=='__main__':unittest.main()
