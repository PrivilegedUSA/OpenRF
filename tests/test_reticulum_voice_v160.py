"""v0.2.160 short voice-note attachment metadata, content bounds and rendering safety."""
import base64
from http.client import HTTPConnection
from pathlib import Path
import tempfile
import threading
import unittest

from openrf.reticulum_attachments import (audio_mime, SessionAttachmentBuffer,
                                          outbound_fields, lxmf_attachment, MAX_ATTACHMENT_BYTES)
from openrf.reticulum_lan import validate_message, ReticulumError
from openrf.server import create_server
from openrf.storage import Repository


ADDRESS = 'a' * 32
OGG = b'OggS' + b'\x00'*64
WEBM = b'\x1a\x45\xdf\xa3' + b'\x00'*64
MP4 = b'\x00\x00\x00\x18ftypM4A ' + b'\x00'*64


class VoiceAttachmentTests(unittest.TestCase):
    def test_recognized_media_containers_only(self):
        for data, mime in [(OGG,'audio/ogg'),(WEBM,'audio/webm'),(MP4,'audio/mp4')]:
            self.assertEqual(audio_mime(data),mime)
            buffer=SessionAttachmentBuffer()
            meta=buffer.add('voice-note.ogg',data)
            self.assertEqual(meta['mime'],mime)
            self.assertEqual(buffer.get(meta['id'])['data'],data)
            buffer.clear()
            self.assertIsNone(buffer.get(meta['id']))
        self.assertIsNone(audio_mime(b'<html><script>alert(1)</script>'))
        self.assertIsNone(audio_mime(b'RIFF' + b'\x00'*64))
        self.assertIsNone(audio_mime(b'\x00\x00\x00\x08ftypabcd'))

    def test_voice_is_one_lxmf_file_field_not_a_fake_live_call(self):
        LXMF = type('LXMF',(),{'FIELD_FILE_ATTACHMENTS':5,'FIELD_IMAGE':6})
        for name, data in [('voice.webm',WEBM),('voice.ogg',OGG),('voice.m4a',MP4)]:
            payload=validate_message({'destination':ADDRESS,'text':'',
                'attachment':{'filename':name,'data_base64':base64.b64encode(data).decode()}})
            fields=outbound_fields(LXMF,payload['attachment'])
            self.assertEqual(fields,{5:[[name,data]]})
            self.assertEqual(lxmf_attachment(fields,LXMF),{'filename':name,'data':data})

    def test_audio_does_not_expand_size_or_allow_extra_payloads(self):
        with self.assertRaises(ReticulumError):
            validate_message({'destination':ADDRESS,'text':'','attachment':{
                'filename':'voice.ogg','data_base64':base64.b64encode(OGG+b'x'*MAX_ATTACHMENT_BYTES).decode()}})
        with self.assertRaises(ReticulumError):
            validate_message({'destination':ADDRESS,'text':'','attachment':{
                'filename':'../../voice.ogg','data_base64':base64.b64encode(OGG).decode()}})

    def test_loopback_download_content_type_is_sniffed_without_html(self):
        class FakeReticulum:
            def attachment(self,token):
                if token!='f'*32:raise ReticulumError('Not found','not_found',404)
                info=SessionAttachmentBuffer().add('voice-note.ogg',OGG)
                return {'filename':'voice-note.ogg','mime':info['mime'],'data':OGG}
            def close(self):pass
        with tempfile.TemporaryDirectory() as temp:
            server=create_server(Repository(Path(temp)/'db.sqlite3'),port=0)
            server.reticulum_manager=FakeReticulum()
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                client=HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                client.request('GET','/api/reticulum/attachments/'+'f'*32,
                    headers={'Host':f'localhost:{server.server_port}'})
                response=client.getresponse()
                self.assertEqual(response.status,200)
                self.assertEqual(response.getheader('Content-Type'),'audio/ogg')
                self.assertEqual(response.read(),OGG)
                client.close()
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__':unittest.main()
