import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from http.client import HTTPConnection
from openrf.public_mesh import fetch_meshcore, PublicMeshDirectory, DirectoryError, MIN_REFRESH, FAILURE_RETRY

class Response(io.BytesIO):
    def __init__(self, data, length=None):
        super().__init__(data)
        self.headers={} if length is None else {'Content-Length':str(length)}
    def read1(self,n): return super().read(min(n,7))

class TransferTests(unittest.TestCase):
    def test_real_byte_progress_known_and_unknown_lengths(self):
        data=b'[{"test":1}]'
        for length in (None,len(data)):
            events=[]
            with patch('openrf.public_mesh.build_opener') as opener:
                opener.return_value.open.return_value=Response(data,length)
                self.assertEqual(fetch_meshcore(lambda **kw: events.append(kw)),[{'test':1}])
            self.assertEqual(events[0]['received_bytes'],0)
            self.assertEqual(events[-1],dict(phase='parsing',received_bytes=len(data),total_bytes=length))
            self.assertEqual([e['received_bytes'] for e in events], sorted(e['received_bytes'] for e in events))
    def test_truncation_and_rate_limit(self):
        with patch('openrf.public_mesh.build_opener') as opener:
            opener.return_value.open.return_value=Response(b'[]',100)
            with self.assertRaisesRegex(DirectoryError,'Incomplete'): fetch_meshcore()
            opener.return_value.open.side_effect=HTTPError('https://map.meshcore.io',429,'limited',{'Retry-After':'600'},None)
            with self.assertRaises(DirectoryError) as error: fetch_meshcore()
            self.assertEqual(error.exception.retry_seconds,600)
    def test_retry_and_preserve_existing_cache(self):
        node=dict(public_key='a'*64,lat=38,lon=-120,type=2)
        with tempfile.TemporaryDirectory() as folder:
            store=PublicMeshDirectory(Path(folder)/'nodes.json',lambda:[node])
            store.refresh()
            self.assertEqual(store.download_status()['phase'],'complete')
            self.assertEqual(store.retry_delay,MIN_REFRESH)
            store.last_attempt=float('-inf')
            def fail(): raise DirectoryError('Mock failed')
            store.fetcher=fail
            with self.assertRaises(DirectoryError): store.refresh()
            self.assertEqual(store.download_status()['phase'],'failed')
            self.assertEqual(store.retry_delay,FAILURE_RETRY)
            self.assertEqual(store.snapshot()['cached_count'],1)
    def test_status_http_during_transfer(self):
        from openrf.server import create_server
        from openrf.storage import Repository
        with tempfile.TemporaryDirectory() as folder:
            server=create_server(Repository(Path(folder)/'db.sqlite3'),port=0)
            ready=threading.Event();release=threading.Event();results=[]
            def fetch():
                server.public_mesh._progress(phase='downloading',received_bytes=10,total_bytes=20)
                ready.set();release.wait(5)
                return [dict(public_key='a'*64,lat=38,lon=-120,type=2)]
            server.public_mesh.fetcher=fetch
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            def req(method,path,body=None):
                c=HTTPConnection('127.0.0.1',server.server_address[1],timeout=5)
                try:
                    c.request(method,path,body=body,headers={'Content-Type':'application/json'})
                    r=c.getresponse();return r.status,json.loads(r.read())
                finally:c.close()
            worker=threading.Thread(target=lambda:results.append(req('POST','/api/mesh/public/refresh','{"confirm":true}')));worker.start()
            try:
                self.assertTrue(ready.wait(3))
                code,data=req('GET','/api/mesh/public/status');self.assertEqual(code,200);self.assertEqual(data['received_bytes'],10);self.assertEqual(data['total_bytes'],20)
                self.assertEqual(req('POST','/api/mesh/public/clear','{"confirm":true}')[0],409)
            finally:
                release.set();worker.join(6);server.shutdown();server.server_close();thread.join(3)
            self.assertEqual(results[0][0],200)
