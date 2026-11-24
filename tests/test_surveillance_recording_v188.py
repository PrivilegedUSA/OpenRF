"""v188 recording outcome checks using synthetic FFmpeg video, never a camera."""
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from openrf.surveillance_recording import RecordingManager, SurveillanceError


class RecordingLifecycle(unittest.TestCase):
    def test_real_synthetic_ffmpeg_can_finalize_recording(self):
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
            self.skipTest('FFmpeg tools missing')
        with tempfile.TemporaryDirectory() as tmp:
            manager=RecordingManager(Path(tmp)/'media.db')
            # Explicitly local synthetic generator. No camera, RTSP, or internet access.
            with patch('openrf.surveillance_recording._input_args', return_value=[
                    '-re','-f','lavfi','-i','testsrc2=size=320x240:rate=10']):
                result=manager.start({'id':7,'name':'DEMO synthetic video','source':'RTSP','location':'rtsp://127.0.0.1/fake'})
                self.assertEqual(result['state'],'STARTING')
                time.sleep(1.6)
                done=manager.stop(7)
            self.assertIn(done['state'],('STOPPED','FAILED'))
            rows=manager.list()
            self.assertEqual(len(rows),1)
            self.assertEqual(rows[0]['state'],done['state'])
            if done['state']=='STOPPED':
                self.assertGreater(done['bytes'],0)
                path,_=manager.file(result['id'])
                self.assertGreater(path.stat().st_size,100)
            else:
                self.fail('Synthetic FFmpeg recording unexpectedly failed; verify ffmpeg/libx264')

    def test_clean_exit_with_missing_file_cannot_be_reported_as_finished(self):
        with tempfile.TemporaryDirectory() as tmp:
            manager=RecordingManager(Path(tmp)/'media.db')
            with manager._db() as db:
                db.execute("INSERT INTO surveillance_recordings(id,camera_id,camera_name,kind,filename,started_utc,state) VALUES(1,1,'DEMO','video','video-00000001.mp4','2026-01-01','RECORDING')")
                db.commit()
            class Process:
                returncode=0
                def poll(self):return 0
            manager.active[1]=(1,Process())
            rows=manager.list()
            self.assertEqual(rows[0]['state'],'FAILED')
            self.assertEqual(rows[0]['bytes'],0)
            with self.assertRaises(SurveillanceError): manager.file(1)


if __name__=='__main__':unittest.main()
