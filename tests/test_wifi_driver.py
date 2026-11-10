"""Deterministic native Linux Wi-Fi adapter tests without physical RF hardware."""
import subprocess
import tempfile
import unittest
from pathlib import Path
from openrf.drivers.wifi_nmcli import (WifiScanUnavailable, linux_wifi_interfaces,
                                       parse_wifi_list, scan_once, split_nmcli)


class NativeWifiTests(unittest.TestCase):
    def test_split_nmcli_escapes_embedded_colons(self):
        self.assertEqual(split_nmcli(r'Cafe\: North:AA\:BB\:CC\:DD\:EE\:FF:6:2437 MHz:78:WPA2'),
                         ['Cafe: North', 'AA:BB:CC:DD:EE:FF', '6', '2437 MHz', '78', 'WPA2'])

    def test_parse_quality_is_not_dbm_and_no_coordinates_are_invented(self):
        lines = (r'Cafe\: North:AA\:BB\:CC\:DD\:EE\:FF:6:2437 MHz:78:WPA2' + '\n' +
                 r':AB\:BC\:CD\:DE\:EF\:FA:36:5180 MHz:22:WPA3')
        records = parse_wifi_list(lines)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['ssid'], 'Cafe: North')
        self.assertEqual(records[0]['bssid'], 'AA:BB:CC:DD:EE:FF')
        self.assertEqual(records[0]['signal_quality_percent'], 78)
        self.assertEqual(records[1]['frequency_mhz'], 5180)
        self.assertNotIn('rssi_dbm', str(records))
        self.assertNotIn('latitude', str(records))

    def test_driver_only_uses_visible_linux_wifi_adapter_and_fixed_args(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wlan = root/'wlan0'; wlan.mkdir(); (wlan/'wireless').mkdir()
            (root/'eth0').mkdir()
            observed = []
            def fake_run(args, **kwargs):
                observed.append((args, kwargs))
                return subprocess.CompletedProcess(args, 0, r'MyWifi:AA\:BB\:CC\:DD\:EE\:FF:1:2412 MHz:60:WPA2', '')
            result = scan_once(net_root=root, which=lambda name: '/usr/bin/nmcli', run=fake_run)
            self.assertEqual(result['interface'], 'wlan0')
            self.assertEqual(result['records'][0]['signal_quality_percent'], 60)
            self.assertIn('--rescan', observed[0][0]); self.assertIn('yes', observed[0][0]); self.assertFalse(observed[0][1]['check'])
            self.assertEqual(result['source'], 'NETWORKMANAGER_WIFI')
            self.assertIn('UNVERIFIED', result['freshness'])

    def test_no_hardware_reports_unavailable_without_running_commands(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(WifiScanUnavailable, 'No Linux Wi-Fi interface'):
                scan_once(net_root=Path(tmp), which=lambda _: '/usr/bin/nmcli', run=lambda *a, **kw: self.fail('must not run'))

    def test_networkmanager_failure_is_reported_not_fabricated(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'wlan1'/'wireless').mkdir(parents=True)
            def fake_run(args, **kwargs):
                return subprocess.CompletedProcess(args, 10, '', 'Error: device not managed')
            with self.assertRaisesRegex(WifiScanUnavailable, 'device not managed'):
                scan_once(net_root=root, which=lambda _: '/usr/bin/nmcli', run=fake_run)

if __name__ == '__main__':
    unittest.main()
