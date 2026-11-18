"""v0.2.111: route proximity is not the same as directional encounter."""
import tempfile
import unittest
from pathlib import Path

from openrf import camera_catalog, camera_routes
from openrf.storage import Repository


class CameraDirectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repository(Path(self.tmp.name) / 'openrf.sqlite3')
        self.east = {'type': 'ROAD_ROUTE', 'is_driving_route': True,
                     'coordinates': [[-120.70, 38.4], [-120.66, 38.4]]}
        self.west = {**self.east, 'coordinates': list(reversed(self.east['coordinates']))}

    def tearDown(self):
        self.tmp.cleanup()

    def camera(self, direction):
        camera_catalog.add_manual(self.repo, {
            'type': 'ALPR', 'state': 'REPORTED', 'label': 'Test camera',
            'latitude': 38.40005, 'longitude': -120.68,
            'direction': direction, 'source': 'Synthetic unit test'})

    def test_reported_west_lens_matches_eastbound_oncoming_only(self):
        self.camera('W')
        east = camera_routes.route_cameras(self.repo, self.east)
        west = camera_routes.route_cameras(self.repo, self.west)
        self.assertEqual(east['count'], 1)
        self.assertEqual(east['direction_matched_count'], 1)
        self.assertEqual(west['count'], 1, 'Lens bearing must not erase a nearby camera')
        self.assertEqual(west['nearby_count'], 1)
        self.assertEqual(west['not_direction_matched_count'], 1)
        self.assertEqual(west['sites'][0]['direction_assessment'], 'not_direction_matched')

    def test_camera_point_near_road_but_facing_away_is_not_match(self):
        self.camera('N')  # North of road, looking further north.
        self.assertEqual(camera_routes.route_cameras(self.repo, self.east)['count'], 1)
        self.assertEqual(camera_routes.route_cameras(self.repo, self.east)['nearby_count'], 1)

    def test_missing_or_unparseable_direction_remains_potential(self):
        for direction in ('', 'forward', 'unknown'):
            with self.subTest(direction=direction):
                camera_catalog.add_manual(self.repo, {
                    'type': 'ALPR', 'label': 'Unknown direction', 'latitude': 38.40005,
                    'longitude': -120.679 + len(direction) / 100000,
                    'direction': direction, 'source': 'Synthetic unit test'})
        west = camera_routes.route_cameras(self.repo, self.west)
        self.assertEqual(west['count'], 3)
        self.assertEqual(west['unknown_direction_count'], 3)
        self.assertEqual(west['excluded_by_direction'], 0)

    def test_camera_bearings_and_clockwise_ranges(self):
        self.assertEqual(camera_routes._view_sector('270'), (270.0, 270.0))
        self.assertEqual(camera_routes._view_sector('SW-NE'), (225.0, 45.0))
        self.assertTrue(camera_routes._sector_contains(
            camera_routes._view_sector('270-90'), 0, 0))
        self.assertFalse(camera_routes._sector_contains(
            camera_routes._view_sector('90-270'), 0, 0))
        self.assertTrue(camera_routes._sector_contains(
            camera_routes._view_sector('0-360'), 180, 0))
        self.assertIsNone(camera_routes._view_sector('left'))

    def test_directional_match_not_proof_of_coverage(self):
        self.camera('270')
        report = camera_routes.route_cameras(self.repo, self.east)
        self.assertIn('remain counted', report['notice'])
        self.assertEqual(report['sites'][0]['direction_assessment'], 'orientation_match')
        self.assertEqual(report['sites'][0]['direction'], '270')

    def test_comparison_explains_nearby_but_not_direction_matched(self):
        self.camera('N')
        locations = [{'latitude': 38.4, 'longitude': -120.70},
                     {'latitude': 38.4, 'longitude': -120.66}]
        result = camera_routes.compare(self.repo, locations, ['ALPR'],
                                       router=lambda _locations, **_opts: self.east)
        self.assertIsNone(result['alternative'])
        self.assertEqual(result['standard_cameras']['count'], 1)
        self.assertEqual(result['standard_cameras']['nearby_count'], 1)
        self.assertEqual(result['attempts'], 1,
                         'The nearby camera must still cause an alternate request')
        self.assertIn('same or nearly the same road', result['detail'])


if __name__ == '__main__':
    unittest.main()
