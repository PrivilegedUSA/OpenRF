"""v0.2.102: HaLow RNS AutoInterface selection is explicit and preflight-gated."""
import json
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.reticulum_lan import (ReticulumError, ReticulumManager,
                                  private_config, runtime_config, validate_start)
from openrf.server import create_server
from openrf.storage import Repository
from openrf.wifi_halow import status_report

NOW = datetime(2026, 11, 17, 21, 0, tzinfo=timezone.utc)


class HalowReticulumTests(unittest.TestCase):
    def fake_report(self, root, *, ipv6=True, carrier='1', state='up'):
        base=Path(root)
        driver=base/'drivers'/'morse'
        driver.mkdir(parents=True,exist_ok=True)
        iface=base/'net'/'wlan1'
        (iface/'device').mkdir(parents=True,exist_ok=True)
        if not (iface/'device'/'driver').exists():
            (iface/'device'/'driver').symlink_to(driver,target_is_directory=True)
        (iface/'operstate').write_text(state)
        (iface/'carrier').write_text(carrier)
        ipv6_file=base/'if_inet6'
        ipv6_file.write_text('fe800000000000000000000000000001 02 40 20 80 wlan1\n' if ipv6 else '')
        return status_report(net_root=base/'net', module_root=base/'modules',
            ipv6_table=ipv6_file, wsl=False, usb_devices=[],now=NOW,
            command_lookup=lambda name: None)

    def test_ipv6_linklocal_only_qualifies_os_preflight_without_link_claim(self):
        with tempfile.TemporaryDirectory() as folder:
            ok=self.fake_report(folder)
            row=ok['candidate_interfaces'][0]
            self.assertTrue(row['ipv6_link_local_present'])
            self.assertTrue(row['reticulum_opt_in_eligible'])
            self.assertFalse(ok['reticulum_transport_verified'])
            self.assertFalse(row['halow_rf_link_verified'])
            self.assertNotIn('fe800000',json.dumps(ok),'Do not expose IPv6 addresses')
            for values in ({'ipv6':False},{'carrier':'0'},{'state':'down'}):
                self.assertFalse(self.fake_report(folder,**values)
                                 ['candidate_interfaces'][0]['reticulum_opt_in_eligible'])

    def test_validates_name_without_config_injection_or_implicit_selection(self):
        self.assertEqual(validate_start({}),{'tcp_enabled':False})
        self.assertEqual(validate_start({'halow_device':'wlan1'}),
                         {'tcp_enabled':False,'halow_device':'wlan1'})
        for value in ('', 'lo', 'wlan1\nignored_devices = eth0','wlan1,eth0',
                      'wlan1 /tmp', '../wlan1',123,None,True):
            with self.subTest(value=value),self.assertRaises(ReticulumError):
                validate_start({'halow_device':value})

    def test_temp_config_isolates_only_managed_auto_and_preserves_operator_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            default=private_config(root)/'config'
            initial=default.read_bytes()
            generated=runtime_config(root,halow_device='wlan1')/'config'
            self.assertNotEqual(generated,default)
            self.assertEqual(default.read_bytes(),initial)
            contents=generated.read_text()
            self.assertEqual(contents.count('    devices = wlan1'),1)
            self.assertIn('group_id = reticulum',contents)
            self.assertIn('enable_transport = No',contents)
            self.assertNotIn('TCPServerInterface',contents)
            self.assertEqual(generated.stat().st_mode & 0o777,0o600)
            self.assertNotIn('devices = wlan1',runtime_config(root).joinpath('config').read_text())

    def test_keeps_original_rnode_and_tcp_controls_separate(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            config=(private_config(root)/'config')
            config.write_text(config.read_text()+'\n  [[Operator VPN]]\n    type = AutoInterface\n    enabled = yes\n    devices = tun2\n')
            scoped=(runtime_config(root,halow_device='wlan1',tcp_enabled=True)/'config').read_text()
            self.assertIn('    devices = wlan1',scoped)
            self.assertIn('    devices = tun2',scoped)
            self.assertIn('TCPServerInterface',scoped)
            self.assertIn('Operator VPN',config.read_text())
            self.assertNotIn('devices = wlan1',config.read_text())
            original=config.read_text()
            config.write_text(original.replace('    discovery_scope = link',
                                                '    discovery_scope = link\n    devices = eth0'))
            with self.assertRaisesRegex(RuntimeError,'changed by the operator'):
                runtime_config(root,halow_device='wlan1')

    def test_halow_plus_rnode_requires_separate_forwarding_consent(self):
        radio={'port':'/dev/ttyUSB2','frequency':915000000,'bandwidth':125000,
               'txpower':7,'spreadingfactor':8,'codingrate':5}
        with tempfile.TemporaryDirectory() as folder:
            default=runtime_config(folder)/'config'
            scoped=(runtime_config(folder,halow_device='wlan1',rnode=radio)/'config').read_text()
            self.assertIn('devices = wlan1',scoped)
            self.assertIn('type = RNodeInterface',scoped)
            self.assertIn('enable_transport = No',scoped)
            self.assertIn('enable_transport = No',default.read_text())
            forwarding=(runtime_config(folder,halow_device='wlan1',rnode=radio,
                                       transport_enabled=True)/'config').read_text()
            self.assertIn('enable_transport = Yes',forwarding)

    def test_manager_refuses_unverified_candidate_before_child_starts(self):
        with tempfile.TemporaryDirectory() as folder:
            manager=ReticulumManager(Path(folder))
            try:
                with patch('openrf.reticulum_lan.halow_status_report',return_value={
                    'candidate_interfaces':[{'name':'wlan1','reticulum_opt_in_eligible':False}]}):
                    with self.assertRaises(ReticulumError) as caught:
                        manager.start({'halow_device':'wlan1'})
                self.assertEqual(caught.exception.code,'halow_not_ready')
                self.assertFalse(manager.status()['enabled'])
                self.assertIsNone(manager.status()['halow_device_requested'])
                self.assertFalse(Path(folder).joinpath('rns').exists())
            finally:
                manager.close()

    def test_no_halow_hardware_start_returns_409_at_http_layer(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            server=create_server(Repository(root/'db.sqlite3'),port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                with patch('openrf.reticulum_lan.halow_status_report',return_value={'candidate_interfaces':[]}):
                    conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=4)
                    body=json.dumps({'halow_device':'wlan1','tcp_enabled':False})
                    conn.request('POST','/api/reticulum/start',body,
                                 {'Content-Type':'application/json'})
                    response=conn.getresponse()
                    code,data=response.status,json.loads(response.read())
                    conn.close()
                self.assertEqual(code,409)
                self.assertIn('HaLow',data.get('error',''))
                self.assertFalse(server.reticulum_manager.status()['enabled'])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__=='__main__': unittest.main()
