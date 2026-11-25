import io,json,tempfile,unittest,urllib.parse
from pathlib import Path
from unittest.mock import patch
from openrf import camera_catalog as cam
from openrf.camera_jobs import ImportManager
from openrf.storage import Repository

class CameraScopeTests(unittest.TestCase):
    bounds=[-121,38,-120,39]
    def test_traffic_only_job_filters_query_and_storage(self):
        elements=[{'type':'node','id':1,'lat':38.5,'lon':-120.5,'tags':{'man_made':'surveillance','surveillance:type':'ALPR'}},
                  {'type':'node','id':2,'lat':38.5,'lon':-120.5,'tags':{'highway':'speed_camera'}},
                  {'type':'node','id':3,'lat':38.5,'lon':-120.5,'tags':{'highway':'red_light_camera'}}]
        raw=json.dumps({'elements':elements}).encode()
        response=io.BytesIO(raw);response.headers={'Content-Length':str(len(raw))}
        with tempfile.TemporaryDirectory() as d:
            repo=Repository(Path(d)/'db.sqlite3');manager=ImportManager(repo)
            cam.add_manual(repo,{'type':'ALPR','label':'saved','latitude':38.5,'longitude':-120.5,'source':'notes'})
            with patch.object(cam.urllib.request,'urlopen',return_value=response) as network:
                manager.start(self.bounds,['SPEED','RED_LIGHT']);manager.thread.join(5)
                query=urllib.parse.parse_qs(network.call_args.args[0].data.decode())['data'][0]
            self.assertNotIn('ALPR',query);self.assertIn('speed_camera',query);self.assertIn('red_light_camera',query)
            result=manager.status()['result'];self.assertEqual(result['counts'],{'ALPR':0,'SPEED':1,'RED_LIGHT':1})
            self.assertEqual(result['types'],['RED_LIGHT','SPEED'])
            self.assertEqual(sorted(s['type'] for s in cam.list_sites(repo,self.bounds)['sites']),['ALPR','RED_LIGHT','SPEED'])
    def test_invalid_scope_rejected(self):
        for scope in ([],['OTHER'],[{}],'SPEED'):
            with self.assertRaises(ValueError):cam._overpass_query(self.bounds,scope)
    def test_legacy_all_categories_still_available(self):
        self.assertIn('ALPR',cam._overpass_query(self.bounds))
        self.assertNotIn('speed_camera',cam._overpass_query(self.bounds,['ALPR']))
