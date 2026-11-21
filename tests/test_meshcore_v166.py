"""MeshCore integration tests: fake radio only, no serial probing or RF."""
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import sys

from openrf.meshcore_radio import MeshCoreManager, MeshCoreError, MeshCoreSerialBridge, _contact_rows
from openrf.server import create_server
from openrf.storage import Repository

ALICE = 'a1' * 32
BOB = 'b2' * 32


class FakeBridge:
    opens = 0

    def __init__(self, port, on_message, on_ack, on_link):
        FakeBridge.opens += 1
        self.port = port
        self.message = on_message
        self.ack = on_ack
        self.link = on_link
        self.closed = False
        self.initial = {'contacts': {ALICE: {'public_key': ALICE, 'name': 'Alice', 'type': '1'}},
                        'device': {'model': 'FAKE / TEST ONLY'}}

    def send(self, destination, text):
        if text == 'fail':
            raise RuntimeError('radio rejected')
        if text == 'early ack':
            self.ack({'code': '1234abcd'})
        return '1234abcd'

    def refresh(self):
        return self.initial

    def close(self):
        self.closed = True


class MeshCoreTests(unittest.TestCase):
    def setUp(self):
        FakeBridge.opens = 0
        self.manager = MeshCoreManager(bridge_factory=FakeBridge,
            port_provider=lambda: ['ttyUSB0', 'ttyACM3', 'invalid-port'],
            sdk_available=lambda: True)

    def tearDown(self):
        self.manager.close()

    def test_readiness_never_opens_radio(self):
        ready = self.manager.status()
        self.assertFalse(ready['connected'])
        self.assertEqual(ready['available_serial_ports'], ['/dev/ttyUSB0', '/dev/ttyACM3'])
        self.assertTrue(ready['ports_are_candidates_only'])
        self.assertEqual(self.manager.contacts()['contacts'], [])
        self.assertEqual(self.manager.messages()['messages'], [])
        self.assertEqual(FakeBridge.opens, 0)

    def test_send_ack_matching_and_late_inbox_order(self):
        self.manager.connect({'port': '/dev/ttyUSB0'})
        self.assertEqual(FakeBridge.opens, 1)
        bridge = self.manager._bridge
        with self.assertRaises(MeshCoreError):
            self.manager.send({'destination': BOB, 'text': 'unknown'})
        sent = self.manager.send({'destination': ALICE, 'text': 'Hello'})
        self.assertTrue(sent['submitted_to_radio'])
        self.assertFalse(sent['network_acknowledged'])
        bridge.ack({'code': 'ffffffff'})  # Wrong ACK must never confirm send.
        self.assertEqual(self.manager.messages()['messages'][0]['delivery'],
                         'SUBMITTED_TO_RADIO_NOT_ACKNOWLEDGED')
        bridge.message({'text': 'Hello back', 'pubkey_prefix': ALICE[:12]})
        bridge.ack({'code': bytes.fromhex('1234abcd')})
        rows = self.manager.messages()['messages']
        self.assertEqual([r['direction'] for r in rows], ['OUT', 'IN'])
        self.assertEqual(rows[0]['delivery'], 'NETWORK_ACK_REPORTED_NOT_READ')
        self.assertEqual(self.manager.messages()['receive_sequence'], 1)
        self.assertTrue(rows[1]['matched_radio_contact'])
        self.assertFalse(rows[1]['sender_identity_verified'])
        self.manager.disconnect()
        self.assertTrue(bridge.closed)
        self.assertEqual(len(self.manager.messages()['messages']), 2)

    def test_validation_failed_send_and_early_ack(self):
        for value in ['/dev/ttyS0', '/dev/ttyUSB0/../ttyACM1', '/dev/ttyUSB9999']:
            with self.assertRaises(MeshCoreError):
                self.manager.connect({'port': value})
        self.manager.connect({'port': '/dev/ttyACM3'})
        for payload in [
            {'destination': ALICE, 'text': 'a' * 121},
            {'destination': ALICE, 'text': '\x00'},
            {'destination': ALICE, 'text': ''},
            {'destination': ALICE, 'text': 'fail'},
            {'destination': BOB, 'text': 'Hello'},
        ]:
            with self.assertRaises(MeshCoreError):
                self.manager.send(payload)
        self.assertFalse(self.manager.messages()['messages'])
        sent = self.manager.send({'destination': ALICE, 'text': 'early ack'})
        self.assertTrue(sent['network_acknowledged'])
        self.assertEqual(self.manager.messages()['messages'][0]['delivery'], 'NETWORK_ACK_REPORTED_NOT_READ')
        self.manager._bridge.message({'text': 'Unknown correspondent', 'pubkey_prefix': 'ff' * 6})
        self.assertFalse(self.manager.messages()['messages'][-1]['matched_radio_contact'])
        self.manager._bridge.link('DISCONNECTED')
        self.assertEqual(self.manager.status()['state'], 'LINK_LOST')

    def test_contact_normalization_rejects_partial_keys(self):
        contacts = _contact_rows({bytes.fromhex(ALICE): {'adv_name': 'Alice'},
                                 BOB: {'adv_name': 123}, 'short': {'adv_name': 'fake'}})
        self.assertEqual(set(contacts), {ALICE, BOB})
        self.assertEqual(contacts[BOB]['name'], '')

    def test_real_async_bridge_contract_with_injected_sdk(self):
        """Run the actual event-loop adapter against documented SDK-shaped stubs."""
        types = SimpleNamespace(CONTACT_MSG_RECV='rx', ACK='ack', DISCONNECTED='off',
                                CONTACTS='contacts', DEVICE_INFO='device', MSG_SENT='sent')

        class Commands:
            async def get_contacts(self):
                return SimpleNamespace(type=types.CONTACTS, payload={ALICE:{'adv_name':'Alice'}})

            async def send_device_query(self):
                return SimpleNamespace(type=types.DEVICE_INFO, payload={'model':'FAKE'})

            async def send_msg(self, key, message):
                self.last_send = (key, message)
                return SimpleNamespace(type=types.MSG_SENT,
                                       payload={'expected_ack':bytes.fromhex('1234abcd')})

        class AsyncClient:
            def __init__(self):
                self.callbacks = {}
                self.commands = Commands()
                self.stopped = False
                self.disconnected = False

            @classmethod
            async def create_serial(cls, port):
                client.port = port
                return client

            def subscribe(self, kind, callback):
                self.callbacks[kind] = callback

            async def start_auto_message_fetching(self):
                self.fetching = True

            async def stop_auto_message_fetching(self):
                self.stopped = True

            async def disconnect(self):
                self.disconnected = True

        client = AsyncClient()
        received, acknowledgements = [], []
        with patch.dict(sys.modules, {'meshcore': SimpleNamespace(MeshCore=AsyncClient, EventType=types)}):
            bridge = MeshCoreSerialBridge('/dev/ttyUSB0',received.append,
                                          acknowledgements.append,lambda state:None)
            try:
                self.assertEqual(bridge.initial['device']['model'],'FAKE')
                self.assertIn(ALICE,bridge.initial['contacts'])
                self.assertEqual(bridge.send(ALICE,'Hello'),'1234abcd')

                async def inject():
                    await client.callbacks[types.CONTACT_MSG_RECV](
                        SimpleNamespace(payload={'text':'Reply','pubkey_prefix':ALICE[:12]}))
                    await client.callbacks[types.ACK](
                        SimpleNamespace(payload={'code':'1234abcd'}))

                bridge._call(inject())
                self.assertEqual(received[0]['text'],'Reply')
                self.assertEqual(acknowledgements[0]['code'],'1234abcd')
            finally:
                bridge.close()
        self.assertTrue(client.stopped and client.disconnected)


