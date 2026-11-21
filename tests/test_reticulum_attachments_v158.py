"""Phase 1 LXMF attachments: explicit user send, safe bounds and no silent disk writes."""
import base64
from http.client import HTTPConnection
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

from openrf.reticulum_attachments import (MAX_ATTACHMENT_BYTES, SessionAttachmentBuffer,
                                          image_mime, lxmf_attachment, outbound_fields)
from openrf.reticulum_lan import (ReticulumError, ReticulumManager,
                                 validate_message, reticulum_worker)
from openrf.reticulum_history import ReticulumLocalStore
from openrf.server import create_server
from openrf.storage import Repository


DEST = 'a' * 32
PNG = b'\x89PNG\r\n\x1a\n' + b'example thumbnail bytes'


class AttachmentTests(unittest.TestCase):
    def test_user_file_becomes_standard_lxmf_field_without_automatic_disk_storage(self):
        data = base64.b64encode(PNG).decode('ascii')
        payload = validate_message({'destination':DEST, 'text':'',
                                    'attachment':{'filename':'trail.png', 'data_base64':data}})
        self.assertEqual(payload['attachment'],{'filename':'trail.png','data':PNG})
        fake_lxmf = type('LXMF', (), {'FIELD_FILE_ATTACHMENTS':5})
        self.assertEqual(lxmf_attachment({5:[['trail.png',PNG]]},fake_lxmf),payload['attachment'])
        self.assertEqual(outbound_fields(fake_lxmf,payload['attachment']),{6:['png',PNG]})
        self.assertEqual(lxmf_attachment({6:['png',PNG]},fake_lxmf),
                         {'filename':'received-image.png','data':PNG})
        self.assertEqual(outbound_fields(fake_lxmf,{'filename':'notes.pdf','data':b'%PDF-1'}),
                         {5:[['notes.pdf',b'%PDF-1']]})
        with tempfile.TemporaryDirectory() as folder:
            files = SessionAttachmentBuffer()
            item = files.add(**payload['attachment'])
            self.assertEqual(item['mime'],'image/png')
            self.assertEqual(files.get(item['id'])['data'],PNG)
            self.assertFalse(list(Path(folder).iterdir()),'No filesystem persistence before explicit save')
            files.clear()
            self.assertIsNone(files.get(item['id']))

    def test_invalid_or_oversized_attachments_are_rejected_before_ipc(self):
        ok = {'destination': DEST, 'text':'Photo',
              'attachment': {'filename':'photo.png', 'data_base64':base64.b64encode(PNG).decode()}}
        for name in ('../private', '..', 'subdir/file.pdf', 'bad\\file', 'a\n.pdf','x'*101):
            with self.subTest(name=name), self.assertRaises(ReticulumError):
                validate_message({**ok,'attachment':{**ok['attachment'],'filename':name}})
        for data in ('?', 'a', base64.b64encode(b'x'*(MAX_ATTACHMENT_BYTES+1)).decode()):
            with self.subTest(data_len=len(data)), self.assertRaises(ReticulumError):
                validate_message({**ok,'attachment':{**ok['attachment'],'data_base64':data}})
        with self.assertRaises(ReticulumError):
            validate_message({'destination':DEST,'text':'','attachment':None})
        with self.assertRaises(ReticulumError):
            validate_message({'destination':DEST,'text':''})
        with self.assertRaises(ReticulumError):
            validate_message({**ok,'share_all':True})

    def test_untrusted_lxmf_fields_do_not_become_html_or_unbounded_files(self):
        fake_lxmf = type('LXMF', (), {'FIELD_FILE_ATTACHMENTS':5})
        self.assertIsNone(lxmf_attachment({5:[['../escape',b'x']]},fake_lxmf))
        self.assertIsNone(lxmf_attachment({5:[['huge.pdf',b'x'*(MAX_ATTACHMENT_BYTES+1)]]},fake_lxmf))
        self.assertIsNone(lxmf_attachment({5:[['test.pdf','not bytes']]},fake_lxmf))
        self.assertIsNone(lxmf_attachment({6:['jpg',b'<html>evil</html>']},fake_lxmf))
        self.assertIsNone(lxmf_attachment({'not-attachments':'hello'},fake_lxmf))
        self.assertIsNone(image_mime(b'<svg onload="alert(1)">'))
        self.assertEqual(SessionAttachmentBuffer().add('untrusted.html',b'<script>x</script>')['mime'],
                         'application/octet-stream')

    def test_history_stores_only_attachment_metadata_and_survives_old_schema(self):
        with tempfile.TemporaryDirectory() as folder:
            store = ReticulumLocalStore(Path(folder)/'reticulum')
            store.set_history(True)
            ident = 'b'*32
            event = {'event_id':1,'direction':'IN','destination':DEST,'text':'a photo',
                     'utc':'2026-11-20T00:00:00Z','status':'RECEIVED_VALID_SIGNATURE',
                     'attachment':{'id':ident,'filename':'photo.png','mime':'image/png',
                                   'size':len(PNG),'available':True}}
            self.assertEqual(store.save_events('c'*32,[event]),1)
            self.assertEqual(store.messages()[0]['attachment']['filename'],'photo.png')
            self.assertNotIn(PNG,store.path.read_bytes(),'Only metadata, never raw file data, is persisted')
            store.set_history(False)
            self.assertEqual(store.messages(),[])

    def test_old_history_schema_migrates_without_erasing_messages(self):
        with tempfile.TemporaryDirectory() as folder:
            store=ReticulumLocalStore(Path(folder)/'reticulum')
            store.root.mkdir()
            with sqlite3.connect(store.path) as db:
                db.executescript('''CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                    INSERT INTO preferences VALUES('history_enabled','1');
                    CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,
                    worker_id TEXT NOT NULL,event_id INTEGER NOT NULL,direction TEXT NOT NULL,
                    destination TEXT NOT NULL,body TEXT NOT NULL,utc TEXT NOT NULL,status TEXT NOT NULL,
                    UNIQUE(worker_id,event_id));
                    INSERT INTO messages(worker_id,event_id,direction,destination,body,utc,status)
                    VALUES('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1,'IN','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    'Old message','now','RECEIVED_VALID_SIGNATURE');''')
            self.assertEqual(store.messages()[0]['text'],'Old message')
            store.set_history(True)
            self.assertEqual(store.messages()[0]['text'],'Old message')

    def test_local_download_is_in_session_and_binary_not_executable(self):
        class FakeReticulum:
            def attachment(self,token):
                if token != 'f'*32:raise ReticulumError('Unavailable','attachment_unavailable',404)
                return {'filename':'untrusted.html','mime':'application/octet-stream','data':b'<script>1</script>'}
            def close(self):pass
        with tempfile.TemporaryDirectory() as folder:
            server=create_server(Repository(Path(folder)/'app.sqlite3'),port=0)
            server.reticulum_manager=FakeReticulum()
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                def get(token):
                    connection=HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                    connection.request('GET',f'/api/reticulum/attachments/{token}?download=1',
                                       headers={'Host':f'localhost:{server.server_port}'})
                    response=connection.getresponse()
                    result=response.status,response.getheader('Content-Type'),response.getheader('Content-Disposition'),response.read()
                    connection.close()
                    return result
                success=get('f'*32)
                self.assertEqual(success[0],200)
                self.assertEqual(success[1],'application/octet-stream')
                self.assertTrue(success[2].startswith('attachment;'))
                self.assertEqual(success[3],b'<script>1</script>')
                self.assertEqual(get('bad')[0],404)
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)

    def test_mocked_lxmf_worker_sends_and_receives_real_attachment_fields(self):
        sent=[]
        class Identity:
            @staticmethod
            def from_file(_path):return Identity()
            def to_file(self,path):Path(path).write_bytes(b'private fake key');return True
            @staticmethod
            def recall(_hash):return Identity()
        class Destination:
            OUT=1;IN=0;SINGLE=2
            def __init__(self,*args):self.hash=b'Z'*16
            def set_link_established_callback(self,_callback):pass
        class Transport:
            @staticmethod
            def has_path(_address):return True
        class Source:
            hash=b'X'*16
        class Router:
            def __init__(self,**kwargs):pass
            def register_delivery_identity(self,*args,**kwargs):return Source()
            def register_delivery_callback(self, callback):self.callback=callback
            def announce(self,*args):pass
            def handle_outbound(self,message):
                sent.append(message)
                received=types.SimpleNamespace(signature_validated=True,
                    source=types.SimpleNamespace(hash=b'Y'*16),
                    content_as_string=lambda:'Received image',
                    fields={6:['png',PNG]})
                self.callback(received)
        class Message:
            DIRECT=1
            def __init__(self,destination,source,content,title,**kwargs):
                self.content=content;self.fields=kwargs.get('fields')
            def register_delivery_callback(self,callback):
                self.delivery_callback=callback
            def register_failed_callback(self,callback):
                self.failed_callback=callback
        fake_rns=types.SimpleNamespace(Reticulum=lambda **kwargs:object(),
            Identity=Identity,Destination=Destination,Transport=Transport)
        fake_lxmf=types.SimpleNamespace(LXMRouter=Router,LXMessage=Message,
            FIELD_IMAGE=6,FIELD_FILE_ATTACHMENTS=5)
        class Pipe:
            def __init__(self,commands):self.commands=iter(commands);self.answers=[]
            def poll(self,_timeout):return True
            def recv(self):return next(self.commands)
            def send(self,payload):self.answers.append(payload)
            def close(self):pass
        outgoing={'destination':DEST,'text':'','attachment':{'filename':'a.png','data':PNG}}
        pipe=Pipe([{'action':'send','message':outgoing},{'action':'messages'},
                   {'action':'attachment','message':{'id':'TO_REPLACE'}},{'action':'stop'}])
        # Return an actual received token from a prior 'messages' response.
        def receive_next():
            command=next(pipe.commands)
            if command['action']=='attachment':
                incoming=next(row for row in pipe.answers[-1]['messages'] if row['direction']=='IN')
                command['message']['id']=incoming['attachment']['id']
            return command
        pipe.recv=receive_next
        with tempfile.TemporaryDirectory() as folder, patch.dict(sys.modules,{'RNS':fake_rns,'LXMF':fake_lxmf}):
            reticulum_worker(pipe,Path(folder)/'rnsdata')
        self.assertTrue(sent)
        self.assertEqual(sent[0].fields,{6:['png',PNG]})
        inbox=next(answer for answer in pipe.answers if 'messages' in answer)
        self.assertEqual(len(inbox['messages']),2)
        incoming=next(row for row in inbox['messages'] if row['direction']=='IN')
        self.assertEqual(incoming['attachment']['filename'],'received-image.png')
        self.assertTrue(incoming['attachment']['available'])
        downloaded=next(answer for answer in pipe.answers if 'data' in answer)
        self.assertEqual(downloaded['data'],PNG)


if __name__=='__main__':unittest.main()
