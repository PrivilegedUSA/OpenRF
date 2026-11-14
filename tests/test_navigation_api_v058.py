"""v0.2.58 HTTP route camera context and opt-in comparison, no live network."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch
from openrf.server import create_server
from openrf.storage import Repository
from openrf import camera_catalog, camera_routes


class CameraRouteHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.repo=Repository(Path(cls.tmp.name)/'openrf.sqlite3')
        camera_catalog.add_manual(cls.repo,{'type':'ALPR','state':'REPORTED','source':'test',
                  'label':'Fixture camera','latitude':38.40,'longitude':-120.68})
        cls.server=create_server(cls.repo,port=0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.port=cls.server.server_address[1]
        cls.points=[{'latitude':38.4,'longitude':-120.7},{'latitude':38.4,'longitude':-120.66}]
        cls.road={'type':'ROAD_ROUTE','is_driving_route':True,'provider':'local-valhalla',
                   'coordinates':[[-120.7,38.4],[-120.68,38.4],[-120.66,38.4]],
                   'origin':[-120.7,38.4],'destination':[-120.66,38.4],
                   'stops':[],'distance_miles':2,'duration_seconds':230,'maneuvers':[]}
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=2)
        cls.tmp.cleanup()
    def post(self,path,body):
        http=HTTPConnection('127.0.0.1',self.port,timeout=5)
        http.request('POST',path,body=json.dumps(body),headers={'Host':f'localhost:{self.port}','Content-Type':'application/json'})
        result=http.getresponse();status=result.status;raw=result.read();http.close()
        return status,json.loads(raw)
    def test_normal_route_includes_bounded_report(self):
        with patch('openrf.server.local_route',return_value=self.road):
            status,body=self.post('/api/navigation/route',{'locations':self.points})
        self.assertEqual(status,200)
        self.assertEqual(body['camera_report']['count'],1)
        self.assertEqual(body['camera_report']['sites'][0]['state'],'REPORTED')
        self.assertEqual(body['route']['provider'],'local-valhalla')
    def test_camera_comparison_uses_explicit_user_type(self):
        original=camera_routes.compare
        alt={**self.road,'coordinates':[[-120.7,38.4],[-120.68,38.41],[-120.66,38.4]],
             'distance_miles':2.3,'duration_seconds':260}
        def local(points,**kw):return alt if kw.get('exclude_locations') else self.road
        with patch('openrf.server.camera_routes.compare',side_effect=lambda repo,points,types:original(repo,points,types,router=local)):
            status,data=self.post('/api/navigation/camera-comparison',{'locations':self.points,'types':['ALPR']})
        self.assertEqual(status,200)
        self.assertEqual(data['standard_cameras']['count'],1)
        self.assertEqual(data['alternative_cameras']['count'],0)
        self.assertEqual(data['alternative']['distance_miles'],2.3)
        status,bad=self.post('/api/navigation/camera-comparison',{'locations':self.points,'types':['UNKNOWN']})
        self.assertEqual(status,400)
        self.assertIn('category',bad['error'])

if __name__=='__main__':unittest.main()
