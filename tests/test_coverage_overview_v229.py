import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from openrf import fcc_coverage as f
from openrf.cellular_catalog import Catalog
from openrf.coverage_overview import overview, _base_cells


class CoverageOverview(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.folder=self.root/'fcc-coverage'; self.folder.mkdir()
        self.layer={'carrier':'verizon','technology':'4G LTE 5/1 Mbps','environment':'Outdoor stationary (all)','count':3}
        self.path=self.fixture('131425','verizon', [(-121,38),(-118,34),(-123,41)])
        self.cat=Catalog(self.root/'catalog.sqlite3')

    def fixture(self,provider,carrier,points,state='06'):
        path=self.folder/f'fcc-{state}-{provider}.sqlite3'
        with sqlite3.connect(path) as db:
            db.executescript(f.DDL)
            for pid,env in enumerate(['Outdoor stationary only','Outdoor stationary + in-vehicle'],1):
                db.execute('INSERT INTO profiles VALUES (?,?,?,?,?,?)',(pid,carrier,carrier,provider,'4G LTE 5/1 Mbps',env))
            for i,(lon,lat) in enumerate(points,1):
                geom={'type':'Polygon','coordinates':[[[lon,lat],[lon+.001,lat],[lon+.001,lat+.001],[lon,lat+.001],[lon,lat]]]}
                w,s,e,n,v,raw=next(f.polygon_parts(geom,lambda x,y:(x,y)))
                db.execute('INSERT INTO shapes VALUES (?,?,?,?)',(i,f'89{i:013x}',raw,v))
                db.execute('INSERT INTO spatial VALUES (?,?,?,?,?)',(i,w,e,s,n))
                db.execute('INSERT INTO membership VALUES (1,?)',(i,));db.execute('INSERT INTO membership VALUES (2,?)',(i,))
            meta={'format':'openrf-fcc-h3','version':1,'state':state,'provider_id':provider,'filing':'J26','vintage':'2026-11-10','source':f.SOURCE,'saved_at':'2026-11-25','layers':[{**self.layer,'carrier':carrier,'count':len(points)}]}
            db.execute('INSERT INTO metadata VALUES (?,?)',('manifest',json.dumps(meta)))
        return path

    def test_local_state_and_national(self):
        local=self.cat.view((-121.1,37.9,-120.9,38.1),[],['verizon'])
        self.assertEqual(len(local['coverage']),1);self.assertFalse(local['coverage'][0].get('overview'));self.assertEqual(local['overviews'],[])
        state=self.cat.view((-125,32,-113,43),[],['verizon']);country=self.cat.view((-130,22,-60,52),[],['verizon'])
        for v in (state,country):
            self.assertEqual(v['limited'],[]);self.assertTrue(v['overviews']);self.assertEqual(sum(x['reports'] for x in v['coverage']),3)
            self.assertTrue(all(x['overview'] for x in v['coverage']))
        self.assertGreater(country['overviews'][0]['degrees'],state['overviews'][0]['degrees'])
        self.assertEqual(self.cat.view((-100,30,-90,40),[],['verizon'])['coverage'],[])
        self.assertTrue(list((self.folder/'.overview-v2').glob('*.json')))

    def test_budget_and_profile_isolation(self):
        self.fixture('130403','tmobile',[(-122,39)])
        v=self.cat.view((-125,32,-113,43),[],['verizon','tmobile']);self.assertEqual({x['carrier'] for x in v['coverage']},{'verizon','tmobile'})
        self.assertEqual(sum(x['reports'] for x in v['coverage'] if x['carrier']=='tmobile'),1)
        with patch('openrf.cellular_catalog.MAX_VIEW_VERTICES',5):
            v=self.cat.view((-125,32,-113,43),[],['verizon']);self.assertEqual(len(v['coverage']),1);self.assertEqual(v['coverage'][0]['reports'],3);self.assertEqual(v['limited'],[])
        with patch('openrf.cellular_catalog.MAX_VIEW_VERTICES',3):
            v=self.cat.view((-125,32,-113,43),[],['verizon']);self.assertEqual(v['limited'],['coverage:verizon'])

    def test_cache_reuse_and_invalidation(self):
        source=self.path.read_bytes();cells=_base_cells(self.path,self.layer);self.assertEqual(sum(x[2] for x in cells),3)
        with patch('openrf.coverage_overview.open_pack',side_effect=AssertionError('cache must be reused')):
            self.assertEqual(_base_cells(self.path,self.layer),cells)
        self.path.unlink();self.fixture('131425','verizon',[(-120,37)])
        self.assertEqual(sum(x[2] for x in _base_cells(self.path,self.layer)),1)
        # Source packs are opened read-only by overview code.
        self.assertNotEqual(self.path.read_bytes(),source)
        before=self.path.read_bytes();overview([(self.path,self.layer)],(-125,32,-113,43),1000);self.assertEqual(self.path.read_bytes(),before)

    def test_sparse_bins_do_not_look_fully_covered(self):
        from openrf.coverage_overview import BASE
        x=int((180-121)*BASE); y=int((90+38)*BASE)
        with patch('openrf.coverage_overview._base_cells',return_value=[[x,y,1],[x+4,y,4]]):
            cells,step=overview([(self.path,self.layer)],(-121.1,37.9,-120.9,38.1),1000)
        self.assertEqual(len(cells),2)
        sparse,dense=cells
        self.assertGreater(sparse['opacity'],0)
        self.assertLess(sparse['opacity'],dense['opacity'])
        self.assertLess(sparse['density'],1)
        self.assertLessEqual(dense['density'],1)
        self.assertAlmostEqual(sparse['opacity'],0.38*sparse['density'],places=6)

    def test_dateline_and_multi_state(self):
        west=self.fixture('131425','verizon',[(179.8,52),(-179.8,52)],state='02')
        cells,step=overview([(west,self.layer),(self.path,self.layer)],(170,50,-170,55),500)
        self.assertEqual(sum(x['reports'] for x in cells),2)
        self.assertTrue(all(-180<=p[0]<=180 for x in cells for p in x['polygon'][0]))

if __name__=='__main__':unittest.main()
