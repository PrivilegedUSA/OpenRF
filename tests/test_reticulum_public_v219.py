import tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from openrf.public_mesh import PublicMeshDirectory, normalize_reticulum, DirectoryError
from openrf.national_traffic import UpdateManager

def row(i=1, **kw):
    return dict(discovery_hash=f'{i:064x}', name='Fixture public gateway', type='BackboneInterface', geolocated=True, location_source='coordinates_only', latitude=38.12345, longitude=-121.23456, last_heard=1700000000, **kw)

class ReticulumPublicTests(unittest.TestCase):
    def test_only_published_positions_and_no_private_fields(self):
        a=row(ifac_netkey='secret', reachable_on='example.invalid'); b=row(2); b['location_source']='ip'; c=row(3); c['latitude']=None
        result=normalize_reticulum([a,a,b,c]);self.assertEqual((result['duplicates'],result['unmapped'],result['rejected']),(1,1,1)); self.assertEqual(len(result['nodes']),1)
        n=result['nodes'][0];self.assertEqual(n['lat'],38.123);self.assertEqual(n['role'],'Repeater');self.assertNotIn('ifac_netkey',n);self.assertNotIn('reachable_on',n)
    def test_previous_cache_kept(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'reticulum.json'; neighbor=Path(tmp)/'meshtastic.json';neighbor.write_text('original')
            d=PublicMeshDirectory(path,lambda:[row()],normalizer=normalize_reticulum);d.refresh();old=path.read_bytes();d.last_attempt=float('-inf');d.fetcher=lambda:[]
            with self.assertRaises(DirectoryError):d.refresh()
            self.assertEqual(path.read_bytes(),old);d.clear();self.assertEqual(neighbor.read_text(),'original')
    def test_transient_retry_and_permanent_failure(self):
        m=UpdateManager(None)
        def error(code,headers=None):return HTTPError('https://example.invalid',code,'fixture',headers,None)
        with patch.object(m,'download',side_effect=[error(503),b'ok']) as download,patch.object(m.cancel,'wait',return_value=False) as wait:
            self.assertEqual(m.download_with_retry('u','a'),b'ok');self.assertEqual(download.call_count,2);wait.assert_called_once_with(2)
        for exc in [error(404),error(429,{'Retry-After':'120'})]:
            with patch.object(m,'download',side_effect=exc) as download:
                with self.assertRaises(HTTPError):m.download_with_retry('u','a')
                self.assertEqual(download.call_count,1)
    def test_http_routes(self):
        import json
        from http.client import HTTPConnection
        from threading import Thread
        from openrf.server import create_server
        from openrf.storage import Repository
        with tempfile.TemporaryDirectory() as tmp:
            server=create_server(Repository(Path(tmp)/'db.sqlite'),port=0)
            server.public_reticulum.fetcher=lambda:[row()]
            thread=Thread(target=server.serve_forever,daemon=True);thread.start()
            route='/api/mesh/public/reticulum'
            def req(method,path,body=None):
                conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=5)
                try:
                    conn.request(method,path,body=json.dumps(body) if body is not None else None,headers={'Content-Type':'application/json'})
                    r=conn.getresponse();return r.status,json.loads(r.read())
                finally:conn.close()
            try:
                self.assertEqual(req('GET',route)[1]['state'],'empty')
                self.assertEqual(req('POST',route+'/refresh',{'confirm':False})[0],400)
                self.assertEqual(req('POST',route+'/refresh',{'confirm':True})[1]['cached_count'],1)
                self.assertEqual(req('GET',route+'/status')[1]['phase'],'complete')
                self.assertEqual(req('GET',route)[1]['cached_count'],1)
                self.assertEqual(req('POST',route+'/clear',{'confirm':True})[0],200)
                self.assertEqual(req('GET','/api/mesh/public/meshtastic')[1]['state'],'empty')
            finally:server.shutdown();server.server_close();thread.join(3)
