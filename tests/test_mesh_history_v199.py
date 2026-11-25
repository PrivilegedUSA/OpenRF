import tempfile,time,unittest
from pathlib import Path
from openrf.mesh_history import MeshHistory
class HistoryTest(unittest.TestCase):
    def test_opt_in_dedup_and_clear(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'db.sqlite'; h=MeshHistory(p); now=time.time(); n=dict(protocol='Meshtastic',id='!12345678',source='RADIO_NODE_DATABASE',telemetry={'RSSI (dBm)':-90},last_heard=now)
            h.record([n],now); self.assertEqual(h.history(n['protocol'],n['id'])['count'],0)
            h.configure(dict(enabled=True,days=30)); h.record([n],now); h.record([dict(n,quality='Stale')],now+1); h.record([dict(n,telemetry={'RSSI (dBm)':-80})],now+2)
            self.assertEqual(MeshHistory(p).history(n['protocol'],n['id'])['count'],2)
            h.clear(); self.assertEqual(h.history(n['protocol'],n['id'])['count'],0)
    def test_retention_and_saved_contacts(self):
        with tempfile.TemporaryDirectory() as d:
            h=MeshHistory(Path(d)/'db'); now=time.time(); h.configure(dict(enabled=True,days=1)); n=dict(protocol='MeshCore',id='a',source='RADIO_CONTACT_LIST')
            h.record([n],now-90000); h.record([dict(n,source='PRIVATE_SAVED_CONTACT')],now); self.assertEqual(h.history('MeshCore','a')['count'],0)
            with self.assertRaises(ValueError): h.configure(dict(enabled=True,days=0))
