"""Deterministic rtl_power stub tests — NOT genuine RF hardware captures."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.sdr_capture import CaptureError, SdrCaptureManager, validate_settings, validate_rtl_power_csv
from openrf.server import create_server
from openrf.storage import Repository

CSV_FIXTURE = b'2026-11-13, 07:00:00, 88000000, 88400000, 100000, 1, -90, -87, -73, -89\n'
SETTINGS = {'start_mhz': 88, 'stop_mhz': 108, 'step_khz': 100, 'duration_seconds': 10}


def stub_tool(folder: Path, *, pause=0.0, invalid=False) -> str:
    """Create clearly non-hardware executable fixture that writes a deterministic CSV."""
    path = folder / 'rtl_power_test_only'
    payload = (b'not genuine RF\n' if invalid else CSV_FIXTURE).decode()
    path.write_text(f'''#!{sys.executable}
import sys, time
from pathlib import Path
Path(sys.argv[-1]).write_bytes({payload!r}.encode('utf-8'))
time.sleep({pause})
''', encoding='utf-8')
    os.chmod(path, 0o700)
    return str(path)


def wait_for(manager, *, timeout=6):
    deadline = time.monotonic() + timeout
    while manager.status()['running'] and time.monotonic() < deadline:
        time.sleep(.03)
    if manager.status()['running']:
        raise AssertionError('Stub did not terminate')
    return manager.status()['current']


class CaptureValidationTests(unittest.TestCase):
    def test_strict_input_allowlist_and_limits(self):
        self.assertEqual(validate_settings(SETTINGS), SETTINGS)
        for modification in ({'start_mhz':0}, {'stop_mhz':2000}, {'stop_mhz':80},
                             {'duration_seconds':31}, {'duration_seconds':3},
                             {'step_khz':1}, {'step_khz':0}, {'step_khz':100.5},
                             {'duration_seconds': True}, {'step_khz':float('nan')},
                             {'start_mhz':24,'stop_mhz':1766,'step_khz':25},
                             {'shell':'/bin/sh'}):
            with self.subTest(modification=modification), self.assertRaises(CaptureError):
                validate_settings({**SETTINGS, **modification})

    def test_csv_requires_valid_reported_bins(self):
        report = validate_rtl_power_csv(CSV_FIXTURE)
        self.assertEqual(report['reported_bins'], 4)
        self.assertEqual(report['sample_time_timezone'], 'UNVERIFIED')
        self.assertFalse(report['receiver_identity_verified'])
        for raw in (b'', b'stub fake data', b'2026-11-13, 07:00:00, 88000000, 88400000, 100000, 1, -70, , -80, -99',
                    b'2026-11-13, 07:00:00, 88000000, 88400000, 100000, 1, nan, -80, -80, -80'):
            with self.assertRaises(CaptureError):
                validate_rtl_power_csv(raw)

    def test_missing_tool_and_stopped_or_invalid_output(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            no_tool = SdrCaptureManager(folder / 'a', lookup=lambda name: None)
            with self.assertRaises(CaptureError) as ctx:
                no_tool.start(SETTINGS)
            self.assertEqual(ctx.exception.code, 'rtl_power_missing')
            self.assertFalse((folder / 'a').exists())
            no_tool.close()
            invalid_tool = stub_tool(folder, invalid=True)
            manager = SdrCaptureManager(folder / 'b', lookup=lambda name: invalid_tool)
            reply = manager.start(SETTINGS)
            final = wait_for(manager)
            self.assertEqual(final['state'], 'FAILED')
            self.assertNotIn('summary', final)
            with self.assertRaises(CaptureError):
                manager.csv(reply['id'])
            manager.close()

    def test_successful_stub_capture_is_local_and_not_live(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            tool = stub_tool(folder)
            manager = SdrCaptureManager(folder / 'recordings', lookup=lambda name: tool)
            start = manager.start(SETTINGS)
            self.assertEqual(start['state'], 'RUNNING')
            self.assertNotIn('path', start)
            final = wait_for(manager)
            self.assertEqual(final['state'], 'COMPLETE')
            self.assertEqual(final['summary']['accepted_rows'], 1)
            self.assertFalse(final['summary']['receiver_identity_verified'])
            self.assertEqual(manager.csv(start['id']), CSV_FIXTURE)
            self.assertEqual(manager.list_saved()[0]['id'], start['id'])
            manager.delete(start['id'])
            self.assertEqual(manager.list_saved(), [])
            manager.close()

    def test_busy_stop_and_shutdown_do_not_publish_partial_data(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            tool = stub_tool(folder, pause=5)
            manager = SdrCaptureManager(folder / 'captures', lookup=lambda name: tool)
            first = manager.start(SETTINGS)
            with self.assertRaises(CaptureError) as ctx:
                manager.start(SETTINGS)
            self.assertEqual(ctx.exception.code, 'capture_busy')
            manager.stop()
            final = wait_for(manager)
            self.assertEqual(final['state'], 'STOPPED')
            with self.assertRaises(CaptureError):
                manager.csv(first['id'])
            manager.close()


class CaptureHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        cls.tool = stub_tool(cls.root)
        cls.server = create_server(Repository(cls.root / 'db.sqlite3'), port=0)
        cls.server.sdr_captures.lookup = lambda name: cls.tool
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.tmp.cleanup()

    def http(self, method, path, body=None, origin=None):
        conn = HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        headers = {'Host': f'localhost:{self.server.server_port}'}
        if body is not None:
            headers['Content-Type'] = 'application/json'
            body = json.dumps(body)
        if origin:
            headers['Origin'] = origin
        conn.request(method, path, body, headers)
        resp = conn.getresponse()
        result = (resp.status, resp.read())
        conn.close()
        return result

    def test_loopback_start_finish_review_delete(self):
        status, response = self.http('GET', '/api/sdr/capture')
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(response)['running'])
        status, response = self.http('POST', '/api/sdr/capture/start', SETTINGS, origin='http://malicious.invalid')
        self.assertEqual(status, 403)
        status, response = self.http('POST', '/api/sdr/capture/start', {'shell': 'echo attack'})
        self.assertEqual(status, 400)
        status, response = self.http('POST', '/api/sdr/capture/start', SETTINGS)
        self.assertEqual(status, 202)
        item = json.loads(response)['capture']
        status, _ = self.http('POST', '/api/sdr/capture/start', SETTINGS)
        self.assertEqual(status, 409)
        final = wait_for(self.server.sdr_captures)
        self.assertEqual(final['state'], 'COMPLETE')
        status, response = self.http('GET', '/api/sdr/captures')
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(response)['captures'])
        status, csv = self.http('GET', f"/api/sdr/captures/{item['id']}.csv")
        self.assertEqual((status, csv), (200, CSV_FIXTURE))
        for bad in ('../../etc/passwd', 'not-a-real-id', '0123456789abcdeG'):
            status, _ = self.http('GET', f'/api/sdr/captures/{bad}.csv')
            self.assertIn(status, (400, 404))
        status, response = self.http('DELETE', f"/api/sdr/captures/{item['id']}")
        self.assertEqual(status, 200)
        status, _ = self.http('GET', f"/api/sdr/captures/{item['id']}.csv")
        self.assertEqual(status, 404)

    def test_current_static_and_no_implicit_scan(self):
        status, raw = self.http('GET', '/api/sdr/status')
        self.assertEqual(status, 200)
        response = json.loads(raw)
        self.assertFalse(response['capture']['running'])
        self.assertFalse(response['hardware_confirmed'])
        status, raw = self.http('GET', '/static/spectrum.js')
        self.assertEqual(status, 200)
        self.assertIn(b'/api/sdr/capture/start', raw)
        status, raw = self.http('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'id="sdr-capture-start"', raw)


if __name__ == '__main__':
    unittest.main()
