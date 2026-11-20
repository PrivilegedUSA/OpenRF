"""v0.2.149 loopback terrain import, source inventory and battery status endpoints."""
import json
import struct
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository


class TerrainPowerApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.server=create_server(Repository(Path(cls.temp.name)/'db.sqlite3'),port=0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.port=cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.temp.cleanup()

    def request(self,method,path,body=None,headers=None):
        connection=HTTPConnection('127.0.0.1',self.port,timeout=8)
        connection.request(method,path,body=body,headers={'Host':f'localhost:{self.port}',**(headers or {})})
        response=connection.getresponse()
        status,data=response.status,response.read()
        connection.close()
        return status,json.loads(data)

    def test_power_and_terrain_endpoints_are_loopback_only(self):
        status,result=self.request('GET','/api/device/power')
        self.assertEqual(status,200)
        self.assertTrue(result['read_only'])
        self.assertEqual(result['battery']['runtime_estimate_minutes'],None)
        self.assertEqual(self.request('GET','/api/terrain/tiles')[1]['tiles'],[])
        self.assertEqual(self.request('GET','/api/device/power',headers={'Host':'example.org'})[0],403)
        connection=HTTPConnection('127.0.0.1',self.port,timeout=8)
        connection.request('GET','/static/battery-status.js',headers={'Host':f'localhost:{self.port}'})
        response=connection.getresponse()
        self.assertEqual(response.status,200)
        self.assertIn(b'OpenRFDeviceBattery',response.read())
        connection.close()

    def test_raw_hgt_import_and_delete_are_private_and_bounded(self):
        data=struct.pack('>h',713)*(1201*1201)
        headers={'Content-Type':'application/octet-stream',
                 'X-OpenRF-Terrain-Name':'N38W121.hgt',
                 'X-OpenRF-Terrain-Source':'Self-created%20test%20fixture'}
        self.assertEqual(self.request('POST','/api/terrain/import',body=b'unsafe',headers=headers)[0],413)
        self.assertEqual(self.request('GET','/api/terrain/tiles')[1]['tiles'],[])
        self.assertEqual(self.request('POST','/api/terrain/import',body=b'unsafe',
                                     headers={**headers,'Origin':'https://not-local.example'})[0],403)
        status,installed=self.request('POST','/api/terrain/import',body=data,headers=headers)
        self.assertEqual(status,201)
        self.assertEqual(installed['tile']['name'],'N38W121')
        self.assertFalse(installed['tile']['source_verified'])
        status,inventory=self.request('GET','/api/terrain/tiles')
        self.assertEqual(status,200)
        self.assertEqual(len(inventory['tiles']),1)
        self.assertEqual(inventory['tiles'][0]['source'],'Self-created test fixture')
        # Duplicate-name rejection is covered directly in test_terrain_hgt_v145;
        # this HTTP server rejects before reading the body by closing early.
        self.assertEqual(self.request('DELETE','/api/terrain/tiles/../../bad')[0],404)
        self.assertEqual(self.request('DELETE','/api/terrain/tiles/N38W121')[1]['removed'],True)
        self.assertEqual(self.request('GET','/api/terrain/tiles')[1]['tiles'],[])


if __name__=='__main__':unittest.main()
