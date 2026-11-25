import gzip
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from openrf.cellular_catalog import Catalog,tower_records,estimate_records,coverage_records,TOWER_SOURCE,ESTIMATE_SOURCE

class CellularCatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=Path(self.tmp.name); self.catalog=Catalog(self.root/'catalog.sqlite3')
    def query(self,params):
        if params.get('returnIdsOnly'): return {'objectIds':[1,2,3]}
        return {'features':[{'attributes':{'FID':1,'Licensee':'Example licensee'},'geometry':{'x':-120,'y':38}},{'attributes':{'FID':2},'geometry':{'x':-121,'y':39}},{'attributes':{'FID':3},'geometry':{'x':0,'y':0}}]}
    def test_download_count_and_geometry(self):
        progress=[]; rows=list(tower_records(lambda **d: progress.append(d),self.query)); self.assertEqual(len(rows),2); self.assertEqual(progress[-1]['completed'],3); self.assertEqual(progress[-1]['rejected'],1)
        self.catalog.replace_points('towers',rows,TOWER_SOURCE)
        self.assertEqual(self.catalog.metadata()['towers']['count'],2)
        view=self.catalog.view([-120.5,37,-119,40],['towers'],[]);self.assertEqual(len(view['points']),1);self.assertEqual(view['points'][0]['detail']['Licensee'],'Example licensee')
    def test_incomplete_refresh_retains_old(self):
        self.catalog.replace_points('towers',[('x',-120,38,{})],TOWER_SOURCE)
        def partial(params):
            if params.get('returnIdsOnly'):return {'objectIds':[1,2]}
            return {'features':[{'attributes':{'FID':1},'geometry':{'x':-120,'y':38}}]}
        with self.assertRaisesRegex(ValueError,'Incomplete'):self.catalog.replace_points('towers',tower_records(lambda **_:None,partial),TOWER_SOURCE)
        self.assertEqual(self.catalog.view([-130,30,-110,40],['towers'],[])['points'][0]['id'],'x')
    def test_estimate_gzip_independent_us_only(self):
        path=self.root/'cells.csv.gz'
        with gzip.open(path,'wt') as out:out.write('radio,mcc,net,area,cell,unit,lon,lat,range,samples,changeable,created,updated,averageSignal\nLTE,310,260,3,4,1,-120,38,500,20,1,1,2,0\nLTE,234,1,3,5,1,-1,50,500,20,1,1,2,0\n')
        self.catalog.replace_points('towers',[('x',-120,38,{})],TOWER_SOURCE);self.catalog.replace_points('estimates',estimate_records(path),ESTIMATE_SOURCE)
        view=self.catalog.view([-121,37,-119,39],['towers','estimates'],[]);self.assertEqual({p['kind'] for p in view['points']},{'towers','estimates'});row=next(p for p in view['points'] if p['kind']=='estimates');self.assertEqual(row['detail']['mnc_or_sid'],260);self.assertEqual(row['detail']['range_m'],500)
    def geo(self,lon=-120):
        path=self.root/'cover.geojson';poly=[[[lon,38],[lon+1,38],[lon+1,39],[lon,38]],[[lon+.2,38.1],[lon+.3,38.1],[lon+.3,38.2],[lon+.2,38.1]]];path.write_text(json.dumps({'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'MultiPolygon','coordinates':[poly]}}]}));return path
    def test_coverage_offline_profiles_and_holes(self):
        path=self.geo();self.catalog.replace_coverage('att','ca',path,'2025-12-31','LTE','outdoor');self.catalog.replace_coverage('att','ca5g',path,'2025-12-31','5G','outdoor');self.catalog.replace_coverage('verizon','ca',path,'2025-12-31','LTE','outdoor');v=self.catalog.view([-121,37,-118,40],[],['att'],[json.dumps(['att','2025-12-31','LTE','outdoor'])]);self.assertEqual(len(v['coverage']),1);self.assertEqual(v['coverage'][0]['pack'],'coverage:att:ca');self.assertEqual(len(v['coverage'][0]['polygon']),2)
        self.assertEqual(self.catalog.view([-121,37,-118,40],[],['att'])['coverage'][0]['pack'],'coverage:att:ca')
        self.assertEqual(self.catalog.view([-90,37,-80,40],[],['att'])['coverage'],[])
        path.write_text('{"type":"FeatureCollection","features":[]}');
        with self.assertRaises(ValueError):self.catalog.replace_coverage('att','ca',path,'2025-12-31','LTE','outdoor')
        self.assertIn('coverage:att:ca',self.catalog.metadata())
    def test_wrapped_bounds_and_limits(self):
        self.catalog.replace_points('towers',[('a',179,38,{}),('b',-179,38,{}),('c',-120,38,{})],TOWER_SOURCE)
        self.assertEqual({p['id'] for p in self.catalog.view([170,37,-170,39],['towers'],[])['points']},{'a','b'})
        with patch('openrf.cellular_catalog.MAX_VIEW_POINTS',1):
            v=self.catalog.view([-180,30,180,40],['towers'],[]);self.assertEqual(v['points'],[]);self.assertEqual(v['limited'],['towers'])
        with self.assertRaises(ValueError):self.catalog.view([-180,40,180,30],['towers'],[])
    def test_background_job_and_status_during_download(self):
        ready=threading.Event();release=threading.Event()
        def fake(progress):
            yield 'x',-120,38,{};progress(phase='downloading',completed=1,total=2);ready.set();release.wait(3);yield 'y',-121,39,{}
        with patch('openrf.cellular_catalog.tower_records',fake):
            self.catalog.refresh();self.assertTrue(ready.wait(2));self.assertEqual(self.catalog.status()['job']['completed'],1);release.set()
            import time
            until=time.monotonic()+3
            while self.catalog.status()['job']['phase'] not in ('complete','failed') and time.monotonic()<until:time.sleep(.01)
            self.assertEqual(self.catalog.status()['job']['phase'],'complete');self.assertEqual(self.catalog.metadata()['towers']['count'],2)

    def test_loopback_http_routes(self):
        from openrf.server import create_server
        from openrf.storage import Repository
        from http.client import HTTPConnection
        from urllib.parse import urlencode
        import time
        server=create_server(Repository(self.root/'main.sqlite'),port=0)
        t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
        def req(method,path,body=None,origin=None):
            conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=5)
            headers={'Content-Type':'application/json'}
            if origin:headers['Origin']=origin
            try:
                conn.request(method,path,body=json.dumps(body) if body is not None else None,headers=headers)
                r=conn.getresponse();return r.status,r.read()
            finally:conn.close()
        route='/api/cellular/reference'
        try:
            self.assertEqual(req('POST',route+'/refresh',{'confirm':False})[0],400)
            self.assertEqual(req('POST',route+'/refresh',{'confirm':True},origin='https://example.invalid')[0],403)
            self.assertEqual(req('GET',route+'/view?bbox=invalid')[0],400)
            def fake(progress):
                yield 'tower',-120,38,{'Licensee':'Fixture'};progress(phase='downloading',completed=1,total=1)
            with patch('openrf.cellular_catalog.tower_records',fake):
                self.assertEqual(req('POST',route+'/refresh',{'confirm':True})[0],202)
                until=time.monotonic()+3
                while time.monotonic()<until:
                    status=json.loads(req('GET',route+'/status')[1]);
                    if status['job']['phase'] in ('complete','failed'):break
                    time.sleep(.02)
                self.assertEqual(status['job']['phase'],'complete')
            view=json.loads(req('GET',route+'/view?'+urlencode({'bbox':'-121,37,-119,39','kind':'towers'}))[1]);self.assertEqual(view['points'][0]['id'],'tower')
            self.assertEqual(req('GET','/static/cellular-map.js')[0],200)
        finally:server.shutdown();server.server_close();t.join(3)

if __name__=='__main__':unittest.main()
