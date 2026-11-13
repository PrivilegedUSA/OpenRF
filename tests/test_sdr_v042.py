import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.sdr import capability_report
from openrf.sensor_connections import connections
from openrf.server import create_server
from openrf.storage import Repository


class SdrReadinessTests(unittest.TestCase):
    def test_never_claims_live_hardware_on_tool_visibility(self):
        for reported in ({'rtl_power': '/usr/bin/rtl_power', 'rtl_test': '/usr/bin/rtl_test'}, {}):
            data = capability_report(executable_lookup=reported.get, collected_at='2026-11-13T00:00:00+00:00')
            self.assertFalse(data['hardware_capture_enabled'])
            self.assertFalse(data['hardware_confirmed'])
            self.assertEqual(data['mode'], 'OFFLINE_FILE_ANALYSIS_ONLY')
            self.assertFalse(data['privacy']['upload_required'])
            self.assertFalse(data['privacy']['data_stored_on_server'])
            self.assertEqual(data['driver_contract']['amplitude_unit'], 'rtl_power reported dB (NOT calibrated dBm)')
            self.assertEqual(data['tooling']['rtl_power_installed'], bool(reported))

    def test_registry_offline_not_live(self):
        hardware = {'wifi_one_shot': {'possible': False}, 'bluetooth_readiness': {}}
        sdr = next(s for s in connections(hardware) if s['sensor_id'] == 'usb-sdr')
        self.assertEqual(sdr['status'], 'offline_file_only')
        self.assertIn('NO receiver capture', sdr['description'])


class SdrEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.server = create_server(Repository(Path(cls.temp.name) / 'openrf.sqlite3'), port=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.temp.cleanup()

    def request(self, method, path, body=None):
        conn = HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        conn.request(method, path, body, headers={'Host': f'localhost:{self.server.server_port}'})
        response = conn.getresponse()
        data = response.read()
        status = response.status
        conn.close()
        return status, data

    def test_status_and_static_assets(self):
        status, data = self.request('GET', '/api/sdr/status')
        self.assertEqual(status, 200)
        info = json.loads(data)
        self.assertFalse(info['hardware_capture_enabled'])
        self.assertEqual(info['driver_contract']['format'], 'rtl_power_csv_v1')
        s, raw = self.request('GET', '/static/spectrum.js')
        self.assertEqual(s, 200)
        self.assertIn(b'parseRtlPowerCsv', raw)
        s, raw = self.request('GET', '/')
        self.assertEqual(s, 200)
        self.assertIn(b'id="page-spectrum"', raw)
        self.assertIn(b'SYNTHETIC', raw) if b'SYNTHETIC' in raw else self.assertIn(b'sdr-demo', raw)

    def test_no_receiver_start_or_upload_endpoint(self):
        status, _ = self.request('GET', '/api/sdr/start')
        self.assertEqual(status, 404)
        status, _ = self.request('POST', '/api/sdr/capture', b'{"start":true}')
        self.assertNotIn(status, (200, 201, 202))


if __name__ == '__main__':
    unittest.main()
