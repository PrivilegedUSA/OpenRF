"""v0.2.85: optional LAN transport is dormant until explicitly enabled."""
import tempfile
from pathlib import Path
from http.client import HTTPConnection
import json
import threading
import unittest

from openrf.reticulum_lan import (LAN_CONFIG, ReticulumError, ReticulumManager,
                                  private_config, validate_message)
from openrf.server import create_server
from openrf.storage import Repository


class ReticulumFoundationTests(unittest.TestCase):
    def test_validation(self):
        destination='a'*32
        self.assertEqual(validate_message({'destination':destination.upper(), 'text':'hello'}),
                         {'destination':destination,'text':'hello'})
        for item in ({'text':'hello', 'destination':'abc'},
                     {'text':'', 'destination':destination},
                     {'text':'x'*1025, 'destination':destination},
                     {'text':'bad\x00', 'destination':destination},
                     {'text':'hello', 'destination':destination, 'broadcast':True}):
            with self.subTest(item=item), self.assertRaises(ReticulumError):
                validate_message(item)

    def test_idle_manager_creates_nothing_and_does_not_connect(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'reticulum'
            manager=ReticulumManager(root,dependencies_available=lambda:False)
            self.assertFalse(root.exists())
            status=manager.status()
            self.assertFalse(status['enabled'])
            self.assertFalse(status['dependencies_available'])
            self.assertIsNone(status['address'])
            with self.assertRaises(ReticulumError) as ctx:manager.start({})
            self.assertEqual(ctx.exception.code,'reticulum_dependencies_missing')
            self.assertFalse(root.exists())
            with self.assertRaises(ReticulumError):manager.send({'destination':'a'*32,'text':'Hi'})
            with self.assertRaises(ReticulumError):manager.announce({})
            manager.close()

    def test_private_config_reproducible_and_scoped(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'data'
            config=private_config(root)/'config'
            self.assertEqual(config.read_text(),LAN_CONFIG)
            self.assertEqual(config.stat().st_mode & 0o777,0o600)
            self.assertEqual(root.stat().st_mode & 0o777,0o700)
            self.assertIn('enable_transport = No',LAN_CONFIG)
            self.assertIn('discovery_scope = link',LAN_CONFIG)
            config.write_text('custom operator configuration')
            private_config(root)
            self.assertEqual(config.read_text(),'custom operator configuration')

    def test_http_status_and_explicit_start_only(self):
        with tempfile.TemporaryDirectory() as folder:
            repo=Repository(Path(folder)/'openrf.sqlite3')
            server=create_server(repo,port=0)
            server.reticulum_manager=ReticulumManager(Path(folder)/'reticulum',
                                                      dependencies_available=lambda:False)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                def request(method,path,body=None,origin=None):
                    conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=4)
                    headers={'Host':f'localhost:{server.server_address[1]}'}
                    if body is not None:headers['Content-Type']='application/json'
                    if origin:headers['Origin']=origin
                    conn.request(method,path,json.dumps(body) if body is not None else None,headers)
                    result=conn.getresponse();data=result.read();status=result.status;conn.close()
                    return status,json.loads(data) if data else None
                self.assertEqual(request('GET','/api/reticulum/status')[1]['enabled'],False)
                self.assertEqual(request('GET','/api/reticulum/messages')[1]['messages'],[])
                self.assertEqual(request('POST','/api/reticulum/start',{},origin='https://elsewhere.example')[0],403)
                self.assertEqual(request('POST','/api/reticulum/start',{})[0],503)
                self.assertFalse((Path(folder)/'reticulum').exists())
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__': unittest.main()
