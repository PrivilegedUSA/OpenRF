import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from openrf.sensor_connections import ScanReceiptStore, browser_survey_location, connections, verified_wifi_observation
from openrf.storage import Repository


FAKE_SCAN = {
    'source': 'NETWORKMANAGER_WIFI', 'interface': 'wlan-test',
    'retrieved_at_utc': '2026-11-10T18:30:00+00:00',
    'freshness': 'UNVERIFIED — may be cached',
    'records': [{'ssid': 'Test AP', 'bssid': 'AB:CD:EF:01:02:03', 'frequency_mhz': 2412,
                 'channel': 1, 'signal_quality_percent': 73, 'security': 'WPA2'}]
}


class ConnectionsTests(unittest.TestCase):
    def test_registry_never_claims_other_sensors_are_implemented(self):
        sensors = connections({'wifi_one_shot': {'possible': False}})
        self.assertEqual(sensors[0]['status'], 'unavailable')
        self.assertEqual(sensors[1]['sensor_id'], 'openrf-serial-v1')
        self.assertEqual(sensors[1]['status'], 'not_connected')
        self.assertTrue(all(x['status'] == 'not_implemented' for x in sensors[2:]))
        self.assertEqual(connections({'wifi_one_shot': {'possible': True, 'interface': 'wlan0'}})[0]['status'], 'ready')

    def test_verified_scan_save_retains_origin_timestamp_and_no_fabricated_rssi(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Repository(Path(temp) / 'private.sqlite3')
            receipts = ScanReceiptStore()
            result = receipts.remember(FAKE_SCAN)
            def save(scan, network):
                record, observed_at = verified_wifi_observation(scan, network,
                        {'latitude': 38.48, 'longitude': -120.62, 'accuracy_m': 25}, None)
                return repo.add_observation(record, observed_at_utc=observed_at)
            item = receipts.take(result['scan_id'], 'AB:CD:EF:01:02:03', save)
            self.assertEqual(item['source'], 'SENSOR')
            self.assertEqual(item['source_device'], 'Linux NetworkManager / wlan-test')
            self.assertEqual(item['observed_at'], FAKE_SCAN['retrieved_at_utc'])
            self.assertIsNone(item['rssi_dbm'])
            self.assertIn('73% quality', item['notes'])
            self.assertIn('browser-reported', item['notes'])
            self.assertEqual(item['latitude'], 38.48)
            with self.assertRaisesRegex(ValueError, 'already saved'):
                receipts.take(result['scan_id'], 'AB:CD:EF:01:02:03', save)
            with self.assertRaisesRegex(ValueError, 'unknown'):
                receipts.take('fabricated', 'AB:CD:EF:01:02:03', save)

    def test_scan_receipts_expire_and_forged_identifiers_rejected(self):
        store = ScanReceiptStore(ttl_seconds=10)
        receipt = store.remember(FAKE_SCAN)
        with self.assertRaisesRegex(ValueError, 'not observed'):
            store.take(receipt['scan_id'], 'AB:CD:EF:12:12:12', lambda *_: True)
        with patch('openrf.sensor_connections.time.monotonic', return_value=store._current.created_monotonic + 11):
            with self.assertRaisesRegex(ValueError, 'expired'):
                store.take(receipt['scan_id'], 'AB:CD:EF:01:02:03', lambda *_: True)

    def test_invalid_browser_coordinate_and_wifi_quality_rejected(self):
        for invalid in [{'latitude': 200, 'longitude': 0, 'accuracy_m': 3},
                        {'latitude': 35, 'longitude': -120, 'accuracy_m': float('nan')},
                        {'latitude': True, 'longitude': 5, 'accuracy_m': 3}]:
            with self.assertRaises(ValueError):
                browser_survey_location(invalid)
        altered = dict(FAKE_SCAN['records'][0], signal_quality_percent='-45dBm')
        with self.assertRaisesRegex(ValueError, 'percent'):
            verified_wifi_observation(FAKE_SCAN, altered, None, None)
