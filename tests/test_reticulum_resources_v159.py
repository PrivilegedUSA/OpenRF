"""v0.2.159: conservative Resource transfer, explicit receive gate and HTTP bounds."""
import base64
import hashlib
from http.client import HTTPConnection
import io
from pathlib import Path
import tempfile
import threading
import types
import unittest

from openrf.reticulum_resources import (ResourceSession, validate_resource_offer,
                                         validate_received_resource, MAX_RESOURCE_BYTES)
from openrf.reticulum_lan import ReticulumError
from openrf.server import create_server
from openrf.storage import Repository


TARGET = 'b' * 32
PAYLOAD = b'document' * 1234


class FakeDestination:
    IN = 1
    OUT = 2
    SINGLE = 3

    def __init__(self, _identity, _direction, _scope, *_parts):
        self.hash = bytes.fromhex(TARGET)

    def set_link_established_callback(self, callback):
        self.on_link = callback

    def announce(self):
        self.announced = True


class FakeLink:
    ACCEPT_APP = 'accept_app'
    def __init__(self, destination):
        self.destination = destination
    def set_resource_strategy(self, strategy):self.strategy = strategy
    def set_resource_callback(self, callback):self.accept = callback
    def set_resource_started_callback(self, callback):self.started = callback
    def set_resource_concluded_callback(self, callback):self.received = callback
    def set_link_established_callback(self, callback):self.established = callback
    def set_link_closed_callback(self, callback):self.closed = callback
    def teardown(self):self.torn_down = True


class FakeResource:
    COMPLETE = 'complete'
    def __init__(self, data, link, **kwargs):
        self.data = io.BytesIO(data)
        self.payload = data
        self.link = link
        self.metadata = kwargs['metadata']
        self.callback = kwargs['callback']
        self.progress_callback = kwargs['progress_callback']
        self.status = 'pending'
        self.progress = 0
    def get_progress(self):return self.progress
    def get_data_size(self):return len(self.payload)
    def get_transfer_size(self):return len(self.payload)
    def cancel(self):self.status = 'canceled'


class FakeTransport:
    path = True
    @staticmethod
    def has_path(_target):return FakeTransport.path
    @staticmethod
    def request_path(_target):FakeTransport.requested = True


RNS = types.SimpleNamespace(Destination=FakeDestination, Link=FakeLink,
                            Resource=FakeResource, Transport=FakeTransport,
                            Identity=types.SimpleNamespace(recall=lambda _target: object()))


