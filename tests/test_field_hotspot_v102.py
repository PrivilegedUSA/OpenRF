"""v0.2.103 hotspot: all NetworkManager calls are FAKE; no real radios used."""
import json
import os
import subprocess
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.field_hotspot import HotspotError, HotspotManager
from openrf.server import create_server
from openrf.storage import Repository


GOOD = {'interface': 'wlan0', 'ssid': 'OpenRF-Field',
        'passphrase': 'Strong+Private12345', 'confirm': True}
AVAILABLE = {'interfaces': [
    {'name': 'wlan0', 'classification': 'ordinary_wifi_candidate', 'os_reports_ap_mode': True},
    {'name': 'halow0', 'classification': 'halow_driver_candidate', 'os_reports_ap_mode': True},
]}


class FakeNetworkManager:
    def __init__(self):
        self.calls = []
        self.connection_uuid = ''
        self.profile = None
        self.profile_name = ''
        self.device = 'wlan0'
        self.state = '30 (disconnected)'
        self.fail = None

    def __call__(self, argv, **kwargs):
        self.calls.append(list(argv))
        assert argv[0] == '/usr/bin/nmcli'
        assert kwargs['stderr'] == subprocess.DEVNULL
        assert kwargs['check'] is False
        assert kwargs['timeout'] <= 20
        a = argv[1:]
        if a[:2] == ['-g', 'GENERAL.TYPE']:
            return subprocess.CompletedProcess(argv, 0, 'wifi\n')
        if a[:2] == ['-g', 'GENERAL.STATE']:
            return subprocess.CompletedProcess(argv, 0, self.state+'\n')
        if a[:2] == ['-g', 'GENERAL.CON-UUID']:
            return subprocess.CompletedProcess(argv, 0, self.connection_uuid+'\n')
        if a[:2] == ['-g', 'connection.id']:
            return subprocess.CompletedProcess(argv, 0 if self.profile else 10,
                                               self.profile_name+'\n' if self.profile else '')
        if a[:2] == ['-g', 'connection.interface-name']:
            return subprocess.CompletedProcess(argv, 0 if self.profile else 10,
                                               self.device+'\n' if self.profile else '')
        if a[:2] == ['connection', 'add']:
            self.profile = a[a.index('connection.uuid')+1]
            self.profile_name = a[a.index('con-name')+1]
            self.device = a[a.index('ifname')+1]
            if self.fail == 'add':
                self.profile = None
                return subprocess.CompletedProcess(argv, 1, '')
            return subprocess.CompletedProcess(argv, 0, '')
        if a[:2] == ['connection', 'up']:
            if self.fail == 'up':
                return subprocess.CompletedProcess(argv, 1, '')
            self.connection_uuid = self.profile
            return subprocess.CompletedProcess(argv, 0, '')
        if a[:2] == ['connection', 'down']:
            if self.fail == 'down':
                return subprocess.CompletedProcess(argv, 1, '')
            self.connection_uuid = ''
            return subprocess.CompletedProcess(argv, 0, '')
        if a[:2] == ['connection', 'delete']:
            if self.fail == 'delete':
                return subprocess.CompletedProcess(argv, 1, '')
            self.profile = None
            return subprocess.CompletedProcess(argv, 0, '')
        raise AssertionError(f'Unexpected NetworkManager command: {a}')


class HotspotUnitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.fake = FakeNetworkManager()
        self.manager = HotspotManager(Path(self.temp.name)/'private',
            inventory=lambda: AVAILABLE,
            command_lookup=lambda name: '/usr/bin/nmcli' if name == 'nmcli' else None,
            runner=self.fake)

    def test_passive_status_and_explicit_WPA2_hotspot_lifecycle(self):
        first = self.manager.status()
        self.assertFalse(first['managed_profile_present'])
        self.assertFalse(first['active_on_adapter'])
        self.assertEqual(first['eligible_idle_status_not_verified'], ['wlan0'])
        self.assertEqual(self.fake.calls, [])
        data = self.manager.start(GOOD)
        self.assertTrue(data['managed_profile_present'])
        self.assertTrue(data['active_on_adapter'])
        self.assertEqual(data['interface'], 'wlan0')
        self.assertFalse(data['openrf_http_api_exposed_to_lan'])
        self.assertNotIn('Strong+Private12345', json.dumps(data))
        raw = self.manager.state_file.read_text()
        self.assertNotIn('Strong+Private12345', raw)
        self.assertEqual(os.stat(self.manager.state_file).st_mode & 0o777, 0o600)
        add = next(c for c in self.fake.calls if c[1:3] == ['connection','add'])
        self.assertEqual(add[add.index('wifi-sec.key-mgmt')+1], 'wpa-psk')
        self.assertEqual(add[add.index('wifi-sec.proto')+1], 'rsn')
        self.assertEqual(add[add.index('connection.autoconnect')+1], 'no')
        self.assertEqual(add[add.index('802-11-wireless.mode')+1], 'ap')
        self.assertEqual(add[add.index('ipv4.method')+1], 'shared')
        self.assertEqual(add[add.index('ipv6.method')+1], 'link-local')
        self.assertFalse(any('hotspot' in part or 'wep' in part for part in add))
        stopped = self.manager.stop({'confirm':True})
        self.assertFalse(stopped['managed_profile_present'])
        self.assertFalse(self.manager.state_file.exists())
        self.assertIsNone(self.fake.profile)
        self.assertFalse(self.fake.connection_uuid)

    def test_rejects_bad_requests_before_any_network_change(self):
        for body in ({}, {**GOOD, 'confirm':False}, {**GOOD, 'interface':'halow0'},
                     {**GOOD, 'interface':'wlan0;sh'}, {**GOOD, 'ssid':'*'},
                     {**GOOD, 'passphrase':'123'}, {**GOOD, 'passphrase':'å'*20},
                     {**GOOD, 'spare': 1}):
            with self.subTest(body=str(body)[:70]), self.assertRaises(HotspotError):
                self.manager.start(body)
        self.assertEqual(self.fake.calls, [])
        with self.assertRaises(HotspotError):
            self.manager.stop({})

    def test_occupied_adapter_is_never_disconnected(self):
        self.fake.state = '100 (connected)'
        with self.assertRaisesRegex(HotspotError, 'not idle'):
            self.manager.start(GOOD)
        self.assertFalse(any(c[1:3] == ['connection','add'] for c in self.fake.calls))
        self.assertFalse(any(c[1:3] == ['connection','down'] for c in self.fake.calls))

    def test_recovery_after_failed_start_and_manual_stop(self):
        self.fake.fail = 'up'
        with self.assertRaises(HotspotError):
            self.manager.start(GOOD)
        self.assertFalse(self.manager.state_file.exists())
        self.assertIsNone(self.fake.profile)
        self.fake.fail = None
        self.manager.start(GOOD)
        self.fake.fail = 'down'
        with self.assertRaises(HotspotError):
            self.manager.stop({'confirm':True})
        self.assertTrue(self.manager.state_file.exists())
        self.fake.fail = None
        self.manager.stop({'confirm':True})
        self.assertFalse(self.manager.state_file.exists())

    def test_never_deletes_changed_profile_ownership(self):
        self.manager.start(GOOD)
        self.fake.profile_name = 'My personal connection'
        with self.assertRaisesRegex(HotspotError, 'different connection'):
            self.manager.stop({'confirm':True})
        self.assertTrue(self.manager.state_file.exists())
        self.assertTrue(self.fake.profile)
        self.assertFalse(any(c[1:3]==['connection','delete'] for c in self.fake.calls))

    def test_persisted_owner_recovers_after_new_manager_instance(self):
        self.manager.start(GOOD)
        recovered = HotspotManager(self.manager.state_dir, inventory=lambda: AVAILABLE,
            command_lookup=lambda _: '/usr/bin/nmcli', runner=self.fake)
        self.assertTrue(recovered.status()['active_on_adapter'])
        recovered.stop({'confirm':True})
        self.assertIsNone(self.fake.profile)

    def test_symlink_state_refused(self):
        path = self.manager.state_file
        path.parent.mkdir()
        path.symlink_to(Path(self.temp.name)/'unrelated')
        with self.assertRaises(HotspotError):
            self.manager.start(GOOD)
        self.assertEqual(self.fake.calls, [])


class HotspotHTTPTests(unittest.TestCase):
    def test_loopback_endpoints_require_explicit_confirmation(self):
        with tempfile.TemporaryDirectory() as folder:
            server=create_server(Repository(Path(folder)/'test.sqlite3'), port=0)
            fake=FakeNetworkManager()
            server.hotspot_manager = HotspotManager(Path(folder)/'private',
                inventory=lambda: AVAILABLE, command_lookup=lambda _: '/usr/bin/nmcli',
                runner=fake)
            worker=threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            port=server.server_address[1]
            def call(method,path,body=None,headers=None):
                conn=HTTPConnection('127.0.0.1',port,timeout=4)
                hdr={'Host':f'127.0.0.1:{port}',**(headers or {})}
                raw=json.dumps(body) if body is not None else None
                if raw is not None:hdr['Content-Type']='application/json'
                conn.request(method,path,body=raw,headers=hdr)
                reply=conn.getresponse()
                data=reply.read()
                conn.close()
                return reply.status,json.loads(data) if path.startswith('/api/') else data
            try:
                self.assertEqual(call('GET','/api/network/hotspot/status')[0],200)
                self.assertEqual(call('GET','/api/network/hotspot/status?start=true')[0],400)
                self.assertEqual(call('POST','/api/network/hotspot/start',{**GOOD,'confirm':False})[0],400)
                self.assertEqual(call('POST','/api/network/hotspot/start',GOOD,
                    headers={'Origin':'http://evil.test'})[0],403)
                self.assertEqual(call('GET','/static/field_hotspot.js')[0],200)
                self.assertEqual(fake.calls, [])
                started=call('POST','/api/network/hotspot/start',GOOD)
                self.assertEqual(started[0],200)
                self.assertTrue(started[1]['active_on_adapter'])
                self.assertEqual(call('POST','/api/network/hotspot/stop',{})[0],400)
                stopped=call('POST','/api/network/hotspot/stop',{'confirm':True})
                self.assertEqual(stopped[0],200)
                self.assertFalse(stopped[1]['managed_profile_present'])
                self.assertEqual(call('POST','/api/network/hotspot/start',GOOD)[0],200)
            finally:
                server.shutdown();server.server_close();worker.join(timeout=3)
            self.assertIsNone(fake.profile, 'Clean server shutdown removes owned hotspot profile')


if __name__ == '__main__':
    unittest.main()
