"""v0.2.176: bounded, source-tagged session CSV tests with synthetic data only."""
import csv
from datetime import datetime, timedelta, timezone
import http.client
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from openrf.server import create_server
from openrf.storage import Repository
from openrf.weather import WeatherError, WeatherStore


class SessionCsvTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = WeatherStore(Path(self.temp.name) / 'weather.sqlite3')
        self.station = self.store.create_station({'name': 'FIXTURE HOME'})['id']
        self.other = self.store.create_station({'name': 'FIXTURE PORTABLE'})['id']

    def prepare_records(self):
        first = self.store.create_recording(self.station, 'ECOWITT', '192.168.1.41', 60)
        second = self.store.create_recording(self.station, 'ECOWITT', '192.168.1.42', 60)
        other_session = self.store.create_recording(self.other, 'ECOWITT', '192.168.1.43', 60)
        with patch('openrf.weather.fetch_livedata', return_value={'temperature_c': 20.5}):
            for session, station, ip in (
                (first, self.station, '192.168.1.41'),
                (second, self.station, '192.168.1.42'),
                (other_session, self.other, '192.168.1.43'),
            ):
                self.store.read_ecowitt({'station_id': station, 'gateway_ip': ip, 'save': True},
                                        recording_session_id=session)
        self.store.add_manual({'station_id': self.station,
            'observed_at_utc': '2026-11-20T12:00:00Z',
            'measurements': {'humidity_pct': 50}})
        return first, second, other_session

    @staticmethod
    def rows(payload):
        return list(csv.DictReader(io.StringIO(payload.decode('utf-8'))))

    def test_session_export_does_not_mix_other_recordings_manual_or_stations(self):
        first, second, other_session = self.prepare_records()
        with patch('openrf.weather.fetch_livedata') as fetch:
            payload = self.store.export_recording_csv(first)
        fetch.assert_not_called()
        rows = self.rows(payload)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['recording_session_id'], str(first))
        self.assertEqual(rows[0]['station_id'], str(self.station))
        self.assertEqual(rows[0]['source_kind'], 'ECOWITT_GATEWAY_REPORTED')
        self.assertEqual(rows[0]['source_device'], '192.168.1.41')
        self.assertEqual(rows[0]['temperature_c'], '20.5')
        self.assertEqual(len(self.rows(self.store.export_recording_csv(second))), 1)
        self.assertEqual(len(self.rows(self.store.export_recording_csv(other_session))), 1)
        self.assertEqual(len(self.rows(self.store.export_csv(self.station))), 3,
                         'Existing whole-station export is unchanged.')

    def test_empty_session_and_invalid_identifiers(self):
        empty = self.store.create_recording(self.station, 'SERIAL', 'FIXTURE USB', 60)
        raw = self.store.export_recording_csv(empty).decode('utf-8')
        self.assertTrue(raw.startswith('station_id,source_kind,source_device,'))
        self.assertEqual(self.rows(raw.encode()), [])
        for bad in (True, 0, -1, 1.5, '1', None, 999_999):
            with self.subTest(bad=bad), self.assertRaises(WeatherError):
                self.store.export_recording_csv(bad)

    def test_export_row_limit_even_for_oversized_legacy_archive(self):
        session = self.store.create_recording(self.station, 'ECOWITT', '192.168.1.40', 60)
        base = datetime(2026, 11, 20, tzinfo=timezone.utc)
        with self.store._connect() as db:
            db.executemany('''INSERT INTO weather_readings
                (station_id,observed_at_utc,recorded_at_utc,source_kind,
                 recording_session_id,temperature_c) VALUES (?,?,?,?,?,?)''',
                ((self.station, (base + timedelta(seconds=n)).isoformat().replace('+00:00', 'Z'),
                  '2026-11-20T00:00:00Z', 'ECOWITT_GATEWAY_REPORTED', session, n)
                 for n in range(5001)))
        rows = self.rows(self.store.export_recording_csv(session))
        self.assertEqual(len(rows), 5000)
        self.assertEqual(rows[0]['temperature_c'], '1.0')
        self.assertEqual(rows[-1]['temperature_c'], '5000.0')


class SessionCsvHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.server = create_server(Repository(Path(self.temp.name) / 'openrf.sqlite3'), port=0)
        self.station = self.server.weather_store.create_station({'name': 'HTTP FIXTURE'})['id']
        self.session = self.server.weather_store.create_recording(self.station, 'ECOWITT', '192.168.1.44', 60)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)

    def close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def get(self, path):
        client = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        client.request('GET', path)
        response = client.getresponse()
        result = (response.status, dict(response.getheaders()), response.read())
        client.close()
        return result

    def test_export_endpoint_is_local_read_only_and_strict(self):
        with patch('openrf.weather.fetch_livedata') as fetch:
            status, headers, data = self.get(f'/api/weather/recording/export.csv?session_id={self.session}')
            self.assertEqual(status, 200)
            self.assertIn('text/csv', headers['Content-Type'])
            self.assertIn(f'openrf-weather-session-{self.session}.csv', headers['Content-Disposition'])
            self.assertIn('recording_session_id', data.decode())
            for invalid in ('', '?station_id=1', '?session_id=', '?session_id=-1',
                            '?session_id=not-a-number', '?session_id=1&session_id=2',
                            '?session_id=1&unexpected=yes', '?session_id=999999'):
                status, _, response = self.get('/api/weather/recording/export.csv' + invalid)
                self.assertEqual(status, 400, invalid)
                self.assertIn('error', json.loads(response))
        fetch.assert_not_called()
        self.assertFalse(self.server.weather_recorder.status()['running'])


if __name__ == '__main__':
    unittest.main()
