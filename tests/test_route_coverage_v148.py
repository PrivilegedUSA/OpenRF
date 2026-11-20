"""v0.2.149: local, sampled and deliberately non-certifying offline route coverage."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.offline_navigation_readiness import route_coverage_report
from openrf.server import create_server
from openrf.storage import Repository


class RouteCoverageTests(unittest.TestCase):
    def test_local_samples_are_counted_by_one_basemap_not_mixed(self):
        vector_calls = []
        raster_calls = []
        report = route_coverage_report(
            points=[[-120.63, 38.48], [-120.62, 38.49], [-120.61, 38.50]],
            route_status={'reachable': True},
            vector_status={'ready': True, 'fonts_ready': True, 'minzoom': 0, 'maxzoom': 14},
            raster_maps=[{'id': 'local-topo', 'name': 'Local topo', 'minzoom': 10, 'maxzoom': 14}],
            vector_probe=lambda z, x, y: (vector_calls.append((z, x, y)) or
                                          (b'vector' if len(vector_calls) < 3 else None)),
            raster_probe=lambda name, z, x, y: (raster_calls.append((name, z, x, y)) or
                                                (b'raster' if len(raster_calls) > 1 else None)))
        self.assertEqual(report['kind'], 'OFFLINE_ROUTE_TILE_SAMPLES')
        self.assertEqual(report['vector_basemap']['sampled_tiles_present'], 2)
        self.assertEqual(report['raster_basemaps'][0]['sampled_tiles_present'], 2)
        self.assertFalse(report['some_basemap_has_all_sampled_tiles'])
        self.assertFalse(report['road_graph_coverage_verified'])
        self.assertFalse(report['continuous_tile_coverage_verified'])
        self.assertFalse(report['gps_fix_checked'])
        self.assertFalse(report['external_requests'])
        self.assertTrue(report['read_only'])
        self.assertEqual(len(vector_calls), 3)
        self.assertEqual(len(raster_calls), 3)

    def test_present_samples_do_not_certify_continuous_coverage(self):
        report = route_coverage_report(
            points=[[-120.5, 38.4], [-120.6, 38.5]], route_status={'reachable': False},
            vector_status={'ready': True, 'fonts_ready': True, 'maxzoom': 11}, raster_maps=[],
            vector_probe=lambda *_: b'present', raster_probe=lambda *_: None)
        self.assertTrue(report['some_basemap_has_all_sampled_tiles'])
        self.assertEqual(report['vector_basemap']['zoom_tested'], 11)
        self.assertFalse(report['routing_service_reachable'])
        self.assertFalse(report['continuous_tile_coverage_verified'])

    def test_missing_tiles_and_invalid_inputs_are_handled(self):
        report = route_coverage_report(
            points=[[0, 0], [1, 1]], route_status={},
            vector_status={'ready': False},
            raster_maps=[{'id': 'map', 'name': 'Map', 'minzoom': 0, 'maxzoom': 13}],
            vector_probe=lambda *_: self.fail('Unready vector map must not be read'),
            raster_probe=lambda *_: (_ for _ in ()).throw(ValueError('tile missing')))
        self.assertEqual(report['best_single_basemap_sampled_tiles_present'], 0)
        self.assertFalse(report['some_basemap_has_all_sampled_tiles'])
        for points in ([], [[0, 0]], [[0, 0]] * 26, [[float('nan'), 0], [0, 0]],
                       [[True, 0], [0, 0]], [[181, 0], [0, 0]], [[0, 86], [0, 0]],
                       [[0, 0, 5], [0, 0]], 'not a route'):
            with self.subTest(points=points), self.assertRaises(ValueError):
                route_coverage_report(points=points, route_status={}, vector_status={},
                                      raster_maps=[], vector_probe=lambda *_: None,
                                      raster_probe=lambda *_: None)

    def test_loopback_api_is_read_only_bounded_and_only_probes_local_sources(self):
        with tempfile.TemporaryDirectory() as temp:
            server = create_server(Repository(Path(temp) / 'test.sqlite3'), port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                port = server.server_address[1]

                def post(payload, host=None):
                    conn = HTTPConnection('127.0.0.1', port, timeout=4)
                    conn.request('POST', '/api/navigation/route-coverage',
                                 body=json.dumps(payload),
                                 headers={'Host': host or f'localhost:{port}',
                                          'Content-Type': 'application/json'})
                    response = conn.getresponse()
                    code, body = response.status, response.read()
                    conn.close()
                    return code, json.loads(body)

                with patch('openrf.server.local_status', return_value={'reachable': True}), \
                     patch('openrf.server.vector_maps.status', return_value={
                         'ready': True, 'fonts_ready': True, 'minzoom': 0, 'maxzoom': 12}), \
                     patch('openrf.server.available_maps', return_value=[]), \
                     patch('openrf.server.vector_maps.tile', return_value=(b'tile', False)) as tile:
                    code, report = post({'points': [[-120.5, 38.4], [-120.4, 38.5]]})
                    self.assertEqual(code, 200)
                    self.assertTrue(report['some_basemap_has_all_sampled_tiles'])
                    self.assertEqual(tile.call_count, 2)
                    self.assertTrue(report['read_only'])
                    self.assertFalse(report['external_requests'])
                    self.assertEqual(post({'points': [[0, 0]]})[0], 400)
                    self.assertEqual(post({'points': [[0, 0], [1, 1]], 'allow_online': True})[0], 400)
                    self.assertEqual(post({'points': [[0, 0], [1, 1]]}, host='evil.example')[0], 403)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
