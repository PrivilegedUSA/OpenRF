"""Host-side ESP32 protocol fixtures, not physical firmware/USB tests."""
import errno
from datetime import datetime, timezone
import unittest
from unittest.mock import patch
from openrf.drivers.serial_openrf import parse_hello, parse_snapshot, query_port, SerialSensorError


class Esp32FirmwareContractTests(unittest.TestCase):
    def setUp(self):
        self.hello = parse_hello({'type': 'hello', 'protocol': 'openrf.serial.v1',
            'hardware_id': 'esp32s3-00001234abcd', 'label': 'OpenRF ESP32-S3 passive Wi-Fi (experimental)',
            'capabilities': ['WIFI']})

    def test_esp32_wifi_record_parses_as_uncalibrated_dBm(self):
        packet = {'type': 'snapshot', 'protocol': 'openrf.serial.v1',
                  'hardware_id': self.hello['hardware_id'], 'records': [
                      {'kind':'WIFI','identifier':'AA:BB:CC:DD:EE:FF',
                       'label':'ESP32-S3 observed Wi-Fi AP', 'frequency_mhz':2412, 'rssi_dbm':-71}]}
        result = parse_snapshot(packet, self.hello, datetime.now(timezone.utc).isoformat())
        self.assertEqual(result['records'][0]['rssi_dbm'], -71)
        self.assertEqual(result['records'][0]['frequency_mhz'], 2412)
        self.assertIsNone(result['captured_at_utc'])
        self.assertIn('UNKNOWN', result['freshness'])
        self.assertFalse(result['identity_verified'])

    def test_firmware_scan_failure_is_not_empty_measurement(self):
        with self.assertRaisesRegex(SerialSensorError, 'WIFI_SCAN_FAILED'):
            parse_snapshot({'type':'error','protocol':'openrf.serial.v1','code':'WIFI_SCAN_FAILED'}, self.hello,
                           datetime.now(timezone.utc).isoformat())

    def test_unsupported_categories_cannot_appear(self):
        with self.assertRaisesRegex(SerialSensorError, 'negotiated'):
            parse_snapshot({'type':'snapshot','protocol':'openrf.serial.v1',
                'hardware_id':self.hello['hardware_id'], 'records':[
                    {'kind':'BLE','identifier':'x','label':'fake', 'rssi_dbm':-50}]},
                self.hello, datetime.now(timezone.utc).isoformat())

    def test_permission_message_specific(self):
        with patch('openrf.drivers.serial_openrf.os.open', side_effect=PermissionError(errno.EACCES, 'denied')):
            with self.assertRaisesRegex(SerialSensorError, 'group membership'):
                query_port('ttyACM0', ['ttyACM0'])

    def test_unplug_message_specific(self):
        with patch('openrf.drivers.serial_openrf.os.open', side_effect=FileNotFoundError(errno.ENOENT, 'gone')):
            with self.assertRaisesRegex(SerialSensorError, 'disappeared'):
                query_port('ttyACM0', ['ttyACM0'])


if __name__ == '__main__':
    unittest.main()
