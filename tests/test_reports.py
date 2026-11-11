"""Report contract: private, historical, source-aware, and safe to print."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.reports import investigation_report, report_html
from openrf.server import create_server
from openrf.storage import Repository


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Repository(Path(self.temp.name) / 'records.sqlite3')
        self.session = self.repo.begin_session('Test <script>unsafe</script> & consent')
        self.sid = self.session['id']
        self.repo.add_observation({
            'kind': 'RF', 'label': '<img src=x onerror=alert(1)>',
            'identifier': 'TEST-001', 'notes': '<script>alert("x")</script>',
            'source_device': 'Tester', 'frequency_mhz': 433.92,
            'rssi_dbm': -68, 'latitude': 38.5, 'longitude': -120.9, 'accuracy_m': 10,
            'session_id': self.sid})
        self.repo.add_observation({
            'kind': 'RF', 'label': 'Same identifier, other hardware',
            'identifier': 'TEST-001', 'source_device': 'Second device',
            'frequency_mhz': 433.92, 'rssi_dbm': -71, 'session_id': self.sid})
        with self.repo._lock, self.repo._connect() as db:
            db.execute('INSERT INTO observations(kind,source,label,identifier,source_device,observed_at,session_id,frequency_mhz,rssi_dbm) '
                       'VALUES (?,?,?,?,?,?,?,?,?)',
                       ('RF', 'DEMO', 'SYNTHETIC DEMO', 'TEST-001', 'Fixture', '2026-11-01T01:00:00+00:00', self.sid, 433.92, -25))
            db.execute('INSERT INTO survey_captures(sensor_id,interface,retrieved_at_utc,saved_at_utc,freshness,result_count,saved_count,session_id) '
                       'VALUES (?,?,?,?,?,?,?,?)',
                       ('networkmanager-wifi', 'test-wlan', '2026-11-01T02:00:00+00:00', '2026-11-01T02:00:01+00:00', 'UNVERIFIED', 0, 0, self.sid))

    def tearDown(self):
        self.temp.cleanup()

    def test_report_filters_demo_redacts_coordinate_and_includes_empty_capture(self):
        state = self.repo.session_report_snapshot(self.sid)
        report = investigation_report(state)
        self.assertEqual(report['data_status'], 'HISTORICAL_SAVED_RECORDS_NOT_LIVE')
        self.assertEqual(report['summary']['observations_included'], 2)
        self.assertEqual(report['summary']['demo_excluded'], 1)
        self.assertEqual(report['summary']['observations_with_survey_coordinates'], 1)
        self.assertEqual(report['summary']['captures_included'], 1)
        self.assertEqual(report['survey_captures'][0]['result_count'], 0)
        self.assertTrue(all(o['latitude'] is None and o['longitude'] is None for o in report['observations']))
        self.assertEqual(len(report['measurements']), 2)  # distinct source devices
        self.assertTrue(all(item['unit'] == 'dBm' for item in report['measurements']))
        self.assertEqual(self.repo.sessions()[0]['status'], 'ACTIVE')  # report is read-only

    def test_opt_in_demo_coordinates_and_safe_html(self):
        report = investigation_report(self.repo.session_report_snapshot(self.sid, include_demo=True, include_coordinates=True))
        self.assertEqual(report['summary']['observations_included'], 3)
        self.assertTrue(any(o['source'] == 'DEMO' for o in report['observations']))
        self.assertTrue(any(o['latitude'] == 38.5 for o in report['observations']))
        raw = report_html(report).decode('utf-8')
        self.assertIn('HISTORICAL SAVED RECORDS', raw)
        self.assertIn('SYNTHETIC DEMO observations explicitly included', raw)
        self.assertIn('&lt;script&gt;unsafe&lt;/script&gt;', raw)
        self.assertIn('&lt;img src=x onerror=alert(1)&gt;', raw)
        self.assertNotIn('<script>alert', raw)
        self.assertNotIn('<img src=x', raw)
        self.assertIn('Survey latitude', raw)
        self.assertIn('browser\'s Print', raw)

    def test_empty_and_missing_session(self):
        self.repo.stop_session(self.sid)
        other = self.repo.begin_session('Empty report')
        report = investigation_report(self.repo.session_report_snapshot(other['id']))
        self.assertEqual(report['summary']['observations_included'], 0)
        self.assertEqual(report['summary']['captures_included'], 0)
        self.assertIn('No saved observations', report_html(report).decode())
        self.assertIsNone(self.repo.session_report_snapshot(999999))
        with self.assertRaises(ValueError):
            self.repo.session_report_snapshot(True)

    def test_large_report_limit_is_explicit_not_silent(self):
        with self.repo._lock, self.repo._connect() as db:
            db.executemany(
                'INSERT INTO observations(kind,source,label,identifier,source_device,observed_at,session_id) '
                'VALUES (?,?,?,?,?,?,?)',
                (('MANUAL', 'MANUAL', 'Bulk fixture', '', 'Manual browser', '2026-11-01T10:00:00+00:00', self.sid)
                 for _ in range(5000)))
        report = investigation_report(self.repo.session_report_snapshot(self.sid))
        self.assertEqual(report['summary']['observations_matching'], 5002)
        self.assertEqual(report['summary']['observations_included'], 5000)
        self.assertTrue(report['summary']['observations_truncated'])
        self.assertIn('capped', report_html(report).decode('utf-8'))

    def test_metrics_separate_quality_and_rssi(self):
        with self.repo._lock, self.repo._connect() as db:
            # Same identifier and source device as first record, but quality is not RSSI.
            db.execute('INSERT INTO observations(kind,source,label,identifier,source_device,observed_at,session_id,frequency_mhz,signal_quality_percent) '
                       'VALUES (?,?,?,?,?,?,?,?,?)',
                       ('RF', 'MANUAL', 'Quality fixture', 'TEST-001', 'Tester', '2026-11-01T02:00:00+00:00', self.sid, 433.92, 72))
        report = investigation_report(self.repo.session_report_snapshot(self.sid))
        self.assertEqual(len(report['measurements']), 3)
        self.assertEqual({m['unit'] for m in report['measurements']}, {'dBm', '% NetworkManager quality'})


class ReportHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Repository(Path(self.temp.name) / 'records.sqlite3')
        self.session = self.repo.begin_session('My RF survey')
        self.repo.add_observation({'kind': 'MANUAL', 'label': 'Visual candidate', 'session_id': self.session['id'],
                                   'latitude': 38.2, 'longitude': -120.3, 'accuracy_m': 50})
        self.server = create_server(self.repo, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.temp.cleanup()

    def request(self, path, host='localhost'):
        con = HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        con.request('GET', path, headers={'Host': f'{host}:{self.server.server_port}'})
        response = con.getresponse()
        body = response.read()
        status, header = response.status, dict(response.getheaders())
        con.close()
        return status, header, body

    def test_report_html_json_privacy_and_download(self):
        sid = self.session['id']
        status, headers, body = self.request(f'/api/reports/sessions/{sid}.json')
        self.assertEqual(status, 200)
        self.assertIn('attachment', headers['Content-Disposition'])
        self.assertEqual(json.loads(body)['observations'][0]['latitude'], None)
        status, headers, body = self.request(f'/api/reports/sessions/{sid}.html')
        self.assertEqual(status, 200)
        self.assertIn('inline', headers['Content-Disposition'])
        self.assertIn('text/html', headers['Content-Type'])
        self.assertNotIn('38.2', body.decode())
        self.assertIn('HISTORICAL', body.decode())
        status, headers, body = self.request(f'/api/reports/sessions/{sid}.json?include_coordinates=1')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['observations'][0]['latitude'], 38.2)
        status, headers, _ = self.request(f'/api/reports/sessions/{sid}.html?download=1')
        self.assertIn('attachment', headers['Content-Disposition'])

    def test_invalid_paths_params_host_rejected(self):
        for path, code in [('/api/reports/sessions/0.html', 400),
                           ('/api/reports/sessions/99999.html', 404),
                           ('/api/reports/sessions/1.pdf', 404),
                           ('/api/reports/sessions/1.html?include_demo=yes', 400),
                           ('/api/reports/sessions/1.html?include_demo=0&include_demo=1', 400),
                           ('/api/reports/sessions/1.html?remote_url=evil', 400)]:
            status, _, _ = self.request(path)
            self.assertEqual(status, code, path)
        status, _, _ = self.request(f'/api/reports/sessions/{self.session["id"]}.html', 'untrusted.site')
        self.assertEqual(status, 403)


if __name__ == '__main__':
    unittest.main()
