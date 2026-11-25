import unittest
from openrf.mesh_dashboard import dashboard, meshtastic_rows, position
from openrf.mesh import MeshManager

class DashboardTests(unittest.TestCase):
    def test_sources_and_coordinates(self):
        rows = meshtastic_rows({'nodes':[{'id':'!12345678','alias':'Saved'}]}, {'!abcdef12':{'user':{'longName':'Radio','role':'ROUTER'},'position':{'latitudeI':380000000,'longitudeI':-1200000000},'snr':-4,'deviceMetrics':{'batteryLevel':101}}})
        self.assertEqual(len(rows),2)
        self.assertIsNone(rows[0]['position'])
        self.assertEqual(rows[1]['position']['latitude'],38)
        self.assertTrue(rows[1]['infrastructure'])
        self.assertNotIn('Battery (%)',rows[1]['telemetry'])
        self.assertIsNone(position({'latitude':0,'longitude':0}))
        self.assertIsNone(position({'latitude':91,'longitude':0}))
    def test_disconnected_no_radio(self):
        manager=MeshManager(sdk_available=lambda:False,port_provider=lambda:[])
        self.assertEqual(manager.radio_nodes(),{})
    def test_inventory_read_only(self):
        class Manager:
            def status(self): return {'connected':False,'sdk_available':True}
            def nodes(self): return {'nodes':[]}
            def contacts(self): return {'contacts':[{'address':'abc','alias':'Saved'}]}
            def radio_nodes(self): raise AssertionError('must not access disconnected radio')
        result=dashboard(Manager(),Manager(),Manager())
        self.assertEqual(len(result['networks']),3)
        self.assertEqual(result['nodes'][0]['quality'],'Saved destination')
        self.assertIsNone(result['nodes'][0]['last_heard'])
