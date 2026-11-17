"""v0.2.95: safe read-only hardware discovery and strictly opt-in RNode config."""
from http.client import HTTPConnection
import json
from pathlib import Path
from unittest.mock import patch
import tempfile
import threading
import unittest

from openrf.reticulum_lan import (LAN_CONFIG, ReticulumError, ReticulumManager,
                                  rnode_config_section, rnode_readiness,
                                  runtime_config, validate_start)
from openrf.server import create_server
from openrf.storage import Repository


PROFILE = {'port': '/dev/ttyUSB0', 'frequency': 915000000, 'bandwidth': 125000,
           'txpower': 7, 'spreadingfactor': 8, 'codingrate': 5}


class RNodeExpansionTests(unittest.TestCase):
    def test_start_defaults_and_explicit_rnode_validation(self):
        self.assertEqual(validate_start({}), {'tcp_enabled': False})
        self.assertEqual(validate_start({'rnode': PROFILE}),
                         {'tcp_enabled': False, 'rnode': PROFILE})
        options = validate_start({'tcp_enabled': True, 'rnode': PROFILE,
                                  'transport_enabled': True})
        self.assertTrue(options['transport_enabled'])
        bad = ({'rnode': {**PROFILE, 'port': '/dev/ttyUSB0\n  enabled = yes'}},
               {'rnode': {**PROFILE, 'port': '/etc/passwd'}},
               {'rnode': {**PROFILE, 'frequency': 868000000}},
               {'rnode': {**PROFILE, 'frequency': True}},
               {'rnode': {**PROFILE, 'bandwidth': 999999}},
               {'rnode': {**PROFILE, 'txpower': 18}},
               {'rnode': {**PROFILE, 'spreadingfactor': 6}},
               {'rnode': {**PROFILE, 'codingrate': 9}},
               {'rnode': {**PROFILE, 'foreign': 1}},
               {'rnode': None},
               {'rnode': PROFILE, 'transport_enabled': 1},
               {'transport_enabled': True})
        for body in bad:
            with self.subTest(body=body), self.assertRaises(ReticulumError):
                validate_start(body)

    def test_optin_settings_do_not_mutate_operator_config(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            existing = runtime_config(root) / 'config'
            existing.write_text(LAN_CONFIG.replace('enable_transport = No',
                                                   'enable_transport = Yes') + '\n[logging]\n  loglevel = 2\n')
            original = existing.read_bytes()
            candidate = runtime_config(root, rnode=PROFILE)
            generated = (candidate / 'config').read_text()
            self.assertEqual(existing.read_bytes(), original)
            self.assertIn('type = RNodeInterface', generated)
            self.assertIn('port = /dev/ttyUSB0', generated)
            self.assertIn('frequency = 915000000', generated)
            self.assertIn('enable_transport = No', generated)
            self.assertLess(generated.index('[[OpenRF Optional USB RNode]]'),
                            generated.index('[logging]'))
            self.assertNotIn('type = TCPServerInterface', generated)
            self.assertEqual((candidate / 'config').stat().st_mode & 0o777, 0o600)
            self.assertEqual(candidate.stat().st_mode & 0o777, 0o700)
            forwarding = (runtime_config(root, rnode=PROFILE, tcp_enabled=True,
                                         transport_enabled=True) / 'config').read_text()
            self.assertIn('enable_transport = Yes', forwarding)
            self.assertIn('type = TCPServerInterface', forwarding)
            self.assertEqual(existing.read_bytes(), original)
            self.assertNotIn('RNodeInterface', existing.read_text())

    def test_readiness_never_claims_firmware_or_halow(self):
        with patch('openrf.reticulum_lan.enumerate_serial_ports', return_value=['ttyUSB0']), \
             patch('openrf.reticulum_lan.serial_port_diagnostics', return_value=[
                 {'path': '/dev/ttyUSB0', 'status': 'ready_to_probe',
                  'identity_verified': False, 'protocol_responding': False}]):
            report = rnode_readiness()
        self.assertFalse(report['rnode_verified'])
        self.assertEqual(report['wifi_halow_status'], 'NOT_VERIFIED')
        self.assertEqual(report['rnode_status'], 'CANDIDATE_PORTS_ONLY')
        self.assertFalse(report['ports'][0]['protocol_responding'])

    def test_api_readiness_is_passive_and_start_requires_dependencies(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            server = create_server(Repository(root / 'openrf.sqlite3'), port=0)
            manager = ReticulumManager(root / 'rnsdata', dependencies_available=lambda: False)
            server.reticulum_manager = manager
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                def call(method, path, value=None):
                    conn = HTTPConnection('127.0.0.1', server.server_address[1], timeout=4)
                    conn.request(method, path, json.dumps(value) if value is not None else None,
                                 {'Content-Type': 'application/json'} if value is not None else {})
                    response = conn.getresponse()
                    status, result = response.status, json.loads(response.read())
                    conn.close()
                    return status, result
                status, data = call('GET', '/api/reticulum/rnode/readiness')
                self.assertEqual(status, 200)
                self.assertFalse(data['rnode_verified'])
                self.assertEqual(data['wifi_halow_status'], 'NOT_VERIFIED')
                self.assertFalse((root / 'rnsdata').exists())
                self.assertEqual(call('POST', '/api/reticulum/start', {'rnode': PROFILE})[0], 503)
                self.assertFalse((root / 'rnsdata').exists())
                self.assertFalse(manager.status()['rnode_requested'])
                with patch.object(server.mesh_manager, 'status', return_value={
                        'port': PROFILE['port'], 'connected': True}):
                    code, result = call('POST', '/api/reticulum/start', {'rnode': PROFILE})
                    self.assertEqual(code, 409)
                    self.assertIn('Meshtastic', result['error'])
                with patch.object(manager, 'status', return_value={
                        'enabled': True, 'rnode_port': PROFILE['port']}):
                    code, result = call('POST', '/api/mesh/connect', {'port': PROFILE['port']})
                    self.assertEqual(code, 409)
                    self.assertIn('Reticulum RNode', result['error'])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)

    def test_section_has_no_arbitrary_lines(self):
        section = rnode_config_section(PROFILE)
        self.assertEqual(section.count('type = RNodeInterface'), 1)
        self.assertEqual(section.count('enabled = yes'), 1)


if __name__ == '__main__':
    unittest.main()
