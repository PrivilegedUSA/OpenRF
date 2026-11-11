"""v0.2.23 local navigation foundations: no road routing or auto tracking."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.navigation import normalize_destination
from openrf.server import create_server
from openrf.storage import Repository


class NavigationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repository(Path(self.tmp.name) / 'investigations.sqlite3')
        self.server = create_server(self.repo, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.tmp.cleanup()

    def api(self, method, path, data=None, headers=None):
        conn = HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=3)
        actual = {'Host': 'localhost:' + str(self.server.server_address[1])}
        if data is not None:
            actual['Content-Type'] = 'application/json'
            data = json.dumps(data)
        actual.update(headers or {})
        conn.request(method, path, body=data, headers=actual)
        reply = conn.getresponse()
        payload = reply.read()
        status = reply.status
        conn.close()
        return status, json.loads(payload) if reply.getheader('Content-Type', '').startswith('application/json') else payload

    def test_coordinates_rejected_when_invalid_or_extra_fields(self):
        for data in ({'name': 'a', 'latitude': None, 'longitude': -120},
                     {'name': '', 'latitude': 0, 'longitude': 0},
                     {'name': 'x', 'latitude': True, 'longitude': 0},
                     {'name': 'x', 'latitude': 91, 'longitude': 0},
                     {'name': 'x', 'latitude': 0, 'longitude': float('inf')},
                     {'name': 'x', 'latitude': 0, 'longitude': 181},
                     {'name': 'x', 'latitude': 1, 'longitude': 2, 'url': 'https://example.org'},
                     {'name': 'x'*121, 'latitude': 0, 'longitude': 0}):
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    normalize_destination(data)

    def test_save_list_delete_only_destinations(self):
        status, out = self.api('POST', '/api/navigation/destinations',
                               {'name':'Test map waypoint', 'latitude':38.123, 'longitude':-120.987})
        self.assertEqual(status, 201)
        destination = out['destination']
        self.assertEqual(destination['name'], 'Test map waypoint')
        self.assertTrue(destination['created_at_utc'])
        status, collection = self.api('GET','/api/navigation/destinations')
        self.assertEqual(status, 200)
        self.assertEqual(len(collection['destinations']), 1)
        self.assertFalse(collection['location_tracking'])
        self.assertEqual(collection['routing_status'], 'not_implemented')
        self.assertEqual(self.repo.list_observations(), [])
        self.assertEqual(self.repo.list_waypoints()['total'], 0)
        status, out = self.api('DELETE',f"/api/navigation/destinations/{destination['id']}")
        self.assertEqual(status, 200)
        self.assertTrue(out['deleted'])
        self.assertEqual(self.repo.list_destinations(), [])

    def test_invalid_requests_do_not_modify_storage(self):
        for body in ({'name':'Invalid','latitude':'0'},
                     {'name':'x','latitude':1,'longitude':2,'session_id':1},
                     {'name':'x','latitude':500,'longitude':2}):
            self.assertEqual(self.api('POST','/api/navigation/destinations',body)[0], 400)
        self.assertEqual(self.repo.list_destinations(), [])
        self.assertEqual(self.api('DELETE','/api/navigation/destinations/none')[0],400)
        self.assertEqual(self.api('DELETE','/api/navigation/destinations/../other')[0],404)
        self.assertEqual(self.api('POST','/api/navigation/destinations',
                                  {'name':'x','latitude':0,'longitude':0},
                                  headers={'Origin':'https://invalid.example'})[0],403)

    def test_navigation_routes_do_not_require_rf_scans_or_geolocation(self):
        status, out = self.api('GET','/api/navigation/destinations')
        self.assertEqual((status,out['destinations']), (200,[]))
        self.assertFalse(out['location_tracking'])
        self.assertEqual(out['routing_status'], 'not_implemented')

if __name__ == '__main__':
    unittest.main()
