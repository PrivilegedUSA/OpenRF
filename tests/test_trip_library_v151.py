"""v0.2.151: read-only classified map inventory and safe existing deletion."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.offline_maps import map_info, available_maps
from openrf.map_areas import save_area
from openrf.server import create_server
from openrf.storage import Repository
from openrf.trip_maps import trip_tile_plan, download_trip

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 40
POINTS = [[-120.648, 38.48], [-120.637, 38.488]]


class TripLibraryTests(unittest.TestCase):
    def test_trip_package_is_classified_but_coverage_is_not_claimed_verified(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            lock = threading.Lock()
            plan = trip_tile_plan(POINTS, 0.5, 9, 11, 'topographic')
            download_trip(folder, plan, 'trail-weekend', lock, fetch=lambda *_: PNG)
            info = map_info(folder, 'trail-weekend')
            self.assertEqual(info['package_kind'], 'TRIP_CORRIDOR')
            self.assertEqual(info['source_label'], 'USGS Topographic')
            self.assertEqual(info['declared_tile_count'], plan['tile_count'])
            self.assertGreater(info['size_bytes'], 100)
            self.assertEqual(len(available_maps(folder)), 1)

    def test_catalog_is_read_only_local_bounded_and_counts_separate_plans(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            server = create_server(Repository(root / 'db.sqlite3'), port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                download_trip(server.map_directory, trip_tile_plan(POINTS, 0.5, 9, 11, 'satellite'),
                              'small-trip', server.map_lock, fetch=lambda *_: PNG)
                plan = save_area(server.map_directory, 'Trip planning only', [-120.8,38.3,-120.6,38.6],
                                 9, 11, server.map_lock)
                def get(path, host=None):
                    conn = HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    conn.request('GET', path, headers={'Host':host or f'localhost:{server.server_port}'})
                    response = conn.getresponse()
                    status = response.status
                    raw = response.read()
                    data = json.loads(raw) if response.getheader('Content-Type', '').startswith('application/json') else raw
                    conn.close()
                    return status, data
                code, data = get('/api/maps/catalog')
                self.assertEqual(code, 200)
                self.assertTrue(data['read_only'])
                self.assertTrue(data['local_only'])
                self.assertFalse(data['bounds_verified'])
                self.assertFalse(data['routing_graph_included'])
                self.assertEqual(data['package_count'], 1)
                self.assertEqual(data['maps'][0]['package_kind'], 'TRIP_CORRIDOR')
                self.assertEqual(data['total_bytes'], data['maps'][0]['size_bytes'])
                self.assertEqual(data['area_plans'][0]['id'], plan['id'])
                self.assertEqual(get('/api/maps/catalog?all=true')[0], 400)
                self.assertEqual(get('/api/maps/catalog', 'evil.example')[0], 403)
                self.assertEqual(get('/static/saved-trips.js')[0], 200)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
