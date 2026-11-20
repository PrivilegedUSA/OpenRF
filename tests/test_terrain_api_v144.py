"""HTTP contracts for opt-in topographic tiles and offline terrain profile."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository


class TerrainApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.server=create_server(Repository(Path(cls.temp.name)/'openrf.sqlite3'),port=0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(5);cls.temp.cleanup()

    def call(self,method,path,body=None):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=10)
        payload=json.dumps(body).encode() if body is not None else None
        headers={'Host':f'localhost:{self.server.server_port}'}
        if payload is not None:headers['Content-Type']='application/json'
        conn.request(method,path,body=payload,headers=headers)
        resp=conn.getresponse()
        out=json.loads(resp.read())
        status=resp.status
        conn.close()
        return status,out

    def test_local_profile_cache_check_and_route_asset(self):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        conn.request('GET','/static/route-elevation.js',headers={'Host':f'localhost:{self.server.server_port}'})
        response=conn.getresponse()
        self.assertEqual(response.status,200)
        self.assertIn(b'OpenRFRouteElevation',response.read())
        conn.close()
        points=[[-120.6,38.4],[-120.601,38.401]]
        status,data=self.call('POST','/api/navigation/elevation-profile',{'points':points,'allow_online':False})
        self.assertEqual(status,200)
        self.assertEqual(data['profile']['status'],'not_prepared')
        self.assertEqual(self.call('POST','/api/navigation/elevation-profile',{'points':points,'allow_online':'true'})[0],422)
        self.assertFalse((Path(self.temp.name)/'maps'/'.openrf-route-elevation.json').exists())

    def test_topo_status_and_network_permission_gate(self):
        code,data=self.call('GET','/api/maps')
        self.assertEqual(code,200)
        self.assertEqual(data['topographic_download'],'explicit-bounded-usgs-region-only')
        self.assertEqual(self.call('GET','/api/maps/topographic/status')[1]['download']['state'],'idle')
        code,area=self.call('POST','/api/maps/areas',{'name':'TEST area','bounds':[-122,30,-119,36],'minzoom':3,'maxzoom':3})
        self.assertEqual(code,201)
        area_id=area['area']['id']
        code,error=self.call('POST','/api/maps/topographic/start',{'area_id':area_id,'map_id':'offline-topo','confirm_network':False})
        self.assertEqual(code,409)
        self.assertIn('Confirm',error['error'])
        self.assertEqual(self.call('GET','/api/maps/topographic/status')[1]['download']['state'],'idle')
        self.assertFalse((Path(self.temp.name)/'maps'/'offline-topo.mbtiles').exists())


if __name__=='__main__':unittest.main()