class MeshCoreHTTPTests(unittest.TestCase):
    def setUp(self):
        FakeBridge.opens = 0
        self.temp = tempfile.TemporaryDirectory()
        self.server = create_server(Repository(Path(self.temp.name) / 'db.sqlite'), port=0)
        self.server.meshcore_manager.close()
        self.server.meshcore_manager = MeshCoreManager(bridge_factory=FakeBridge,
            port_provider=lambda: ['ttyUSB0'], sdk_available=lambda: True)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.temp.cleanup()

    def call(self, method, path, body=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=4)
        headers = {'Host': '127.0.0.1:' + str(self.server.server_port)}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        connection.request(method, path, body=None if body is None else json.dumps(body), headers=headers)
        response = connection.getresponse()
        status, data = response.status, json.loads(response.read())
        connection.close()
        return status, data

    def test_http_explicit_connect_messages_and_disconnect(self):
        self.assertEqual(self.call('GET', '/api/meshcore/status')[0], 200)
        self.assertEqual(FakeBridge.opens, 0)
        self.assertEqual(self.call('POST', '/api/meshcore/send', {'destination':ALICE,'text':'hello'})[0], 409)
        self.assertEqual(self.call('POST', '/api/meshcore/connect', {'port':'/dev/ttyUSB0'})[0], 200)
        self.assertEqual(self.call('GET', '/api/meshcore/contacts')[1]['contacts'][0]['name'], 'Alice')
        self.assertEqual(self.call('POST', '/api/meshcore/send', {'destination':ALICE,'text':'Hi'})[0], 202)
        self.assertEqual(len(self.call('GET', '/api/meshcore/messages')[1]['messages']), 1)
        self.assertEqual(self.call('POST', '/api/meshcore/refresh', {})[0], 200)
        self.assertEqual(self.call('POST', '/api/meshcore/disconnect', {})[0], 200)

    def test_blocks_meshtastic_and_reticulum_claims(self):
        self.server.mesh_manager.status = lambda: {'connected':True, 'state':'CONNECTED', 'port':'/dev/ttyUSB0'}
        code, response = self.call('POST', '/api/meshcore/connect', {'port':'/dev/ttyUSB0'})
        self.assertEqual(code, 409)
        self.assertEqual(response['error_code'], 'meshcore_port_in_use_by_meshtastic')
        self.server.mesh_manager.status = lambda: {'connected':False, 'state':'DISCONNECTED', 'port':None}
        self.server.reticulum_manager.status = lambda: {'enabled':True, 'rnode_ports':['/dev/ttyUSB0']}
        code, response = self.call('POST', '/api/meshcore/connect', {'port':'/dev/ttyUSB0'})
        self.assertEqual(code, 409)
        self.assertEqual(response['error_code'], 'meshcore_port_in_use_by_reticulum')

    def test_running_meshcore_reserves_port_in_both_other_inboxes(self):
        self.assertEqual(self.call('POST', '/api/meshcore/connect', {'port':'/dev/ttyUSB0'})[0], 200)
        code, result = self.call('POST', '/api/mesh/connect', {'port':'/dev/ttyUSB0'})
        self.assertEqual(code, 409)
        self.assertEqual(result['error_code'], 'mesh_port_in_use_by_meshcore')
        code, result = self.call('POST', '/api/reticulum/start',
                                 {'rnode': {'port':'/dev/ttyUSB0'}})
        self.assertEqual(code, 409)
        self.assertEqual(result['error_code'], 'rnode_port_in_use_by_meshcore')
        code, result = self.call('GET', '/api/mesh/connections')
        self.assertEqual(code, 200)
        self.assertEqual(result['meshcore']['port'], '/dev/ttyUSB0')
        self.assertTrue(any(p['owner']=='MESHCORE_USB_SESSION' for p in result['ports']))


if __name__ == '__main__':
    unittest.main()
