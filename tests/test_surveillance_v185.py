"""v0.2.185 — opt-in schedules, local device enumeration, and API guards.

Tests use temporary SQLite data and fake cameras/recording processes; no hardware.
"""
import http.client
import json
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from openrf.surveillance import SurveillanceError, usb_candidates
from openrf.surveillance_schedules import SurveillanceSchedules, in_window
from openrf.server import create_server
from openrf.storage import Repository


class FakeCameras:
    def get_source(self, ident):
        if ident != 1:
            raise SurveillanceError('Camera not found')
        return {'id': 1, 'source': 'USB', 'location': '/dev/video0', 'name': 'DEMO fake camera'}


class FakeRecordings:
    def __init__(self):
        self.lock = threading.RLock()
        self.active = {}
        self.started = 0
        self.stopped = 0

    def _refresh(self):
        pass

    def start(self, source):
        with self.lock:
            if source['id'] in self.active:
                raise SurveillanceError('Already recording')
            self.started += 1
            self.active[source['id']] = (self.started, object())
            return {'id': self.started}

    def stop(self, camera_id):
        with self.lock:
            if camera_id not in self.active:
                raise SurveillanceError('No recording')
            self.stopped += 1
            self.active.pop(camera_id)


class SchedulesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'openrf.sqlite'
        self.records = FakeRecordings()
        self.schedules = SurveillanceSchedules(self.db, FakeCameras(), self.records, start_thread=False)

    def tearDown(self):
        self.schedules.close()
        self.tmp.cleanup()

    def example(self):
        return {'camera_id': 1, 'weekdays': [0, 1], 'start_time': '08:00',
                'end_time': '08:30', 'time_zone': 'UTC'}

    def test_no_connections_until_explicit_arm_then_windowed_stop(self):
        self.schedules.add(self.example())
        at_start = datetime(2026, 11, 23, 8, 10, tzinfo=timezone.utc)  # Monday
        past_end = datetime(2026, 11, 23, 8, 31, tzinfo=timezone.utc)
        self.assertTrue(in_window(self.example(), at_start))
        self.assertFalse(in_window(self.example(), past_end))
        self.schedules.tick(at_start)
        self.assertEqual(self.records.started, 0)
        self.assertFalse(self.schedules.status()['armed'])
        self.schedules.arm(True)
        self.schedules.tick(at_start)
        self.assertEqual(self.records.started, 1)
        self.schedules.tick(at_start)
        self.assertEqual(self.records.started, 1)
        self.schedules.tick(past_end)
        self.assertEqual(self.records.stopped, 1)
        self.assertFalse(self.records.active)
        self.schedules.arm(False)

    def test_disarm_keeps_user_owned_recordings(self):
        self.schedules.add(self.example())
        self.records.active[1] = (777, object())
        self.schedules.arm(True)
        self.schedules.arm(False)
        self.assertEqual(self.records.stopped, 0)
        self.assertEqual(self.records.active[1][0], 777)

    def test_definitions_survive_restart_but_armed_never_does(self):
        self.schedules.add(self.example())
        self.schedules.arm(True)
        self.schedules.close()
        self.schedules = SurveillanceSchedules(self.db, FakeCameras(), self.records, start_thread=False)
        state = self.schedules.status()
        self.assertFalse(state['armed'])
        self.assertEqual(len(state['schedules']), 1)
        self.assertEqual(state['schedules'][0]['state'], 'DISARMED')

    def test_rejects_bad_inputs_and_duplicate_camera(self):
        original = self.example()
        for field, bad in [('weekdays', []), ('weekdays', [1, 1]), ('weekdays', [7]),
                           ('camera_id', True), ('camera_id', 2), ('start_time', '25:00'),
                           ('end_time', '07:00'), ('time_zone', 'Not/AZone')]:
            payload = dict(original)
            payload[field] = bad
            with self.subTest(field=field, bad=bad), self.assertRaises(SurveillanceError):
                self.schedules.add(payload)
        self.schedules.add(original)
        with self.assertRaises(SurveillanceError):
            self.schedules.add(original)
        with self.assertRaises(SurveillanceError):
            self.schedules.arm('true')

    def test_pause_prevents_restarting_same_window(self):
        self.schedules.add(self.example())
        t = datetime(2026, 11, 23, 8, 10, tzinfo=timezone.utc)
        self.schedules.arm(True)
        self.schedules.tick(t)
        self.assertTrue(self.schedules.pause_camera(1))
        self.assertEqual(self.records.stopped, 1)
        self.schedules.tick(t)
        self.assertEqual(self.records.started, 1)
        self.schedules.tick(datetime(2026, 11, 23, 9, 0, tzinfo=timezone.utc))
        self.schedules.tick(t)
        self.assertEqual(self.records.started, 2)

    def test_usb_enumeration_never_opens_device(self):
        with patch('openrf.surveillance.usb_devices', return_value=['/dev/video0']), \
             patch.object(Path, 'read_text', side_effect=['NexiGo webcam\n', '0']):
            entries = usb_candidates()
        self.assertEqual(entries[0]['name'], 'NexiGo webcam')
        self.assertEqual(entries[0]['path'], '/dev/video0')
        self.assertIn('not stream-tested', entries[0]['hint'])


class ScheduleAPITests(unittest.TestCase):
    def test_manual_schedule_creation_and_cross_origin_protection(self):
        with tempfile.TemporaryDirectory() as tmp:
            server = create_server(Repository(Path(tmp) / 'db.sqlite3'), port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def req(method, path, body=None, origin=None):
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=8)
                headers = {'Host': f'127.0.0.1:{server.server_port}'}
                if origin:
                    headers['Origin'] = origin
                if body is not None:
                    headers['Content-Type'] = 'application/json'
                conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers)
                resp = conn.getresponse()
                out = resp.status, json.loads(resp.read())
                conn.close()
                return out
            try:
                self.assertEqual(req('GET', '/api/surveillance/usb-devices')[0], 200)
                status, report = req('GET', '/api/surveillance')
                self.assertEqual(status, 200)
                self.assertEqual(report['schedules']['armed'], False)
                self.assertEqual(req('POST', '/api/surveillance/schedules/arm', {'armed': True})[0], 409)
                self.assertEqual(req('POST', '/api/surveillance/schedules/arm', {'armed': True}, 'http://attacker.invalid')[0], 403)
                self.assertEqual(req('POST', '/api/surveillance/schedules', {'camera_id': 3}, 'http://attacker.invalid')[0], 403)
            finally:
                server.shutdown()
                thread.join(5)
                server.server_close()


if __name__ == '__main__':
    unittest.main()
