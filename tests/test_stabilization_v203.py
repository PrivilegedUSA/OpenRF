"""Privacy, fail-soft behavior and concurrency checks, using only temporary fixtures."""
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
import http.client
import json
import os
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from openrf.mesh_dashboard import dashboard
from openrf.mesh_monitor import SnapshotCoordinator, SnapshotBusy
from openrf.mesh_history import MeshHistory
from openrf.storage import Repository
from openrf.server import create_server
from openrf.emergency import EmergencyStore
from openrf.breadcrumbs import BreadcrumbStore
from openrf.surveillance_recording import RecordingManager
from openrf.mesh import MeshManager

class StabilityTests(unittest.TestCase):
    def test_single_flight(self):
        started, release = threading.Event(), threading.Event(); results=[]
        def read():
            started.set(); release.wait(2); return {'nodes':[]}
        c=SnapshotCoordinator(read); t=threading.Thread(target=lambda:results.append(c())); t.start()
        try:
            self.assertTrue(started.wait(1))
            with self.assertRaises(SnapshotBusy): c()
        finally:
            release.set(); t.join(2)
        self.assertFalse(t.is_alive()); self.assertGreater(results[0]['snapshot_at'],0); self.assertEqual(c()['nodes'],[])

    def test_occupied_radio_does_not_block_inventory(self):
        class Busy:
            _lock=threading.RLock()
            def status(self): raise AssertionError('must not access busy manager')
        class Off:
            def status(self): return {'connected':False,'sdk_available':True}
            def nodes(self): return {'nodes':[]}
            def contacts(self): return {'contacts':[]}
        b=Busy(); entered, release=threading.Event(),threading.Event()
        def occupy():
            with b._lock: entered.set(); release.wait(3)
        t=threading.Thread(target=occupy);t.start()
        try:
            self.assertTrue(entered.wait(1)); start=time.monotonic(); result=dashboard(b,Off(),Off())
            self.assertLess(time.monotonic()-start,1); self.assertIn('busy',result['networks'][0]['state']); self.assertEqual(result['networks'][1]['state'],'Disconnected')
        finally: release.set();t.join()

    def test_private_files_clear_disables_and_closes(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'db'; repo=Repository(p); h=MeshHistory.separate(p)
            self.assertEqual(p.stat().st_mode & 0o777,0o600); self.assertEqual(Path(h.path).stat().st_mode & 0o777,0o600)
            h.configure({'enabled':True,'days':30,'background_enabled':True})
            n=dict(protocol='MeshCore',id='a',source='RADIO_CONTACT_LIST'); h.record([n]);self.assertEqual(h.usage()['samples'],1)
            h.clear(); h.record([n]); self.assertEqual(h.usage()['samples'],0); self.assertFalse(h.settings()['background_enabled']);self.assertFalse(h.settings()['enabled'])
            link=Path(d)/'link'; link.symlink_to(p)
            with self.assertRaises(OSError): MeshHistory(link)
            with self.assertRaises(OSError): Repository(link)
            for cm in [EmergencyStore(p)._connect,BreadcrumbStore(p)._connect,RecordingManager(p)._db,MeshManager(history_path=Path(d)/'messages')._db]:
                with cm() as db: self.assertEqual(db.execute('SELECT 1').fetchone()[0],1)
                with self.assertRaises(sqlite3.ProgrammingError): db.execute('SELECT 1')

    def test_http_privacy_and_optional_storage_failure(self):
        with tempfile.TemporaryDirectory() as d:
            repo=Repository(Path(d)/'db'); log=StringIO()
            with patch('openrf.mesh_history.MeshHistory.separate',side_effect=sqlite3.OperationalError('fixture')):
                s=create_server(repo,0)
            t=threading.Thread(target=s.serve_forever,daemon=True);t.start()
            def req(method,path,headers=None,body=None):
                c=http.client.HTTPConnection('127.0.0.1',s.server_port,timeout=5)
                try:
                    c.request(method,path,body=body,headers=headers or {});r=c.getresponse(); return r.status,json.loads(r.read())
                finally:c.close()
            try:
                with redirect_stderr(log):
                    self.assertEqual(req('GET','/api/mesh/dashboard',{'Origin':'https://example.invalid'})[0],403)
                    self.assertEqual(req('GET','/api/mesh/dashboard',{'Sec-Fetch-Site':'cross-site'})[0],403)
                    status,data=req('GET','/api/mesh/dashboard');self.assertEqual(status,200);self.assertIn('history_error',data)
                    self.assertEqual(req('GET','/api/mesh/dashboard/history?protocol=Meshtastic&id=PRIVATE-TEST-ID')[0],503)
                    self.assertEqual(req('POST','/api/mesh/dashboard/history/clear',{'Content-Type':'application/json'},'{"confirm":true}')[0],503)
                self.assertNotIn('PRIVATE-TEST-ID',log.getvalue())
            finally: s.shutdown();s.server_close();t.join(2)

if __name__=='__main__': unittest.main()
