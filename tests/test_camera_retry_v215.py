import io,json,tempfile,unittest,urllib.error,urllib.parse
from pathlib import Path
from unittest.mock import patch
from openrf import camera_catalog as cam
from openrf.storage import Repository

class CameraRetryTests(unittest.TestCase):
    bounds=[-121,38,-120,39]
    def reply(self, elements):
        raw=json.dumps({'elements':elements}).encode()
        response=io.BytesIO(raw);response.headers={'Content-Length':str(len(raw))}
        return response
    def gateway(self):
        return urllib.error.HTTPError('https://example.invalid',502,'gateway',None,None)
    def test_retry_tiles_deduplicate_and_report_real_parts(self):
        node={'type':'node','id':12,'lat':38.5,'lon':-120.5,'tags':{'highway':'speed_camera'}}
        progress=[]
        with patch.object(cam.urllib.request,'urlopen',side_effect=[self.gateway(),TimeoutError(),*[self.reply([node]) for _ in range(4)]]) as network:
            doc=cam._read_osm_area(self.bounds,lambda **kw:progress.append(kw))
        self.assertEqual(network.call_count,6)
        self.assertEqual(len(doc['features']),1)
        self.assertEqual([p['part'] for p in progress if 'part' in p],[1,2,3,4])
        self.assertEqual(progress[-1]['completed_parts'],4)
        query=urllib.parse.parse_qs(network.call_args_list[2].args[0].data.decode())['data'][0]
        self.assertIn('38.000000,-121.000000,38.500000,-120.500000',query)
    def test_retry_failure_does_not_save_partial_area(self):
        node={'type':'node','id':12,'lat':38.2,'lon':-120.8,'tags':{'highway':'speed_camera'}}
        with tempfile.TemporaryDirectory() as d:
            repo=Repository(Path(d)/'db.sqlite3')
            cam.add_manual(repo,{'type':'RED_LIGHT','label':'saved','latitude':38.5,'longitude':-120.5,'source':'notes'})
            with patch.object(cam.urllib.request,'urlopen',side_effect=[self.gateway(),TimeoutError(),self.reply([node]),self.gateway(),TimeoutError()]):
                with self.assertRaisesRegex(ValueError,'section 2 of 4. No partial import saved'):
                    cam.import_feed(repo,self.bounds)
            self.assertEqual([s['type'] for s in cam.list_sites(repo,self.bounds)['sites']],['RED_LIGHT'])
    def test_no_subdivision_for_rate_limit_or_small_area(self):
        for bounds,error in [(self.bounds,urllib.error.HTTPError('https://example.invalid',429,'rate',None,None)),([-121,38,-120.8,38.2],self.gateway())]:
            with patch.object(cam.urllib.request,'urlopen',side_effect=error) as network:
                with self.assertRaises(ValueError):cam._read_osm_area(bounds)
                self.assertEqual(network.call_count,2)
    def test_hidden_alpr_cannot_consume_selected_result_limit(self):
        with tempfile.TemporaryDirectory() as d:
            repo=Repository(Path(d)/'db.sqlite3')
            for kind in ('SPEED','RED_LIGHT','ALPR','ALPR','ALPR'):
                cam.add_manual(repo,{'type':kind,'label':'saved','latitude':38.5,'longitude':-120.5,'source':'notes'})
            result=cam.list_sites(repo,self.bounds,limit=2,types=['SPEED','RED_LIGHT'])
            self.assertEqual({s['type'] for s in result['sites']},{'SPEED','RED_LIGHT'})
            self.assertFalse(result['truncated'])
            self.assertTrue(cam.list_sites(repo,self.bounds,limit=2)['truncated'])
            with self.assertRaises(ValueError):cam.list_sites(repo,self.bounds,types=['OTHER'])
