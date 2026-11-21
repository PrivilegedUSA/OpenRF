"""Opt-in NetworkManager Wi-Fi connection, WSL fallback and loopback API."""
import json
import subprocess
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf import wifi_connect
from openrf.server import create_server
from openrf.storage import Repository


class WifiConnectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.net = self.base / 'net'
        self.net.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def wifi_adapter(self):
        adapter = self.net / 'wlan0'
        adapter.mkdir()
        (adapter / 'phy80211').mkdir()

    def runner(self, args, **kwargs):
        if args[-2:] == ['device', 'status']:
            return subprocess.CompletedProcess(args, 0, 'wlan0:wifi:disconnected:--\n', '')
        if 'wifi' in args and 'list' in args:
            return subprocess.CompletedProcess(args, 0,
                '*:ConnectedWiFi::11:2462:78:WPA2\n'
                ' :OpenCafe::6:2437:62:--\n'
                ' :Corporate::1:2412:97:802.1X\n', '')
        return subprocess.CompletedProcess(args, 0, 'success', '')

    def test_wsl_does_not_claim_windows_wifi_adapter(self):
        report = wifi_connect.wifi_status(net_root=self.net, which=lambda _: '/usr/bin/nmcli')
        self.assertFalse(report['available'])
        self.assertEqual(report['code'], 'no_linux_wifi')
        with self.assertRaises(wifi_connect.WifiConnectionError):
            wifi_connect.list_wifi(net_root=self.net, which=lambda _: '/usr/bin/nmcli', run=self.runner)

    def test_scan_is_explicit_and_excludes_unavailable_enterprise_join(self):
        self.wifi_adapter()
        result = wifi_connect.list_wifi(net_root=self.net, which=lambda _: '/usr/bin/nmcli', run=self.runner)
        self.assertEqual(result['interface'], 'wlan0')
        self.assertEqual([x['ssid'] for x in result['networks']], ['ConnectedWiFi','Corporate','OpenCafe'])
        self.assertTrue(result['networks'][0]['connected'])
        self.assertEqual(result['networks'][1]['security_kind'], 'unsupported')
        self.assertEqual(result['networks'][2]['security_kind'], 'open')

    def test_password_is_never_passed_on_command_line_or_error(self):
        self.wifi_adapter()
        calls = []
        def run(args, **kwargs):
            calls.append((args, kwargs))
            return self.runner(args, **kwargs)
        value = wifi_connect.connect_wifi('PrivateWiFi', 'super-private-password', True,
            net_root=self.net, which=lambda _: '/usr/bin/nmcli', run=run)
        self.assertTrue(value['connected'])
        command, options = calls[-1]
        self.assertNotIn('super-private-password', str(command))
        self.assertNotIn('super-private-password', repr(value))
        self.assertEqual(options['input'], 'super-private-password\n')
        self.assertEqual(command[1:3], ['--ask', '--wait'])
        self.assertNotIn('shell', options)
        with self.assertRaises(wifi_connect.WifiConnectionError) as caught:
            wifi_connect.connect_wifi('PrivateWiFi', 'short', True,
                net_root=self.net, which=lambda _: '/usr/bin/nmcli', run=run)
        self.assertEqual(caught.exception.status, 400)

    def test_explicit_confirmation_and_safe_network_selection(self):
        for ssid in ('', '--help', 'x' * 33):
            with self.assertRaises(wifi_connect.WifiConnectionError):
                wifi_connect.connect_wifi(ssid, '', True, net_root=self.net)
        with self.assertRaises(wifi_connect.WifiConnectionError) as caught:
            wifi_connect.connect_wifi('PrivateWiFi', '12345678', False, net_root=self.net)
        self.assertEqual(caught.exception.code, 'confirmation_required')


class WifiApiTests(unittest.TestCase):
    def test_status_scan_connect_are_loopback_and_explicit(self):
        with tempfile.TemporaryDirectory() as folder:
            server = create_server(Repository(Path(folder) / 'db.sqlite3'), port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                def call(method, path, data=None, headers=None):
                    conn = HTTPConnection('127.0.0.1', server.server_port)
                    extra = {'Content-Type': 'application/json'} if data is not None else {}
                    extra.update(headers or {})
                    conn.request(method, path, json.dumps(data) if data is not None else None, headers=extra)
                    response = conn.getresponse()
                    payload = json.loads(response.read())
                    conn.close()
                    return response.status, payload
                with patch('openrf.server.wifi_status', return_value={'available':False,'connected':False,'reason':'no adapter'}):
                    self.assertEqual(call('GET', '/api/network/wifi/status')[0], 200)
                    self.assertEqual(call('GET', '/api/network/wifi/status?connect=yes')[0], 400)
                code, source = call('GET','/api/health')
                self.assertEqual(code,200)
                self.assertEqual(source['version'],'0.2.160')
                conn = HTTPConnection('127.0.0.1', server.server_port)
                conn.request('GET','/static/wifi-quick.js')
                asset = conn.getresponse()
                self.assertEqual(asset.status,200)
                self.assertIn(b'header-wifi-panel',asset.read())
                conn.close()
                self.assertEqual(call('POST','/api/network/wifi/scan',{})[0],403)
                with patch('openrf.server.list_wifi', return_value={'networks':[]}):
                    self.assertEqual(call('POST','/api/network/wifi/scan',{}, {'X-OpenRF-Wifi-Consent':'scan'})[0],200)
                self.assertEqual(call('POST','/api/network/wifi/connect',
                    {'ssid':'Home','password':'12345678','confirm':True})[0],403)
                with patch('openrf.server.connect_wifi', return_value={'connected':True,'ssid':'Home'}) as join:
                    reply = call('POST','/api/network/wifi/connect',
                        {'ssid':'Home','password':'12345678','confirm':True},
                        {'X-OpenRF-Wifi-Consent':'connect'})
                    self.assertEqual(reply[0],200)
                    self.assertTrue(reply[1]['connected'])
                    join.assert_called_once_with('Home','12345678',True)
            finally:
                server.shutdown(); thread.join(timeout=3); server.server_close()


if __name__ == '__main__':
    unittest.main()
