import unittest
import time
from openrf.reticulum_lan import path_inventory
from openrf.mesh_dashboard import dashboard, reticulum_rows

class Paths(unittest.TestCase):
    def test_cache(self):
        now=time.time()
        class RNS:
            def get_path_table(self):
                return [{'hash':bytes.fromhex('ab'*16),'timestamp':now-10,'expires':now+60,'hops':2,'via':bytes.fromhex('cd'*16),'interface':'LAN'}, {'hash':'ef'*16,'expires':now-1,'hops':True}, {'hash':'bad'}, {'hash':'12'*16}]
        report=path_inventory(RNS(), '12'*16)
        self.assertTrue(report['available'])
        self.assertEqual(report['total'],2)
        rows=reticulum_rows([{'address':'AB'*16,'alias':'Friend'}], report['paths'])
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]['name'],'Friend')
        self.assertTrue(rows[0]['saved_contact'])
        self.assertIsNone(rows[0]['last_heard'])
        self.assertIsNone(rows[0]['position'])
        self.assertEqual(rows[0]['telemetry']['Hops away'],2)
        self.assertEqual(rows[1]['quality'],'Expired cached path')
        self.assertEqual(rows[1]['telemetry'],{})
    def test_unsupported(self):
        self.assertFalse(path_inventory(object())['available'])
    def test_dashboard_failure_preserves_contacts(self):
        class Manager:
            def status(self): return {'enabled':True,'dependencies_available':True}
            def contacts(self): return {'contacts':[{'address':'ab'*16,'alias':'Friend'}]}
            def mesh_inventory(self): raise RuntimeError()
        result=dashboard(Manager(),Manager(),Manager())
        self.assertEqual(result['networks'][-1]['saved_count'],1)
        self.assertIsNone(result['networks'][-1]['path_count'])
        self.assertEqual(result['nodes'][-1]['quality'],'Saved destination')
