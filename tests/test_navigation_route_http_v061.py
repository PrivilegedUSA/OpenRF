"""HTTP options stay loopback-only and do not weaken route input validation."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch
from openrf.server import create_server
from openrf.storage import Repository


class OptionAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.server=create_server(Repository(Path(cls.tmp.name)/'openrf.sqlite3'),port=0)
        cls.port=cls.server.server_address[1]
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(2);cls.tmp.cleanup()
    def post(self,path,body):
        http=HTTPConnection('127.0.0.1',self.port,timeout=3)
        http.request('POST',path,json.dumps(body),{'Host':f'localhost:{self.port}','Content-Type':'application/json'})
        result=http.getresponse();out=result.status,json.loads(result.read());http.close();return out
    def test_options_forwarded_only_on_explicit_request(self):
        route={'type':'ROAD_ROUTE','is_driving_route':True,'provider':'local-valhalla',
               'coordinates':[[-120.7,38.4],[-120.6,38.5]],'origin':[-120.7,38.4],
               'destination':[-120.6,38.5],'stops':[],'distance_miles':7,'duration_seconds':800,'maneuvers':[]}
        pts=[{'latitude':38.4,'longitude':-120.7},{'latitude':38.5,'longitude':-120.6}]
        with patch('openrf.server.local_route',return_value=route) as router:
            status,_=self.post('/api/navigation/route',{'locations':pts,'options':{'avoid_tolls':True,'exclude_locations':[]}})
            self.assertEqual(status,200)
            self.assertEqual(router.call_args.kwargs['options']['avoid_tolls'],True)
            status,_=self.post('/api/navigation/route',{'locations':pts})
            self.assertEqual(status,200)
            self.assertEqual(router.call_args.kwargs,{})
    def test_invalid_coordinates_and_preferences_fail_closed(self):
        pts=[{'latitude':38.4,'longitude':-120.7},{'latitude':38.5,'longitude':-120.6}]
        status,data=self.post('/api/navigation/route',{'locations':pts,'options':{'avoid_tolls':'yes'}})
        self.assertEqual(status,422)
        self.assertIn('true or false',data['error'])
        status,_=self.post('/api/navigation/route',{'locations':pts,'url':'https://example.invalid'})
        self.assertEqual(status,400)
        status,_=self.post('/api/navigation/camera-comparison',{'locations':pts,'types':['ALPR'],
                            'options':{'exclude_locations':[{'latitude':0,'longitude':999}]}})
        self.assertIn(status,(400,422))

if __name__=='__main__':unittest.main()
