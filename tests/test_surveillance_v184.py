"""v184 opt-in live motion and clip controls; all camera samples are synthetic."""
import io
import http.client
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from openrf.storage import Repository
from openrf.server import create_server
from openrf.surveillance import SurveillanceError
from openrf.surveillance_live_motion import (FRAME_BYTES, LiveMotionService, frame_change, read_frame)


class FakeRecordings:
    def __init__(self):
        self.starts = 0
        self.stops = 0

    def start(self, camera):
        self.starts += 1
        return {'id': self.starts}

    def stop(self, camera_id):
        self.stops += 1

    def list(self):
        return [{'id': ident, 'bytes': 1500, 'state': 'STOPPED'} for ident in range(1, self.starts + 1)]


class FakeProcess:
    def __init__(self, frames):
        self.stdout = io.BytesIO(frames)
        self.terminated = False

    def poll(self):
        return 0 if self.stdout.tell() == len(self.stdout.getbuffer()) or self.terminated else None

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=1):
        return 0

    def kill(self):
        self.terminated = True


class MotionWorkerTests(unittest.TestCase):
    def test_frame_change_and_chunked_read(self):
        black = bytes(FRAME_BYTES)
        white = bytes([240]) * FRAME_BYTES
        self.assertEqual(frame_change(black, black), 0)
        self.assertEqual(frame_change(black, white), 1)
        for bad in (b'', b'123'):
            with self.assertRaises(SurveillanceError):
                frame_change(bad, black)
        self.assertEqual(read_frame(io.BytesIO(black)), black)
        self.assertIsNone(read_frame(io.BytesIO(black[:20])))

    def test_explicit_start_decoded_motion_clip_and_persistent_event(self):
        with tempfile.TemporaryDirectory() as temp:
            records = FakeRecordings()
            service = LiveMotionService(Path(temp) / 'store.sqlite', records)
            camera = {'id': 2, 'name': 'Synthetic test camera', 'source': 'RTSP', 'location': 'rtsp://192.168.1.11/test'}
            self.assertEqual(service.status()['state'], 'OFF')
            self.assertEqual(service.history(), [])
            raw = bytes(FRAME_BYTES) * 6 + bytes([210]) * FRAME_BYTES * 3
            proc = FakeProcess(raw)
            with patch('openrf.surveillance_live_motion.shutil.which', return_value='/usr/bin/ffmpeg'), \
                 patch('openrf.surveillance_live_motion.subprocess.Popen', return_value=proc):
                service.start(camera, 'medium')
                for _ in range(100):
                    if service.current is None:
                        break
                    time.sleep(.01)
                self.assertIsNone(service.current)
            self.assertEqual(records.starts, 1)
            self.assertEqual(records.stops, 1)
            self.assertEqual(service.history()[0]['action'], 'MEDIA_SAVED')
            self.assertEqual(service.history()[0]['camera_name'], camera['name'])
            self.assertEqual(LiveMotionService(Path(temp) / 'store.sqlite', records).history()[0]['action'], 'MEDIA_SAVED')
            self.assertNotIn('location', service.status())
            self.assertEqual(service.stop()['state'], 'STREAM_ENDED')

    def test_static_camera_does_not_record_and_input_is_restricted(self):
        with tempfile.TemporaryDirectory() as temp:
            records = FakeRecordings()
            service = LiveMotionService(Path(temp) / 'store.sqlite', records)
            camera = {'id': 3, 'name': 'Static fixture', 'source': 'RTSP', 'location': 'rtsp://192.168.1.11/test'}
            with patch('openrf.surveillance_live_motion.shutil.which', return_value='/usr/bin/ffmpeg'), \
                 patch('openrf.surveillance_live_motion.subprocess.Popen', return_value=FakeProcess(bytes(FRAME_BYTES) * 8)):
                service.start(camera, 'high')
                for _ in range(100):
                    if service.current is None:
                        break
                    time.sleep(.01)
            self.assertEqual(records.starts, 0)
            self.assertEqual(service.history(), [])
            with self.assertRaises(SurveillanceError):
                service.start(camera, 'invalid')
            with patch('openrf.surveillance_live_motion.shutil.which', return_value=None):
                with self.assertRaises(SurveillanceError):
                    service.start(camera, 'low')


class LiveMotionHTTPTests(unittest.TestCase):
    def test_origin_validation_and_monitor_api_rejects_automatic_setup(self):
        with tempfile.TemporaryDirectory() as temp:
            repository = Repository(Path(temp) / 'db.sqlite')
            server = create_server(repository, port=0)
            camera = server.surveillance_store.save({'name':'Private test', 'rtsp_url':'rtsp://192.168.1.22/live'})
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            def request(method, path, data=None, origin=None):
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=6)
                headers = {'Host':f'127.0.0.1:{server.server_port}'}
                if origin:
                    headers['Origin'] = origin
                if data is not None:
                    headers['Content-Type']='application/json'
                conn.request(method, path, json.dumps(data) if data is not None else None, headers)
                resp=conn.getresponse(); output=resp.status,json.loads(resp.read()); conn.close();return output
            try:
                status,data=request('GET','/api/surveillance')
                self.assertEqual(status,200)
                self.assertEqual(data['live_motion']['status']['state'],'OFF')
                self.assertEqual(data['live_motion']['events'],[])
                path=f'/api/surveillance/cameras/{camera["id"]}/motion/start'
                self.assertEqual(request('POST',path,{'sensitivity':'medium'},'http://evil.invalid')[0],403)
                self.assertEqual(request('POST',path,{'bad':'medium'})[0],409)
                self.assertEqual(request('POST',path,{'sensitivity':'wrong'})[0],409)
                self.assertEqual(server.surveillance_live_motion.status()['state'],'OFF')
                with patch.object(server.surveillance_live_motion, 'start', return_value={'state':'STARTING'}):
                    self.assertEqual(request('POST',path,{'sensitivity':'medium'}),(200,{'state':'STARTING'}))
                self.assertEqual(request('POST',f'/api/surveillance/cameras/{camera["id"]}/motion/stop', origin='http://evil.invalid')[0],403)
                self.assertEqual(request('POST',f'/api/surveillance/cameras/{camera["id"]}/motion/stop')[0],200)
            finally:
                server.shutdown(); worker.join(5); server.server_close()


if __name__=='__main__':
    unittest.main()
