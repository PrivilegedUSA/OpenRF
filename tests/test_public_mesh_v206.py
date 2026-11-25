import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from openrf.public_mesh import PublicMeshDirectory, DirectoryError, normalize

def row(key='a', **changes):
    return dict(public_key=key*64,adv_name='Test',type=2,lat=38.1,lon=-120.1,**changes)

class PublicMeshTests(unittest.TestCase):
    def test_normalize(self):
        a=normalize([row(),row(),dict(row('b'),lat=999),dict(row('c'),type=1)])
        self.assertEqual((a['received'],a['rejected'],a['duplicates']), (4,1,1))
        self.assertEqual([n['role'] for n in a['nodes']],['Repeater','Client'])
        with self.assertRaises(DirectoryError): normalize([{'wrong':1}])
    def test_cache_replace_offline_failure_and_clear(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'public.json';calls=[]
            store=PublicMeshDirectory(p,lambda: calls.append(1) or [row()])
            self.assertEqual(store.snapshot()['state'],'empty'); self.assertFalse(calls)
            self.assertEqual(store.refresh()['cached_count'],1)
            self.assertEqual(PublicMeshDirectory(p).snapshot()['nodes'][0]['id'],'a'*64)
            with self.assertRaises(DirectoryError): store.refresh()
            store.last_attempt=float('-inf');store.fetcher=lambda: {'bad':1}
            with self.assertRaises(DirectoryError): store.refresh()
            self.assertEqual(store.snapshot()['cached_count'],1)
            store.last_attempt=float('-inf');store.fetcher=lambda: [row('b')]
            self.assertEqual(store.refresh()['nodes'][0]['id'],'b'*64)
            with patch('openrf.public_mesh.time.time',return_value=10**12):
                self.assertEqual(store.snapshot()['state'],'expired');self.assertEqual(store.snapshot()['nodes'],[])
            self.assertEqual(store.clear()['state'],'empty');self.assertFalse(p.exists())

    def test_http_offline_cache_explicit_refresh_and_asset(self):
        from http.client import HTTPConnection
        import json
        from threading import Thread
        from openrf.server import create_server
        from openrf.storage import Repository
        with tempfile.TemporaryDirectory() as d:
            server=create_server(Repository(Path(d)/'db.sqlite3'),port=0)
            calls=[];server.public_mesh.fetcher=lambda: calls.append(1) or [row()]
            thread=Thread(target=server.serve_forever,daemon=True);thread.start()
            port=server.server_address[1]
            def req(method,path,body=None,extra=None):
                c=HTTPConnection('127.0.0.1',port,timeout=5)
                try:
                    h={'Host':f'localhost:{port}','Content-Type':'application/json',**(extra or {})}
                    c.request(method,path,body=json.dumps(body) if body is not None else None,headers=h)
                    r=c.getresponse();return r.status,r.read()
                finally:c.close()
            try:
                self.assertEqual(req('GET','/static/public-mesh.js')[0],200)
                self.assertEqual(json.loads(req('GET','/api/mesh/public')[1])['state'],'empty')
                self.assertEqual(req('POST','/api/mesh/public/refresh',{'confirm':1})[0],400)
                self.assertEqual(req('POST','/api/mesh/public/refresh',{'confirm':True},{'Sec-Fetch-Site':'cross-site'})[0],403)
                self.assertEqual(calls,[])
                self.assertEqual(req('POST','/api/mesh/public/refresh',{'confirm':True})[0],200)
                self.assertEqual(json.loads(req('GET','/api/mesh/public')[1])['cached_count'],1)
                self.assertEqual(calls,[1])
                self.assertEqual(req('POST','/api/mesh/public/clear',{'confirm':True})[0],200)
                self.assertEqual(json.loads(req('GET','/api/mesh/public')[1])['state'],'empty')
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)
