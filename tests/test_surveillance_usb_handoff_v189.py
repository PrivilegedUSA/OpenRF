"""v189: local USB preview/recording handoff, using only fake or synthetic sources."""
import shutil
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from openrf.surveillance import PreviewSlots, SurveillanceError
from openrf.surveillance_recording import RecordingManager


class UsbPreviewHandoff(unittest.TestCase):
    def test_stop_camera_finishes_reader_cleanup(self):
        slots = PreviewSlots(capacity=1)
        done = threading.Event()
        started = threading.Event()
        class Stream:
            def read(self, n):
                started.set()
                done.wait(timeout=4)
                return b''
            def close(self): pass
        class FakeProcess:
            def __init__(self, *args, **kwargs):
                self.stdout = Stream()
                self.returncode = None
            def poll(self): return self.returncode
            def terminate(self):
                self.returncode = 0
                done.set()
            def wait(self, timeout=1):
                done.set()
                self.returncode = 0
                return 0
            def kill(self): self.terminate()
        thread_errors=[]
        def run():
            try: slots.run('/dev/video0', object(), camera_id=5, source='USB')
            except Exception as error: thread_errors.append(error)
        with patch('openrf.surveillance.subprocess.Popen', FakeProcess), patch('openrf.surveillance.shutil.which', return_value='/usr/bin/ffmpeg'):
            thread = threading.Thread(target=run)
            thread.start()
            self.assertTrue(started.wait(2))
            slots.stop_camera(5)
            thread.join(2)
        self.assertFalse(thread.is_alive())
        self.assertFalse(thread_errors)
        self.assertNotIn(5, slots.by_camera)
        self.assertTrue(slots.semaphore.acquire(blocking=False))
        slots.semaphore.release()

    def test_recorder_calls_usb_preview_release_before_ffmpeg(self):
        if not shutil.which('ffmpeg'):
            self.skipTest('FFmpeg missing')
        with tempfile.TemporaryDirectory() as tmp:
            manager = RecordingManager(Path(tmp)/'media.db')
            device = Path(tmp)/'video0'
            device.touch()  # Local stand-in for the device-presence check; NOT a camera.
            calls=[]
            manager.preview_stopper = lambda camera_id: calls.append(camera_id)
            with patch('openrf.surveillance_recording._input_args',return_value=[
                 '-re','-f','lavfi','-i','testsrc2=size=160x120:rate=10']):
                started=manager.start({'id':4,'name':'DEMO synthetic video','source':'USB','location':str(device)})
                self.assertEqual(started['state'],'STARTING')
                self.assertEqual(calls,[4])
                time.sleep(0.5)
                manager.stop(4)

    def test_failed_preview_release_prevents_camera_recording(self):
        with tempfile.TemporaryDirectory() as tmp:
            manager = RecordingManager(Path(tmp)/'media.db')
            device = Path(tmp)/'video0';device.touch()
            def busy(camera_id): raise SurveillanceError('USB preview is still releasing the device')
            manager.preview_stopper=busy
            with patch('openrf.surveillance_recording.shutil.which', return_value='/usr/bin/ffmpeg'), \
                 patch('openrf.surveillance_recording.subprocess.Popen') as popen, \
                 self.assertRaisesRegex(SurveillanceError,'still releasing'):
                manager.start({'id':4,'name':'DEMO','source':'USB','location':str(device)})
            popen.assert_not_called()
            self.assertEqual(manager.list(),[])

if __name__ == '__main__': unittest.main()
