"""v0.2.59: local Valhalla verbal text and optional OSM lane metadata."""
import io
import json
import unittest
from openrf.routing import local_route, normalize_result
from test_routing_geocoding import encoded


class Reply(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *args): self.close()


class LaneVoiceTests(unittest.TestCase):
    def setUp(self):
        self.points = [[-120.6, 38.4], [-120.598, 38.401], [-120.596, 38.402]]
        self.req = [{'lat': 38.4, 'lon': -120.6}, {'lat': 38.402, 'lon': -120.596}]

    def test_valhalla_opt_in_turn_lanes_and_verbal_without_network(self):
        payloads = []
        response = {'trip': {'summary': {'length': 1.2, 'time': 156}, 'legs': [
            {'shape': encoded(self.points), 'maneuvers': [
                {'instruction': 'Turn left.', 'length': .3, 'begin_shape_index': 1,
                 'verbal_transition_alert_instruction': 'In a quarter mile, turn left.',
                 'verbal_pre_transition_instruction': 'Turn left at the next street.',
                 'lanes': [{'directions': 8, 'active': 8},
                           {'directions': 10, 'valid': 8}]}
            ]}]}}
        def opener(request, timeout):
            self.assertEqual(request.full_url, 'http://127.0.0.1:8002/route')
            payloads.append(json.loads(request.data))
            return Reply(json.dumps(response).encode())
        result = local_route([
            {'latitude': 38.4, 'longitude': -120.6},
            {'latitude': 38.402, 'longitude': -120.596}],
            open_connection=opener, port=8002)
        self.assertTrue(payloads[0]['turn_lanes'])
        self.assertEqual(result['maneuvers'][0]['lanes'][0]['active'], 8)
        self.assertEqual(result['maneuvers'][0]['verbal_pre_transition_instruction'],
                         'Turn left at the next street.')
        self.assertFalse(result['live_traffic'])
        self.assertEqual(result['traffic_status'], 'NOT_CONFIGURED')

    def test_missing_or_invalid_metadata_is_not_invented(self):
        response = {'trip': {'summary': {'length': 1.2, 'time': 100}, 'legs': [
            {'shape': encoded(self.points), 'maneuvers': [
                {'instruction': 'Turn right.', 'begin_shape_index': 1,
                 'lanes': [{'directions': 'right', 'active': 8}],
                 'verbal_pre_transition_instruction': '<>' * 400},
                {'instruction': 'Continue.', 'begin_shape_index': 2,
                 'lanes': [{'directions': 64, 'active': 8}],
                 'verbal_transition_alert_instruction': None}
            ]}]}}
        result = normalize_result(response, self.req)
        first, second = result['maneuvers']
        self.assertNotIn('lanes', first)
        self.assertEqual(len(first['verbal_pre_transition_instruction']), 300)
        self.assertEqual(second['lanes'][0], {'directions': 64})
        self.assertNotIn('verbal_transition_alert_instruction', second)

if __name__ == '__main__': unittest.main()
