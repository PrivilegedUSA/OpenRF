"""v0.2.175: strictly local, opt-in weather warning preferences; no live sensor data."""
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest

from openrf.server import create_server
from openrf.storage import Repository
from openrf.weather import WeatherError, WeatherStore


def rules(station, **overrides):
    return dict(station_id=station, enabled=True, stale_minutes=30,
                low_temperature_c=0.0, high_temperature_c=35.0,
                high_wind_gust_mps=20.0, high_rain_rate_mm_h=None, **overrides)


class AlertPreferenceTests(unittest.TestCase):
    def setUp(self):
        directory=tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path=Path(directory.name)/'weather.db'
        self.store=WeatherStore(self.path)
        self.first=self.store.create_station({'name':'TEST FIXTURE A'})['id']
        self.second=self.store.create_station({'name':'TEST FIXTURE B'})['id']

    def test_defaults_are_opt_out_and_persist_per_station(self):
        default=self.store.alert_settings(self.first)
        self.assertFalse(default['enabled'])
        self.assertIsNone(default['high_temperature_c'])
        self.assertEqual(default['stale_minutes'],30)
        self.assertEqual(self.store.status()['reading_count'],0)
        saved=self.store.save_alert_settings(rules(self.first))
        self.assertTrue(saved['enabled'])
        self.assertEqual(saved['high_temperature_c'],35)
        self.assertEqual(self.store.alert_settings(self.second)['enabled'],False)
        reopened=WeatherStore(self.path)
        self.assertEqual(reopened.alert_settings(self.first),saved)
        self.assertEqual(reopened.status()['reading_count'],0)
        disabled=reopened.save_alert_settings({**rules(self.first),'enabled':False})
        self.assertFalse(disabled['enabled'])

    def test_reject_bad_inputs_without_changing_saved_configuration(self):
        baseline=rules(self.first)
        self.store.save_alert_settings(baseline)
        invalid=[{**baseline,'enabled':1}, {**baseline,'stale_minutes':True},
                 {**baseline,'stale_minutes':300}, {**baseline,'station_id':True},
                 {**baseline,'station_id':999}, {**baseline,'high_temperature_c':'45'},
                 {**baseline,'high_temperature_c':float('nan')},
                 {**baseline,'high_wind_gust_mps':float('inf')},
                 {**baseline,'low_temperature_c':40},
                 {**baseline,'extra':'unexpected'},
                 {key:value for key,value in baseline.items() if key!='enabled'}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(WeatherError):
                self.store.save_alert_settings(value)
        self.assertEqual(self.store.alert_settings(self.first)['high_temperature_c'],35)


class AlertHttpTests(unittest.TestCase):
    def test_local_get_and_explicit_post_never_start_recording(self):
        with tempfile.TemporaryDirectory() as directory:
            server=create_server(Repository(Path(directory)/'repo.sqlite3'),port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                station=server.weather_store.create_station({'name':'HTTP FIXTURE'})['id']
                def invoke(method,path,body=None):
                    conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                    data=json.dumps(body).encode() if body is not None else None
                    headers={'Content-Type':'application/json'} if data is not None else {}
                    conn.request(method,path,data,headers)
                    response=conn.getresponse()
                    result=(response.status,json.loads(response.read()))
                    conn.close()
                    return result
                code,data=invoke('GET',f'/api/weather/alerts?station_id={station}')
                self.assertEqual(code,200)
                self.assertFalse(data['settings']['enabled'])
                self.assertFalse(server.weather_recorder.status()['running'])
                code,data=invoke('POST','/api/weather/alerts',rules(station))
                self.assertEqual(code,200)
                self.assertTrue(data['settings']['enabled'])
                self.assertFalse(server.weather_recorder.status()['running'])
                self.assertEqual(server.weather_store.status()['reading_count'],0)
                for query in ('','?station_id=0','?station_id=1&station_id=2',
                              '?station_id=1&extra=1'):
                    self.assertEqual(invoke('GET','/api/weather/alerts'+query)[0],400)
                self.assertEqual(invoke('POST','/api/weather/alerts',
                                        {**rules(station),'enabled':'yes'})[0],400)
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__':
    unittest.main()