class ResourceTransferTests(unittest.TestCase):
    def offer(self, data=PAYLOAD, name='small.pdf'):
        return {'destination': TARGET, 'filename':name,
                'data_base64':base64.b64encode(data).decode('ascii'), 'confirm': True}

    def test_transfer_input_rejects_oversize_bad_address_missing_confirmation_and_path(self):
        self.assertEqual(validate_resource_offer(self.offer())['data'], PAYLOAD)
        for changes in ({'confirm': False}, {'destination':'short'}, {'filename':'../file'},
                        {'data_base64':'invalid!'}, {'data_base64':base64.b64encode(b'x'*(MAX_RESOURCE_BYTES+1)).decode('ascii')}):
            payload = {**self.offer(), **changes}
            with self.assertRaises(ValueError):validate_resource_offer(payload)

    def test_receiver_requires_one_manual_window_and_rejects_oversize(self):
        now=[100.0]
        session = ResourceSession(RNS, object(), clock=lambda:now[0])
        link=FakeLink(session.destination)
        session.destination.on_link(link)
        inbound=FakeResource(PAYLOAD,link, metadata={'openrf_file_v1':1,'filename':'ok.pdf',
            'size':len(PAYLOAD),'sha256':hashlib.sha256(PAYLOAD).hexdigest()},
            callback=lambda _:None,progress_callback=lambda _:None)
        self.assertEqual(link.strategy,FakeLink.ACCEPT_APP)
        self.assertFalse(link.accept(inbound), 'Nothing is accepted before consent')
        session.arm(True)
        self.assertEqual(session.snapshot()['receiving_armed_seconds'],300)
        self.assertTrue(link.accept(inbound))
        self.assertFalse(link.accept(inbound), 'The window permits only one resource')
        inbound.status=FakeResource.COMPLETE
        link.started(inbound)
        link.received(inbound)
        completed=session.snapshot()['transfers'][0]
        self.assertEqual(completed['status'],'RECEIVED_READY')
        self.assertEqual(session.download(completed['id'])['data'],PAYLOAD)
        self.assertEqual(session.snapshot()['receiving_armed_seconds'],0)
        session.arm(True);now[0]+=301
        self.assertFalse(link.accept(inbound), 'The authorization expired')
        session.arm(True)
        too_big=FakeResource(b'x'*(MAX_RESOURCE_BYTES+1),link,
                             metadata=inbound.metadata,callback=lambda _:None,
                             progress_callback=lambda _:None)
        self.assertFalse(link.accept(too_big))

    def test_hash_and_metadata_integrity_not_just_transport_completion(self):
        meta={'openrf_file_v1':1,'filename':'report.pdf','size':len(PAYLOAD),
              'sha256':hashlib.sha256(PAYLOAD).hexdigest()}
        self.assertEqual(validate_received_resource(meta,PAYLOAD),'report.pdf')
        for invalid in ({**meta,'sha256':'0'*64},{**meta,'size':len(PAYLOAD)+1},
                        {**meta,'filename':'../../secret'},{**meta,'openrf_file_v1':2}):
            with self.assertRaises(ValueError):validate_received_resource(invalid,PAYLOAD)

    def test_sender_reports_link_connecting_then_actual_resource_completion(self):
        FakeTransport.path=False
        try:
            session=ResourceSession(RNS,object())
            offer=validate_resource_offer(self.offer())
            self.assertEqual(session.send(offer)['status'],'PATH_REQUESTED_NOT_SENT')
            self.assertEqual(session.snapshot()['transfers'],[])
        finally:
            FakeTransport.path=True
        result=session.send(offer)
        self.assertEqual(result['status'],'LINK_CONNECTING_NOT_SENT')
        transfer_id=result['id']
        outgoing=session.outgoing[1]
        outgoing.established(outgoing)
        self.assertEqual(session.snapshot()['transfers'][0]['status'],'TRANSFERRING')
        resource=session.outgoing[2]
        self.assertEqual(resource.metadata['sha256'],hashlib.sha256(PAYLOAD).hexdigest())
        resource.progress=.5;resource.progress_callback(resource)
        self.assertEqual(session.snapshot()['transfers'][0]['progress'],.5)
        resource.status=FakeResource.COMPLETE;resource.callback(resource)
        self.assertEqual(session.snapshot()['transfers'][0]['status'],'SENT_COMPLETE')
        with self.assertRaises(ValueError):session.cancel(transfer_id)

    def test_cancel_does_not_claim_delivery(self):
        session=ResourceSession(RNS,object())
        result=session.send(validate_resource_offer(self.offer()))
        session.cancel(result['id'])
        self.assertEqual(session.snapshot()['transfers'][0]['status'],'CANCELED')
        self.assertTrue(session.outgoing[1].torn_down)

    def test_local_api_bounds_offline_status_and_opaque_download(self):
        class FakeManager:
            def close(self):pass
            def files_status(self):return {'enabled':False,'transfers':[],'receiving_armed_seconds':0}
            def files_download(self,ident):
                if ident != 'f'*32:raise ReticulumError('Not found','resource_unavailable',404)
                return {'filename':'report.pdf','data':b'%PDF-1.4'}
        with tempfile.TemporaryDirectory() as tmp:
            server=create_server(Repository(Path(tmp)/'db.sqlite3'),port=0)
            server.reticulum_manager=FakeManager()
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                def get(path):
                    connection=HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                    connection.request('GET',path,headers={'Host':f'localhost:{server.server_port}'})
                    response=connection.getresponse()
                    result=(response.status,response.getheader('Content-Type'),
                            response.getheader('Content-Disposition'),response.read())
                    connection.close();return result
                self.assertEqual(get('/api/reticulum/files/status')[0],200)
                self.assertEqual(get('/static/reticulum-files.js')[0],200)
                success=get('/api/reticulum/files/download/'+'f'*32)
                self.assertEqual(success[0],200)
                self.assertEqual(success[1],'application/octet-stream')
                self.assertIn('attachment;',success[2]);self.assertEqual(success[3],b'%PDF-1.4')
                self.assertEqual(get('/api/reticulum/files/download/bad')[0],404)
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__':unittest.main()
