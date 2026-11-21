"""v0.2.174 saved weather comparison: all readings are TEST FIXTURES."""
import http.client
import json
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import threading
import unittest

from openrf.weather import WeatherError, WeatherStore
from openrf.storage import Repository
from openrf.server import create_server


NOW = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)


class WeatherComparisonTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store=WeatherStore(Path(self.tmp.name)/'weather.db')
        self.station=self.store.create_station({'name':'HISTORICAL FIXTURE'})['id']

    def save(self, at, **values):
        self.store.add_manual({'station_id':self.station, 'observed_at_utc':at,
                               'measurements':values})

    def test_two_adjacent_windows_exclude_missing_and_boundary(self):
        self.save('2026-11-20T12:00:00Z',temperature_c=20)
        self.save('2026-11-20T16:00:00Z',temperature_c=30)
        self.save('2026-11-20T17:00:00Z',humidity_pct=50)  # Not a measured 0°C.
        self.save('2026-11-19T12:00:00Z',temperature_c=10)
        self.save('2026-11-19T11:59:59Z',temperature_c=5)  # Outside both windows.
        result=self.store.compare_periods(self.station,1,'temperature_c',now=NOW)
        self.assertEqual(result['current']['count'],2)
        self.assertEqual(result['current']['mean'],25)
        self.assertEqual(result['current']['minimum'],20)
        self.assertEqual(result['current']['maximum'],30)
        self.assertEqual(result['previous']['count'],1)
        self.assertEqual(result['previous']['mean'],10)
        self.assertEqual(result['current']['from_utc'],'2026-11-20T12:00:00Z')
        self.assertEqual(result['previous']['to_utc'],result['current']['from_utc'])
        self.assertEqual(result['units'],'SI')
        self.assertIn('UNVERIFIED',result['provenance'])

    def test_empty_and_invalid_requests_do_not_fabricate_statistics(self):
        empty=self.store.compare_periods(self.station,7,'wind_speed_mps',now=NOW)
        for period in ('current','previous'):
            self.assertEqual(empty[period]['count'],0)
            self.assertIsNone(empty[period]['mean'])
            self.assertIsNone(empty[period]['minimum'])
        for metric in ('name','__class__','temperature_c; DROP TABLE weather_readings'):
            with self.assertRaises(WeatherError):
                self.store.compare_periods(self.station,7,metric,now=NOW)
        for days in (0,2,400,True):
            with self.assertRaises(WeatherError):
                self.store.compare_periods(self.station,days,'temperature_c',now=NOW)


class ComparisonHttpTests(unittest.TestCase):
    def test_read_only_comparison_route_and_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            server=create_server(Repository(Path(temp)/'openrf.sqlite3'),port=0)
            worker=threading.Thread(target=server.serve_forever,daemon=True)
            worker.start()
            try:
                station=server.weather_store.create_station({'name':'HTTP FIXTURE'})['id']
                def get(query):
                    c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                    c.request('GET','/api/weather/compare'+query)
                    response=c.getresponse();data=json.loads(response.read());c.close()
                    return response.status,data
                code,result=get(f'?station_id={station}&days=7&metric=temperature_c')
                self.assertEqual(code,200)
                self.assertEqual(result['current']['count'],0)
                self.assertEqual(server.weather_store.readings(station,0),[])
                for query in ('','?station_id=1&days=0&metric=temperature_c',
                              '?station_id=1&days=7&metric=bad',
                              '?station_id=1&days=7&metric=temperature_c&extra=1',
                              '?station_id=1&days=7&days=30&metric=temperature_c'):
                    self.assertEqual(get(query)[0],400)
            finally:
                server.shutdown();server.server_close();worker.join(timeout=3)


if __name__=='__main__':
    unittest.main()
