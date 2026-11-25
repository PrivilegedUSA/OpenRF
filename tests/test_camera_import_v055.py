"""Offline, controlled tests for bounded OSM map import and label accuracy."""
import io
import json
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest.mock import patch

from openrf import camera_catalog as cam
from openrf.storage import Repository


class _Reply:
    def __init__(self, document):
        self.data = io.BytesIO(json.dumps(document).encode())
    def __enter__(self): return self
    def __exit__(self, *args): self.data.close()
    def read(self, limit): return self.data.read(limit)


class AreaImportTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.repo = Repository(Path(self.folder.name) / 'report.sqlite3')
    def tearDown(self): self.folder.cleanup()

    def test_queries_only_visible_area_and_persists_source_labeled_points(self):
        fixture = {'elements': [
            {'type':'node', 'id':721, 'lat':38.49, 'lon':-120.69,
             'tags':{'man_made':'surveillance', 'surveillance:type':'ALPR', 'brand':'Flock Safety'}},
            {'type':'way','id':842,'center':{'lat':38.53,'lon':-120.72},
             'tags':{'man_made':'surveillance','surveillance:type':'ALPR','camera:direction':'N'}},
            {'type':'node','id':900,'lat':38.51,'lon':-120.65,
             'tags':{'man_made':'surveillance','surveillance:type':'camera'}},
        ]}
        requests=[]
        def fetch(request, timeout):
            requests.append((request,timeout))
            return _Reply(fixture)
        with patch.object(cam.urllib.request,'urlopen',side_effect=fetch):
            result=cam.import_feed(self.repo,[-120.8,38.4,-120.6,38.6])
        self.assertEqual(result['matched'],2)
        self.assertEqual(len(requests),1)
        self.assertIn('overpass',requests[0][0].full_url)
        self.assertNotIn('cameras.geojson.gz',requests[0][0].full_url)
        posted=urllib.parse.parse_qs(requests[0][0].data.decode())['data'][0]
        self.assertIn('38.400000,-120.800000,38.600000,-120.600000',posted)
        self.assertIn('surveillance:type',posted)
        self.assertEqual(requests[0][0].get_header('Content-type'),'application/x-www-form-urlencoded')
        saved=cam.list_sites(self.repo,[-121,38,-120,39])['sites']
        self.assertEqual(len(saved),2)
        self.assertEqual({row['state'] for row in saved},{'COMMUNITY_MAPPED'})
        self.assertEqual({row['type'] for row in saved},{'ALPR'})
        self.assertTrue(any(row['source_url'].endswith('node/721') for row in saved))
        self.assertTrue(any(row['source_url'].endswith('way/842') for row in saved))
        # Same OSM ids may be re-imported without duplicating reports.
        with patch.object(cam.urllib.request,'urlopen',side_effect=lambda *a,**k:_Reply(fixture)):
            cam.import_feed(self.repo,[-120.8,38.4,-120.6,38.6])
        self.assertEqual(len(cam.list_sites(self.repo,[-121,38,-120,39])['sites']),2)

    def test_remote_empty_list_is_not_fabricated(self):
        with patch.object(cam.urllib.request,'urlopen',return_value=_Reply({'elements':[]})):
            result=cam.import_feed(self.repo,[-121,38,-120,39])
        self.assertEqual(result['matched'],0)
        self.assertEqual(cam.list_sites(self.repo,[-121,38,-120,39])['sites'],[])

    def test_guard_blocks_large_bounds_before_request(self):
        with patch.object(cam.urllib.request,'urlopen') as network:
            with self.assertRaisesRegex(ValueError,'Zoom'):
                cam.import_feed(self.repo,[-130,25,-110,50])
            network.assert_not_called()

    def test_incomplete_data_and_offline_fallback_fail_closed(self):
        for bad in ({'remark':'timeout','elements':[]}, {'elements':'not a list'}):
            with patch.object(cam.urllib.request,'urlopen',return_value=_Reply(bad)):
                with self.assertRaisesRegex(ValueError,'Area query failed'):
                    cam.import_feed(self.repo,[-121,38,-120,39])
        with patch.object(cam.urllib.request,'urlopen',side_effect=urllib.error.URLError('offline')) as call:
            with self.assertRaisesRegex(ValueError,'Try again when online'):
                cam.import_feed(self.repo,[-121,38,-120,39])
        self.assertEqual(call.call_count,len(cam.OVERPASS_ENDPOINTS))

    def test_manual_cameras_preserved_when_remote_import_fails(self):
        cam.add_manual(self.repo,{'type':'RED_LIGHT','label':'User report',
            'source':'field notes','latitude':38.50,'longitude':-120.7})
        with patch.object(cam.urllib.request,'urlopen',side_effect=urllib.error.URLError('offline')):
            with self.assertRaises(ValueError):
                cam.import_feed(self.repo,[-121,38,-120,39])
        rows=cam.list_sites(self.repo,[-121,38,-120,39])['sites']
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['type'],'RED_LIGHT')


if __name__=='__main__': unittest.main()

class CameraHTTPContractTests(unittest.TestCase):
    def test_post_import_and_get_camera_list_using_only_local_test_data(self):
        import threading
        from http.client import HTTPConnection
        from openrf.server import create_server
        with tempfile.TemporaryDirectory() as root:
            server=create_server(Repository(Path(root)/'db.sqlite3'), port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                port=server.server_address[1]
                def request(method,path,data=None):
                    c=HTTPConnection('127.0.0.1',port,timeout=4)
                    headers={'Host':f'localhost:{port}'}
                    if data is not None:
                        headers['Content-Type']='application/json'
                        data=json.dumps(data)
                    c.request(method,path,data,headers)
                    r=c.getresponse(); result=(r.status,json.loads(r.read())); c.close()
                    return result
                fixture={'type':'FeatureCollection','features':[{
                    'type':'Feature','id':'node/204','geometry':{'type':'Point',
                    'coordinates':[-120.4,38.6]},'properties':{'brand':'OSM sample'}}]}
                with patch.object(cam,'_read_osm_area',return_value=fixture) as fetch:
                    status,payload=request('POST','/api/cameras/import-osm',
                                           {'bounds':[-121,38,-120,39]})
                    self.assertEqual(status,202)
                    server.camera_import_manager.thread.join(timeout=4)
                    status,payload=request('GET','/api/cameras/import-status')
                    self.assertEqual(status,200)
                    self.assertEqual(payload['result']['matched'],1)
                    fetch.assert_called_once()
                status,payload=request('GET','/api/cameras?bounds=%5B-121%2C38%2C-120%2C39%5D')
                self.assertEqual(status,200)
                self.assertEqual(len(payload['sites']),1)
                self.assertEqual(payload['sites'][0]['state'],'COMMUNITY_MAPPED')
            finally:
                server.shutdown();server.server_close();thread.join(timeout=4)
