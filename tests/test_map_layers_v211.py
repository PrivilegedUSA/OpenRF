import tempfile
import unittest
from pathlib import Path
from openrf import camera_catalog as cam
from openrf.storage import Repository

class EnforcementImport(unittest.TestCase):
    def test_mixed_import_and_reimport(self):
        def node(i, tags): return dict(type='node',id=i,lat=38.5,lon=-120.5,tags=tags)
        doc={'elements':[
            node(1,{'highway':'speed_camera'}),node(2,{'highway':'red_light_camera'}),
            node(3,{'highway':'traffic_signals'}),node(4,{'man_made':'surveillance','surveillance:type':'ALPR'}),
            {'type':'relation','id':50,'tags':{'type':'enforcement','enforcement':'maxspeed;traffic_signals'},'members':[
                {'type':'node','ref':1,'role':'device','lat':38.5,'lon':-120.5},
                {'type':'node','ref':5,'role':'device','lat':38.6,'lon':-120.5},
                {'type':'node','ref':6,'role':'from','lat':38.6,'lon':-120.6},
                {'type':'node','ref':7,'role':'device'}]},
            node(8,{'man_made':'surveillance','surveillance:type':'camera'})]}
        with tempfile.TemporaryDirectory() as d:
            repo=Repository(Path(d)/'test.sqlite3');bounds=[-121,38,-120,39]
            for _ in range(2):
                result=cam.import_feed(repo,bounds,fetch=lambda:cam._parse_overpass(doc))
                self.assertEqual(result['counts'],{'ALPR':1,'RED_LIGHT':3,'SPEED':2})
            sites=cam.list_sites(repo,bounds)['sites'];self.assertEqual(len(sites),6)
            self.assertEqual({s['state'] for s in sites},{'COMMUNITY_MAPPED'})
            self.assertFalse(any(s['source_url'].endswith(('/3','/6','/7','/8')) for s in sites))
        q=cam._overpass_query(bounds)
        self.assertIn('out geom',q);self.assertIn('speed_camera',q);self.assertIn('traffic_signals',q)
