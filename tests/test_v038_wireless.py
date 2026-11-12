"""v0.2.38: real-source Wi-Fi metadata and read-only BLE readiness boundaries."""
import subprocess
import tempfile
import unittest
from pathlib import Path

from openrf.drivers.ble_readiness import controllers, readiness
from openrf.drivers.wifi_nmcli import parse_wifi_list, frequency_band, scan_once
from openrf.sensor_connections import connections, verified_wifi_observation


class WifiMetadataTests(unittest.TestCase):
    def test_frequency_bands_from_reported_mhz_not_inferred_capability(self):
        self.assertEqual(frequency_band(2437), '2.4 GHz')
        self.assertEqual(frequency_band(5180), '5 GHz')
        self.assertEqual(frequency_band(5975), '6 GHz')
        self.assertEqual(frequency_band(58320), '60 GHz')
        self.assertEqual(frequency_band(None), 'Unknown')
        self.assertEqual(frequency_band(12345), 'Other')

    def test_nmc_fields_and_advertised_rate_are_not_throughput(self):
        data = r'Cafe\: West:AA\:BB\:CC\:DD\:EE\:FF:149:5745 MHz:81:WPA2:Infra:540 Mbit/s'
        rows = parse_wifi_list(data)
        self.assertEqual(len(rows), 1)
        ap = rows[0]
        self.assertEqual(ap['band'], '5 GHz')
        self.assertEqual(ap['frequency_mhz'], 5745)
        self.assertEqual(ap['mode'], 'Infra')
        self.assertEqual(ap['advertised_rate'], '540 Mbit/s')
        self.assertEqual(ap['signal_quality_percent'], 81)
        self.assertNotIn('rssi_dbm', ap)
        self.assertNotIn('latitude', ap)
        scan = {'interface': 'wlan0', 'retrieved_at_utc': '2026-11-12T20:30:00+00:00'}
        record, _ = verified_wifi_observation(scan, ap, None, None)
        self.assertIsNone(record['rssi_dbm'])
        self.assertIn('Band 5 GHz', record['notes'])
        self.assertIn('SIGNAL 81% quality (NOT RSSI dBm)', record['notes'])

    def test_actual_driver_requests_mode_rate_without_shell_or_fake_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'wlan5'/'wireless').mkdir(parents=True)
            seen = []
            def fake_run(args, **kwargs):
                seen.append((args, kwargs))
                return subprocess.CompletedProcess(args, 0, r'SS:AA\:BB\:CC\:DD\:EE\:FF:6:2437 MHz:63:WPA2:Infra:144 Mbit/s', '')
            report = scan_once(net_root=root, which=lambda n:'/usr/bin/nmcli', run=fake_run)
            self.assertEqual(report['records'][0]['band'], '2.4 GHz')
            self.assertIn('MODE,RATE', seen[0][0][5])
            self.assertFalse(seen[0][1]['check'])
            self.assertNotIn('RSSI in dBm', report['measurement'].split('NOT ')[0])


class BleInventoryTests(unittest.TestCase):
    def test_no_adapter_never_triggers_bluetoothctl_and_never_scans(self):
        with tempfile.TemporaryDirectory() as tmp:
            obj=readiness(root=Path(tmp), which=lambda _: '/usr/bin/bluetoothctl',
                         run=lambda *args,**kw: self.fail('should not call BlueZ without adapter'))
        self.assertEqual(obj['controller_count'], 0)
        self.assertFalse(obj['scan_active'])
        self.assertFalse(obj['scan_supported'])
        self.assertEqual(obj['daemon'], 'not_checked')
        self.assertNotIn('bluetooth scan', str(obj).lower())

    def test_controller_visible_is_not_ble_scan_support(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'hci0').mkdir(); (root/'hci1').mkdir(); (root/'other').mkdir()
            self.assertEqual(controllers(root), ['hci0', 'hci1'])
            seen = []
            def fake_run(args, **kwargs):
                seen.append(args)
                return subprocess.CompletedProcess(args, 0, 'Controller 00:11:22:33:44:55', '')
            obj=readiness(root=root, which=lambda _: '/usr/bin/bluetoothctl',run=fake_run)
            self.assertEqual(obj['status'], 'controller_detected_unverified')
            self.assertEqual(obj['daemon'], 'responding')
            self.assertFalse(obj['scan_active'])
            self.assertFalse(obj['scan_supported'])
            self.assertEqual(seen[0][3], 'list')
            # No BLE addresses returned by readiness API despite BlueZ's listing.
            self.assertNotIn('00:11:22:33:44:55', str(obj))
            registry=connections({'bluetooth_readiness':obj})
            self.assertEqual(registry[2]['status'], 'not_implemented')
            self.assertIn('2', registry[2]['description'])

if __name__=='__main__': unittest.main()
