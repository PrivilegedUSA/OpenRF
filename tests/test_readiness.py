"""Hardware-readiness decisions are conservative and pure; never touch devices."""
import unittest
from datetime import datetime, timedelta, timezone
from openrf.readiness import readiness_report

NOW = datetime(2026, 11, 11, 19, 0, tzinfo=timezone.utc)


def fixture(*, ports=(), access='permission_ok_unverified', device_type='character_device',
            wifi=False, wsl=True, nmcli=False):
    return {
        'environment': 'WSL 2 / Linux' if wsl else 'Linux',
        'serial_ports': list(ports),
        'serial_port_details': [{'port': p, 'access': access, 'device_type': device_type} for p in ports],
        'wifi_one_shot': {'possible': wifi, 'interface': 'wlan0' if wifi else None},
        'network_details': [{'name': 'wlan0', 'wireless': True}] if wifi or nmcli else [],
        'command_availability': {'nmcli': bool(wifi)},
    }


def status(result, key):
    return next(c for c in result['checklist'] if c['key'] == key)['status']


class ReadinessTests(unittest.TestCase):
    def test_no_hardware_never_means_measuring(self):
        result = readiness_report(fixture(), now=NOW)
        self.assertFalse(result['active_rf_capture'])
        self.assertEqual(result['kind'], 'READ_ONLY_HOST_DIAGNOSTICS')
        self.assertEqual(status(result, 'usb_serial'), 'not_connected')
        self.assertEqual(status(result, 'wifi'), 'no_linux_interface')
        self.assertEqual(status(result, 'serial_protocol'), 'not_probed')
        self.assertEqual(status(result, 'radar'), 'not_implemented')
        self.assertNotIn('ready', [c['status'] for c in result['checklist']])

    def test_wifi_prerequisites_not_equivalent_to_wifi_scan(self):
        result = readiness_report(fixture(wifi=True),
            last_wifi_scan={'last_scan':'2026-11-11T17:00:00Z','result_count':13}, now=NOW)
        self.assertEqual(status(result, 'wifi'), 'prerequisites_visible')
        self.assertTrue(result['summary']['wifi_last_scan_recorded'])
        self.assertEqual(result['summary']['wifi_last_result_count'],13)
        self.assertFalse(result['active_rf_capture'])
        result = readiness_report(fixture(nmcli=True), now=NOW)
        self.assertEqual(status(result, 'wifi'), 'tool_missing')

    def test_permission_denial_and_port_presence_do_not_verify_firmware(self):
        p = readiness_report(fixture(ports=['ttyUSB0'],access='permission_denied'),now=NOW)
        self.assertEqual(status(p, 'usb_serial'), 'permission_denied')
        a = readiness_report(fixture(ports=['ttyUSB0']),now=NOW)
        self.assertEqual(status(a, 'usb_serial'), 'ready_to_probe')
        self.assertEqual(a['summary']['usb_ports_accessible_unverified'],1)

    def test_recent_probe_disconnect_stale_and_failure_states(self):
        info={'port':'ttyACM0','status':'responding','hardware_id':'PRIVATE-FW-ID',
              'at_utc':(NOW-timedelta(seconds=30)).isoformat()}
        hw = fixture(ports=['ttyACM0'])
        p = readiness_report(hw,last_probe=info,now=NOW)
        self.assertEqual(status(p,'serial_protocol'),'responding_unverified')
        self.assertNotIn('PRIVATE-FW-ID',str(p))
        self.assertEqual(status(readiness_report(fixture(),last_probe=info,now=NOW),'serial_protocol'),'disconnected')
        info['at_utc']=(NOW-timedelta(seconds=301)).isoformat()
        self.assertEqual(status(readiness_report(hw,last_probe=info,now=NOW),'serial_protocol'),'stale')
        info['at_utc']=(NOW-timedelta(seconds=3)).isoformat()
        info['status']='failed';info['detail']='sensitive device text'
        p=readiness_report(hw,last_probe=info,now=NOW)
        self.assertEqual(status(p,'serial_protocol'),'probe_failed')
        self.assertNotIn('sensitive device text',str(p))

    def test_invalid_timestamps_and_future_clock_are_stale(self):
        hw=fixture(ports=['ttyACM0'])
        for text in ('2026-11-11T19:00:00', 'garbage', (NOW+timedelta(minutes=1)).isoformat()):
            p=readiness_report(hw,last_probe={'port':'ttyACM0','at_utc':text,'status':'responding'},now=NOW)
            self.assertIn(status(p,'serial_protocol'),('not_probed','stale'))

    def test_export_report_excludes_private_inventory_and_fake_wifi_counts(self):
        p=readiness_report(fixture(ports=['ttyUSB0']),last_wifi_scan={
            'last_scan':'never','result_count':True,'records':[{'ssid':'private-home'}]},now=NOW)
        self.assertIsNone(p['summary']['wifi_last_result_count'])
        self.assertNotIn('private-home',str(p))
        self.assertNotIn('ttyUSB0',str(p))

if __name__ == '__main__':
    unittest.main()
