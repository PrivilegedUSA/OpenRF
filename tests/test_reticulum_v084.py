"""v0.2.85: explicit TCP opt-in and factual Reticulum interface diagnostics."""
import json
from http.client import HTTPConnection
from pathlib import Path
import tempfile
import threading
import unittest

from openrf.reticulum_lan import (LAN_CONFIG, ReticulumError, ReticulumManager,
                                  interface_diagnostics, runtime_config, validate_start)
from openrf.server import create_server
from openrf.storage import Repository


class ReticulumTCPTests(unittest.TestCase):
    def test_tcp_is_off_by_default_and_input_is_strict(self):
        self.assertEqual(validate_start({}), {'tcp_enabled': False})
        self.assertEqual(validate_start({'tcp_enabled': True}), {'tcp_enabled': True})
        for body in (None, [], {'tcp_enabled': 1}, {'tcp_enabled': 'true'},
                     {'tcp_enabled': True, 'host': '0.0.0.0'}, {'port': 4242}):
            with self.subTest(body=body), self.assertRaises(ReticulumError):
                validate_start(body)

    def test_tcp_runtime_never_changes_operator_config_or_key_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            ordinary = runtime_config(root)
            self.assertEqual(ordinary, root / 'rns')
            original = ordinary / 'config'
            self.assertEqual(original.read_text(), LAN_CONFIG)
            self.assertNotIn('TCPServerInterface', original.read_text())
            original.write_text(LAN_CONFIG + '\n[logging]\n  loglevel = 2\n')
            tcp_dir = runtime_config(root, tcp_enabled=True)
            generated = (tcp_dir / 'config').read_text()
            self.assertEqual(original.read_text(), LAN_CONFIG + '\n[logging]\n  loglevel = 2\n')
            self.assertIn('type = TCPServerInterface', generated)
            self.assertIn('listen_port = 4242', generated)
            self.assertLess(generated.index('[[OpenRF Optional TCP Listener]]'),
                            generated.index('[logging]'))
            self.assertEqual((tcp_dir / 'config').stat().st_mode & 0o777, 0o600)
            self.assertEqual(tcp_dir.stat().st_mode & 0o777, 0o700)
            self.assertEqual(runtime_config(root, tcp_enabled=False), ordinary)
            self.assertNotIn('TCPServerInterface', original.read_text())

    def test_missing_interfaces_section_does_not_rewrite_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = runtime_config(root) / 'config'
            source.write_text('[reticulum]\n  enable_transport = No\n')
            with self.assertRaisesRegex(RuntimeError, r'no \[interfaces\]'):
                runtime_config(root, tcp_enabled=True)
            self.assertEqual(source.read_text(), '[reticulum]\n  enable_transport = No\n')

    def test_counter_fidelity_and_unknown_states(self):
        class Good:
            def get_interface_stats(self):
                return {'interfaces': [{'name': 'AutoInterface / LAN', 'status': True,
                                        'peers': 0, 'clients': 2, 'rxb': 32, 'txb': 64},
                                       {'name': 'TCPServer', 'status': None,
                                        'peers': None, 'clients': 0, 'rxb': -1}]}
        result = interface_diagnostics(Good())
        self.assertTrue(result['available'])
        self.assertEqual(result['interfaces'][0]['reachable_peers'], 0)
        self.assertEqual(result['interfaces'][0]['connected_clients'], 2)
        self.assertIsNone(result['interfaces'][1]['reachable_peers'])
        self.assertIsNone(result['interfaces'][1]['rx_bytes'])
        self.assertIsNone(result['interfaces'][1]['up'])

        class Broken:
            def get_interface_stats(self):
                raise RuntimeError('internal secret must not leak')
        unavailable = interface_diagnostics(Broken())
        self.assertFalse(unavailable['available'])
        self.assertNotIn('internal secret', unavailable['note'])

    def test_idle_http_diagnostics_does_not_start_worker(self):
        with tempfile.TemporaryDirectory() as folder:
            repo = Repository(Path(folder) / 'openrf.sqlite3')
            server = create_server(repo, port=0)
            root = Path(folder) / 'reticulum'
            server.reticulum_manager = ReticulumManager(root, dependencies_available=lambda:False)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                conn = HTTPConnection('127.0.0.1', server.server_address[1], timeout=4)
                conn.request('GET', '/api/reticulum/diagnostics')
                response = conn.getresponse()
                body = json.loads(response.read())
                conn.close()
                self.assertEqual(response.status, 200)
                self.assertFalse(body['active'])
                self.assertFalse(body['tcp_requested'])
                self.assertEqual(body['interfaces'], [])
                self.assertFalse(root.exists())
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
