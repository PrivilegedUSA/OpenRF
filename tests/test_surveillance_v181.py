"""Surveillance USB/media regression using local fakes; no external camera access."""
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from openrf.server import create_server
from openrf.storage import Repository
from openrf.surveillance import SurveillanceStore, SurveillanceError, validate_usb_device
from openrf.surveillance_recording import RecordingManager


class StoreMigration(unittest.TestCase):
    def test_usb_and_legacy_rtsp(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/'db.sqlite3'
            store=SurveillanceStore(db)
            old=store.save({'name':'Existing camera', 'rtsp_url':'rtsp://user:secret@192.168.1.30/live'})
            new=SurveillanceStore(db)
            self.assertEqual(new.get_source(old['id'])['source'], 'RTSP')
            usb=new.save({'name':'USB cam', 'source_type':'USB', 'usb_device':'/dev/video0'})
            self.assertEqual(usb['type'], 'USB')
            self.assertEqual(usb['host'], '/dev/video0')
            self.assertNotIn('secret', json.dumps(new.list()))
            self.assertEqual(new.get_source(usb['id'])['location'],'/dev/video0')
            for bad in ('/dev/ttyUSB0','/tmp/video0','/dev/video0/../../etc/passwd','/dev/video000','/dev/video1\n'):
                with self.assertRaises(SurveillanceError): validate_usb_device(bad)

    def test_recordings_survive_restart_and_reject_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/'db.sqlite3'
            manager=RecordingManager(db)
            with manager._db() as conn:
                conn.execute("INSERT INTO surveillance_recordings(camera_id,camera_name,kind,filename,started_utc,state) VALUES (1,'Front','image','snapshot-00000001.jpg','2026-01-01','FINISHED')")
                conn.commit()
            file=manager.folder/'snapshot-00000001.jpg'
            file.write_bytes(b'JPEG_TEST')
            second=RecordingManager(db)
            self.assertEqual(second.list()[0]['bytes'],9)
            self.assertEqual(second.file(1)[0],file)
            self.assertTrue(second.delete(1))
            self.assertFalse(file.exists())
            with self.assertRaises(SurveillanceError):second.file(1)


class CameraMediaHTTP(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.server=create_server(Repository(Path(self.temp.name)/'db.sqlite3'), port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.camera=self.server.surveillance_store.save({'name':'Front', 'rtsp_url':'rtsp://user:secret@192.168.5.3/live'})

    def tearDown(self):
        self.server.shutdown();self.thread.join(5);self.server.server_close();self.temp.cleanup()

    def request(self, method, path, headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=8)
        conn.request(method,path,headers={'Host':f'127.0.0.1:{self.server.server_port}',**(headers or {})})
        reply=conn.getresponse();data=reply.read();status=reply.status;h=dict(reply.getheaders());conn.close()
        return status,data,h

    def test_inventory_and_media_private_range_and_deletion(self):
        status, body, _=self.request('GET','/api/surveillance')
        self.assertEqual(status,200)
        self.assertNotIn(b'secret',body)
        self.assertIn(b'recordings',body)
        media=self.server.surveillance_recordings
        with media._db() as db:
            db.execute("INSERT INTO surveillance_recordings(camera_id,camera_name,kind,filename,started_utc,state) VALUES (1,'Front','image','snapshot-00000001.jpg','2026-01-01','FINISHED')")
            db.commit()
        (media.folder/'snapshot-00000001.jpg').write_bytes(b'abcdefghij')
        status, body, headers=self.request('GET','/api/surveillance/recordings/1/file',{'Range':'bytes=3-6'})
        self.assertEqual((status,body,headers['Content-Range']),(206,b'defg','bytes 3-6/10'))
        self.assertEqual(self.request('GET','/api/surveillance/recordings/1/file',{'Range':'bytes=50-60'})[0],416)
        self.assertEqual(self.request('GET','/api/surveillance/recordings/1/file',{'Sec-Fetch-Site':'cross-site'})[0],403)
        self.assertEqual(self.request('DELETE','/api/surveillance/recordings/1',{'Origin':'http://elsewhere.test'})[0],403)
        self.assertEqual(self.request('DELETE','/api/surveillance/recordings/1')[0],200)
        self.assertEqual(self.request('GET','/api/surveillance/recordings/1/file')[0],404)

    def test_manual_action_missing_ffmpeg_and_unsupported_usb(self):
        with patch('openrf.surveillance_recording.shutil.which',return_value=None):
            status, body, _=self.request('POST',f'/api/surveillance/cameras/{self.camera["id"]}/record')
        self.assertEqual(status,409)
        self.assertNotIn(b'secret',body)
        usb=self.server.surveillance_store.save({'name':'Local','source_type':'USB','usb_device':'/dev/video999'})
        status, body, _=self.request('POST',f'/api/surveillance/cameras/{usb["id"]}/probe')
        self.assertEqual(status,200)
        self.assertEqual(json.loads(body)['state'],'UNAVAILABLE')
        self.assertEqual(self.request('POST',f'/api/surveillance/cameras/{usb["id"]}/snapshot')[0],409)


if __name__=='__main__': unittest.main()
