"""v0.2.187: USB V4L2 controls are explicit, bounded, and never network PTZ."""
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

from openrf.server import create_server
from openrf.storage import Repository
from openrf.surveillance import SurveillanceError, set_usb_ptz, usb_ptz_controls

RAW = '''
                     pan_absolute 0x009a0908 (int)    : min=-36000 max=36000 step=3600 default=0 value=0 flags=has-min-max
                    tilt_absolute 0x009a0909 (int)    : min=-36000 max=36000 step=3600 default=0 value=0 flags=has-min-max
                    zoom_absolute 0x009a090d (int)    : min=10 max=20 step=1 default=10 value=10 flags=has-min-max
'''


class PTZUnitTests(unittest.TestCase):
    @patch('openrf.surveillance.shutil.which', return_value='/usr/bin/v4l2-ctl')
    @patch('openrf.surveillance.subprocess.run')
    def test_read_only_metadata_and_explicit_step(self, run, _):
        run.side_effect = [Mock(returncode=0, stdout=RAW), Mock(returncode=0, stdout=b'')]
        data = usb_ptz_controls('/dev/video0')
        self.assertTrue(data['supported'])
        self.assertEqual(set(data['controls']), {'pan','tilt','zoom'})
        self.assertEqual(data['controls']['pan']['step'], 3600)
        run.reset_mock()
        run.side_effect = [Mock(returncode=0, stdout=RAW), Mock(returncode=0, stdout=b'')]
        response = set_usb_ptz('/dev/video0', {'axis':'pan','step':1})
        self.assertEqual(response['value'], 3600)
        self.assertEqual(run.call_args.args[0], ['/usr/bin/v4l2-ctl','--device','/dev/video0','--set-ctrl','pan_absolute=3600'])
        self.assertEqual(run.call_args.kwargs['timeout'], 5)
        self.assertNotIn('shell',run.call_args.kwargs)

    @patch('openrf.surveillance.shutil.which', return_value='/usr/bin/v4l2-ctl')
    @patch('openrf.surveillance.subprocess.run')
    def test_clamp_and_invalid_inputs(self, run, _):
        run.return_value = Mock(returncode=0, stdout=RAW.replace('value=10 flags=', 'value=20 flags='))
        self.assertEqual(set_usb_ptz('/dev/video0', {'axis':'zoom','step':1})['state'],'AT_LIMIT')
        self.assertEqual(run.call_count,1)
        for bad in ({'axis':'zoom','step':100}, {'axis':'pan','step':True},
                    {'axis':'brightness','step':1}, {'axis':'zoom','step':1,'command':'reboot'}):
            with self.assertRaises(SurveillanceError): set_usb_ptz('/dev/video0',bad)
        with self.assertRaises(SurveillanceError): set_usb_ptz('/etc/passwd',{'axis':'pan','step':1})
        self.assertEqual(run.call_count,1)

    @patch('openrf.surveillance.shutil.which', return_value=None)
    def test_no_v4l2_binary_is_honest(self, _):
        self.assertEqual(usb_ptz_controls('/dev/video0')['supported'],False)


class PTZAPITests(unittest.TestCase):
    def test_only_saved_usb_and_same_origin_actuation(self):
        with tempfile.TemporaryDirectory() as tmp:
            server = create_server(Repository(Path(tmp) / 'db.sqlite3'), port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            usb = server.surveillance_store.save({'name':'USB camera', 'source_type':'USB','usb_device':'/dev/video0'})
            rtsp = server.surveillance_store.save({'name':'Network camera','rtsp_url':'rtsp://192.168.2.12/live'})
            def request(method, path, body=None, origin=None):
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=8)
                headers = {'Host':f'127.0.0.1:{server.server_port}'}
                if origin: headers['Origin']=origin
                if body is not None: headers['Content-Type']='application/json'
                conn.request(method,path,body=json.dumps(body) if body is not None else None, headers=headers)
                response=conn.getresponse(); result=response.status,json.loads(response.read());conn.close();return result
            path=f'/api/surveillance/cameras/{usb["id"]}/ptz'
            try:
                with patch('openrf.server.usb_ptz_controls',return_value={'supported':True,'controls':{'zoom':{'value':10}}}) as read, \
                     patch('openrf.server.set_usb_ptz',return_value={'axis':'zoom','value':11}) as write:
                    self.assertEqual(request('GET','/api/surveillance')[0],200)
                    read.assert_not_called(); write.assert_not_called()
                    self.assertEqual(request('GET',path)[0],200)
                    self.assertEqual(request('POST',path,{'axis':'zoom','step':1},'http://evil.invalid')[0],403)
                    self.assertEqual(request('POST',path+'?bad',{'axis':'zoom','step':1})[0],400)
                    write.assert_not_called()
                    self.assertEqual(request('POST',path,{'axis':'zoom','step':1})[0],200)
                    write.assert_called_once_with('/dev/video0',{'axis':'zoom','step':1})
                self.assertFalse(request('GET',f'/api/surveillance/cameras/{rtsp["id"]}/ptz')[1]['supported'])
                self.assertEqual(request('POST',f'/api/surveillance/cameras/{rtsp["id"]}/ptz',{'axis':'pan','step':1})[0],409)
                self.assertEqual(request('GET','/api/surveillance/cameras/999999/ptz')[0],404)
            finally:
                server.shutdown(); thread.join(5);server.server_close()

if __name__=='__main__': unittest.main()
