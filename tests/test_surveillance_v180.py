"""Mocked opt-in probe checks; never contact cameras or use physical radios."""
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from subprocess import TimeoutExpired

from openrf.server import create_server
from openrf.storage import Repository
from openrf.surveillance import probe_camera

URL = 'rtsp://viewer:secret@192.168.7.21/stream'

class ProbeUnitTests(unittest.TestCase):
    @patch('openrf.surveillance.shutil.which', return_value='/usr/bin/ffprobe')
    @patch('openrf.surveillance.subprocess.run')
    def test_success_sanitized_metadata(self, run, which):
        run.return_value=Mock(returncode=0,stdout=b'{"streams":[{"codec_name":"h264","width":1280,"height":720}]}',stderr=b'')
        result=probe_camera(URL)
        self.assertEqual(result['state'],'STREAM_FOUND')
        self.assertEqual((result['codec'],result['width'],result['height']),('h264',1280,720))
        self.assertNotIn('secret',json.dumps(result))
        self.assertEqual(run.call_args.kwargs['timeout'],9)
        self.assertEqual(run.call_args.kwargs['capture_output'],True)
        self.assertNotIn('shell',run.call_args.kwargs)

    @patch('openrf.surveillance.shutil.which', return_value='/usr/bin/ffprobe')
    @patch('openrf.surveillance.subprocess.run')
    def test_failure_never_echoes_credentials(self, run, which):
        run.return_value=Mock(returncode=1,stdout=b'',stderr=b'rtsp://viewer:secret@192.168.7.21/stream')
        result=probe_camera(URL)
        self.assertEqual(result['state'],'UNAVAILABLE')
        self.assertNotIn('secret',json.dumps(result))
        run.side_effect=TimeoutExpired('ffprobe',9)
        self.assertEqual(probe_camera(URL)['state'],'TIMEOUT')

    @patch('openrf.surveillance.shutil.which', return_value=None)
    def test_optional_dependency(self, which):
        self.assertEqual(probe_camera(URL)['state'],'UNSUPPORTED')

class ProbeAPITests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.server=create_server(Repository(Path(self.temp.name)/'local.sqlite3'),port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.camera=self.server.surveillance_store.save({'name':'Front','rtsp_url':URL})

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(5)
        self.server.server_close()
        self.temp.cleanup()

    def request(self, method, path, headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        conn.request(method,path,headers={'Host':f'127.0.0.1:{self.server.server_port}', **(headers or {})})
        res=conn.getresponse()
        status=res.status
        data=json.loads(res.read())
        conn.close()
        return status,data

    @patch('openrf.server.probe_camera',return_value={'state':'STREAM_FOUND','codec':'h264'})
    def test_explicit_request_only(self, probe):
        self.assertEqual(self.request('GET','/api/surveillance')[0],200)
        probe.assert_not_called()
        ident=self.camera['id']
        status, result=self.request('POST',f'/api/surveillance/cameras/{ident}/probe')
        self.assertEqual((status,result['state']),(200,'STREAM_FOUND'))
        probe.assert_called_once_with(URL)
        self.assertEqual(self.request('POST',f'/api/surveillance/cameras/{ident}/probe',{'Origin':'http://evil.example'})[0],403)
        self.assertEqual(self.request('POST',f'/api/surveillance/cameras/{ident}/probe?x=1')[0],400)
        self.assertEqual(self.request('POST','/api/surveillance/cameras/987654/probe')[0],404)

    @patch('openrf.server.probe_camera')
    def test_single_diagnostic_slot(self, probe):
        self.assertTrue(self.server.surveillance_probe_lock.acquire(blocking=False))
        try:
            self.assertEqual(self.request('POST',f'/api/surveillance/cameras/{self.camera["id"]}/probe')[0],429)
        finally:
            self.server.surveillance_probe_lock.release()
        probe.assert_not_called()

if __name__=='__main__': unittest.main()
