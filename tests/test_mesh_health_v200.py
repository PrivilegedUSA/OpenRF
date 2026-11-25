import unittest
from openrf.mesh_dashboard import network_health

class HealthTests(unittest.TestCase):
    def test_age_and_metrics(self):
        rows=[dict(last_heard=6400, telemetry={'RSSI (dBm)':-80,'Battery (%)':0}, infrastructure=True),dict(last_heard=6399,telemetry={'RSSI (dBm)':-100,'Battery (%)':101}),dict(last_heard=None,route={'expired':True},position={}),dict(last_heard=10001)]
        h=network_health(rows,10000)
        self.assertEqual((h['recent'],h['stale'],h['age_unknown']),(1,1,2))
        self.assertEqual(h['telemetry']['RSSI (dBm)']['mean'],-90)
        self.assertEqual(h['telemetry']['Battery (%)']['samples'],1)
        self.assertEqual((h['located'],h['infrastructure'],h['expired_paths']),(1,1,1))
    def test_empty(self):
        h=network_health([],10000)
        self.assertIsNone(h['telemetry']['SNR (dB)'])
        self.assertEqual(h['recent'],0)
