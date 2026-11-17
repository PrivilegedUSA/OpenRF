"""v0.2.102: explicit HaLow host diagnostics without packets or private IDs."""
import json
import subprocess
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.halow_diagnostics import diagnostic_report, HaLowDiagnosticError
from openrf.server import create_server
from openrf.storage import Repository


NOW = datetime(2026, 11, 17, 20, 0, tzinfo=timezone.utc)
FIELDS = ('rx_bytes', 'tx_bytes', 'rx_packets', 'tx_packets',
          'rx_errors', 'tx_errors', 'rx_dropped', 'tx_dropped')


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.net = Path(self.temp.name) / 'net'
        self.net.mkdir()
        self.iface = self.net / 'halow0'
        (self.iface / 'statistics').mkdir(parents=True)
        for name in FIELDS:
            (self.iface / 'statistics' / name).write_text('0\n', encoding='ascii')
        self.readiness = {'candidate_interfaces': [{
            'name': 'halow0', 'driver_hint': 'morse', 'os_operstate': 'up',
            'os_carrier_reported': True, 'ipv6_link_local_present': True,
            'reticulum_opt_in_eligible': True}]}

    def inspect(self, **kwargs):
        options = dict(net_root=self.net, readiness=self.readiness, now=NOW,
                       command_lookup=lambda _: '/usr/bin/iw',
                       runner=lambda *args, **opts: subprocess.CompletedProcess(args, 0, 'Not connected.'))
        options.update(kwargs)
        return diagnostic_report('halow0', **options)

    def test_known_candidate_no_association_all_privacy_and_proof_guards(self):
        result = self.inspect()
        self.assertEqual(result['kind'], 'PASSIVE_WIFI_HALOW_LINK_DIAGNOSTIC')
        self.assertEqual(result['os_association'], 'os_reports_not_associated')
        self.assertTrue(result['read_only'])
        self.assertFalse(result['performs_scan_or_connection'])
        for field in ('rf_link_verified', 'peer_reachability_verified',
                      'ip_transport_verified', 'reticulum_transport_verified'):
            self.assertFalse(result[field], field)
        self.assertEqual(result['kernel_cumulative_counters']['rx_bytes'], '0')
        self.assertIn('Cumulative local', result['kernel_counters_scope'])

    def test_associated_iw_discards_bssid_ssid_frequency_signal_and_ip(self):
        private = 'Connected to aa:bb:cc:dd:ee:ff (on halow0)\n' \
                  '\tSSID: VerySecretNetwork\n\tfreq: 918\n\tsignal: -55 dBm\n' \
                  '\tprivate IP: 10.1.4.2\n'
        args_seen = []

        def fake_run(args, **kw):
            args_seen.append((args, kw))
            return subprocess.CompletedProcess(args, 0, private)

        result = self.inspect(runner=fake_run)
        self.assertEqual(result['os_association'], 'os_reports_associated')
        self.assertEqual(args_seen[0][0], ['/usr/bin/iw', 'dev', 'halow0', 'link'])
        self.assertEqual(args_seen[0][1]['timeout'], 2)
        self.assertFalse(args_seen[0][1]['check'])
        self.assertEqual(args_seen[0][1]['stderr'], subprocess.DEVNULL)
        raw = json.dumps(result)
        for secret in ('aa:bb:cc:dd:ee:ff', 'VerySecretNetwork', '10.1.4.2', '-55'):
            self.assertNotIn(secret, raw)

    def test_missing_tool_timeout_and_unsupported_output(self):
        self.assertEqual(self.inspect(command_lookup=lambda _: None)['os_association'], 'tool_unavailable')

        def timeout(*args, **kwargs):
            raise subprocess.TimeoutExpired(args[0], timeout=2)

        self.assertEqual(self.inspect(runner=timeout)['os_association'], 'timed_out')
        self.assertEqual(self.inspect(runner=lambda args, **kw:
            subprocess.CompletedProcess(args, 1, 'SECRET'))['os_association'], 'unsupported_or_failed')
        self.assertEqual(self.inspect(runner=lambda args, **kw:
            subprocess.CompletedProcess(args, 0, 'SSID: PRIVATE\n'))['os_association'], 'unsupported_or_unknown')

    def test_only_whitelisted_current_candidate_is_inspected(self):
        attempted = []

        def should_not_run(*args, **kwargs):
            attempted.append(args)
            raise AssertionError('Must not reach a command')

        for name in ('', 'lo', 'eth0', 'wlan0', '../bad', 'halow0;touch /tmp/a', 'ha/low', 'a' * 33):
            with self.subTest(name=name), self.assertRaises(HaLowDiagnosticError):
                diagnostic_report(name, net_root=self.net, readiness=self.readiness,
                                  command_lookup=lambda _: '/usr/bin/iw', runner=should_not_run)
        self.assertEqual(attempted, [])
        (self.iface / 'statistics').rename(self.iface / 'old_stats')
        self.iface.rename(self.net / 'removed')
        with self.assertRaisesRegex(HaLowDiagnosticError, 'no longer visible'):
            self.inspect(runner=should_not_run)
        self.assertEqual(attempted, [])

    def test_counters_are_exact_decimal_strings_and_missing_is_null(self):
        values = {'rx_bytes': '18446744073709551615', 'tx_bytes': '-1',
                  'rx_packets': '18446744073709551616', 'tx_errors': 'garbage'}
        for name, value in values.items():
            (self.iface / 'statistics' / name).write_text(value)
        (self.iface / 'statistics' / 'rx_dropped').unlink()
        stats = self.inspect()['kernel_cumulative_counters']
        self.assertEqual(stats['rx_bytes'], values['rx_bytes'])
        for name in ('tx_bytes', 'rx_packets', 'tx_errors', 'rx_dropped'):
            self.assertIsNone(stats[name])
        self.assertEqual(stats['tx_packets'], '0')

    def test_query_endpoint_requires_one_valid_candidate_and_never_writes(self):
        server = create_server(Repository(Path(self.temp.name) / 'openrf.sqlite3'), port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (server.shutdown(), server.server_close(), thread.join(timeout=3)))

        def get(path):
            conn = HTTPConnection('127.0.0.1', server.server_address[1], timeout=4)
            conn.request('GET', path)
            response = conn.getresponse()
            status, body = response.status, json.loads(response.read())
            conn.close()
            return status, body

        with patch('openrf.server.halow_diagnostic_report', return_value=self.inspect()) as mock:
            status, report = get('/api/wifi-halow/diagnostics?interface=halow0')
            self.assertEqual(status, 200)
            self.assertEqual(report['interface'], 'halow0')
            mock.assert_called_once_with('halow0')
            for path in ('/api/wifi-halow/diagnostics',
                         '/api/wifi-halow/diagnostics?interface=',
                         '/api/wifi-halow/diagnostics?interface=halow0&interface=lo',
                         '/api/wifi-halow/diagnostics?interface=halow0&scan=true'):
                self.assertEqual(get(path)[0], 400)
            self.assertEqual(mock.call_count, 1)
        with patch('openrf.server.halow_diagnostic_report', side_effect=HaLowDiagnosticError('Not a candidate', 409)):
            self.assertEqual(get('/api/wifi-halow/diagnostics?interface=wlan0')[0], 409)


if __name__ == '__main__':
    unittest.main()
