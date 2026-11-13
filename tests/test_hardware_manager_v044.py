"""v0.2.44 hardware matrix statuses remain conservative, read-only and private."""
import json
import unittest
from datetime import datetime, timedelta, timezone
from openrf.hardware_manager import manager_report

NOW = datetime(2026, 11, 13, 16, 0, tzinfo=timezone.utc)


def sample_hardware(*, wsl=False, ports=None, access='permission_ok_unverified',
                    wifi=False, ble=False, tools=None):
    ports = ports or []
    return {
        'environment': 'WSL 2 / Linux' if wsl else 'Linux',
        'inventory_collected_utc': NOW.isoformat(),
        'wifi_one_shot': {'possible': wifi, 'interface': 'wlan0' if wifi else None},
        'network_details': [{'name': 'wlan0', 'wireless': True}] if wifi else [],
        'bluetooth_adapters': ['hci0'] if ble else [],
        'bluetooth_readiness': {'scan_supported': ble, 'controller_count': 1 if ble else 0},
        'serial_ports': ports,
        'serial_port_details': [{'port': p, 'access': access} for p in ports],
        'usb_devices': [{'port':'1-1', 'vendor_id':'dead', 'product_id':'beef',
                         'product':'Generic USB', 'manufacturer':'Testing'}],
        'command_availability': tools or {},
    }


def states(report):
    return {item['key']: item['state'] for item in report['entries']}


class HardwareManagerTests(unittest.TestCase):
    def test_wsl_with_no_interfaces_must_not_claim_success(self):
        report = manager_report(sample_hardware(wsl=True), now=NOW)
        self.assertEqual(report['kind'], 'READ_ONLY_HARDWARE_MANAGER')
        self.assertEqual(states(report)['wifi'], 'unsupported_current_host')
        self.assertEqual(states(report)['ble'], 'unsupported_current_host')
        self.assertEqual(states(report)['usb_serial'], 'not_connected')
        self.assertEqual(states(report)['sdr'], 'offline_analysis_only')
        self.assertFalse(report['active_continuous_rf_capture'])
        self.assertEqual(report['verified_live_receivers'], 0)
        self.assertNotIn('PRIVATE', json.dumps(report))

    def test_visible_interfaces_are_only_prerequisites(self):
        report = manager_report(sample_hardware(wifi=True, ble=True,
                                 ports=['ttyACM0']), now=NOW)
        self.assertEqual(states(report)['wifi'], 'prerequisites_visible')
        self.assertEqual(states(report)['ble'], 'prerequisites_visible')
        self.assertEqual(states(report)['usb_serial'], 'detected_unverified')
        self.assertEqual(report['summary']['linux_serial_ports_visible'], 1)
        self.assertEqual(report['summary']['linux_usb_descriptors_visible'], 1)
        self.assertEqual(report['summary']['linux_wifi_interfaces_visible'], 1)
        self.assertEqual(report['summary']['linux_bluetooth_controllers_visible'], 1)
        self.assertFalse(any(item['state'] == 'connected' for item in report['entries']))
        self.assertNotIn('ttyACM0', json.dumps(report))

    def test_permission_denied_failed_and_recent_handshake_not_live_capture(self):
        hw = sample_hardware(ports=['ttyUSB0'], access='permission_denied')
        self.assertEqual(states(manager_report(hw, now=NOW))['usb_serial'], 'permission_denied')
        probe = {'port': 'ttyUSB0', 'status': 'failed', 'at_utc': NOW.isoformat()}
        self.assertEqual(states(manager_report(hw, last_probe=probe, now=NOW))['usb_serial'], 'probe_failed')
        probe['status'] = 'responding'
        report = manager_report(hw, last_probe=probe, now=NOW)
        self.assertEqual(states(report)['usb_serial'], 'responded_recently_unverified')
        self.assertEqual(report['verified_live_receivers'], 0)

    def test_disconnected_stale_and_future_probes(self):
        hw = sample_hardware(ports=['ttyACM0'])
        result = manager_report(hw, last_probe={'port':'ttyUSB4', 'status':'responding',
                                                 'at_utc': NOW.isoformat()}, now=NOW)
        self.assertEqual(states(result)['usb_serial'], 'disconnected')
        for time in (NOW-timedelta(minutes=6), NOW+timedelta(seconds=3)):
            result = manager_report(hw, last_probe={'port':'ttyACM0','status':'responding',
                                                    'at_utc':time.isoformat()}, now=NOW)
            self.assertEqual(states(result)['usb_serial'], 'stale')
        result = manager_report(hw, last_probe={'port':'ttyACM0','status':'responding',
                                                'at_utc':'not-a-time'}, now=NOW)
        self.assertEqual(states(result)['usb_serial'], 'detected_unverified')

    def test_tooling_does_not_prove_sdr_or_gnss_receiver(self):
        hw = sample_hardware(tools={'rtl_power':True,'gpsd':True})
        report = manager_report(hw, now=NOW)
        self.assertEqual(states(report)['sdr'], 'offline_analysis_only')
        self.assertEqual(states(report)['gnss'], 'tools_only_unverified')
        self.assertEqual(states(report)['radar'], 'not_implemented')
        self.assertEqual(states(report)['cellular'], 'not_implemented')
        self.assertEqual(states(report)['subghz'], 'not_implemented')

    def test_naive_now_rejected(self):
        with self.assertRaises(ValueError):
            manager_report(sample_hardware(), now=datetime(2026,11,13))
