"""All rtl_433 packets below are SYNTHETIC FIXTURES, not physical RF scans."""
import http.client
import json
import sqlite3
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from openrf.server import create_server
from openrf.storage import Repository
from openrf.weather import WeatherStore
from openrf.weather_rtl433 import (WeatherReceiverError, WeatherRtl433Manager,
                                   decode_json_lines, parse_weather_packet, validate_settings)


EVENT = {'model': 'Acurite-FIXTURE', 'id': 53, 'channel': 1, 'temperature_F': 68.0,
         'humidity': 50, 'wind_avg_km_h': 18, 'wind_max_km_h': 36,
         'wind_dir_deg': 270, 'rain_mm': 502.0, 'rain_rate_mm_h': 2.3,
         'battery_ok': 1, 'mic': 'CRC'}
RAW = (json.dumps({'model': 'Generic-Remote', 'id': 33, 'button': 'press'}) + '\n' +
       json.dumps(EVENT) + '\n').encode()


class FakeProcess:
    def __init__(self, argv, *, output=RAW, blocking=False, **_kwargs):
        self.argv = argv
        self.output = output
        self.ready = threading.Event()
        self.returncode = None
        self.blocking = blocking
        if not blocking:
            self.ready.set()

    def communicate(self, timeout=None):
        if not self.ready.wait(timeout):
            raise __import__('subprocess').TimeoutExpired(self.argv, timeout)
        if self.returncode is None:
            self.returncode = 0
        return self.output, b''

    def poll(self):
        return self.returncode

    def terminate(self):
        self.returncode = -15
        self.ready.set()

    def kill(self):
        self.terminate()


def finished(manager, max_seconds=2):
    deadline = time.monotonic() + max_seconds
    while manager.status()['running'] and time.monotonic() < deadline:
        time.sleep(.005)
    return manager.status()


class ReceiverParserTests(unittest.TestCase):
    def test_normalization_and_no_cumulative_rain_as_interval(self):
        packet = parse_weather_packet(EVENT)
        self.assertEqual(packet['model'], 'Acurite-FIXTURE')
        self.assertEqual(packet['device_id'], '53')
        self.assertEqual(packet['measurements']['temperature_c'], 20)
        self.assertEqual(packet['measurements']['wind_speed_mps'], 5)
        self.assertEqual(packet['measurements']['wind_gust_mps'], 10)
        self.assertEqual(packet['measurements']['rain_rate_mm_h'], 2.3)
        self.assertIsNone(packet['measurements']['rain_interval_mm'])
        self.assertFalse(packet['hardware_verified'])

    def test_no_unsupported_remote_or_missing_sensor_identity(self):
        self.assertEqual(len(decode_json_lines(RAW)), 1)
        self.assertIsNone(parse_weather_packet({'model': 'No ID', 'temperature_C': 20}))
        self.assertIsNone(parse_weather_packet({'id': 1, 'temperature_C': 20}))
        self.assertIsNone(parse_weather_packet({'model': 'Radio', 'id': 2, 'button': 1}))
        self.assertIsNone(parse_weather_packet({**EVENT, 'humidity': 999}))
        self.assertIsNone(parse_weather_packet({**EVENT, 'model': 'bad\nmodel'}))
        self.assertEqual(decode_json_lines(b'{bad json}\n'), [])
        with self.assertRaises(WeatherReceiverError):
            decode_json_lines(b'X' * 512001)

    def test_restricted_frequency_and_duration(self):
        self.assertEqual(validate_settings({'frequency_mhz': 433.92, 'duration_seconds': 10})['duration_seconds'], 10)
        for invalid in ({'frequency_mhz': 500, 'duration_seconds': 10},
                        {'frequency_mhz': 433.92, 'duration_seconds': 60},
                        {'frequency_mhz': True, 'duration_seconds': 10},
                        {'frequency_mhz': '433.92', 'duration_seconds': 10},
                        {'frequency_mhz': 433.92, 'duration_seconds': 10, 'extra': 3}):
            with self.subTest(body=invalid), self.assertRaises(WeatherReceiverError):
                validate_settings(invalid)


class ReceiverLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = WeatherStore(Path(self.temp.name)/'observations.sqlite3')
        self.station = self.store.create_station({'name': 'Fixture station'})['id']
        self.procs = []
        def launch(argv, **kwargs):
            p = FakeProcess(argv, **kwargs)
            self.procs.append(p)
            return p
        self.manager = WeatherRtl433Manager(lookup=lambda name: '/mock/rtl_433', popen=launch)

    def tearDown(self):
        self.manager.close()
        self.temp.cleanup()

    def test_no_receiver_is_opened_on_status_start_is_opt_in(self):
        self.assertFalse(self.manager.status()['running'])
        self.assertEqual(self.procs, [])
        result = self.manager.start({'frequency_mhz': 915, 'duration_seconds': 10})
        self.assertEqual(result['frequency_mhz'], 915)
        self.assertEqual(self.procs[0].argv,
                         ['/mock/rtl_433', '-d', '0', '-f', '915.0M', '-T', '10', '-C', 'si', '-F', 'json'])
        status = finished(self.manager)
        self.assertFalse(status['running'])
        self.assertEqual(status['run']['state'], 'COMPLETE')
        self.assertEqual(len(status['run']['candidates']), 1)
        self.assertEqual(self.store.status()['reading_count'], 0)

    def test_receiver_receipt_selected_save_and_duplicate_rejection(self):
        self.manager.start({'frequency_mhz': 433.92, 'duration_seconds': 10})
        run = finished(self.manager)['run']
        candidate = run['candidates'][0]
        body = {'run_id': run['run_id'], 'candidate_id': candidate['candidate_id'],
                'station_id': self.station}
        with self.assertRaises(WeatherReceiverError):
            self.manager.save({**body, 'measurements': {'temperature_c': 100}}, self.store)
        with self.assertRaises(WeatherReceiverError):
            self.manager.save({**body, 'candidate_id': 'forged'}, self.store)
        self.assertEqual(self.store.status()['reading_count'], 0)
        saved = self.manager.save(body, self.store)
        self.assertEqual(saved['source_kind'], 'RTL433_RECEIVER_REPORTED')
        self.assertEqual(saved['timestamp_basis'], 'HOST_LISTEN_WINDOW_NOT_PACKET_TIMESTAMP')
        self.assertFalse(saved['hardware_verified'])
        self.assertIn('Acurite-FIXTURE', saved['source_device'])
        self.assertEqual(self.store.readings(self.station, 0)[0]['rain_rate_mm_h'], 2.3)
        with self.assertRaises(WeatherReceiverError):
            self.manager.save(body, self.store)
        run_after=self.manager.status()['run']
        self.assertTrue(run_after['candidates'][0]['saved'])
        self.manager._last['_completed_monotonic'] -= 601
        with self.assertRaises(WeatherReceiverError):
            self.manager.save(body, self.store)

    def test_stop_discards_partial_output(self):
        blocked = []
        manager = WeatherRtl433Manager(lookup=lambda _: '/mock/rtl_433',
            popen=lambda argv, **kw: blocked.append(FakeProcess(argv, blocking=True, **kw)) or blocked[-1])
        try:
            manager.start({'frequency_mhz': 433.92, 'duration_seconds': 30})
            self.assertTrue(manager.status()['running'])
            manager.stop()
            result = finished(manager)
            self.assertEqual(result['run']['state'], 'STOPPED')
            self.assertFalse(result['run']['candidates'])
        finally:
            manager.close()

    def test_empty_completed_read_has_no_fabricated_sensors(self):
        manager = WeatherRtl433Manager(lookup=lambda _: '/mock/rtl_433',
            popen=lambda argv, **kw: FakeProcess(argv, output=b'', **kw))
        manager.start({'frequency_mhz': 433.92, 'duration_seconds': 10})
        self.assertEqual(finished(manager)['run']['candidates'], [])
        manager.close()


