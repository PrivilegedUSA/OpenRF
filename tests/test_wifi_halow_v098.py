"""v0.2.98: read-only HaLow driver evidence is not an RF link."""
import json
import tempfile
import unittest
from datetime import datetime, timezone
from http.client import HTTPConnection
from pathlib import Path
import threading
from unittest.mock import patch

from openrf.server import create_server
from openrf.storage import Repository
from openrf.wifi_halow import status_report


NOW = datetime(2026, 11, 17, 21, 0, tzinfo=timezone.utc)


class HaLowTests(unittest.TestCase):
    def report(self, directory, **kwargs):
        base = Path(directory)
        network = base / 'net'
        modules = base / 'modules'
        network.mkdir(exist_ok=True)
        modules.mkdir(exist_ok=True)
        options={'usb_devices':[], 'wsl':False, 'command_lookup':lambda _name: None, 'now':NOW}
        options.update(kwargs)
        return status_report(net_root=network, module_root=modules, **options)

    def test_no_halow_from_generic_network_card_or_arbitrary_900mhz_description(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)
            interface=base/'net'/'wlan0'
            interface.mkdir(parents=True)
            (interface/'operstate').write_text('up')
            report=self.report(folder)
            self.assertEqual(report['state'],'no_halow_evidence')
            self.assertFalse(report['candidate_interfaces'])
            self.assertFalse(report['rf_link_verified'])
            self.assertFalse(report['performs_scan_or_connection'])
            self.assertTrue(report['read_only'])

    def test_morse_driver_up_and_carrier_still_not_a_verified_rf_link(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)
            driver=(base/'drivers'/'morse')
            driver.mkdir(parents=True)
            iface=(base/'net'/'wlan1')
            (iface/'device').mkdir(parents=True)
            (iface/'device'/'driver').symlink_to(driver, target_is_directory=True)
            (iface/'operstate').write_text('up\n')
            (iface/'carrier').write_text('1\n')
            report=self.report(folder)
            self.assertEqual(report['state'],'candidate_interface_visible')
            self.assertEqual(report['candidate_interfaces'][0]['driver_hint'],'morse')
            self.assertTrue(report['candidate_interfaces'][0]['os_carrier_reported'])
            self.assertFalse(report['candidate_interfaces'][0]['halow_rf_link_verified'])
            self.assertFalse(report['ip_transport_verified'])
            self.assertFalse(report['reticulum_transport_verified'])

    def test_nrc_module_without_network_or_radio_is_only_hint(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder)/'modules'/'nrc').mkdir(parents=True)
            report=self.report(folder)
            self.assertEqual(report['state'],'driver_module_only')
            self.assertEqual(report['loaded_module_hints'],['nrc'])
            self.assertEqual(report['candidate_interfaces'],[])

    def test_usb_description_is_not_dongle_connection_or_private_serial_data(self):
        with tempfile.TemporaryDirectory() as folder:
            report=self.report(folder, usb_devices=[
                {'vendor_id':'ffee','product_id':'0012',
                 'manufacturer':'Morse Micro', 'product':'MM8108 USB',
                 'serial_number':'PRIVATE_SERIAL_54321', 'port':'1-9'},
                {'manufacturer':'Unrelated','product':'A 900 MHz antenna', 'serial':'SECRET'},
            ])
            self.assertEqual(report['state'],'candidate_usb_visible')
            self.assertEqual(len(report['candidate_usb_descriptors']),1)
            self.assertEqual(report['candidate_usb_descriptors'][0]['vendor_id'],'ffee')
            self.assertNotIn('PRIVATE',json.dumps(report))
            self.assertNotIn('SECRET',json.dumps(report))
            self.assertNotIn('1-9',json.dumps(report))

    def test_wsl_never_infers_windows_radio_and_lists_passthrough(self):
        with tempfile.TemporaryDirectory() as folder:
            report=status_report(net_root=Path(folder)/'none',
                module_root=Path(folder)/'none-modules', wsl=True, usb_devices=[],
                now=NOW, command_lookup=lambda _name: None)
            self.assertEqual(report['state'],'not_visible_in_wsl')
            self.assertIn('USB passthrough', report['setup_steps'][0])
            self.assertEqual(report['optional_tool_presence']['iw'],False)

    def test_http_endpoint_is_read_only_and_serves_local_ui(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)
            server=create_server(Repository(base/'db.sqlite3'),port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                def get(path):
                    conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=4)
                    conn.request('GET',path)
                    resp=conn.getresponse()
                    code,raw=resp.status,resp.read()
                    conn.close()
                    return code,raw
                with patch('openrf.server.halow_status_report', return_value={'kind':'PASSIVE_WIFI_HALOW_READINESS','read_only':True}):
                    code,raw=get('/api/wifi-halow/status')
                self.assertEqual(code,200)
                self.assertTrue(json.loads(raw)['read_only'])
                code,raw=get('/static/wifi_halow.js')
                self.assertEqual(code,200)
                self.assertIn(b'PASSIVE_WIFI_HALOW_READINESS',raw)
                self.assertFalse((base/'reticulum').exists())
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__=='__main__':
    unittest.main()
