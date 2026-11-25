import unittest, tempfile, time, json
from pathlib import Path
from unittest.mock import patch
from openrf.public_mesh import normalize_meshtastic, PublicMeshDirectory, DirectoryError, fetch_meshtastic, MESHTASTIC_URL
from test_public_mesh_v207 import Response

class MeshtasticTests(unittest.TestCase):
    def payload(self):
        return {'123':{'latitude':384567890,'longitude':-1211234567,'role':'ROUTER','longName':'Test router','seenBy':{'topic':int(time.time())},'batteryLevel':25},'124':{'latitude':390000000,'longitude':-1200000000,'role':'CLIENT','longName':'Test client'},'125':{'latitude':True,'longitude':2}}
    def test_parse(self):
        result=normalize_meshtastic(self.payload());self.assertEqual(result['rejected'],1);self.assertEqual(len(result['nodes']),2)
        node=result['nodes'][0];self.assertEqual((node['id'],node['role'],node['lat'],node['lon']),('!0000007b','Repeater',38.457,-121.123));self.assertNotIn('seenBy',node);self.assertNotIn('batteryLevel',node);self.assertIsNotNone(node['updated'])
        for bad in ([],{}, {'123':{'latitude':38.2,'longitude':-120.2}}, {'123':{'latitude':0,'longitude':0}}):
            with self.assertRaises(DirectoryError):normalize_meshtastic(bad)
    def test_transfer(self):
        raw=json.dumps(self.payload()).encode();events=[]
        with patch('openrf.public_mesh.build_opener') as opener:
            opener.return_value.open.return_value=Response(raw,len(raw));self.assertEqual(fetch_meshtastic(lambda **kw:events.append(kw)),json.loads(raw))
            self.assertEqual(opener.return_value.open.call_args.args[0].full_url,MESHTASTIC_URL)
        self.assertEqual(events[-1]['received_bytes'],len(raw))
    def test_cache_independence_and_failure(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);other=root/'public-meshcore.json';other.write_bytes(b'unchanged')
            m=PublicMeshDirectory(root/'public-meshtastic.json',self.payload,normalizer=normalize_meshtastic,provider='MeshMap.net',max_cache_age=7*86400)
            m.refresh();self.assertEqual(m.snapshot()['cached_count'],2);m.last_attempt=float('-inf');m.fetcher=lambda:{}
            with self.assertRaises(DirectoryError):m.refresh()
            self.assertEqual(m.snapshot()['cached_count'],2);m.clear();self.assertEqual(other.read_bytes(),b'unchanged')
    def test_http_directory_routes(self):
        from http.client import HTTPConnection
        from threading import Thread
        from openrf.server import create_server
        from openrf.storage import Repository
        with tempfile.TemporaryDirectory() as d:
            server=create_server(Repository(Path(d)/'db.sqlite3'),port=0)
            calls=[];server.public_meshtastic.fetcher=lambda: calls.append(1) or self.payload()
            server.public_mesh.fetcher=lambda:[dict(public_key='a'*64,lat=38,lon=-120,type=2)]
            server.public_mesh.refresh()
            thread=Thread(target=server.serve_forever,daemon=True);thread.start()
            def req(method,path,body=None):
                c=HTTPConnection('127.0.0.1',server.server_address[1],timeout=5)
                try:
                    c.request(method,path,body=json.dumps(body) if body is not None else None,headers={'Content-Type':'application/json'})
                    r=c.getresponse();return r.status,json.loads(r.read())
                finally:c.close()
            route='/api/mesh/public/meshtastic'
            try:
                self.assertEqual(req('GET',route)[1]['state'],'empty');self.assertEqual(calls,[])
                self.assertEqual(req('POST',route+'/refresh',{'confirm':False})[0],400)
                self.assertEqual(req('POST',route+'/refresh',{'confirm':True})[1]['cached_count'],2)
                self.assertEqual(req('GET',route+'/status')[1]['phase'],'complete')
                self.assertEqual(req('GET',route)[1]['cached_count'],2)
                self.assertEqual(req('POST',route+'/clear',{'confirm':True})[0],200)
                self.assertEqual(req('GET','/api/mesh/public')[1]['cached_count'],1)
            finally:server.shutdown();server.server_close();thread.join(3)
