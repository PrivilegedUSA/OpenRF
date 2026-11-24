"""Tests use synthetic camera URLs only: no physical camera connects."""
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from openrf.storage import Repository
from openrf.server import create_server
from openrf.surveillance import SurveillanceStore, SurveillanceError, validate_rtsp


class CameraInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name)/'data.sqlite3'
        self.store = SurveillanceStore(self.db)

    def tearDown(self):
        self.temp.cleanup()

    def test_local_persistent_inventory_and_redaction(self):
        camera = self.store.save({'name':' TEST FRONT ', 'rtsp_url':'rtsp://viewer:secret@192.168.1.75:554/h264?channel=1'})
        self.assertEqual(camera['name'], 'TEST FRONT')
        self.assertEqual(camera['state'], 'NOT_CHECKED')
        self.assertNotIn('secret', json.dumps(camera))
        self.assertFalse(camera['connected'])
        self.assertEqual(len(SurveillanceStore(self.db).list()), 1)
        changed = self.store.save({'name':'Renamed'}, camera['id'])
        self.assertEqual(changed['name'], 'Renamed')
        self.assertIn('secret', self.store.get_url(camera['id']))
        self.assertTrue(self.store.delete(camera['id']))
        self.assertEqual(self.store.list(), [])

    def test_reject_unsafe_urls(self):
        for url in ('rtsp://127.0.0.1/a','rtsp://169.254.1.3/a','rtsp://8.8.8.8/a',
                    'http://192.168.1.2/x','rtsp://localhost/a','rtsp://[::1]/x',
                    'rtsp://224.0.0.1/a','rtsp://192.168.1.2/#abc',
                    'rtsp://192.168.1.2:invalid/a', None, 'rtsp://192.168.1.2/\n'):
            with self.subTest(url=url), self.assertRaises(SurveillanceError):
                validate_rtsp(url)
        self.assertEqual(validate_rtsp('rtsp://10.0.0.4:554/live'), 'rtsp://10.0.0.4:554/live')

    def test_reject_invalid_data(self):
        for payload in ({'name': 'test'}, {'name':'x','rtsp_url':'rtsp://localhost/a'},
                        {'name':'x','rtsp_url':'rtsp://192.168.1.2/a','connected':True}):
            with self.assertRaises(SurveillanceError):
                self.store.save(payload)


class CameraHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.server = create_server(Repository(Path(self.temp.name)/'openrf.sqlite3'),port=0)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        payload = json.dumps(body) if body is not None else None
        conn.request(method,path,body=payload,headers={'Host':f'127.0.0.1:{self.server.server_port}',
                     **({'Content-Type':'application/json'} if body is not None else {}),**(headers or {})})
        response = conn.getresponse()
        status = response.status
        raw = response.read()
        conn.close()
        return status, json.loads(raw)

    def test_crud_is_private_in_http_and_no_connection_on_read(self):
        status, data = self.request('POST','/api/surveillance/cameras',
               {'name':'TEST', 'rtsp_url':'rtsp://demo:password@192.168.42.55/live'})
        self.assertEqual(status,201)
        self.assertNotIn('password',json.dumps(data))
        ident=data['id']
        status, info=self.request('GET','/api/surveillance')
        self.assertEqual(status,200)
        self.assertFalse(info['capabilities']['automatic_connections'])
        self.assertEqual(info['cameras'][0]['state'],'NOT_CHECKED')
        self.assertNotIn('password',json.dumps(info))
        self.assertEqual(self.request('POST',f'/api/surveillance/cameras/{ident}',{'name':'new'})[0],200)
        self.assertTrue(self.request('DELETE',f'/api/surveillance/cameras/{ident}')[1]['deleted'])

    def test_cross_origin_write_rejected_and_external_stream_blocked(self):
        self.assertEqual(self.request('POST','/api/surveillance/cameras',
          {'name':'bad','rtsp_url':'rtsp://8.8.8.8/a'})[0],400)
        self.assertEqual(self.request('POST','/api/surveillance/cameras',
          {'name':'x','rtsp_url':'rtsp://192.168.1.2/a'},
          {'Origin':'http://attacker.example'})[0],403)
        self.assertEqual(self.request('GET','/api/surveillance/cameras/1/live',
          headers={'Sec-Fetch-Site':'cross-site'})[0],403)

if __name__ == '__main__':
    unittest.main()
