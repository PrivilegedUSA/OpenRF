"""Explicit manual retention review and delete; no camera hardware required."""
import json
import tempfile
import unittest
import http.client
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository
from openrf.surveillance import SurveillanceError
from openrf.surveillance_recording import RecordingManager


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.manager = RecordingManager(Path(self.temp.name) / 'openrf.sqlite')

    def tearDown(self):
        self.manager.close()
        self.temp.cleanup()

    def add(self, days, state='FINISHED'):
        started = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with self.manager._db() as db:
            cur = db.execute("INSERT INTO surveillance_recordings(camera_id,camera_name,kind,filename,started_utc,state) VALUES (?,?,?,?,?,?)",
                             (1, 'Test', 'image', 'pending', started, state))
            ident = cur.lastrowid
            db.execute('UPDATE surveillance_recordings SET filename=? WHERE id=?', (f'snapshot-{ident:08d}.jpg', ident))
            db.commit()
        (self.manager.folder / f'snapshot-{ident:08d}.jpg').write_bytes(b'test-image')
        return ident

    def test_preview_and_explicit_delete_exclude_recent_and_active(self):
        old = self.add(40)
        recent = self.add(2)
        active = self.add(40, 'RECORDING')
        plan = self.manager.cleanup_preview(30)
        self.assertEqual(plan['ids'], [old])
        self.assertEqual(plan['bytes'], 10)
        self.assertTrue((self.manager.folder / f'snapshot-{old:08d}.jpg').exists())
        with self.assertRaises(SurveillanceError):
            self.manager.cleanup_apply(30, [old, active])
        self.assertEqual(self.manager.cleanup_apply(30, [old]), {'deleted': 1})
        self.assertFalse((self.manager.folder / f'snapshot-{old:08d}.jpg').exists())
        self.assertEqual(set(item['id'] for item in self.manager.list()), {recent, active})

    def test_reject_invalid_inputs_and_changed_eligibility(self):
        old = self.add(40)
        for bad in (0, -1, 3651, 30.0, '30', True):
            with self.assertRaises(SurveillanceError): self.manager.cleanup_preview(bad)
        for ids in ([old, old], [0], ['1'], '1', [True]):
            with self.assertRaises(SurveillanceError): self.manager.cleanup_apply(30, ids)
        with self.manager._db() as db:
            db.execute('UPDATE surveillance_recordings SET started_utc=? WHERE id=?', (datetime.now(timezone.utc).isoformat(), old))
            db.commit()
        with self.assertRaises(SurveillanceError): self.manager.cleanup_apply(30, [old])
        self.assertTrue((self.manager.folder / f'snapshot-{old:08d}.jpg').exists())


class RetentionHTTPTests(unittest.TestCase):
    def test_manual_review_origin_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            server = create_server(Repository(Path(tmp) / 'db.sqlite3'), port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def request(body, origin=None, path='/api/surveillance/cleanup/preview'):
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=6)
                headers = {'Host': f'127.0.0.1:{server.server_port}', 'Content-Type': 'application/json'}
                if origin: headers['Origin'] = origin
                conn.request('POST', path, body=json.dumps(body), headers=headers)
                response = conn.getresponse()
                result = response.status, json.loads(response.read())
                conn.close()
                return result
            try:
                self.assertEqual(request({'days': 30})[1]['count'], 0)
                self.assertEqual(request({'days': 30}, 'http://attacker.invalid')[0], 403)
                self.assertEqual(request({'days': '30'})[0], 400)
                self.assertEqual(request({'days': 30, 'ids': []}, path='/api/surveillance/cleanup/apply')[1]['deleted'], 0)
            finally:
                server.shutdown()
                thread.join(5)
                server.server_close()


if __name__ == '__main__': unittest.main()
