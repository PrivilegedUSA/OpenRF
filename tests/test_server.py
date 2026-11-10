import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.server=create_server(Repository(Path(cls.tmp.name)/'db.sqlite3'), port=0)
        cls.server_thread=threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.port=cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=3)
        cls.tmp.cleanup()

    def call(self, method, path, body=None, headers=None):
        conn=HTTPConnection('127.0.0.1',self.port,timeout=5)
        base={'Host':f'localhost:{self.port}'}
        if body is not None:
            base['Content-Type']='application/json'
            body=json.dumps(body)
        base.update(headers or {})
        conn.request(method,path,body=body,headers=base)
        response=conn.getresponse()
        raw=response.read()
        status=response.status
        conn.close()
        return status, json.loads(raw) if response.getheader('Content-Type','').startswith('application/json') else raw

    def test_health_static_hardware_and_exports(self):
        s,data=self.call('GET','/api/health')
        self.assertEqual(s,200)
        self.assertEqual(data['version'],'0.2.0')
        for path in ('/','/static/app.css','/static/app.js','/api/export.csv','/api/export.geojson'):
            status,_=self.call('GET',path)
            self.assertEqual(status,200,path)
        s,data=self.call('GET','/api/hardware')
        self.assertEqual(s,200)
        self.assertEqual(len(data['capabilities']),6)

    def test_cannot_forge_sensor_source_via_manual_entry(self):
        s,data=self.call('POST','/api/observations', {'kind':'BLE','source':'SENSOR', 'source_device':'HackRF','label':'Unverified manual'})
        self.assertEqual(s,201)
        self.assertEqual(data['source'],'MANUAL')
        self.assertEqual(data['source_device'],'Manual browser entry')

    def test_invalid_origin_and_host_rejected(self):
        status,_=self.call('POST','/api/demo/load',{}, {'Origin':'https://attacker.example'})
        self.assertEqual(status,403)
        status,_=self.call('GET','/api/health',headers={'Host':'evil.example'})
        self.assertEqual(status,403)

    def test_session_and_manual_observation(self):
        s,session=self.call('POST','/api/sessions', {'name':'HTTP test session'})
        self.assertEqual(s,201)
        s,item=self.call('POST','/api/observations', {'label':'HTTP record','session_id':session['id']})
        self.assertEqual(s,201)
        s,response=self.call('POST',f"/api/sessions/{session['id']}/stop",{})
        self.assertTrue(response['stopped'])
        s,response=self.call('GET','/api/sessions')
        self.assertEqual(response['sessions'][0]['observation_count'],1)

    def test_invalid_observation_rejected(self):
        status,data=self.call('POST','/api/observations',{'label':'invalid GPS','latitude':35})
        self.assertEqual(status,400)
        self.assertIn('together',data['error'])
