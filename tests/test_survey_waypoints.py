"""v0.2.20: fresh, user-triggered browser fixes never masquerade as RF evidence."""
import json
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository
from openrf.survey_waypoints import normalize_waypoint, waypoints_geojson


def candidate(session_id=1, **changes):
    row = {
        'session_id': session_id, 'latitude': 38.55, 'longitude': -120.75,
        'accuracy_m': 75.0, 'fix_age_seconds': 2.0,
        'fix_reported_at_utc': datetime.now(timezone.utc).isoformat(),
        'note': '<b>A survey stop</b>'
    }
    row.update(changes)
    return row


class WaypointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'original.sqlite3'
        self.repo = Repository(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_valid_waypoint_and_record_is_not_an_rf_observation(self):
        session = self.repo.begin_session('Survey field day')
        self.repo.add_observation({'label':'Existing observation', 'session_id':session['id']})
        saved = self.repo.record_waypoint(candidate(session['id']))
        self.assertEqual(saved['session_id'],session['id'])
        self.assertEqual(saved['source_device'], 'Browser Geolocation API')
        self.assertEqual(saved['location_source'], 'BROWSER_REPORTED')
        self.assertIsNotNone(saved['recorded_at_utc'])
        self.assertEqual(self.repo.list_waypoints(session['id'])['total'],1)
        self.assertEqual(len(self.repo.list_observations()),1)
        features = waypoints_geojson([saved],session['id'])
        self.assertEqual(features['features'][0]['geometry']['coordinates'],[-120.75,38.55])
        self.assertNotIn('LineString',json.dumps(features))
        self.assertIn('not_transmitter_location', features['features'][0]['properties']['coordinate_meaning'])
        self.repo.stop_session(session['id'])
        with self.assertRaisesRegex(ValueError, 'not active'):
            self.repo.record_waypoint(candidate(session['id']))
        self.assertTrue(self.repo.delete_waypoint(saved['id']))
        self.assertFalse(self.repo.delete_waypoint(saved['id']))
        self.assertEqual(len(self.repo.list_observations()),1)

    def test_reject_stale_invalid_unauthorized_and_forged_sensor_readings(self):
        session=self.repo.begin_session('Testing')
        invalid = [
            candidate(session['id'],fix_age_seconds=61),
            candidate(session['id'],accuracy_m=float('nan')),
            candidate(session['id'],latitude=91),
            candidate(session['id'],longitude=181),
            candidate(True),
            candidate(session['id'],note='x'*501),
            candidate(session['id'],fix_reported_at_utc='2024-01-01T00:00:00Z'),
            candidate(session['id'],fix_reported_at_utc='2026-01-01'),
            candidate(session['id'],frequency_mhz=2400),
            candidate(session['id'],source='SENSOR'),
        ]
        for item in invalid:
            with self.subTest(item=item),self.assertRaises(ValueError):
                normalize_waypoint(item)
        self.assertEqual(self.repo.list_waypoints()['total'],0)

    def test_additive_schema_preserves_existing_database(self):
        original=self.repo.begin_session('Unchanged source')
        self.repo.add_observation({'label':'Keep this', 'session_id':original['id']})
        self.repo.record_waypoint(candidate(original['id']))
        repo2=Repository(self.path)  # migration must be idempotent
        self.assertEqual(repo2.list_waypoints()['total'],1)
        self.assertEqual(repo2.list_observations()[0]['label'],'Keep this')
        self.assertEqual(repo2.sessions()[0]['status'],'INTERRUPTED')


class WaypointHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.repo=Repository(Path(cls.temp.name)/'api.sqlite3')
        cls.server=create_server(cls.repo,port=0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.port=cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=3);cls.temp.cleanup()

    def call(self,method,url,data=None):
        conn=HTTPConnection('127.0.0.1',self.port,timeout=5)
        headers={'Host':f'localhost:{self.port}'}
        if data is not None:
            data=json.dumps(data)
            headers['Content-Type']='application/json'
        conn.request(method,url,body=data,headers=headers)
        resp=conn.getresponse()
        raw=resp.read();code=resp.status
        conn.close()
        return code,json.loads(raw)

    def test_api_opt_in_save_and_session_export(self):
        status,not_saved=self.call('POST','/api/survey/waypoints',candidate(20000))
        self.assertEqual(status,400)
        status,session=self.call('POST','/api/sessions',{'name':'Private waypoint investigation'})
        self.assertEqual(status,201)
        status,saved=self.call('POST','/api/survey/waypoints',candidate(session['id']))
        self.assertEqual(status,201)
        self.assertEqual(saved['waypoint']['session_id'],session['id'])
        status,data=self.call('GET','/api/survey/waypoints')
        self.assertEqual(status,200)
        self.assertEqual(data['total'],1)
        status,geo=self.call('GET',f"/api/survey/waypoints.geojson?session_id={session['id']}")
        self.assertEqual(status,200)
        self.assertEqual(len(geo['features']),1)
        self.assertEqual(geo['features'][0]['properties']['location_source'],'BROWSER_REPORTED')
        status,_=self.call('GET','/api/survey/waypoints.geojson')
        self.assertEqual(status,400)
        status,_=self.call('GET','/api/survey/waypoints.geojson?session_id=234567')
        self.assertEqual(status,404)
        status,_=self.call('POST','/api/survey/waypoints',candidate(session['id'],rssi_dbm=-42))
        self.assertEqual(status,400)
        status,_=self.call('DELETE',f"/api/survey/waypoints/{saved['waypoint']['id']}")
        self.assertEqual(status,200)
        status,data=self.call('GET','/api/survey/waypoints')
        self.assertEqual(data['total'],0)


if __name__=='__main__': unittest.main()