class ReceiverUpgradeTests(unittest.TestCase):
    def test_weewx_rain_rate_converts_separately_from_interval_rain(self):
        with tempfile.TemporaryDirectory() as temp:
            store = WeatherStore(Path(temp)/'rain.sqlite3')
            station = store.create_station({'name': 'Rain-rate fixture'})['id']
            sample = 'dateTime,usUnits,rain,rainRate\n1795219200,1,0.2,0.5\n1795219260,16,0.3,1.2\n1795219320,17,2,3\n'
            receipt = store.import_weewx_csv({'station_id': station, 'csv_text': sample})
            self.assertEqual(receipt['imported'], 3)
            rows = store.readings(station, 0)
            self.assertEqual([r['rain_interval_mm'] for r in rows], [5.08, 3, 2])
            self.assertEqual([r['rain_rate_mm_h'] for r in rows], [12.7, 12, 3])
            self.assertIn(b'rain_rate_mm_h', store.export_csv(station))

    def test_v170_archive_migration_keeps_every_old_record(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'old.sqlite3'
            with sqlite3.connect(path) as db:
                db.executescript('''CREATE TABLE weather_stations(id INTEGER PRIMARY KEY,name TEXT,notes TEXT,created_at_utc TEXT);
                    CREATE TABLE weather_readings(id INTEGER PRIMARY KEY,station_id INTEGER,
                        observed_at_utc TEXT,recorded_at_utc TEXT,
                        source_kind TEXT CHECK(source_kind IN ('MANUAL','IMPORTED_HISTORICAL','ECOWITT_GATEWAY_REPORTED')),
                        source_device TEXT NOT NULL DEFAULT '',temperature_c REAL,humidity_pct REAL,
                        pressure_hpa REAL,wind_speed_mps REAL,wind_gust_mps REAL,wind_direction_deg REAL,
                        rain_interval_mm REAL,uv_index REAL,solar_wm2 REAL,
                        UNIQUE(station_id,observed_at_utc,source_kind));
                    INSERT INTO weather_stations VALUES(1,'Previous station','','2026-11-20T00:00:00Z');
                    INSERT INTO weather_readings(id,station_id,observed_at_utc,recorded_at_utc,
                        source_kind,source_device,temperature_c) VALUES
                        (8,1,'2026-11-20T00:00:00Z','2026-11-20T00:00:00Z','ECOWITT_GATEWAY_REPORTED','192.168.1.99',21);
                ''')
            store = WeatherStore(path)
            row=store.readings(1,0)[0]
            self.assertEqual(row['id'],8)
            self.assertEqual(row['source_device'],'192.168.1.99')
            self.assertEqual(row['source_kind'],'ECOWITT_GATEWAY_REPORTED')
            self.assertIsNone(row['rain_rate_mm_h'])
            self.assertEqual(WeatherStore(path).status()['reading_count'],1)


class ReceiverHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        repo=Repository(Path(self.temp.name)/'http.sqlite3')
        self.server=create_server(repo, port=0)
        self.station=self.server.weather_store.create_station({'name':'HTTP test'})['id']
        self.server.weather_receiver=WeatherRtl433Manager(lookup=lambda _: '/mock/rtl_433',
              popen=lambda argv, **kw: FakeProcess(argv, **kw))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def call(self, method, path, body=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=4)
        headers={'Host':f'127.0.0.1:{self.server.server_port}'}
        if method=='POST':
            headers['Content-Type']='application/json'
        conn.request(method,path,json.dumps(body) if body is not None else None,headers)
        response=conn.getresponse()
        data=json.loads(response.read())
        status=response.status
        conn.close()
        return status,data

    def test_api_does_not_scan_until_start_and_saves_receipt_only(self):
        status,info=self.call('GET','/api/weather/rtl433/status')
        self.assertEqual(status,200)
        self.assertFalse(info['running'])
        status,_=self.call('POST','/api/weather/rtl433/save',{'station_id':self.station,
                                'run_id':'guessed','candidate_id':'guessed'})
        self.assertEqual(status,409)
        status,response=self.call('POST','/api/weather/rtl433/start',
                                  {'frequency_mhz':433.92,'duration_seconds':10})
        self.assertEqual(status,202)
        finished(self.server.weather_receiver)
        status,info=self.call('GET','/api/weather/rtl433/status')
        self.assertEqual(status,200)
        self.assertEqual(len(info['run']['candidates']),1)
        body={'station_id':self.station,'run_id':info['run']['run_id'],
              'candidate_id':info['run']['candidates'][0]['candidate_id']}
        status,_=self.call('POST','/api/weather/rtl433/save',{**body,'temperature_c':90})
        self.assertEqual(status,400)
        status,receipt=self.call('POST','/api/weather/rtl433/save',body)
        self.assertEqual(status,201)
        self.assertFalse(receipt['reading']['hardware_verified'])
        self.assertEqual(self.server.weather_store.status()['reading_count'],1)

    def test_weather_and_sdr_radio_share_receiver_start_guard(self):
        with patch.object(self.server.sdr_captures,'status',return_value={'running':True}):
            status,response=self.call('POST','/api/weather/rtl433/start',
                         {'frequency_mhz':915,'duration_seconds':10})
            self.assertEqual(status,409)
            self.assertIn('Stop radio reception',response['error'])
        with patch.object(self.server.weather_receiver,'status',return_value={'running':True}):
            status,response=self.call('POST','/api/sdr/capture/start',
                {'start_mhz':433,'stop_mhz':434,'step_khz':100,'duration_seconds':5})
            self.assertEqual(status,409)
            self.assertIn('rtl_433',response['error'])


if __name__=='__main__':
    unittest.main()
