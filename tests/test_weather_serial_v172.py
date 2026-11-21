"""Weather bridge test frames are SYNTHETIC FIXTURES, never physical sensors."""
import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from openrf.server import create_server
from openrf.storage import Repository
from openrf.weather import WeatherStore
from openrf.weather_serial import (PROTOCOL, WeatherSerialError, WeatherSerialReceipts,
                                   parse_weather_hello, parse_weather_snapshot, query_weather_port)

HELLO = {'protocol': PROTOCOL, 'type': 'hello', 'hardware_id': 'fixture-esp32-01',
         'label': 'SYNTHETIC weather bridge', 'firmware_version': '0.1-fixture', 'capabilities': ['WEATHER']}
SNAPSHOT = {'protocol': PROTOCOL, 'type': 'snapshot', 'hardware_id': 'fixture-esp32-01',
            'sensors': [{'sensor_id': 'bme280-0x76', 'model': 'Fixture BME280', 'channel': 'i2c',
                         'measurements': {'temperature_c': 21.5, 'humidity_pct': 45, 'pressure_hpa': 1010},
                         'measurement_age_seconds': 1},
                        {'sensor_id': 'anemometer-01', 'model': 'Fixture wind', 'channel': 'A',
                         'measurements': {'wind_speed_mps': 8, 'wind_gust_mps': 12,
                                          'wind_direction_deg': 260}, 'measurement_age_seconds': 160}]}


def fixture_capture():
    capture = parse_weather_snapshot(SNAPSHOT, parse_weather_hello(HELLO), '2026-11-21T12:00:00Z')
    capture['port'] = 'ttyACM0'
    return capture


class SerialProtocolTests(unittest.TestCase):
    def test_hello_requires_explicit_protocol_and_weather_capability(self):
        hello = parse_weather_hello(HELLO)
        self.assertFalse(hello['identity_verified'])
        for packet in ({**HELLO, 'protocol': 'openrf.serial.v1'},
                       {**HELLO, 'capabilities': ['RF']},
                       {**HELLO, 'hardware_id': ''},
                       {**HELLO, 'type': 'snapshot'}):
            with self.subTest(packet=packet), self.assertRaises(WeatherSerialError):
                parse_weather_hello(packet)

    def test_bounded_units_no_fake_readings_and_stale_age(self):
        result = fixture_capture()
        self.assertEqual(len(result['candidates']), 2)
        self.assertEqual(result['candidates'][0]['measurements']['temperature_c'], 21.5)
        self.assertEqual(result['candidates'][0]['freshness'], 'FRESHNESS_DEVICE_REPORTED_UNVERIFIED')
        self.assertFalse(result['candidates'][0]['stale'])
        self.assertTrue(result['candidates'][1]['stale'])
        self.assertEqual(result['candidates'][1]['freshness'], 'STALE_DEVICE_REPORTED')
        self.assertEqual(result['timestamp_basis'], 'HOST_RECEIVED_AT_UTC')

    def test_unknown_age_future_clock_and_bad_frame_are_honest(self):
        hello = parse_weather_hello(HELLO)
        result = parse_weather_snapshot({**SNAPSHOT, 'sensors': [
            {'sensor_id': 'fixture', 'model': 'fixture', 'measurements': {'temperature_c': 18}}]},
            hello, '2026-11-21T12:00:00Z')
        self.assertEqual(result['candidates'][0]['freshness'], 'UNKNOWN_AGE')
        skew = parse_weather_snapshot({**SNAPSHOT, 'sensors': [
            {'sensor_id': 'fixture', 'model': 'fixture', 'measurements': {'temperature_c': 18},
             'reported_at_utc': '2026-11-21T12:05:00Z'}]},
            hello, '2026-11-21T12:00:00Z')
        self.assertEqual(skew['candidates'][0]['freshness'], 'CLOCK_SKEW_UNVERIFIED')
        bad = ({**SNAPSHOT, 'hardware_id': 'other'},
               {**SNAPSHOT, 'sensors': [{'sensor_id': 'x', 'model': 'bad', 'measurements': {'humidity_pct': 200}}]},
               {**SNAPSHOT, 'sensors': [{'sensor_id': 'x', 'model': 'bad', 'measurements': {'rain_mm': 10}}]},
               {**SNAPSHOT, 'sensors': SNAPSHOT['sensors'] * 9},
               {**SNAPSHOT, 'sensors': [SNAPSHOT['sensors'][0]] * 2},
               {**SNAPSHOT, 'type': 'error', 'code': 'SENSOR_NOT_AVAILABLE'})
        for frame in bad:
            with self.subTest(frame=frame), self.assertRaises(WeatherSerialError):
                parse_weather_snapshot(frame, hello, '2026-11-21T12:00:00Z')

    def test_query_only_opens_inventoried_device_and_always_closes(self):
        with patch('openrf.weather_serial.os.open', return_value=99) as opener, \
             patch('openrf.weather_serial.os.close') as closer, \
             patch('openrf.weather_serial._configure'), \
             patch('openrf.weather_serial._exchange', side_effect=[HELLO, SNAPSHOT]) as exchange:
            reply = query_weather_port('ttyACM0', ['ttyACM0'], snapshot=True)
            self.assertEqual(reply['port'], 'ttyACM0')
            self.assertEqual(len(reply['candidates']), 2)
            self.assertEqual(exchange.call_args_list[0].args[1], b'OPENRF WEATHER HELLO 1\n')
            self.assertEqual(exchange.call_args_list[1].args[1], b'OPENRF WEATHER SNAPSHOT 1\n')
            self.assertEqual(opener.call_args.args[0], '/dev/ttyACM0')
            closer.assert_called_once_with(99)
        with patch('openrf.weather_serial.os.open') as opener:
            with self.assertRaises(WeatherSerialError):
                query_weather_port('../../etc/passwd', ['ttyACM0'])
            opener.assert_not_called()


