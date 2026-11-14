"""v0.2.53 radio tests use synthetic PCM stubs; no physical RF reception."""
import io
import json
import tempfile
import threading
import time
import unittest
import wave
from http.client import HTTPConnection
from pathlib import Path

from openrf.radio import RadioError, RadioReceiver, validate_radio_settings
from openrf.server import create_server
from openrf.storage import Repository


class SyntheticPcmProcess:
    def __init__(self, argv, **kw):
        self.argv = argv
        self.returncode = None

    def communicate(self, timeout=None):
        self.returncode = 0
        return (b'\x00\x00\x01\x00' * 2400, b'FAKE RTL_FM FIXTURE')

    def terminate(self):
        self.returncode = -15

    def kill(self):
        self.returncode = -9


class WaitProcess(SyntheticPcmProcess):
    def __init__(self, argv, **kw):
        super().__init__(argv, **kw)
        self.started = threading.Event()
        self.done = threading.Event()

    def communicate(self, timeout=None):
        self.started.set()
        self.done.wait(2)
        self.returncode = -15
        return b'\x00\x00'*200, b''

    def terminate(self):
        self.done.set()
        self.returncode = -15


class RadioValidationTests(unittest.TestCase):
    def test_validation_and_fixed_receiver_options(self):
        opts = {'frequency_mhz': 146.52, 'mode': 'nfm', 'duration_seconds': 5}
        self.assertEqual(validate_radio_settings(opts), opts)
        for updates in ({'frequency_mhz': '146.52'}, {'frequency_mhz': float('nan')}, {'frequency_mhz': 0},
                        {'frequency_mhz': 1770}, {'frequency_mhz': 146.5200001}, {'mode': 'raw'},
                        {'mode': 'usb'}, {'duration_seconds': 120}, {'duration_seconds': True},
                        {'shell':'echo unsafe'}):
            with self.subTest(updates=updates), self.assertRaises(RadioError):
                validate_radio_settings({**opts, **updates})
        manager = RadioReceiver(lookup=lambda name: '/fake/stub/rtl_fm', popen=SyntheticPcmProcess)
        self.assertIsNone(manager.status()['current'])
        manager.start(opts)
        deadline = time.monotonic() + 2
        while manager.status()['running'] and time.monotonic() < deadline:
            time.sleep(.01)
        report = manager.status()['current']
        self.assertEqual(report['state'], 'READY')
        self.assertFalse(manager.status()['transmit_supported'])
        audio = manager.audio(report['id'])
        with wave.open(io.BytesIO(audio)) as f:
            self.assertEqual(f.getframerate(), 24000)
            self.assertEqual(f.getnchannels(), 1)
        with self.assertRaises(RadioError):
            manager.audio('../file')
        manager.close()
        with self.assertRaises(RadioError):
            manager.audio(report['id'])

    def test_missing_executable_and_stop(self):
        manager = RadioReceiver(lookup=lambda _: None)
        with self.assertRaises(RadioError) as e:
            manager.start({'frequency_mhz':99.5, 'mode':'wfm', 'duration_seconds':5})
        self.assertEqual(e.exception.code, 'rtl_fm_missing')
        self.assertFalse(manager.status()['running'])
        manager.close()
        proc = []
        def factory(argv, **kwargs):
            result = WaitProcess(argv, **kwargs)
            proc.append(result)
            return result
        manager = RadioReceiver(lookup=lambda _: 'rtl_fm_stub', popen=factory)
        manager.start({'frequency_mhz': 99.5, 'mode': 'wfm', 'duration_seconds': 5})
        self.assertTrue(proc[0].started.wait(1))
        with self.assertRaises(RadioError):
            manager.start({'frequency_mhz':99.5,'mode':'wfm','duration_seconds':5})
        manager.stop()
        deadline = time.monotonic() + 2
        while manager.status()['running'] and time.monotonic() < deadline:
            time.sleep(.01)
        self.assertEqual(manager.status()['current']['state'], 'STOPPED')
        with self.assertRaises(RadioError):
            manager.audio(manager.status()['current']['id'])
        manager.close()


class RadioApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Repository(Path(self.temp.name) / 'private' / 'openrf.db')
        self.server = create_server(self.repo, port=0)
        self.server.radio_receiver.lookup = lambda _: '/test/stub'
        self.server.radio_receiver.popen = SyntheticPcmProcess
        self.t = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.t.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.t.join(2)
        self.temp.cleanup()

    def http(self, method, path, obj=None, origin=None):
        conn = HTTPConnection('127.0.0.1', self.server.server_port, timeout=4)
        headers = {'Host':f'localhost:{self.server.server_port}'}
        if origin: headers['Origin'] = origin
        if obj is not None:
            headers['Content-Type']='application/json'
            obj=json.dumps(obj).encode()
        conn.request(method, path, obj, headers)
        resp=conn.getresponse(); data=resp.read(); status=resp.status; mimetype=resp.getheader('Content-Type'); conn.close()
        return status,data,mimetype

    def test_api_start_status_audio_and_security(self):
        status, raw, _ = self.http('GET', '/api/radio/status')
        self.assertEqual(status,200)
        self.assertIsNone(json.loads(raw)['current'])
        status, _, _ = self.http('GET','/static/radio.js')
        self.assertEqual(status,200)
        settings = {'frequency_mhz':146.52,'mode':'nfm','duration_seconds':5}
        status,_,_=self.http('POST','/api/radio/start',settings,origin='http://untrusted.test')
        self.assertEqual(status,403)
        for bad in ({'frequency_mhz':146.52,'mode':'raw','duration_seconds':5},
                    {'frequency_mhz':146.52,'mode':'nfm','duration_seconds':5,'extra':'no'}):
            status,_,_=self.http('POST','/api/radio/start',bad)
            self.assertEqual(status,400)
        status,raw,_=self.http('POST','/api/radio/start',settings)
        self.assertEqual(status,202, raw)
        ident=json.loads(raw)['radio']['id']
        deadline=time.monotonic()+2
        while self.server.radio_receiver.status()['running'] and time.monotonic()<deadline:time.sleep(.01)
        status,data,mime=self.http('GET',f'/api/radio/audio/{ident}.wav')
        self.assertEqual(status,200, data)
        self.assertEqual(mime,'audio/wav')
        self.assertTrue(data.startswith(b'RIFF'))
        status,_,_=self.http('GET','/api/radio/audio/../../x.wav')
        self.assertIn(status,(400,404))
        status,_,_=self.http('POST','/api/radio/stop',{})
        self.assertEqual(status,409)
        self.assertFalse((Path(self.temp.name)/'private'/'radio').exists())

    def test_capture_mutex_prevents_sdr_sweep_during_radio(self):
        proc=[]
        self.server.radio_receiver.popen=lambda argv, **kw: proc.append(WaitProcess(argv,**kw)) or proc[-1]
        settings={'frequency_mhz':146.52,'mode':'nfm','duration_seconds':5}
        status,_,_=self.http('POST','/api/radio/start',settings)
        self.assertEqual(status,202)
        self.assertTrue(proc[0].started.wait(1))
        sweep={'start_mhz':88,'stop_mhz':108,'step_khz':100,'duration_seconds':5}
        status,body,_=self.http('POST','/api/sdr/capture/start',sweep)
        self.assertEqual(status,409,body)
        self.assertEqual(json.loads(body)['error_code'],'receiver_busy')
        self.server.radio_receiver.stop()


if __name__ == '__main__':
    unittest.main()
