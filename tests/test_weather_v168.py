"""v0.2.172 offline weather hub: synthetic measurements are TEST FIXTURES ONLY."""
import http.client
import json
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository
from openrf.weather import WeatherError, WeatherStore, normalize_measurements, normalize_time


class WeatherStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'openrf.sqlite3'
        self.store = WeatherStore(self.path)
        self.station = self.store.create_station({'name': 'TEST STATION ONLY', 'notes': 'synthetic fixtures'})['id']

    def tearDown(self):
        self.temp.cleanup()

    def test_initial_status_is_not_a_sensor_claim(self):
        report = self.store.status()
        self.assertEqual(report['hardware_status'], 'NOT_CONFIGURED')
        self.assertFalse(report['automatic_collection'])
        self.assertEqual(report['connected_devices'], 0)
        self.assertEqual(report['reading_count'], 0)
        self.assertEqual(report['stations'][0]['reading_count'], 0)
        self.assertEqual(report['stations'][0]['collection_state'], 'NOT_CONFIGURED')

    def test_manual_history_survives_restart_and_preserves_origin(self):
        times = ['2026-11-20T05:00:00-08:00', '2026-11-20T12:00:00-08:00']
        newer = self.store.add_manual({'station_id': self.station, 'observed_at_utc': times[1],
                                        'measurements': {'temperature_c': 12.5, 'humidity_pct': 0}})
        older = self.store.add_manual({'station_id': self.station, 'observed_at_utc': times[0],
                                        'measurements': {'temperature_c': -1, 'wind_speed_mps': 0}})
        self.assertEqual(newer['observed_at_utc'], '2026-11-20T20:00:00Z')
        self.assertEqual(older['observed_at_utc'], '2026-11-20T13:00:00Z')
        reopened = WeatherStore(self.path)
        rows = reopened.readings(self.station, days=0)
        self.assertEqual([r['temperature_c'] for r in rows], [-1, 12.5])
        self.assertEqual({r['source_kind'] for r in rows}, {'MANUAL'})
        self.assertEqual(rows[1]['humidity_pct'], 0.0)
        self.assertIsNone(rows[0]['humidity_pct'])
        self.assertEqual(reopened.status()['stations'][0]['reading_count'], 2)

    def test_csv_import_is_historical_atomic_and_idempotent(self):
        data = 'observed_at_utc,temperature_c,wind_speed_mps,rain_interval_mm\n2026-11-19T10:00:00Z,17,0,0.1\n2026-11-19T11:00:00Z,18,3,0\n'
        first = self.store.import_csv({'station_id': self.station, 'csv_text': data})
        self.assertEqual((first['imported'], first['duplicates']), (2, 0))
        again = self.store.import_csv({'station_id': self.station, 'csv_text': data})
        self.assertEqual((again['imported'], again['duplicates']), (0, 2))
        self.assertEqual({r['source_kind'] for r in self.store.readings(self.station, 0)}, {'IMPORTED_HISTORICAL'})
        with_bom = self.store.import_csv({'station_id': self.station,
            'csv_text': '\ufeffobserved_at_utc,temperature_c\n2026-11-19T12:00:00Z,12.3\n'})
        self.assertEqual(with_bom['imported'], 1)
        invalid = data + '2026-11-19T12:00:00Z,12,not-a-value,0\n'
        with self.assertRaises(WeatherError):
            self.store.import_csv({'station_id': self.station, 'csv_text': invalid})
        self.assertEqual(self.store.status()['reading_count'], 3)

    def test_roundtrip_export_includes_origin_but_reimport_marks_historical(self):
        self.store.add_manual({'station_id': self.station, 'observed_at_utc': '2026-11-19T10:00:00Z',
                               'measurements': {'wind_direction_deg': 360, 'temperature_c': 0}})
        data = self.store.export_csv(self.station).decode('utf-8')
        self.assertIn('source_kind', data.splitlines()[0])
        self.assertIn('MANUAL', data)
        another = self.store.create_station({'name': 'Second station'})['id']
        self.assertEqual(self.store.import_csv({'station_id': another, 'csv_text': data})['imported'], 1)
        row = self.store.readings(another, 0)[0]
        self.assertEqual(row['source_kind'], 'IMPORTED_HISTORICAL')
        self.assertEqual(row['wind_direction_deg'], 360)

    def test_rejects_invalid_stations_and_fields(self):
        for payload in ({'name': ''}, {'name': 'bad\nname'}, {'name': 'ok', 'connected': True},
                        {'name': 19}, {'name': 'x'*65}, {'name': 'okay', 'notes': True}):
            with self.subTest(payload=payload), self.assertRaises(WeatherError):
                self.store.create_station(payload)
        for value in (True, 0, -1, 1.2, '1', None):
            with self.subTest(id=value), self.assertRaises(WeatherError):
                self.store.readings(value)
        with self.assertRaises(WeatherError):
            self.store.add_manual({'station_id': 999, 'measurements': {'temperature_c': 10}})
        with self.assertRaises(WeatherError):
            self.store.add_manual({'station_id': self.station, 'source_kind': 'CONNECTED',
                                   'measurements': {'temperature_c': 10}})

    def test_no_fake_measurements_and_strict_ranges(self):
        for invalid in ({}, {'temperature_c': None}, {'temperature_c': float('nan')},
                        {'temperature_c': float('inf')}, {'humidity_pct': 101},
                        {'wind_speed_mps': -1}, {'wind_direction_deg': 370},
                        {'temperature_c': True}, {'test_sensor': 12}, {'temperature_c': 'nonsense'}):
            with self.subTest(values=invalid), self.assertRaises(WeatherError):
                normalize_measurements(invalid)
        self.assertEqual(normalize_measurements({'temperature_c': '0'})['temperature_c'], 0.0)
        self.assertEqual(self.store.status()['reading_count'], 0)

    def test_utc_required_future_rejected(self):
        for date in ('2026-11-20T10:00:00', 'not a date', '2050-01-01T00:00:00Z',
                     '1900-01-01T00:00:00Z'):
            with self.subTest(date=date), self.assertRaises(WeatherError):
                normalize_time(date)
        # A valid offset is normalized to UTC.
        self.assertEqual(normalize_time('2026-11-20T09:00:00-08:00'), '2026-11-20T17:00:00Z')

    def test_csv_safety_bounds(self):
        data = 'observed_at_utc,temperature_c\n'
        for bad in ('junk,temperature_c\nX,4\n', data, data+'2026-11-19T12:00:00Z,3,extra\n',
                    'observed_at_utc,temperature_c,temperature_c\n2026-11-19T12:00:00Z,2,3\n'):
            with self.subTest(csv=bad), self.assertRaises(WeatherError):
                self.store.import_csv({'station_id': self.station, 'csv_text': bad})
        too_many = data + '2026-11-19T10:00:00Z,4\n'*501
        with self.assertRaises(WeatherError):
            self.store.import_csv({'station_id': self.station, 'csv_text': too_many})
        with self.assertRaises(WeatherError):
            self.store.import_csv({'station_id': self.station, 'csv_text': 'x'*160001})
        self.assertEqual(self.store.status()['reading_count'], 0)

    def test_history_limits_and_time_windows(self):
        self.store.add_manual({'station_id': self.station, 'observed_at_utc': '2025-01-01T00:00:00Z',
                               'measurements': {'temperature_c': 5}})
        self.assertEqual(len(self.store.readings(self.station, days=7)), 0)
        self.assertEqual(len(self.store.readings(self.station, days=0)), 1)
        for days in (2, 999, True, '7'):
            with self.subTest(days=days), self.assertRaises(WeatherError):
                self.store.readings(self.station, days=days)
        with self.assertRaises(WeatherError):
            self.store.readings(self.station, limit=20000)


class WeatherHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repository = Repository(Path(self.temp.name) / 'openrf.sqlite3')
        self.server = create_server(self.repository, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.thread.join(timeout=3);self.server.server_close();self.temp.cleanup()

    def api(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=4)
        content = json.dumps(body).encode('utf-8') if body is not None else None
        req_headers = {'Content-Type': 'application/json'} if body is not None else {}
        req_headers.update(headers or {})
        connection.request(method, path, content, headers=req_headers)
        result = connection.getresponse()
        raw = result.read()
        output = json.loads(raw) if result.getheader('Content-Type','').startswith('application/json') else raw
        code = result.status
        connection.close()
        return code, output

    def test_local_api_lifecycle_without_any_adapter(self):
        code, report = self.api('GET', '/api/weather/status')
        self.assertEqual(code, 200)
        self.assertFalse(report['automatic_collection'])
        self.assertEqual(report['connected_devices'], 0)
        code, created = self.api('POST', '/api/weather/stations', {'name': 'API TEST'})
        self.assertEqual(code, 201)
        ident = created['station']['id']
        code, saved = self.api('POST', '/api/weather/readings/manual',
                               {'station_id': ident, 'measurements': {'wind_speed_mps': 0}})
        self.assertEqual(code, 201)
        self.assertEqual(saved['reading']['source_kind'], 'MANUAL')
        code, history = self.api('GET', f'/api/weather/readings?station_id={ident}&days=7')
        self.assertEqual(code, 200)
        self.assertEqual(len(history['readings']), 1)
        code, exported = self.api('GET', f'/api/weather/export.csv?station_id={ident}')
        self.assertEqual(code, 200)
        self.assertIn(b'MANUAL', exported)
        self.assertIn(b'wind_speed_mps', exported)

    def test_local_security_and_readonly_static_script(self):
        code, script = self.api('GET', '/static/weather.js')
        self.assertEqual(code, 200)
        self.assertIn(b'OpenRF v', script)
        self.assertIn(__import__('openrf').__version__.encode(), script)
        code, _ = self.api('GET', '/api/weather/readings?station_id=1&limit=200000')
        self.assertEqual(code, 400)
        code, _ = self.api('POST', '/api/weather/stations', {'name': 'X'},
                           headers={'Origin': 'https://evil.example'})
        self.assertEqual(code, 403)
        code, _ = self.api('GET', '/api/weather/status', headers={'Host': 'evil.example'})
        self.assertEqual(code, 403)
        code, _ = self.api('POST', '/api/weather/readings/manual',
                           {'station_id': 1, 'measurements': {'temperature_c': 1}, 'source_kind': 'CONNECTED'})
        self.assertEqual(code, 400)


if __name__ == '__main__':
    unittest.main()
