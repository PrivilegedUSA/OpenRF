"""Tests for conservative, read-only host inventory behavior."""
import tempfile
import unittest
from pathlib import Path
from openrf.hardware import enumerate_usb_devices, enumerate_serial_ports, status_report


class HardwareInventoryTests(unittest.TestCase):
    def test_usb_enumeration_excludes_serial_numbers_and_invalid_descriptors(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            valid = root / '1-2'; valid.mkdir()
            (valid / 'idVendor').write_text('0bda\n')
            (valid / 'idProduct').write_text('2838\n')
            (valid / 'manufacturer').write_text('Example vendor')
            (valid / 'product').write_text('Example USB receiver')
            (valid / 'serial').write_text('PRIVATE-USB-SERIAL')
            bad = root / '1-3'; bad.mkdir()
            (bad / 'idVendor').write_text('incorrect')
            (bad / 'idProduct').write_text('1234')
            items = enumerate_usb_devices(root)
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]['vendor_id'], '0bda')
            self.assertNotIn('serial', items[0])
            self.assertNotIn('PRIVATE-USB-SERIAL', str(items))

    def test_only_usb_serial_endpoints_are_listed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ('ttyUSB0', 'ttyACM2', 'ttyS0', 'ttyUSB-no', 'notes'):
                (root/name).touch()
            self.assertEqual(enumerate_serial_ports(root), ['ttyACM2', 'ttyUSB0'])

    def test_inventory_never_reports_active_rf_scan(self):
        report = status_report()
        self.assertFalse(any(cap['status'] == 'ready' for cap in report['capabilities']))
        self.assertIn('No continuous RF capture is active', report['scan_status'])
        self.assertIn('usb_devices', report)
        self.assertIn('network_details', report)
        self.assertIn('inventory_collected_utc', report)
