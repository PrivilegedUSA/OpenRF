"""v0.2.56 national ALPR snapshot: validated atomic offline updates, no live web."""
import gzip
import io
import json
import sqlite3
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch
from openrf import camera_catalog as camera, national_alpr as national
from openrf.storage import Repository


def sample(n=5, *, start=0):
    return {'type':'FeatureCollection','features':[
        {'type':'Feature','id':f'node/{i}',
         'geometry':{'type':'Point','coordinates':[-120.75 + i*.001,38.45 + i*.001]},
         'properties':{'brand':'Flock Safety','direction':'N'}}
        for i in range(start+1,start+n+1)]}


class ALPRStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.repo=Repository(self.root/'openrf.sqlite3')
        camera.add_manual(self.repo,{'type':'RED_LIGHT','label':'Local report',
          'latitude':38.46,'longitude':-120.70,'source':'My notes'})
    def tearDown(self):self.tmp.cleanup()
    def write(self,obj,gzip_data=True):
        path=self.root/'national.geojson.gz'
        data=json.dumps(obj,separators=(',',':')).encode()
        path.write_bytes(gzip.compress(data) if gzip_data else data)
        return path

    def test_install_query_viewport_and_preserve_manual_report(self):
        result=national._ingest(self.repo,self.write(sample(5)),min_features=3)
        self.assertEqual(result['count'],5)
        listing=camera.list_sites(self.repo,[-121,38,-120,39])
        self.assertEqual(len(listing['sites']),6)
        self.assertEqual(len(camera.list_sites(self.repo,[-121,38,-120.74,38.46])['sites']),5)
        self.assertEqual({row['state'] for row in listing['sites'] if row['type']=='ALPR'}, {'COMMUNITY_MAPPED'})
        self.assertEqual(national.status(Repository(self.repo.path))['count'],5)
        self.assertTrue(any(row['type']=='RED_LIGHT' for row in listing['sites']))
        self.assertTrue(any(row['source_url'].endswith('node/1') for row in listing['sites']))

    def test_failed_partial_update_does_not_erase_previous_or_manual(self):
        national._ingest(self.repo,self.write(sample(5)),min_features=3)
        for document in (sample(1),{'type':'FeatureCollection','features':'bad'},
                {'type':'Bogus','features':sample(5)['features']}):
            with self.assertRaises(national.SnapshotError):
                national._ingest(self.repo,self.write(document),min_features=3)
            self.assertEqual(national.status(self.repo)['count'],5)
        self.assertEqual(len(camera.list_sites(self.repo,[-121,38,-120,39])['sites']),6)

    def test_valid_refresh_replaces_old_national_only(self):
        national._ingest(self.repo,self.write(sample(5)),min_features=2)
        national._ingest(self.repo,self.write(sample(4,start=20)),min_features=2)
        listing=camera.list_sites(self.repo,[-121,38,-120,39])['sites']
        self.assertEqual(len(listing),5)
        self.assertEqual(national.status(self.repo)['count'],4)
        self.assertTrue(any(row['label']=='Local report' for row in listing))
        self.assertFalse(any(row['source_url'].endswith('node/1') for row in listing))

    def test_duplicate_osm_ids_are_deduplicated_and_invalid_coords_skipped(self):
        fixture=sample(4)
        fixture['features'].append(fixture['features'][0])
        fixture['features'].append({'type':'Feature','geometry':{'type':'Point','coordinates':[float('inf'),38]},'properties':{}})
        result=national._ingest(self.repo,self.write(fixture,gzip_data=False),min_features=3)
        self.assertEqual(result['count'],4)
        self.assertEqual(national.status(self.repo)['count'],4)

    def test_oversized_expansion_and_truncation_fail_closed(self):
        doc=self.write(sample(4));doc.write_bytes(b'not valid geojson')
        with self.assertRaises(national.SnapshotError):
            national._ingest(self.repo,doc,min_features=1)
        with patch.object(national,'MAX_EXPANDED_BYTES',50):
            with self.assertRaisesRegex(national.SnapshotError,'safety limit'):
                national._ingest(self.repo,self.write(sample(4)),min_features=1)
        self.assertEqual(national.status(self.repo)['count'],0)

    def test_upload_source_is_distinct_and_unverified(self):
        national._ingest(self.repo,self.write(sample(5)),min_features=3,uploaded=True)
        row=[x for x in camera.list_sites(self.repo,[-121,38,-120,39])['sites'] if x['type']=='ALPR'][0]
        self.assertIn('unverified',row['source'])
        self.assertIn('Local file',national.status(self.repo)['source_url'])

class FakeReply:
    def __init__(self,raw):self.io=io.BytesIO(raw)
    def __enter__(self):return self
    def __exit__(self,*args):self.io.close()
    def geturl(self):return national.SNAPSHOT_URL
    def read(self,n):return self.io.read(n)

class HTTPTests(unittest.TestCase):
    def test_status_start_online_fixture_then_local_read_and_file_fallback(self):
        from openrf.server import create_server
        with tempfile.TemporaryDirectory() as root:
            repo=Repository(Path(root)/'openrf.sqlite3')
            server=create_server(repo,port=0)
            worker=threading.Thread(target=server.serve_forever,daemon=True)
            worker.start()
            try:
                def request(method,path,body=None,content_type='application/json'):
                    conn=HTTPConnection('127.0.0.1',server.server_port,timeout=12)
                    data=json.dumps(body).encode() if content_type=='application/json' and body is not None else body
                    headers={'Host':f'localhost:{server.server_port}'}
                    if data is not None:headers['Content-Type']=content_type
                    conn.request(method,path,body=data,headers=headers)
                    result=conn.getresponse();out=(result.status,json.loads(result.read()));conn.close()
                    return out
                st,body=request('GET','/api/cameras/snapshot')
                self.assertEqual((st,body['snapshot']['count']),(200,0))
                with patch.object(national,'MIN_NATIONAL_FEATURES',3), patch.object(
                    national.urllib.request,'urlopen',return_value=FakeReply(gzip.compress(json.dumps(sample(5)).encode()))):
                    st,_=request('POST','/api/cameras/snapshot/update',{})
                    self.assertEqual(st,202)
                    for _ in range(100):
                        if not request('GET','/api/cameras/snapshot')[1]['running']:break
                        time.sleep(.025)
                st,body=request('GET','/api/cameras/snapshot')
                self.assertEqual(body['snapshot']['count'],5)
                self.assertEqual(body['phase'],'ready')
                st,body=request('GET','/api/cameras?bounds=%5B-121%2C38%2C-120%2C39%5D')
                self.assertEqual(len(body['sites']),5)
                raw=gzip.compress(json.dumps(sample(4,start=40)).encode())
                with patch.object(national,'MIN_NATIONAL_FEATURES',3):
                    st,_=request('POST','/api/cameras/snapshot/upload',raw,'application/octet-stream')
                    self.assertEqual(st,202)
                    for _ in range(100):
                        if not request('GET','/api/cameras/snapshot')[1]['running']:break
                        time.sleep(.025)
                st,body=request('GET','/api/cameras/snapshot')
                self.assertEqual(body['snapshot']['count'],4)
                self.assertIn('Local file',body['snapshot']['source_url'])
            finally:
                server.shutdown();server.server_close();worker.join(timeout=5)

if __name__=='__main__':unittest.main()
