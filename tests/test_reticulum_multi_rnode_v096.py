"""v0.2.96: two independent RNode USB ports, never duplicated or auto-started."""
from pathlib import Path
from unittest.mock import patch
from http.client import HTTPConnection
import json
import tempfile
import threading
import unittest

from openrf.reticulum_lan import (LAN_CONFIG, ReticulumError, ReticulumManager,
                                  runtime_config, validate_rnodes, validate_start)
from openrf.server import create_server
from openrf.storage import Repository


FIRST = {'port':'/dev/ttyUSB0','frequency':915000000,'bandwidth':125000,
         'txpower':7,'spreadingfactor':8,'codingrate':5}
SECOND = {'port':'/dev/ttyACM1','frequency':916000000,'bandwidth':62500,
          'txpower':3,'spreadingfactor':10,'codingrate':7}


class MultiRNodeTests(unittest.TestCase):
    def test_multiple_usb_radio_validation_and_legacy_compatibility(self):
        options=validate_start({'rnodes':[FIRST,SECOND],'transport_enabled':True,
                                'tcp_enabled':True})
        self.assertEqual(options['rnodes'],[FIRST,SECOND])
        self.assertTrue(options['transport_enabled'])
        self.assertEqual(validate_start({'rnode':FIRST})['rnode'],FIRST)
        self.assertEqual(validate_start({'rnodes':[FIRST]})['rnodes'],[FIRST])
        for body in ({'rnodes':[]}, {'rnodes':[FIRST,FIRST]},
                     {'rnodes':[FIRST,{**SECOND,'port':'/dev/ttyUSB0'}]},
                     {'rnodes':[FIRST,SECOND,FIRST]},
                     {'rnodes':(FIRST,SECOND)},
                     {'rnodes':[FIRST,None]},
                     {'rnode':FIRST,'rnodes':[SECOND]},
                     {'rnodes':[SECOND],'transport_enabled':1}):
            with self.subTest(body=body),self.assertRaises(ReticulumError):
                validate_start(body)

    def test_two_interfaces_use_distinct_sections_and_keep_operator_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            original=runtime_config(root)/'config'
            source=LAN_CONFIG + '\n[logging]\n  loglevel = 1\n'
            original.write_text(source)
            generated=runtime_config(root,rnodes=[FIRST,SECOND],transport_enabled=True)
            text=(generated/'config').read_text()
            self.assertEqual(original.read_text(),source)
            self.assertEqual(text.count('type = RNodeInterface'),2)
            self.assertEqual(text.count('port = /dev/ttyUSB0'),1)
            self.assertEqual(text.count('port = /dev/ttyACM1'),1)
            self.assertIn('[[OpenRF Optional USB RNode]]',text)
            self.assertIn('[[OpenRF Optional USB RNode 2]]',text)
            self.assertLess(text.index('[[OpenRF Optional USB RNode 2]]'),text.index('[logging]'))
            self.assertIn('enable_transport = Yes',text)
            self.assertNotIn('TCPServerInterface',text)
            self.assertEqual((generated/'config').stat().st_mode&0o777,0o600)
            stopped=(runtime_config(root,rnodes=[FIRST,SECOND])/'config').read_text()
            self.assertIn('enable_transport = No',stopped)
            self.assertEqual(stopped.count('type = RNodeInterface'),2)
            self.assertEqual(original.read_text(),source)
            tcp=(runtime_config(root,rnodes=[FIRST,SECOND],tcp_enabled=True)/'config').read_text()
            self.assertIn('type = TCPServerInterface',tcp)

    def test_runtime_invalid_values_do_not_make_config_or_radio_contact(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'private'
            with self.assertRaises(ReticulumError):
                runtime_config(root,rnodes=[FIRST,FIRST])
            self.assertFalse(root.exists())
            with self.assertRaises(ValueError):
                runtime_config(root,rnode=FIRST,rnodes=[SECOND])
            self.assertFalse(root.exists())
            with self.assertRaises(ValueError):
                runtime_config(root,transport_enabled=True)
            self.assertFalse(root.exists())

    def test_default_manager_off_and_status_has_no_ghost_radios(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'reticulum'
            manager=ReticulumManager(root,dependencies_available=lambda:False)
            state=manager.status()
            self.assertEqual(state['rnode_ports'],[])
            self.assertEqual(state['rnode_count'],0)
            with self.assertRaises(ReticulumError):
                manager.start({'rnodes':[FIRST,SECOND]})
            self.assertFalse(root.exists())

    def test_second_radio_port_cannot_also_be_meshtastic(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            server=create_server(Repository(root/'openrf.sqlite3'),port=0)
            runner=threading.Thread(target=server.serve_forever,daemon=True)
            runner.start()
            try:
                def call(path,payload):
                    conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=3)
                    conn.request('POST',path,json.dumps(payload),
                                 {'Content-Type':'application/json'})
                    response=conn.getresponse()
                    code,body=response.status,json.loads(response.read())
                    conn.close()
                    return code,body
                with patch.object(server.mesh_manager,'status',return_value={
                        'connected':True,'port':SECOND['port']}):
                    code,body=call('/api/reticulum/start',{'rnodes':[FIRST,SECOND]})
                    self.assertEqual(code,409)
                    self.assertIn('Meshtastic',body['error'])
                with patch.object(server.reticulum_manager,'status',return_value={
                        'enabled':True,'rnode_ports':[FIRST['port'],SECOND['port']]}):
                    code,body=call('/api/mesh/connect',{'port':SECOND['port']})
                    self.assertEqual(code,409)
                    self.assertIn('Reticulum',body['error'])
            finally:
                server.shutdown()
                server.server_close()
                runner.join(timeout=3)


if __name__=='__main__':unittest.main()
