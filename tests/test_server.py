import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.server=create_server(Repository(Path(cls.tmp.name)/'db.sqlite3'), port=0)
        cls.server_thread=threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.port=cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=3)
        cls.tmp.cleanup()

    def call(self, method, path, body=None, headers=None):
        conn=HTTPConnection('127.0.0.1',self.port,timeout=5)
        base={'Host':f'localhost:{self.port}'}
        if body is not None:
            base['Content-Type']='application/json'
            body=json.dumps(body)
        base.update(headers or {})
        conn.request(method,path,body=body,headers=base)
        response=conn.getresponse()
        raw=response.read()
        status=response.status
        conn.close()
        return status, json.loads(raw) if response.getheader('Content-Type','').startswith('application/json') else raw

    def test_health_static_hardware_and_exports(self):
        s,data=self.call('GET','/api/health')
        self.assertEqual(s,200)
        self.assertEqual(data['version'],'0.2.109')
        for path in ('/','/static/app.css','/static/app.js','/static/history-analysis.js','/static/route_guidance.js','/static/spectrum.js','/static/spectrum-analysis.js','/static/sdr-history.js','/api/export.csv','/api/export.geojson'):
            status,_=self.call('GET',path)
            self.assertEqual(status,200,path)
        status,index=self.call('GET','/')
        self.assertEqual(status,200)
        self.assertNotIn(b'id="field-map-toggle"',index)
        self.assertIn(b'id="map-search-toggle"',index)
        self.assertIn(b'aria-controls="map-destination-form"',index)
        s,data=self.call('GET','/api/hardware')
        self.assertEqual(s,200)
        self.assertEqual(len(data['capabilities']),8)
        self.assertTrue(any(c['key'] == 'police_radar' and c['status'] == 'not_implemented' for c in data['capabilities']))

    def test_unified_hardware_manager_endpoint_does_not_fake_rf_capture(self):
        status,report=self.call('GET','/api/hardware/manager')
        self.assertEqual(status,200)
        self.assertEqual(report['kind'],'READ_ONLY_HARDWARE_MANAGER')
        self.assertEqual(report['schema_version'],1)
        self.assertFalse(report['active_continuous_rf_capture'])
        self.assertEqual(report['verified_live_receivers'],0)
        self.assertEqual(len(report['entries']),8)
        self.assertTrue(any(e['key']=='sdr' and e['state']=='offline_analysis_only' for e in report['entries']))
        self.assertTrue(any(e['key']=='radar' and e['state']=='not_implemented' for e in report['entries']))
        self.assertNotIn('serial_number',str(report))

    def test_readiness_endpoint_is_read_only_and_private(self):
        from unittest.mock import patch
        with patch('openrf.server.status_report', return_value={
            'environment':'WSL 2 / Linux', 'serial_ports':['ttyACM0'],
            'serial_port_details':[{'port':'ttyACM0','access':'permission_ok_unverified',
                                    'device_type':'character_device'}],
            'wifi_one_shot':{'possible':False,'interface':None},
            'network_details':[], 'command_availability':{'nmcli':False}
        }):
            status,report=self.call('GET','/api/hardware/readiness')
        self.assertEqual(status,200)
        self.assertFalse(report['active_rf_capture'])
        self.assertEqual(report['schema_version'],1)
        self.assertEqual(report['summary']['usb_serial_ports_visible'],1)
        self.assertNotIn('ttyACM0',str(report))
        self.assertFalse(any(c['status']=='ready' for c in report['checklist']))

    def test_cannot_forge_sensor_source_via_manual_entry(self):
        s,data=self.call('POST','/api/observations', {'kind':'BLE','source':'SENSOR', 'source_device':'HackRF','label':'Unverified manual'})
        self.assertEqual(s,201)
        self.assertEqual(data['source'],'MANUAL')
        self.assertEqual(data['source_device'],'Manual browser entry')

    def test_manual_observation_with_browser_coordinates_retains_unverified_source(self):
        status, data = self.call('POST', '/api/observations', {
            'kind':'INFRASTRUCTURE','label':'Observed location via browser',
            'source':'SENSOR','source_device':'Fake receiver',
            'latitude':'38.486', 'longitude':'-120.623', 'accuracy_m':'105',
            'location_source':'BROWSER_REPORTED', 'fix_age_seconds':'2.1'
        })
        self.assertEqual(status, 201)
        self.assertEqual(data['source'], 'MANUAL')
        self.assertEqual(data['source_device'], 'Manual browser entry')
        self.assertEqual(data['location_source'], 'BROWSER_REPORTED')
        self.assertAlmostEqual(data['fix_age_seconds'],2.1)

    def test_invalid_origin_and_host_rejected(self):
        status,_=self.call('POST','/api/demo/load',{}, {'Origin':'https://attacker.example'})
        self.assertEqual(status,403)
        status,_=self.call('GET','/api/health',headers={'Host':'evil.example'})
        self.assertEqual(status,403)

    def test_session_and_manual_observation(self):
        s,session=self.call('POST','/api/sessions', {'name':'HTTP test session'})
        self.assertEqual(s,201)
        s,item=self.call('POST','/api/observations', {'label':'HTTP record','session_id':session['id']})
        self.assertEqual(s,201)
        s,response=self.call('POST',f"/api/sessions/{session['id']}/stop",{})
        self.assertTrue(response['stopped'])
        s,response=self.call('GET','/api/sessions')
        self.assertEqual(response['sessions'][0]['observation_count'],1)

    def test_wifi_scan_without_interface_does_not_fake_readings(self):
        from unittest.mock import patch
        from openrf.drivers.wifi_nmcli import WifiScanUnavailable
        self.server.wifi_scan_last = float('-inf')
        with patch('openrf.server.scan_once', side_effect=WifiScanUnavailable('No Linux Wi-Fi interface is visible.')):
            status, data = self.call('POST', '/api/wifi/scan', {})
            self.assertEqual(status, 409)
            self.assertIn('No Linux Wi-Fi', data['error'])

    def test_sensor_receipt_save_requires_server_side_real_scan(self):
        from unittest.mock import patch
        scan = {
            'source': 'NETWORKMANAGER_WIFI', 'interface': 'wlan-test',
            'retrieved_at_utc': '2026-11-10T19:01:00+00:00', 'freshness': 'UNVERIFIED',
            'records': [{'ssid':'Test-only network','bssid':'AA:BB:CC:11:22:33',
                         'channel': 6, 'frequency_mhz':2437,'signal_quality_percent':62,'security':'WPA2'}]
        }
        status, data = self.call('GET', '/api/sensors')
        self.assertEqual(status, 200)
        self.assertEqual(data['schema_version'], 2)
        self.assertEqual(data['sensors'][2]['status'], 'unavailable')
        status, _ = self.call('POST', '/api/sensors/networkmanager-wifi/save',
                              {'scan_id':'fake', 'bssid':'AA:BB:CC:11:22:33'})
        self.assertEqual(status, 400)
        self.server.wifi_scan_last = float('-inf')
        with patch('openrf.server.scan_once', return_value=scan):
            status, result = self.call('POST', '/api/wifi/scan', {})
        self.assertEqual(status, 200)
        self.assertIn('scan_id', result)
        self.assertEqual(result['records'][0]['signal_quality_percent'], 62)
        status, saved = self.call('POST', '/api/sensors/networkmanager-wifi/save',
                {'scan_id':result['scan_id'], 'bssid':'AA:BB:CC:11:22:33',
                 'survey_location': {'latitude':38.48, 'longitude':-120.63, 'accuracy_m':25}})
        self.assertEqual(status, 201)
        self.assertEqual(saved['source'], 'SENSOR')
        self.assertEqual(saved['observed_at'], scan['retrieved_at_utc'])
        self.assertIsNone(saved['rssi_dbm'])
        self.assertEqual(saved['longitude'], -120.63)
        status, _ = self.call('POST', '/api/sensors/networkmanager-wifi/save',
                             {'scan_id':result['scan_id'], 'bssid':'AA:BB:CC:11:22:33'})
        self.assertEqual(status, 400)

    def test_usb_api_refuses_browser_sensor_values_and_unlisted_port(self):
        from unittest.mock import patch
        with patch('openrf.server.enumerate_serial_ports', return_value=[]):
            status, data = self.call('POST', '/api/sensors/serial/probe', {'port':'ttyACM0'})
            self.assertEqual(status,409)
            self.assertIn('unavailable', data['error'])
        with patch('openrf.server.enumerate_serial_ports', return_value=['ttyACM0']):
            status, data = self.call('POST', '/api/sensors/serial/snapshot', {
                'port':'ttyACM0','records':[{'kind':'RF','rssi_dbm':-42}]})
            self.assertEqual(status,400)
            self.assertIn('browser', data['error'])

    def test_usb_api_one_shot_captures_only_backend_device_frames(self):
        from unittest.mock import patch
        from openrf.drivers.serial_openrf import parse_hello, parse_snapshot
        from datetime import datetime, timezone
        hello = {'type':'hello','protocol':'openrf.serial.v1','hardware_id':'TEST-SERVER-001',
                 'capabilities':['RF']}
        snapshot = {'type':'snapshot','protocol':'openrf.serial.v1','hardware_id':'TEST-SERVER-001',
                    'records':[{'kind':'RF','identifier':'TEST-ONLY-433', 'label':'Test radio power',
                                'frequency_mhz':433.92,'rssi_dbm':-71}]}
        utc = datetime.now(timezone.utc).isoformat(timespec='seconds')
        sensor_data = parse_snapshot(snapshot, parse_hello(hello), utc)
        sensor_data['interface'] = 'ttyUSB0'
        with patch('openrf.server.enumerate_serial_ports', return_value=['ttyUSB0']), \
                patch('openrf.server.query_port', side_effect=[dict(parse_hello(hello), port='ttyUSB0'),sensor_data]) as mock:
            status, probed = self.call('POST', '/api/sensors/serial/probe', {'port':'ttyUSB0'})
            self.assertEqual(status,200)
            self.assertFalse(probed['identity_verified'])
            status, saved = self.call('POST', '/api/sensors/serial/snapshot', {'port':'ttyUSB0'})
            self.assertEqual(status,201, f'Unexpected USB snapshot response: {saved}')
            self.assertEqual(saved['capture']['saved_count'],1)
            self.assertEqual(saved['snapshot']['records'][0]['rssi_dbm'],-71)
            self.assertEqual(mock.call_count,2)
            status, records = self.call('GET','/api/observations')
            self.assertEqual(status,200)
            self.assertTrue(any(x['source_device'].startswith('OpenRF Serial') for x in records['observations']))

    def test_invalid_observation_rejected(self):
        status,data=self.call('POST','/api/observations',{'label':'invalid GPS','latitude':35})
        self.assertEqual(status,400)
        self.assertIn('together',data['error'])


    def test_local_maps_http_tiles_and_missing_paths(self):
        from test_offline_maps import fixture, PNG
        maps_dir = self.server.map_directory
        maps_dir.mkdir(exist_ok=True)
        fixture(maps_dir,'testcase')
        try:
            status, data = self.call('GET','/api/maps')
            self.assertEqual(status,200)
            self.assertEqual(data['maps'][0]['id'],'testcase')
            self.assertFalse(data['downloads_enabled'])
            status, raw = self.call('GET','/api/maps/testcase/tiles/2/1/1.png')
            self.assertEqual(status,200)
            self.assertEqual(raw,PNG)
            status, _ = self.call('GET','/api/maps/testcase/tiles/2/1/9.png')
            self.assertEqual(status,404)
            status, _ = self.call('GET','/api/maps/../tiles/2/1/1.png')
            self.assertEqual(status,404)
        finally:
            (maps_dir/'testcase.mbtiles').unlink()
