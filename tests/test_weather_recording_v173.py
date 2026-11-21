"""v0.2.173 weather recording — all sensor measurements below are TEST FIXTURES."""
import http.client
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from openrf.storage import Repository
from openrf.server import create_server, safe_weather_serial_query
from openrf.weather import WeatherError, WeatherStore
from openrf.weather_recording import WeatherRecorder, WeatherRecordingError
from openrf.weather_serial import WeatherSerialError


def wait_until(predicate, timeout=2):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.01)
    raise AssertionError('Background weather operation did not finish in test time')


class RecordingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.file = Path(self.temp.name) / 'data.sqlite3'
        self.store = WeatherStore(self.file)
        self.station = self.store.create_station({'name': 'MOCK SENSOR ONLY'})['id']

    def test_opt_in_ecowitt_persists_session_and_reading(self):
        recorder = WeatherRecorder(self.store, ports=lambda: [], serial_snapshot=lambda _: None)
        self.assertFalse(recorder.status()['running'])
        self.assertEqual(recorder.sessions(), [])
        self.assertEqual(self.store.status()['reading_count'], 0)
        with patch('openrf.weather.fetch_livedata', return_value={'temperature_c': 20} ) as fetch:
            session = recorder.start({'station_id': self.station, 'source_kind': 'ECOWITT',
                'source_address': '192.168.1.40', 'interval_seconds': 60})['session_id']
            wait_until(lambda: recorder.sessions()[0]['samples_saved'] == 1)
            self.assertTrue(recorder.status()['running'])
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(recorder.stop()['state'], 'STOPPING')
            wait_until(lambda: not recorder.status()['running'])
        record = self.store.readings(self.station, 0)[0]
        self.assertEqual(record['recording_session_id'], session)
        self.assertEqual(record['source_kind'], 'ECOWITT_GATEWAY_REPORTED')
        self.assertEqual(record['temperature_c'], 20)
        self.assertIn('recording_session_id', self.store.export_csv(self.station).decode())
        # Recreating the store does not reconnect; the session remains available.
        reopened = WeatherStore(self.file)
        self.assertEqual(reopened.recordings()[0]['state'], 'STOPPED')
        self.assertEqual(reopened.recordings()[0]['samples_saved'], 1)

    def test_validation_and_single_recording(self):
        recorder = WeatherRecorder(self.store, ports=lambda: ['ttyACM0'], serial_snapshot=lambda _: None)
        base = {'station_id': self.station, 'source_kind': 'ECOWITT',
                'source_address': '192.168.1.40', 'interval_seconds': 60}
        for invalid in ({**base, 'source_address':'8.8.8.8'},
                        {**base, 'interval_seconds':1},
                        {**base, 'station_id': True},
                        {**base, 'extra': 1},
                        {**base, 'source_kind': 'RTL433'}):
            with self.assertRaises((WeatherError, WeatherRecordingError)):
                recorder.start(invalid)
        with patch('openrf.weather.fetch_livedata', return_value={'temperature_c': 20}):
            recorder.start(base)
            with self.assertRaises(WeatherRecordingError):
                recorder.start(base)
            recorder.stop()
            wait_until(lambda: not recorder.status()['running'])

    def test_serial_stale_unknown_duplicate_skipped_and_fresh_saved(self):
        capture = {'port': 'ttyACM0','hardware_id':'FIXTURE BRIDGE',
                   'received_at_utc':'2026-11-21T12:00:00Z', 'candidates':[]}
        recorder = WeatherRecorder(self.store, ports=lambda: ['ttyACM0'],
            serial_snapshot=lambda _: capture)
        with self.assertRaises(WeatherRecordingError):
            recorder.start({'station_id':self.station,'source_kind':'SERIAL',
                'source_address':'ttyACM1','sensor_id':'temp','interval_seconds':60})
        run = {'id': self.store.create_recording(self.station, 'SERIAL','TEST',60),
               'source':'SERIAL','address':'ttyACM0','station':self.station,
               'sensor_id':'temp','channel':'A','last_device_time':None}
        item = {'sensor_id':'temp','channel':'A','model':'FIXTURE',
                'measurements':{'temperature_c':20},'freshness':'STALE_DEVICE_REPORTED',
                'sensor_reported_at_utc':'2026-11-21T11:56:00Z',
                'measurement_age_seconds':240}
        capture['candidates'] = [item]
        self.assertFalse(recorder._sample(run))
        item['freshness']='UNKNOWN_AGE';item['measurement_age_seconds']=None
        self.assertFalse(recorder._sample(run))
        item['freshness']='FRESHNESS_DEVICE_REPORTED_UNVERIFIED';item['measurement_age_seconds']=1
        self.assertTrue(recorder._sample(run))
        self.assertFalse(recorder._sample(run))  # No repeated device timestamp.
        self.assertEqual(self.store.readings(self.station,0)[0]['recording_session_id'],run['id'])

    def test_interrupted_sessions_not_resumed_and_history_is_bounded(self):
        ident = self.store.create_recording(self.station,'ECOWITT','192.168.1.40',60)
        reopened = WeatherStore(self.file)
        self.assertEqual(reopened.recordings()[0]['id'], ident)
        self.assertEqual(reopened.recordings()[0]['state'],'INTERRUPTED')
        self.assertIsNotNone(reopened.recordings()[0]['ended_at_utc'])
        with self.assertRaises(WeatherError):
            reopened.recordings(51)


class RecordingApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.server = create_server(Repository(Path(self.temp.name)/'app.sqlite3'),port=0)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)

    def close_server(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)

    def req(self, method, path, body=None):
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        data=json.dumps(body).encode() if body is not None else None
        headers={'Content-Type':'application/json','Origin':f'http://127.0.0.1:{self.server.server_port}'} if body is not None else {}
        connection.request(method,path,body=data,headers=headers)
        response=connection.getresponse()
        output=response.read()
        connection.close()
        return response.status,json.loads(output)

    def test_status_is_read_only_and_start_stop_api(self):
        code, state = self.req('GET','/api/weather/recording/status')
        self.assertEqual(code,200);self.assertFalse(state['running'])
        self.assertEqual(self.req('GET','/api/weather/recording/sessions')[1]['sessions'],[])
        station = self.server.weather_store.create_station({'name':'API TEST'})['id']
        code,_ = self.req('POST','/api/weather/recording/start',
            {'station_id':station,'source_kind':'ECOWITT','source_address':'1.2.3.4','interval_seconds':60})
        self.assertEqual(code,400)
        with patch('openrf.weather.fetch_livedata', return_value={'humidity_pct':50}):
            code,run = self.req('POST','/api/weather/recording/start',
                {'station_id':station,'source_kind':'ECOWITT','source_address':'10.0.0.2','interval_seconds':60})
            self.assertEqual(code,202)
            wait_until(lambda:self.server.weather_store.recordings()[0]['samples_saved']==1)
            self.assertEqual(self.req('GET','/api/weather/status')[1]['automatic_collection'],True)
            code,_ = self.req('POST','/api/weather/recording/stop',{})
            self.assertEqual(code,200)
            wait_until(lambda:not self.server.weather_recorder.status()['running'])
        self.assertEqual(self.req('GET','/api/weather/recording/sessions')[1]['sessions'][0]['state'],'STOPPED')
        self.assertEqual(run['first_sample'],'PENDING')

    def test_live_messaging_owner_blocks_background_weather_usb(self):
        class FakeManager:
            def __init__(self,status):self.data=status
            def status(self):return self.data
            def close(self):pass
        self.server.meshcore_manager=FakeManager({'port':'ttyACM0','state':'CONNECTED'})
        with self.assertRaises(WeatherSerialError) as raised:
            safe_weather_serial_query(self.server,'ttyACM0',snapshot=True)
        self.assertEqual(raised.exception.code,'port_owned_by_meshcore')


if __name__ == '__main__':
    unittest.main()