class SerialStoreTests(unittest.TestCase):
    def test_server_issued_receipt_save_selected_only_and_utc_quality(self):
        with tempfile.TemporaryDirectory() as temp:
            store=WeatherStore(Path(temp)/'weather.db')
            station=store.create_station({'name': 'Fixture house'})['id']
            receipts=WeatherSerialReceipts()
            self.assertFalse(receipts.summary()['receipt_valid'])
            capture=receipts.remember(fixture_capture())
            self.assertEqual(store.status()['reading_count'], 0)
            body={'run_id': capture['run_id'], 'candidate_id': capture['candidates'][1]['candidate_id'],
                  'station_id':station}
            with self.assertRaises(WeatherSerialError):
                receipts.save({**body, 'measurements': {'wind_speed_mps': 100}}, store)
            with self.assertRaises(WeatherSerialError):
                receipts.save({**body, 'candidate_id': 'fake'}, store)
            row=receipts.save(body, store)
            self.assertEqual(row['source_kind'], 'OPENRF_SERIAL_WEATHER_REPORTED')
            self.assertEqual(row['freshness'], 'STALE_DEVICE_REPORTED')
            self.assertEqual(row['observed_at_utc'], '2026-11-21T12:00:00Z')
            self.assertEqual(row['wind_speed_mps'], 8)
            self.assertFalse(row['hardware_verified'])
            self.assertIn('fixture-esp32-01', row['source_device'])
            self.assertEqual(store.status()['reading_count'], 1)
            with self.assertRaises(WeatherSerialError):
                receipts.save(body, store)
            saved=store.readings(station, 0)[0]
            self.assertEqual(saved['measurement_age_seconds'], 160)
            self.assertIn(b'STALE_DEVICE_REPORTED', store.export_csv(station))
            receipts._latest['created'] -= 601
            with self.assertRaises(WeatherSerialError):
                receipts.save({**body, 'candidate_id': capture['candidates'][0]['candidate_id']}, store)

    def test_migration_from_v171_preserves_prior_readings(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'v171.sqlite3'
            with sqlite3.connect(path) as db:
                db.executescript('''CREATE TABLE weather_stations(id INTEGER PRIMARY KEY,name TEXT,notes TEXT,created_at_utc TEXT);
                    CREATE TABLE weather_readings(id INTEGER PRIMARY KEY, station_id INTEGER,
                        observed_at_utc TEXT, recorded_at_utc TEXT, source_kind TEXT CHECK(source_kind IN
                        ('MANUAL','IMPORTED_HISTORICAL','ECOWITT_GATEWAY_REPORTED','RTL433_RECEIVER_REPORTED')),
                        source_device TEXT NOT NULL DEFAULT '', temperature_c REAL,humidity_pct REAL,pressure_hpa REAL,
                        wind_speed_mps REAL,wind_gust_mps REAL,wind_direction_deg REAL,rain_interval_mm REAL,
                        rain_rate_mm_h REAL,uv_index REAL,solar_wm2 REAL,
                        UNIQUE(station_id,observed_at_utc,source_kind,source_device));
                    INSERT INTO weather_stations VALUES (1,'Old station','','2026-11-21T00:00:00Z');
                    INSERT INTO weather_readings(id,station_id,observed_at_utc,recorded_at_utc,
                        source_kind,source_device,temperature_c,rain_rate_mm_h) VALUES
                        (12,1,'2026-11-21T00:00:00Z','2026-11-21T00:00:00Z',
                         'RTL433_RECEIVER_REPORTED','rtl_433 old decoded sensor',18,2.3);''')
            store=WeatherStore(path)
            old=store.readings(1,0)[0]
            self.assertEqual(old['id'],12)
            self.assertEqual(old['source_device'],'rtl_433 old decoded sensor')
            self.assertEqual(old['rain_rate_mm_h'],2.3)
            self.assertIsNone(old['measurement_age_seconds'])
            self.assertEqual(WeatherStore(path).status()['reading_count'],1)


class SerialApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.server=create_server(Repository(Path(self.temp.name)/'http.db'),port=0)
        self.station=self.server.weather_store.create_station({'name':'HTTP fixture'})['id']
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=3);self.temp.cleanup()

    def call(self,method,path,body=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_address[1],timeout=5)
        raw=json.dumps(body).encode() if body is not None else None
        conn.request(method,path,body=raw,headers={'Host':f'localhost:{self.server.server_address[1]}',
               'Content-Type':'application/json'})
        response=conn.getresponse();status=response.status
        data=json.loads(response.read());conn.close()
        return status,data

    def test_port_inventory_does_not_open_probe_read_or_save_implicitly(self):
        with patch('openrf.server.enumerate_serial_ports',return_value=['ttyACM0']), \
             patch('openrf.server.serial_port_diagnostics',return_value=[]), \
             patch('openrf.server.query_weather_port',side_effect=lambda port,available,snapshot=False: (
                 fixture_capture() if snapshot else {**parse_weather_hello(HELLO),'port':port})) as query:
            status,response=self.call('GET','/api/weather/serial/ports')
            self.assertEqual(status,200)
            self.assertEqual(response['ports'],['ttyACM0'])
            query.assert_not_called()
            self.assertEqual(self.server.weather_store.status()['reading_count'],0)
            status,response=self.call('POST','/api/weather/serial/probe',{'port':'ttyACM0'})
            self.assertEqual(status,200)
            self.assertFalse(response['probe']['identity_verified'])
            status,response=self.call('POST','/api/weather/serial/read',{'port':'ttyACM0'})
            self.assertEqual(status,200)
            self.assertEqual(len(response['capture']['candidates']),2)
            self.assertEqual(self.server.weather_store.status()['reading_count'],0)
            candidate=response['capture']['candidates'][0]
            body={'run_id':response['capture']['run_id'], 'candidate_id':candidate['candidate_id'],
                  'station_id':self.station}
            self.assertEqual(self.call('POST','/api/weather/serial/save',{**body,'pressure_hpa':99})[0],400)
            self.assertEqual(self.call('POST','/api/weather/serial/save',body)[0],201)
            self.assertEqual(self.server.weather_store.status()['reading_count'],1)
            self.assertEqual(query.call_count,2)

    def test_conflicts_meshtastic_meshcore_reticulum_and_sensor_busy(self):
        with patch('openrf.server.enumerate_serial_ports',return_value=['ttyACM0']), \
             patch('openrf.server.query_weather_port') as query:
            for manager,report in (
                (self.server.mesh_manager,{'port':'ttyACM0','state':'CONNECTED'}),
                (self.server.meshcore_manager,{'port':'ttyACM0','state':'CONNECTED'}),
                (self.server.reticulum_manager,{'enabled':True,'rnode_ports':['ttyACM0']})):
                with self.subTest(manager=manager),patch.object(manager,'status',return_value=report):
                    self.assertEqual(self.call('POST','/api/weather/serial/read',{'port':'ttyACM0'})[0],409)
            query.assert_not_called()
            self.server.serial_lock.acquire()
            try:
                self.assertEqual(self.call('POST','/api/weather/serial/probe',{'port':'ttyACM0'})[0],409)
            finally:
                self.server.serial_lock.release()


if __name__=='__main__':unittest.main()
