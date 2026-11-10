"""v0.2.6 regression tests: upgrade, provenance, atomic capture, receipts, API."""
import csv
import io
import json
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.sensor_connections import (ScanReceiptStore, browser_location_details,
                                       verified_wifi_observation)
from openrf.server import create_server
from openrf.storage import Repository, to_csv, to_geojson


def sample_scan(records=None):
    if records is None:
        records = [
            {'ssid': 'Test access point', 'bssid': 'A1:B2:C3:11:22:33',
             'frequency_mhz': 2412, 'channel': 1, 'signal_quality_percent': 76,
             'security': 'WPA2'},
            {'ssid': 'Second access point', 'bssid': 'D1:E2:F3:44:55:66',
             'frequency_mhz': 5180, 'channel': 36, 'signal_quality_percent': 42,
             'security': 'WPA3'},
        ]
    return {'source': 'NETWORKMANAGER_WIFI', 'interface': 'wlan-test',
            'retrieved_at_utc': '2026-11-10T21:00:00+00:00',
            'freshness': 'UNVERIFIED — cached results possible', 'records': records}


def save_capture(repo, scan, rows, session=None, location=None):
    trusted = [verified_wifi_observation(scan, row, location, session) for row in rows]
    return repo.store_wifi_capture(scan, trusted, session, browser_location_details(location))


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'survey.sqlite3'
        self.repo = Repository(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_automatic_additive_upgrade_preserves_old_observations(self):
        original = self.repo.add_observation({'kind': 'MANUAL', 'label': 'Preexisting field note',
                                              'latitude': 38.5, 'longitude': -120.5})
        # Emulate an existing v0.2.5 database: remove only v0.2.6 additions.
        with self.repo._connect() as db:
            db.execute('PRAGMA foreign_keys=OFF')
            db.execute('DROP INDEX idx_observations_capture')
            db.execute('DROP TABLE survey_captures')
            db.execute('ALTER TABLE observations DROP COLUMN signal_quality_percent')
            db.execute('ALTER TABLE observations DROP COLUMN survey_capture_id')
            db.execute('ALTER TABLE observations DROP COLUMN location_source')
            db.execute('ALTER TABLE observations DROP COLUMN fix_age_seconds')
        restored = Repository(self.path)
        self.assertEqual(restored.get_observation(original['id'])['label'], 'Preexisting field note')
        self.assertEqual(restored.get_observation(original['id'])['latitude'], 38.5)
        self.assertEqual(restored.captures(), [])
        self.assertIsNone(restored.get_observation(original['id'])['signal_quality_percent'])
        self.assertEqual(Repository(self.path).stats()['observations'], 1)

    def test_real_snapshot_saved_atomically_with_quality_unit_and_source(self):
        session = self.repo.begin_session('Walking Wi-Fi survey')
        scan = sample_scan()
        loc = {'latitude': 38.48, 'longitude': -120.63, 'accuracy_m': 15, 'fix_age_seconds': 7.5}
        result = save_capture(self.repo, scan, scan['records'], session['id'], loc)
        self.assertEqual(result['result_count'], 2)
        self.assertEqual(result['saved_count'], 2)
        self.assertEqual(result['location_source'], 'BROWSER_REPORTED')
        self.assertEqual(result['fix_age_seconds'], 7.5)
        entries = self.repo.list_observations()
        self.assertEqual(len(entries), 2)
        self.assertEqual({row['signal_quality_percent'] for row in entries}, {42, 76})
        self.assertEqual({row['source'] for row in entries}, {'SENSOR'})
        self.assertEqual({row['rssi_dbm'] for row in entries}, {None})
        self.assertEqual({row['survey_capture_id'] for row in entries}, {result['id']})
        self.assertTrue(all(row['observed_at'] == scan['retrieved_at_utc'] for row in entries))
        self.assertEqual(self.repo.sessions()[0]['capture_count'], 1)
        self.assertEqual(self.repo.sessions()[0]['observation_count'], 2)
        out = list(csv.DictReader(io.StringIO(to_csv(entries))))
        self.assertIn('signal_quality_percent', out[0])
        self.assertEqual(len(to_geojson(entries)['features']), 2)

    def test_empty_scan_is_a_record_of_retrieval_not_fake_signal(self):
        scan = sample_scan([])
        record = save_capture(self.repo, scan, [])
        self.assertEqual(record['result_count'], 0)
        self.assertEqual(record['saved_count'], 0)
        self.assertEqual(self.repo.list_observations(), [])
        self.assertEqual(self.repo.stats()['captures'], 1)

    def test_invalid_record_causes_no_partial_writes(self):
        scan = sample_scan()
        first = verified_wifi_observation(scan, scan['records'][0], None, None)
        invalid = verified_wifi_observation(scan, scan['records'][1], None, None)
        invalid[0]['signal_quality_percent'] = -25
        with self.assertRaisesRegex(ValueError, 'percentage'):
            self.repo.store_wifi_capture(scan, [first, invalid], None, browser_location_details(None))
        self.assertEqual(self.repo.captures(), [])
        self.assertEqual(self.repo.list_observations(), [])

    def test_expired_or_replayed_receipts_rejected(self):
        scan = sample_scan()
        receipt_store = ScanReceiptStore(ttl_seconds=5)
        receipt = receipt_store.remember(scan)
        with self.assertRaisesRegex(ValueError, 'unknown'):
            receipt_store.take_all('fake', lambda *_: None)
        result = receipt_store.take_all(receipt['scan_id'],
                                        lambda observed, rows: save_capture(self.repo, observed, rows))
        self.assertEqual(result['saved_count'], 2)
        with self.assertRaisesRegex(ValueError, 'already saved'):
            receipt_store.take_all(receipt['scan_id'], lambda *_: None)
        with patch('openrf.sensor_connections.time.monotonic', return_value=receipt_store._current.created_monotonic + 6):
            with self.assertRaisesRegex(ValueError, 'expired'):
                receipt_store.take_all(receipt['scan_id'], lambda *_: None)

    def test_location_age_and_stopped_session_rejected(self):
        scan = sample_scan()
        for age in (-1, 61, float('nan'), True):
            with self.subTest(age=age), self.assertRaises(ValueError):
                save_capture(self.repo, scan, scan['records'], None,
                             {'latitude': 38, 'longitude': -120, 'accuracy_m': 20, 'fix_age_seconds': age})
        active = self.repo.begin_session('Short survey')
        self.repo.stop_session(active['id'])
        with self.assertRaisesRegex(ValueError, 'no longer active'):
            save_capture(self.repo, scan, scan['records'], active['id'])
        self.assertEqual(self.repo.stats()['observations'], 0)


class CaptureApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.server = create_server(Repository(Path(self.tmp.name) / 'db.sqlite3'), port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tmp.cleanup()

    def req(self, method, path, body=None):
        conn = HTTPConnection('127.0.0.1', self.port, timeout=5)
        headers = {'Host': f'localhost:{self.port}'}
        if body is not None:
            headers['Content-Type'] = 'application/json'
            body = json.dumps(body)
        conn.request(method, path, body=body, headers=headers)
        resp = conn.getresponse()
        raw = resp.read()
        result = resp.status, json.loads(raw)
        conn.close()
        return result

    def test_api_real_scan_capture_and_diagnostics(self):
        status, diag = self.req('GET', '/api/sensors/diagnostics')
        self.assertEqual(status, 200)
        self.assertFalse(diag['hardware_is_measurement'])
        status, response = self.req('POST', '/api/sensors/networkmanager-wifi/save-scan',
                                    {'scan_id': 'forged', 'survey_location': None})
        self.assertEqual(status, 400)
        self.server.wifi_scan_last = float('-inf')
        with patch('openrf.server.scan_once', return_value=sample_scan()):
            status, receipt = self.req('POST', '/api/wifi/scan', {})
        self.assertEqual(status, 200)
        status, saved = self.req('POST', '/api/sensors/networkmanager-wifi/save-scan',
                                 {'scan_id': receipt['scan_id'], 'survey_location': None})
        self.assertEqual(status, 201)
        self.assertEqual(saved['saved_count'], 2)
        status, captures = self.req('GET', '/api/captures')
        self.assertEqual(status, 200)
        self.assertEqual(len(captures['captures']), 1)
        status, observations = self.req('GET', '/api/observations')
        self.assertEqual(status, 200)
        self.assertEqual(len(observations['observations']), 2)
        self.assertEqual(observations['observations'][0]['signal_quality_percent'], 42)
        status, _ = self.req('POST', '/api/sensors/networkmanager-wifi/save-scan',
                              {'scan_id': receipt['scan_id'], 'survey_location': None})
        self.assertEqual(status, 400)


if __name__ == '__main__':
    unittest.main()
