"""v0.2.102: dual-radio gateway foundation is only an inventory, not AP control."""
import json
import subprocess
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.field_network import readiness_report
from openrf.offline_navigation_readiness import readiness_report as offline_report
from openrf.server import create_server
from openrf.storage import Repository

NOW=datetime(2026,11,17,22,tzinfo=timezone.utc)


class FoundationTests(unittest.TestCase):
    def test_no_hardware_is_no_network_and_no_gps(self):
        with tempfile.TemporaryDirectory() as folder:
            report=readiness_report(net_root=Path(folder)/'absent',
                halow={'candidate_interfaces':[]},now=NOW,
                command_lookup=lambda _:None)
            self.assertEqual(report['interfaces'],[])
            self.assertFalse(any(report['mode_candidates'].values()))
            self.assertFalse(report['activation_available'])
            self.assertFalse(report['radio_actions_performed'])
            self.assertTrue(report['management_api_remains_loopback_only'])
        offline=offline_report(route_status={'reachable':False,'detail':'No Valhalla'},
            vector_status={'ready':False},raster_maps=[],now=NOW)
        self.assertFalse(offline['routing_service_reachable'])
        self.assertFalse(offline['any_local_visual_map_available'])
        self.assertFalse(offline['route_coverage_verified'])
        self.assertFalse(offline['gps_fix_checked'])
        self.assertFalse(offline['external_requests'])

    def test_dual_radio_diagnostics_never_equate_with_actual_connection(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)
            net=base/'net';net.mkdir()
            phy0=base/'phy0';phy0.mkdir()
            phy1=base/'phy1';phy1.mkdir()
            for interface,phy in [('wlan0',phy0),('halow0',phy1)]:
                path=net/interface;path.mkdir()
                (path/'operstate').write_text('up')
                (path/'phy80211').symlink_to(phy,target_is_directory=True)
            commands=[]
            def runner(args,**kw):
                commands.append((args,kw))
                self.assertEqual(args[1],'phy')
                self.assertEqual(args[3],'info')
                self.assertEqual(kw['timeout'],2)
                self.assertEqual(kw['stderr'],subprocess.DEVNULL)
                return subprocess.CompletedProcess(args,0,'Supported interface modes:\n\t * managed\n\t * AP\n\t * mesh point\n\t Band 1:\n'+'SSID: PRIVATE_NETWORK\n')
            report=readiness_report(net_root=net,halow={'candidate_interfaces':[
                {'name':'halow0','driver_hint':'morse'}]},now=NOW,
                command_lookup=lambda cmd:'/usr/bin/iw' if cmd=='iw' else None,
                runner=runner)
            self.assertEqual(len(report['interfaces']),2)
            self.assertEqual(len(commands),2)
            self.assertEqual({i['classification'] for i in report['interfaces']},
                {'ordinary_wifi_candidate','halow_driver_candidate'})
            self.assertTrue(report['mode_candidates']['two_radio_gateway'])
            self.assertFalse(report['mode_candidates']['reticulum_transport'])
            self.assertFalse(report['activation_available'])
            self.assertFalse(report['actual_network_or_peer_verified'])
            self.assertTrue(all(not i['ap_station_concurrency_verified'] for i in report['interfaces']))
            self.assertNotIn('PRIVATE_NETWORK',json.dumps(report))
            self.assertNotIn('/usr/bin/iw',json.dumps(report))

    def test_missing_iw_does_not_claim_ap_support(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);net=base/'net';net.mkdir()
            phy=base/'phy0';phy.mkdir()
            iface=net/'wlan0';iface.mkdir();(iface/'phy80211').symlink_to(phy,target_is_directory=True)
            report=readiness_report(net_root=net,halow={'candidate_interfaces':[]},
                command_lookup=lambda _:None,runner=lambda *a,**k: self.fail('No command'))
            self.assertIsNone(report['interfaces'][0]['os_reports_ap_mode'])
            self.assertFalse(report['mode_candidates']['local_wifi_hotspot'])

    def test_local_visual_map_and_route_service_remain_distinct(self):
        report=offline_report(route_status={'reachable':True,'detail':'Service up'},
            vector_status={'ready':True,'fonts_ready':True,'bounds':[-121,37,-119,39]},
            raster_maps=[{'id':'test'}],now=NOW)
        self.assertTrue(report['routing_service_reachable'])
        self.assertTrue(report['local_vector_basemap_ready'])
        self.assertTrue(report['any_local_visual_map_available'])
        self.assertEqual(report['local_raster_package_count'],1)
        self.assertFalse(report['route_coverage_verified'])
        self.assertFalse(report['gps_fix_checked'])

    def test_new_endpoints_are_get_only_and_reject_query_options(self):
        with tempfile.TemporaryDirectory() as folder:
            server=create_server(Repository(Path(folder)/'db.sqlite3'),port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                def get(path):
                    c=HTTPConnection('127.0.0.1',server.server_address[1],timeout=4)
                    c.request('GET',path)
                    res=c.getresponse();status=res.status;body=json.loads(res.read());c.close()
                    return status,body
                with (patch('openrf.server.field_network_readiness_report',
                             return_value={'kind':'PASSIVE_FIELD_NETWORK_FOUNDATION','read_only':True}) as field,
                      patch('openrf.server.offline_navigation_readiness_report',
                            return_value={'kind':'OFFLINE_NAVIGATION_PREFLIGHT','read_only':True}) as offline,
                      patch('openrf.server.local_status',return_value={'reachable':False}) as route,
                      patch('openrf.server.vector_maps.status',return_value={'ready':False}),
                      patch('openrf.server.available_maps',return_value=[])):
                    self.assertEqual(get('/api/network/field-readiness')[0],200)
                    self.assertEqual(get('/api/navigation/offline-readiness')[0],200)
                    self.assertEqual(get('/api/network/field-readiness?enable=yes')[0],400)
                    self.assertEqual(get('/api/navigation/offline-readiness?location=1')[0],400)
                    field.assert_called_once();offline.assert_called_once();route.assert_called_once()
                for path in ('/static/field_network.js','/static/offline_readiness.js'):
                    c=HTTPConnection('127.0.0.1',server.server_address[1],timeout=4)
                    c.request('GET',path)
                    res=c.getresponse()
                    self.assertEqual(res.status,200)
                    self.assertIn(b'readiness',res.read())
                    c.close()
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__':
    unittest.main()
