"""v0.2.192: optional private audio, finalized-video thumbnails and safe media access.
Tests use a local synthetic clip, not a live camera or microphone.
"""
import http.client
import json
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository
from openrf.surveillance import SurveillanceError, SurveillanceStore, validate_audio_device
from openrf.surveillance_recording import RecordingManager


class CameraAudioOptions(unittest.TestCase):
    def test_saved_audio_off_by_default_and_validated(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp) / 'local.sqlite3'
            store = SurveillanceStore(repo)
            cam = store.save({'name': 'Local', 'source_type': 'USB', 'usb_device': '/dev/video0'})
            self.assertFalse(cam['record_audio'])
            self.assertFalse(store.get_source(cam['id'])['record_audio'])
            with self.assertRaises(SurveillanceError):
                store.save({'name': 'Wrong', 'source_type': 'USB', 'usb_device': '/dev/video0', 'record_audio': True, 'audio_device': 'default; touch /tmp/oops'})
            with self.assertRaises(SurveillanceError):
                validate_audio_device('plughw:1,0')
            self.assertEqual(validate_audio_device('hw:1,0'), 'hw:1,0')
            store.save({'name': 'Local Audio', 'source_type': 'USB', 'usb_device': '/dev/video0', 'record_audio': True, 'audio_device': 'hw:1,0'}, cam['id'])
            restarted = SurveillanceStore(repo)
            self.assertTrue(restarted.get_source(cam['id'])['record_audio'])
            self.assertEqual(restarted.get_source(cam['id'])['audio_device'], 'hw:1,0')
            restarted.save({'name': 'Local Audio', 'source_type': 'USB', 'record_audio': False}, cam['id'])
            self.assertFalse(restarted.get_source(cam['id'])['record_audio'])
            self.assertEqual(restarted.get_source(cam['id'])['audio_device'], '')
            rtsp = restarted.save({'name': 'Private RTSP', 'rtsp_url': 'rtsp://me:password@192.168.2.4/stream', 'record_audio': True})
            self.assertTrue(rtsp['record_audio'])
            self.assertNotIn('password', json.dumps(restarted.list()))


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg/FFprobe required for synthetic media test')
class ThumbnailHTTP(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'openrf.sqlite3'
        self.server = create_server(Repository(self.db), port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        media = self.server.surveillance_recordings
        with media._db() as db:
            db.execute("INSERT INTO surveillance_recordings (camera_id, camera_name,kind,filename,started_utc,state,audio_requested) VALUES (1,'DEMO SYNTHETIC','video','video-00000001.mp4','2026-01-01T00:00:00+00:00','STOPPED',1)")
            db.commit()
        self.recording = media.folder / 'video-00000001.mp4'
        result = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
                                 '-f', 'lavfi', '-i', 'color=c=blue:s=96x64:r=6:d=1',
                                 '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
                                 '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                                 '-c:a', 'aac', '-movflags', '+faststart', str(self.recording)],
                                capture_output=True, timeout=20, check=False)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace')[-400:])

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(4)
        self.server.server_close()
        self.temp.cleanup()

    def get(self, path, headers=None):
        c = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=15)
        c.request('GET', path, headers={'Host': f'127.0.0.1:{self.server.server_port}', **(headers or {})})
        result = c.getresponse()
        status, content, mime = result.status, result.read(), result.getheader('Content-Type')
        c.close()
        return status, content, mime

    def test_private_thumbnail_and_cleanup(self):
        self.assertEqual(self.get('/api/surveillance/recordings/1/thumbnail', {'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.get('/api/surveillance/recordings/1/thumbnail?x=1')[0], 403)
        self.assertEqual(self.get('/api/surveillance/recordings/999/thumbnail')[0], 404)
        status, jpg, mime = self.get('/api/surveillance/recordings/1/thumbnail')
        self.assertEqual((status, mime), (200, 'image/jpeg'))
        self.assertTrue(jpg.startswith(b'\xff\xd8'))
        self.assertEqual(self.get('/api/surveillance/recordings/1/thumbnail')[1], jpg)
        manager = self.server.surveillance_recordings
        self.assertTrue((manager.folder/'thumb-00000001.jpg').exists())
        self.assertTrue(manager._audio_in_file(self.recording))
        self.assertTrue(manager.delete(1))
        self.assertFalse((manager.folder/'thumb-00000001.jpg').exists())
        self.assertEqual(self.get('/api/surveillance/recordings/1/thumbnail')[0], 404)


if __name__ == '__main__':
    unittest.main()

class FFmpegAudioCommand(unittest.TestCase):
    def test_rtsp_audio_enabled_only_with_opt_in(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temp:
            manager = RecordingManager(Path(temp) / 'local.sqlite3')
            camera = {'id': 1, 'name': 'DEMO private camera', 'source': 'RTSP',
                      'location': 'rtsp://192.168.1.4/stream', 'record_audio': True}
            with patch('openrf.surveillance_recording.shutil.which', return_value='/usr/bin/ffmpeg'), \
                 patch('openrf.surveillance_recording.subprocess.Popen', side_effect=OSError('fake process')) as popen:
                with self.assertRaises(SurveillanceError):
                    manager.start(camera)
            command = popen.call_args.args[0]
            self.assertIn('0:a:0?', command)
            self.assertIn('aac', command)
            camera['record_audio'] = False
            with patch('openrf.surveillance_recording.shutil.which', return_value='/usr/bin/ffmpeg'), \
                 patch('openrf.surveillance_recording.subprocess.Popen', side_effect=OSError('fake process')) as popen:
                with self.assertRaises(SurveillanceError):
                    manager.start(camera)
            command = popen.call_args.args[0]
            self.assertNotIn('0:a:0?', command)
            self.assertIn('-an', command)
