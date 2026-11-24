"""Opt-in motion-candidate review of saved video; no camera or RF hardware."""
import http.client
import json
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from openrf.server import create_server
from openrf.storage import Repository
from openrf.surveillance import SurveillanceError
from openrf.surveillance_motion import FRAME_BYTES, MotionHistory, detect_motion
from openrf.surveillance_recording import RecordingManager


class MotionFrameTests(unittest.TestCase):
    def test_static_frames_generate_no_motion(self):
        raw = bytes(FRAME_BYTES) * 8
        seconds, events = detect_motion(raw, 'high')
        self.assertEqual(seconds, 4)
        self.assertEqual(events, [])

    def test_moving_region_is_a_candidate_not_a_confidence_score(self):
        black = bytes(FRAME_BYTES)
        white_half = (bytes([200]) * (FRAME_BYTES // 2)) + bytes(FRAME_BYTES // 2)
        data = black * 4 + white_half * 4 + black * 8
        seconds, events = detect_motion(data, 'medium')
        self.assertEqual(seconds, 8)
        self.assertEqual(len(events), 1)  # 6-second cooldown
        self.assertEqual(events[0], {'offset_seconds': 2.0, 'changed_fraction': 0.5})

    def test_validation_and_bounded_output(self):
        for sensitivity in ('extreme', '', None, 5):
            with self.assertRaises(SurveillanceError):
                detect_motion(bytes(FRAME_BYTES) * 2, sensitivity)
        for bad in (b'', bytes(13), bytes(FRAME_BYTES), bytes(FRAME_BYTES * 601)):
            with self.assertRaises(SurveillanceError):
                detect_motion(bad, 'medium')


@unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg not installed: synthetic clip integration unavailable')
class SavedVideoMotionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.recordings = RecordingManager(Path(self.tmp.name) / 'db.sqlite3')
        self.motion = MotionHistory(self.recordings)
        with self.recordings._db() as db:
            cur = db.execute('''INSERT INTO surveillance_recordings
                (camera_id,camera_name,kind,filename,started_utc,state)
                VALUES (1,'Synthetic Test Camera','video','pending','2026-11-24T12:00:00+00:00','FINISHED')''')
            self.ident = cur.lastrowid
            filename = f'video-{self.ident:08d}.mp4'
            db.execute('UPDATE surveillance_recordings SET filename=? WHERE id=?', (filename, self.ident))
            db.commit()
        raw = bytes(FRAME_BYTES) * 4 + bytes([240]) * FRAME_BYTES * 12
        self.clip = self.recordings.folder / filename
        subprocess.run([shutil.which('ffmpeg'), '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
                        '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', '128x72', '-r', '2',
                        '-i', 'pipe:0', '-c:v', 'mpeg4', str(self.clip)], input=raw,
                       check=True, timeout=12, capture_output=True)

    def tearDown(self):
        self.recordings.close()
        self.tmp.cleanup()

    def test_realtime_ffmpeg_saved_clip_and_persistence(self):
        self.assertEqual(self.motion.history()['scans'], [])
        receipt = self.motion.scan(self.ident, 'medium')
        self.assertEqual(receipt['mode'], 'ON_DEMAND_SAVED_VIDEO_ONLY')
        self.assertEqual(receipt['event_count'], 1)
        events = MotionHistory(self.recordings).history()
        self.assertEqual(events['scans'][0]['event_count'], 1)
        self.assertTrue(events['events'][0]['source_available'])
        self.assertAlmostEqual(events['events'][0]['offset_seconds'], 2.0)
        self.assertGreater(events['events'][0]['changed_fraction'], .06)
        # Rescanning replaces events, preventing duplicates.
        self.motion.scan(self.ident, 'high')
        self.assertEqual(len(self.motion.history()['events']), 1)
        self.recordings.delete(self.ident)
        self.assertFalse(self.motion.history()['events'][0]['source_available'])
        self.assertTrue(self.motion.delete_history(self.ident))
        self.assertEqual(self.motion.history()['scans'], [])
        self.assertFalse(self.motion.delete_history(self.ident))

    def test_reject_active_image_missing_ffmpeg_and_busy(self):
        with self.recordings._db() as db:
            db.execute("UPDATE surveillance_recordings SET state='RECORDING' WHERE id=?", (self.ident,))
            db.commit()
        with self.assertRaises(SurveillanceError): self.motion.scan(self.ident)
        with self.recordings._db() as db:
            db.execute("UPDATE surveillance_recordings SET state='FINISHED' WHERE id=?", (self.ident,))
            db.commit()
        with patch('openrf.surveillance_motion.shutil.which', return_value=None):
            with self.assertRaises(SurveillanceError): self.motion.scan(self.ident)
        self.assertTrue(self.motion.busy.acquire(False))
        try:
            with self.assertRaises(SurveillanceError): self.motion.scan(self.ident)
        finally:
            self.motion.busy.release()
        for ident in (0, True, '1'):
            with self.assertRaises(SurveillanceError): self.motion.scan(ident)
        with self.assertRaises(SurveillanceError): self.motion.scan(self.ident, 'super')


class MotionHTTPTests(unittest.TestCase):
    def test_origin_validation_and_explicit_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            server = create_server(Repository(Path(tmp) / 'db.sqlite3'), port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def request(method, path, data=None, origin=None):
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=8)
                headers = {'Host': f'127.0.0.1:{server.server_port}', 'Content-Type': 'application/json'}
                if origin:
                    headers['Origin'] = origin
                conn.request(method, path, body=json.dumps(data) if data is not None else None, headers=headers)
                result = conn.getresponse()
                output = (result.status, json.loads(result.read()))
                conn.close()
                return output
            try:
                status, payload = request('GET', '/api/surveillance')
                self.assertEqual(status, 200)
                self.assertEqual(payload['motion']['scans'], [])
                self.assertEqual(request('POST', '/api/surveillance/recordings/1/motion-scan', {'sensitivity':'medium'}, 'http://evil.invalid')[0], 403)
                self.assertEqual(request('POST', '/api/surveillance/recordings/1/motion-scan', {'sensitivity':'medium'})[0], 409)
                self.assertEqual(request('POST', '/api/surveillance/recordings/1/motion-scan', {'sensitivity':'wrong'})[0], 409)
                self.assertEqual(request('DELETE', '/api/surveillance/motion-scans/1', origin='http://evil.invalid')[0], 403)
                self.assertEqual(request('DELETE', '/api/surveillance/motion-scans/1'), (200, {'deleted':False}))
            finally:
                server.shutdown(); thread.join(5); server.server_close()


if __name__ == '__main__':
    unittest.main()
