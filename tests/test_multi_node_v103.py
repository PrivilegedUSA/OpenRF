"""v0.2.103 two-node config: never start a real Reticulum worker or RF device."""
import json
import os
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.reticulum_lan import (ReticulumError, ReticulumManager,
                                   runtime_config, validate_start)
from openrf.server import create_server
from openrf.storage import Repository


class MultiNodeConfigTests(unittest.TestCase):
    def test_two_isolated_nodes_different_roles_and_private_configs(self):
        with tempfile.TemporaryDirectory() as folder:
            parent = Path(folder)
            listener = parent/'box-A'
            caller = parent/'box-B'
            left = runtime_config(listener, tcp_enabled=True, tcp_listen_port=4542)
            right = runtime_config(caller, tcp_peer={'host':'127.0.0.1','port':4542})
            self.assertNotEqual(left,right)
            first = (left/'config').read_text()
            second = (right/'config').read_text()
            self.assertIn('type = TCPServerInterface', first)
            self.assertIn('listen_port = 4542', first)
            self.assertNotIn('TCPClientInterface', first)
            self.assertIn('type = TCPClientInterface', second)
            self.assertIn('target_host = 127.0.0.1', second)
            self.assertIn('target_port = 4542', second)
            self.assertNotIn('TCPServerInterface', second)
            for config in (left/'config',right/'config'):
                self.assertEqual(os.stat(config).st_mode&0o777,0o600)
            self.assertIn('enable_transport = No',first)
            self.assertIn('enable_transport = No',second)
            self.assertNotIn('TCPClientInterface',(right.parent/'rns'/'config').read_text())
            self.assertNotIn('TCPServerInterface',(left.parent/'rns'/'config').read_text())

    def test_validated_tcp_peers_and_custom_ports(self):
        self.assertEqual(validate_start({}),{'tcp_enabled':False})
        self.assertEqual(validate_start({'tcp_enabled':True}),{'tcp_enabled':True})
        for host in ['127.0.0.1','10.42.0.1','172.31.2.6','192.168.14.22']:
            config=validate_start({'tcp_peer':{'host':host,'port':4242,'confirm':True}})
            self.assertEqual(config['tcp_peer'],{'host':host,'port':4242})
        result=validate_start({'tcp_enabled':True,'tcp_listen_port':4500})
        self.assertEqual(result['tcp_listen_port'],4500)
        with self.assertRaisesRegex(ReticulumError, 'back to itself'):
            validate_start({'tcp_enabled':True,
                'tcp_peer':{'host':'127.0.0.1','port':4242,'confirm':True}})

    def test_rejects_public_dns_injection_and_unconfirmed_targets(self):
        bad = ['localhost','example.com','8.8.8.8','169.254.1.2','0.0.0.0',
               '127.0.0.1\nfoo = bar','::1','192.168.1.1; reboot', '255.255.255.255']
        for host in bad:
            with self.subTest(host=host),self.assertRaises(ReticulumError):
                validate_start({'tcp_peer':{'host':host,'port':4242,'confirm':True}})
        for peer in ({'host':'10.0.0.1','port':4242,'confirm':False},
                     {'host':'10.0.0.1','port':4242},
                     {'host':'10.0.0.1','port':80,'confirm':True},
                     {'host':'10.0.0.1','port':True,'confirm':True},
                     {'host':'10.0.0.1','port':'4242','confirm':True}):
            with self.subTest(peer=peer),self.assertRaises(ReticulumError):
                validate_start({'tcp_peer':peer})
        for payload in ({'tcp_listen_port':4242}, {'tcp_enabled':True,'tcp_listen_port':80},
                        {'tcp_enabled':True,'tcp_listen_port':True},
                        {'tcp_enabled':True,'tcp_listen_port':'4242'}):
            with self.subTest(payload=payload),self.assertRaises(ReticulumError):
                validate_start(payload)

    def test_both_roles_can_use_same_private_config_without_forwarding(self):
        with tempfile.TemporaryDirectory() as folder:
            result=runtime_config(Path(folder),tcp_enabled=True,tcp_listen_port=4455,
                tcp_peer={'host':'192.168.2.2','port':5000})
            contents=(result/'config').read_text()
            self.assertEqual(contents.count('TCPServerInterface'),1)
            self.assertEqual(contents.count('TCPClientInterface'),1)
            self.assertEqual(contents.count('enable_transport = No'),1)
            self.assertNotIn('confirm',contents)

    def test_manager_inactive_status_does_not_claim_any_peer(self):
        with tempfile.TemporaryDirectory() as folder:
            manager=ReticulumManager(Path(folder),dependencies_available=lambda:False)
            status=manager.status()
            self.assertFalse(status['enabled'])
            self.assertFalse(status['tcp_peer_requested'])
            self.assertIsNone(status['tcp_port'])
            self.assertEqual(status['delivery'],'UNVERIFIED_UNTIL_LXMF_RECEIPT')


class MultiNodeHTTPTests(unittest.TestCase):
    def test_two_loopback_management_instances_and_no_public_peer_action(self):
        with tempfile.TemporaryDirectory() as folder:
            parent=Path(folder)
            left=create_server(Repository(parent/'A'/'state.sqlite3'),port=0)
            right=create_server(Repository(parent/'B'/'state.sqlite3'),port=0)
            left.reticulum_manager=ReticulumManager(parent/'A'/'reticulum',dependencies_available=lambda:False)
            right.reticulum_manager=ReticulumManager(parent/'B'/'reticulum',dependencies_available=lambda:False)
            self.assertNotEqual(left.server_address,right.server_address)
            self.assertEqual(left.server_address[0],'127.0.0.1')
            self.assertEqual(right.server_address[0],'127.0.0.1')
            threads=[threading.Thread(target=s.serve_forever,daemon=True) for s in (left,right)]
            for thread in threads:thread.start()
            def call(server,method,path,body=None):
                port=server.server_address[1]
                conn=HTTPConnection('127.0.0.1',port,timeout=4)
                headers={'Host':f'localhost:{port}'}
                raw=json.dumps(body) if body is not None else None
                if raw is not None:headers['Content-Type']='application/json'
                conn.request(method,path,body=raw,headers=headers)
                response=conn.getresponse()
                code=response.status
                data=json.loads(response.read())
                conn.close()
                return code,data
            try:
                for server in (left,right):
                    code,status=call(server,'GET','/api/reticulum/status')
                    self.assertEqual(code,200)
                    self.assertFalse(status['enabled'])
                peer={'tcp_peer':{'host':'127.0.0.1','port':4242,'confirm':True}}
                code,_=call(right,'POST','/api/reticulum/start',peer)
                self.assertEqual(code,503, 'Real RNS/LXMF unavailable: no fake peer reported')
                for host in ('8.8.8.8','localhost'):
                    code,_=call(right,'POST','/api/reticulum/start',
                        {'tcp_peer':{'host':host,'port':4242,'confirm':True}})
                    self.assertEqual(code,400)
                self.assertFalse(call(left,'GET','/api/reticulum/status')[1]['enabled'])
                self.assertFalse(call(right,'GET','/api/reticulum/status')[1]['enabled'])
            finally:
                for server in (left,right):server.shutdown();server.server_close()
                for thread in threads:thread.join(timeout=3)


if __name__=='__main__':
    unittest.main()
