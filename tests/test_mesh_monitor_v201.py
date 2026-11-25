import tempfile, unittest, time
from pathlib import Path
from openrf.mesh_history import MeshHistory
from openrf.mesh_monitor import MeshMonitor, topology

class MonitorTest(unittest.TestCase):
    def test_collect_opt_in(self):
        with tempfile.TemporaryDirectory() as d:
            h=MeshHistory(Path(d)/'db'); calls=[]
            n=dict(protocol='Meshtastic',id='!12345678',source='RADIO_NODE_DATABASE',telemetry={})
            def snapshot():
                calls.append(1); return dict(nodes=[n],networks=[])
            m=MeshMonitor(h,snapshot)
            try:
                m.collect(); self.assertEqual(calls,[])
                h.configure(dict(enabled=True,days=30,interval_seconds=15,background_enabled=True));m.collect();m.collect()
                self.assertEqual(h.history(n['protocol'],n['id'])['count'],1)
                self.assertIsNotNone(m.status()['last_success'])
            finally: m.close()
            self.assertFalse(m.thread.is_alive())
    def test_topology(self):
        a=dict(protocol='Reticulum',id='ab'*16,name='A',route=dict(via='cd'*16,expired=True,hops=2))
        self.assertEqual(topology([a])[0]['via'],'cd'*16)
        self.assertTrue(topology([a])[0]['expired'])
        self.assertEqual(topology([dict(a,protocol='MeshCore'),dict(a,route={'via':a['id']})]),[])
