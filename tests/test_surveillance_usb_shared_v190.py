"""v190 single USB capture / simultaneous preview + recording; synthetic-only."""
import shutil
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from openrf.surveillance_recording import RecordingManager

class SharedCaptureTests(unittest.TestCase):
    def test_record_and_live_preview_use_one_synthetic_ffmpeg_input(self):
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
            self.skipTest('FFmpeg tools missing')
        with tempfile.TemporaryDirectory() as tmp:
            manager = RecordingManager(Path(tmp) / 'media.db')
            # This is NOT a camera. Fake file satisfies the device-presence check.
            fake_device = Path(tmp) / 'video0'; fake_device.touch()
            calls=[]; manager.preview_stopper = lambda camera_id: calls.append(camera_id)
            with patch('openrf.surveillance_recording._input_args', return_value=[
                 '-re', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10']):
                started = manager.start({'id':4, 'name':'DEMO synthetic frames',
                                         'source':'USB', 'location':str(fake_device)})
                relay = manager.shared_preview(4)
                self.assertIsNotNone(relay)
                self.assertEqual(calls,[4])
                chunks=[]
                class Output:
                    def write(self, data): chunks.append(data)
                    def flush(self): pass
                viewer=threading.Thread(target=relay.stream_to,args=(Output(),),daemon=True)
                viewer.start()
                time.sleep(2.1)
                stopped=manager.stop(4)
                viewer.join(timeout=3)
                self.assertFalse(viewer.is_alive(), 'preview relay must close after recording stops')
                self.assertEqual(stopped['state'],'STOPPED')
                self.assertGreater(stopped['bytes'],1000)
                self.assertTrue(any(b'--openrf' in c and b'Content-type: image/jpeg' in c for c in chunks))
                self.assertIsNone(manager.shared_preview(4))
                path, mime=manager.file(started['id'])
                self.assertEqual(mime,'video/mp4')
                self.assertTrue(path.is_file())

    def test_recording_continues_without_any_preview_client(self):
        if not shutil.which('ffmpeg'):
            self.skipTest('FFmpeg missing')
        with tempfile.TemporaryDirectory() as tmp:
            manager=RecordingManager(Path(tmp)/'media.db')
            fake=Path(tmp)/'video0';fake.touch()
            with patch('openrf.surveillance_recording._input_args',return_value=[
                  '-re','-f','lavfi','-i','testsrc2=size=160x120:rate=12']):
                manager.start({'id':1,'name':'DEMO','source':'USB','location':str(fake)})
                time.sleep(1.8)
                stopped=manager.stop(1)
                self.assertEqual(stopped['state'],'STOPPED')
                self.assertGreater(stopped['bytes'],500)

if __name__=='__main__': unittest.main()
