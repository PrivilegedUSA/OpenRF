import io
import json
import tempfile
import threading
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
from openrf import camera_catalog as cam
from openrf.camera_jobs import ImportManager
from openrf.storage import Repository

class CameraJobs(unittest.TestCase):
    def test_provider_fallback_bytes_and_completion(self):
        raw=json.dumps({'elements':[{'type':'node','id':1,'lat':38.5,'lon':-120.5,'tags':{'highway':'speed_camera'}}]}).encode()
        entered=threading.Event(); release=threading.Event()
        class Reply(io.BytesIO):
            headers={'Content-Length':str(len(raw))}
            def read(self,n):
                entered.set(); release.wait(5)
                return super().read(n)
        with tempfile.TemporaryDirectory() as d:
            manager=ImportManager(Repository(Path(d)/'db.sqlite3'))
            with patch.object(cam.urllib.request,'urlopen',side_effect=[urllib.error.HTTPError('https://example.invalid',504,'timeout',None,None),Reply(raw)]):
                try:
                    manager.start([-121,38,-120,39]); self.assertTrue(entered.wait(4))
                    status=manager.status(); self.assertTrue(status['running']);self.assertEqual(status['phase'],'downloading');self.assertEqual(status['total_bytes'],len(raw));self.assertIn('HTTP 504',status['errors'][0]);self.assertEqual(status['provider'],cam.OVERPASS_ENDPOINTS[1]);
                    with self.assertRaises(RuntimeError):manager.start([-121,38,-120,39])
                finally:release.set();manager.thread.join(5)
            status=manager.status();self.assertEqual(status['phase'],'complete');self.assertEqual(status['received_bytes'],len(raw));self.assertEqual(status['result']['counts']['SPEED'],1)
            self.assertEqual(len(cam.list_sites(manager.repo,[-121,38,-120,39])['sites']),1)

    def test_failed_job_preserves_previous_rows(self):
        with tempfile.TemporaryDirectory() as d:
            repo=Repository(Path(d)/'db.sqlite3');manager=ImportManager(repo)
            cam.add_manual(repo,{'type':'RED_LIGHT','label':'Manual','latitude':38.5,'longitude':-120.5,'source':'notes'})
            with patch.object(cam.urllib.request,'urlopen',side_effect=urllib.error.URLError('offline')):
                manager.start([-121,38,-120,39]);manager.thread.join(5)
            self.assertEqual(manager.status()['phase'],'failed');self.assertEqual(len(manager.status()['errors']),len(cam.OVERPASS_ENDPOINTS));self.assertEqual(len(cam.list_sites(repo,[-121,38,-120,39])['sites']),1)
