"""Walking preflight claims must stay evidence-limited and no-location."""
import json
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch
from openrf.offline_navigation_readiness import readiness_report
from openrf.server import create_server
from openrf.storage import Repository


class WalkingReadinessTests(unittest.TestCase):
    def test_reachable_router_is_not_pedestrian_graph_proof(self):
        report = readiness_report(route_status={'reachable':True,'detail':'ready'},
            vector_status={'ready':False},raster_maps=[],imported_trail_count=3,
            now=datetime(2026,11,19,tzinfo=timezone.utc))
        self.assertTrue(report['pedestrian_router_reachable'])
        self.assertFalse(report['pedestrian_graph_coverage_verified'])
        self.assertFalse(report['walking_follow_supported'])
        self.assertFalse(report['trail_access_or_closures_verified'])
        self.assertEqual(report['imported_gpx_reference_count'],3)
        self.assertFalse(report['gps_fix_checked'])
        self.assertFalse(report['external_requests'])
        self.assertTrue(report['read_only'])

    def test_bad_reference_counts_rejected(self):
        for value in (-1,True,1.5,'5'):
            with self.subTest(value=value),self.assertRaises(ValueError):
                readiness_report(route_status={},vector_status={},raster_maps=[],
                    imported_trail_count=value)

    def test_local_api_reads_private_trail_inventory_without_location(self):
        with tempfile.TemporaryDirectory() as directory:
            server=create_server(Repository(Path(directory)/'db.sqlite3'),port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                with patch('openrf.server.local_status',return_value={'reachable':True,'detail':'test'}), \
                     patch('openrf.server.vector_maps.status',return_value={'ready':False}), \
                     patch('openrf.server.available_maps',return_value=[]):
                    conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=5)
                    conn.request('GET','/api/navigation/offline-readiness')
                    response=conn.getresponse()
                    self.assertEqual(response.status,200)
                    report=json.loads(response.read());conn.close()
                    self.assertEqual(report['imported_gpx_reference_count'],0)
                    self.assertFalse(report['pedestrian_graph_coverage_verified'])
                    self.assertNotIn('location',report)
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)

    def test_ui_renders_separate_walking_claims(self):
        source=(Path(__file__).resolve().parents[1]/'openrf/static/offline_readiness.js').read_text()
        for token in ('Walking router','Imported GPX references','Walking safety / follow',
                      'pedestrian_router_reachable','imported_gpx_reference_count'):
            self.assertIn(token,source)

if __name__=='__main__':unittest.main()
