"""Ecowitt test fixtures are synthetic, not readings from physical hardware."""
import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from openrf.weather import WeatherError, WeatherStore
from openrf.weather_ecowitt import (EcowittError, fetch_livedata,
                                     parse_livedata, private_gateway_ip)
from openrf.server import create_server
from openrf.storage import Repository


FIXTURE = {'common_list': [
    {'id': '0x02', 'val': '68.0', 'unit': 'F'},
    {'id': '0x07', 'val': '51%'},
    {'id': '0x0A', 'val': '270'},
    {'id': '0x0B', 'val': '11.18 mph'},
    {'id': '0x0C', 'val': '20 km/h'},
    {'id': '0x15', 'val': '250 w/m2'},
    {'id': '0x17', 'val': '4'},
    {'id': '0x09', 'val': '29.92 inHg'},
], 'rain': [{'id': '0x10', 'val': '0.5 in'}]}


class EcowittProtocolTests(unittest.TestCase):
    def test_private_lan_literal_only(self):
        for ip in ('192.168.1.9', '10.2.3.4', '172.20.2.1'):
            self.assertEqual(private_gateway_ip(ip), ip)
        for ip in ('127.0.0.1', '169.254.0.10', '8.8.8.8', '192.168.1.9:80',
                   'http://192.168.1.9', 'gateway.local', '192.168.1.09',
                   '172.32.0.1', '192.168.1.9\n', '::1', '0.0.0.0', None):
            with self.subTest(ip=ip), self.assertRaises(EcowittError):
                private_gateway_ip(ip)

    def test_outdoor_weather_and_unit_conversions(self):
        actual = parse_livedata(FIXTURE)
        self.assertAlmostEqual(actual['temperature_c'], 20)
        self.assertAlmostEqual(actual['wind_speed_mps'], 5, delta=.02)
        self.assertAlmostEqual(actual['wind_gust_mps'], 20/3.6)
        self.assertAlmostEqual(actual['pressure_hpa'], 1013.21, delta=.1)
        self.assertEqual(actual['humidity_pct'], 51)
        self.assertEqual(actual['wind_direction_deg'], 270)
        self.assertEqual(actual['solar_wm2'], 250)
        self.assertEqual(actual['uv_index'], 4)
        self.assertNotIn('rain_interval_mm', actual, 'Cumulative rain is NOT interval rain')

    def test_celsius_and_wh25_pressure_fallback(self):
        result = parse_livedata({'common_list': [{'id': '0x02', 'val': '21.5', 'unit': 'C'}],
                                 'wh25': [{'rel': '1010.5 hPa'}]})
        self.assertEqual(result['temperature_c'], 21.5)
        self.assertEqual(result['pressure_hpa'], 1010.5)

    def test_rejects_unrecognized_or_ambiguous_weather(self):
        for payload in ({}, {'common_list': {}}, {'common_list': []},
                        {'common_list': [{'id': '0x02', 'val': '70'}]},
                        {'common_list': [{'id': '0x0B', 'val': '12 knots'}]},
                        {'common_list': [{'id': '0x02', 'val': '110', 'unit': 'K'}]},
                        {'common_list': [{'id': '0x02', 'val': 'NaN', 'unit': 'C'}]}):
            with self.subTest(payload=payload), self.assertRaises(EcowittError):
                parse_livedata(payload)

    def test_http_read_is_single_get_with_timeout_and_no_redirect(self):
        class FakeResponse:
            status = 200
            def read(self, size):
                self.size = size
                return json.dumps(FIXTURE).encode()
        class FakeConnection:
            def __init__(self, ip, port, timeout):
                self.address = (ip, port, timeout)
                created.append(self)
            def request(self, method, path, headers):
                self.request_info = (method, path, headers)
            def getresponse(self):
                return FakeResponse()
            def close(self):
                self.closed = True
        created = []
        with patch('openrf.weather_ecowitt.http.client.HTTPConnection', FakeConnection):
            values = fetch_livedata('192.168.1.40')
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0].address, ('192.168.1.40', 80, 3))
        self.assertEqual(created[0].request_info[:2], ('GET', '/get_livedata_info'))
        self.assertTrue(created[0].closed)
        self.assertEqual(values['temperature_c'], 20)

        class RedirectConnection(FakeConnection):
            def getresponse(self):
                return type('Redirect', (), {'status': 302})()
        with patch('openrf.weather_ecowitt.http.client.HTTPConnection', RedirectConnection):
            with self.assertRaisesRegex(EcowittError, 'HTTP 302'):
                fetch_livedata('192.168.1.40')


class EcowittPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)/'app.sqlite3'
        self.store = WeatherStore(self.path)
        self.station = self.store.create_station({'name': 'FICTIONAL FIXTURE'})['id']

    def tearDown(self):
        self.temp.cleanup()

    def test_preview_does_not_save_and_save_has_explicit_source(self):
        payload = {'station_id': self.station, 'gateway_ip': '192.168.1.40', 'save': False}
        with patch('openrf.weather.fetch_livedata', return_value={'temperature_c': 20.0}) as reader:
            snapshot = self.store.read_ecowitt(payload)
            self.assertFalse(snapshot['saved'])
            self.assertFalse(snapshot['hardware_verified'])
            self.assertEqual(snapshot['source_device'], payload['gateway_ip'])
            self.assertEqual(snapshot['timestamp_basis'], 'OPENRF_RECEIVED_AT_UTC')
            self.assertEqual(self.store.status()['reading_count'], 0)
            saved = self.store.read_ecowitt({**payload, 'save': True})
        self.assertEqual(reader.call_count, 2)
        self.assertTrue(saved['saved'])
        reading = self.store.readings(self.station, 0)[0]
        self.assertEqual(reading['source_kind'], 'ECOWITT_GATEWAY_REPORTED')
        self.assertEqual(reading['source_device'], '192.168.1.40')
        self.assertEqual(self.store.status()['connected_devices'], 0)
        self.assertFalse(self.store.status()['automatic_collection'])
        self.assertIn('192.168.1.40', self.store.export_csv(self.station).decode('utf-8'))

    def test_no_browser_supplied_sensor_data_or_implicit_connection(self):
        payload = {'station_id': self.station, 'gateway_ip': '192.168.1.40', 'save': False}
        with patch('openrf.weather.fetch_livedata') as reader:
            for invalid in ({**payload, 'temperature_c': 20}, {**payload, 'save': 'true'},
                            {**payload, 'gateway_ip': '127.0.0.1'},
                            {**payload, 'station_id': 999},
                            {key: value for key, value in payload.items() if key != 'save'}):
                with self.subTest(invalid=invalid), self.assertRaises(WeatherError):
                    self.store.read_ecowitt(invalid)
            reader.assert_not_called()

    def test_old_169_history_migrates_without_loss(self):
        old = Path(self.temp.name)/'old.sqlite3'
        with sqlite3.connect(old) as db:
            db.executescript('''
                CREATE TABLE weather_stations(id INTEGER PRIMARY KEY,name TEXT,notes TEXT,created_at_utc TEXT);
                CREATE TABLE weather_readings(id INTEGER PRIMARY KEY,station_id INTEGER,
                    observed_at_utc TEXT,recorded_at_utc TEXT,
                    source_kind TEXT CHECK(source_kind IN ('MANUAL','IMPORTED_HISTORICAL')),
                    temperature_c REAL,humidity_pct REAL,pressure_hpa REAL,wind_speed_mps REAL,
                    wind_gust_mps REAL,wind_direction_deg REAL,rain_interval_mm REAL,
                    uv_index REAL,solar_wm2 REAL,UNIQUE(station_id,observed_at_utc,source_kind));
                INSERT INTO weather_stations VALUES(1,'Old station','','2026-11-20T00:00:00Z');
                INSERT INTO weather_readings(id,station_id,observed_at_utc,recorded_at_utc,
                    source_kind,temperature_c) VALUES(3,1,'2026-11-20T01:00:00Z',
                    '2026-11-20T02:00:00Z','MANUAL',12);
            ''')
        migrated = WeatherStore(old)
        readings = migrated.readings(1, 0)
        self.assertEqual(len(readings), 1)
        self.assertEqual(readings[0]['id'], 3)
        self.assertEqual(readings[0]['temperature_c'], 12)
        self.assertEqual(readings[0]['source_device'], '')
        self.assertEqual(migrated.stations()[0]['name'], 'Old station')
        self.assertEqual(WeatherStore(old).status()['reading_count'], 1)

    def test_weewx_archive_us_metric_and_metricwx_units(self):
        data = ('dateTime,usUnits,outTemp,outHumidity,barometer,windSpeed,windGust,windDir,rain,UV,radiation,extraTemp1\n'
                '1795219200,1,68,52,29.92,11.1847,15,180,0.1,2,200,\n'
                '1795219500,16,21,53,1013,18,23,90,0.2,3,300,\n'
                '1795219800,17,19,54,1014,5,7,270,2,4,400,\n')
        result = self.store.import_weewx_csv({'station_id': self.station, 'csv_text': data})
        self.assertEqual(result['imported'], 3)
        self.assertEqual(result['source_kind'], 'IMPORTED_HISTORICAL')
        rows = self.store.readings(self.station, 0)
        self.assertAlmostEqual(rows[0]['temperature_c'], 20)
        self.assertAlmostEqual(rows[0]['wind_speed_mps'], 5, delta=.03)
        self.assertAlmostEqual(rows[0]['rain_interval_mm'], 2.54)
        self.assertAlmostEqual(rows[1]['wind_speed_mps'], 5)
        self.assertAlmostEqual(rows[1]['rain_interval_mm'], 2)
        self.assertAlmostEqual(rows[2]['wind_speed_mps'], 5)
        self.assertAlmostEqual(rows[2]['rain_interval_mm'], 2)
        self.assertEqual(rows[0]['source_device'], 'WeeWX archive CSV')
        again = self.store.import_weewx_csv({'station_id': self.station, 'csv_text': data})
        self.assertEqual((again['imported'], again['duplicates']), (0, 3))

    def test_weewx_rejects_wrong_units_dates_and_incomplete_import_atomically(self):
        base = 'dateTime,usUnits,outTemp\n1795219200,17,19\n'
        for invalid in ('dateTime,outTemp\n1795219200,20\n',
                        'dateTime,usUnits,outTemp\n1795219200,2,20\n',
                        'dateTime,usUnits,outTemp\n1795219200,17,broken\n',
                        'dateTime,usUnits,outTemp\n3000000000,17,20\n',
                        base + '1795219500,17,broken\n'):
            with self.subTest(csv=invalid), self.assertRaises(WeatherError):
                self.store.import_weewx_csv({'station_id': self.station, 'csv_text': invalid})
        self.assertEqual(self.store.status()['reading_count'], 0)


class WeatherAdapterHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repository = Repository(Path(self.temp.name)/'http.sqlite3')
        self.server = create_server(self.repository, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.station = self.server.weather_store.create_station({'name': 'Test gateway'})['id']

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.temp.cleanup()

    def post(self, url, body):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        conn.request('POST', url, json.dumps(body),
                     {'Content-Type': 'application/json',
                      'Host': f'127.0.0.1:{self.server.server_port}'})
        response = conn.getresponse()
        data = json.loads(response.read())
        status = response.status
        conn.close()
        return status, data

    def test_gateway_ui_endpoints_cannot_submit_fake_hardware_data(self):
        body = {'station_id': self.station, 'gateway_ip': '10.0.0.50', 'save': False}
        with patch('openrf.weather.fetch_livedata', return_value={'wind_speed_mps': 3.4}) as fetch:
            status, output = self.post('/api/weather/ecowitt/read', body)
            self.assertEqual(status, 200)
            self.assertFalse(output['reading']['saved'])
            self.assertEqual(self.server.weather_store.status()['reading_count'], 0)
            status, output = self.post('/api/weather/ecowitt/read', {**body, 'save': True})
            self.assertEqual(status, 201)
            self.assertEqual(output['reading']['source_kind'], 'ECOWITT_GATEWAY_REPORTED')
            self.assertEqual(self.server.weather_store.status()['reading_count'], 1)
            status, _ = self.post('/api/weather/ecowitt/read', {**body, 'temperature_c': 42})
            self.assertEqual(status, 400)
            status, _ = self.post('/api/weather/ecowitt/read', {**body, 'gateway_ip': '8.8.8.8'})
            self.assertEqual(status, 400)
        self.assertEqual(fetch.call_count, 2)

    def test_weewx_selected_csv_is_imported_historical_not_live(self):
        status, result = self.post('/api/weather/import/weewx', {'station_id': self.station,
                  'csv_text': 'dateTime,usUnits,windSpeed\n1795219200,17,4\n'})
        self.assertEqual(status, 201)
        self.assertEqual(result['imported'], 1)
        reading = self.server.weather_store.readings(self.station, 0)[0]
        self.assertEqual(reading['source_kind'], 'IMPORTED_HISTORICAL')
        self.assertEqual(reading['source_device'], 'WeeWX archive CSV')


if __name__ == '__main__':
    unittest.main()
