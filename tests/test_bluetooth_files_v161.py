"""v0.2.166 simulated paired Bluetooth Classic file exchange; no radio required."""
import base64
from http.client import HTTPConnection
from pathlib import Path
import queue
import socket
import tempfile
import threading
import time
import unittest
from unittest import mock

from openrf.bluetooth_files import (BluetoothFileManager, BluetoothFileError,
    check_address, decode_file, MAX_FILE, MAGIC, _high_security, _packet, _read_packet)
from openrf.server import create_server
from openrf.storage import Repository


SENDER = 'AA:BB:CC:DD:EE:01'
RECEIVER = 'AA:BB:CC:DD:EE:02'


def upload(data=b'short file', filename='field-note.pdf', address=RECEIVER):
    return {'address': address, 'filename': filename,
            'data_base64': base64.b64encode(data).decode(), 'confirm': True}


class FakeBluetoothSocket:
    def __init__(self, wire, kind, raw=None):
        self.wire, self.kind, self.raw = wire, kind, raw
        self.closed, self.secured, self.timeout = False, False, 0.8

    def setsockopt(self, _level, _opt, data):
        self.secured = data[0] == 3

    def getsockopt(self, _level, _opt, _size):
        return bytes([3, 0]) if self.secured else bytes([1, 0])

    def settimeout(self, value):
        self.timeout = value
        if self.raw: self.raw.settimeout(value)

    def bind(self, address):
        self.wire.bound = address

    def listen(self, _backlog):
        self.wire.listener = self

    def accept(self):
        if self.closed: raise OSError('listener closed')
        try:return self.wire.pending.get(timeout=0.08)
        except queue.Empty:raise socket.timeout()

    def connect(self, address):
        if address != (RECEIVER, 22):raise OSError('Wrong receiver')
        lhs, rhs = socket.socketpair()
        self.raw = lhs
        self.raw.settimeout(self.timeout)
        incoming = FakeBluetoothSocket(self.wire, 'accepted', rhs)
        self.wire.pending.put((incoming, (SENDER, 22)))

    def sendall(self, data):return self.raw.sendall(data)
    def send(self, data):return self.raw.send(data)
    def recv(self, size):return self.raw.recv(size)
    def close(self):
        self.closed = True
        if self.raw:self.raw.close()

    def __enter__(self):return self
    def __exit__(self, *_):self.close()


class FakeWire:
    def __init__(self):
        self.pending = queue.Queue()
        self.listener = None
        self.bound = None

    def factory(self, *_):
        return FakeBluetoothSocket(self, 'listener' if not self.listener else 'client')


class BluetoothFileTests(unittest.TestCase):
    def test_address_consent_size_and_name_bounds(self):
        self.assertEqual(check_address(SENDER.lower()), SENDER)
        self.assertEqual(decode_file(upload())[1:], ('field-note.pdf', b'short file'))
        for value in ('bad', '00:00:00:00:00:00:00', '00:00:00:00:00:GG'):
            with self.assertRaises(BluetoothFileError):check_address(value)
        for payload in (upload(b''), upload(b'z'*(MAX_FILE+1)), upload(filename='../x'),
                        {**upload(), 'confirm': False}, {**upload(), 'unexpected': 1},
                        {**upload(), 'data_base64': '@@'}) :
            with self.assertRaises(BluetoothFileError):decode_file(payload)

    def test_high_security_must_never_fall_back_to_insecure(self):
        class Insecure:
            def setsockopt(self, *args):pass
            def getsockopt(self, *args):return bytes([1, 0])
        with self.assertRaises(BluetoothFileError):_high_security(Insecure())
        class Unsupported:
            def setsockopt(self, *args):raise OSError('unsupported')
        with self.assertRaises(BluetoothFileError):_high_security(Unsupported())

    def test_packet_rejects_oversized_and_invalid_header(self):
        a, b = socket.socketpair()
        try:
            a.sendall(_packet({'name':'test'}))
            self.assertEqual(_read_packet(b, time.monotonic()+1, threading.Event()), {'name':'test'})
            a.sendall((9999).to_bytes(4,'big'))
            with self.assertRaises(BluetoothFileError):_read_packet(b, time.monotonic()+1, threading.Event())
        finally:a.close();b.close()

    def test_unsupported_linux_adapter_is_honest_not_simulated(self):
        manager=BluetoothFileManager()
        manager._supported=lambda:False
        try:
            self.assertFalse(manager.status()['supported'])
            with self.assertRaises(BluetoothFileError) as exc:
                manager.arm({'address':SENDER,'confirm':True})
            self.assertEqual(exc.exception.code,'bluetooth_unavailable')
        finally:manager.close()

    def test_manual_pairing_required_without_touching_bluez(self):
        manager=BluetoothFileManager()
        manager._supported=lambda:True
        manager._ctl=lambda args:'Paired: no\nTrusted: yes\n'
        try:
            with self.assertRaises(BluetoothFileError) as err:
                manager.arm({'address':SENDER,'confirm':True})
            self.assertEqual(err.exception.code,'peer_not_trusted')
            with self.assertRaises(BluetoothFileError):manager.send(upload())
        finally:manager.close()

    def test_two_peer_transfer_with_checksum_receipt_and_manual_download(self):
        wire=FakeWire()
        receiver=BluetoothFileManager(socket_factory=wire.factory)
        sender=BluetoothFileManager(socket_factory=wire.factory)
        for manager in (receiver,sender):
            manager._require=lambda:None
            manager._paired=lambda _:None
            manager._supported=lambda:True
            manager._local_address_checked=time.monotonic()
        payload=b'%PDF-1.4\n' + b'a'*45000
        with mock.patch.object(socket,'AF_BLUETOOTH',31,create=True), \
             mock.patch.object(socket,'BTPROTO_RFCOMM',3,create=True):
            try:
                self.assertEqual(receiver.arm({'address':SENDER,'confirm':True})['status'],'RECEIVE_ARMED')
                self.assertEqual(wire.bound,('00:00:00:00:00:00',22))
                started=sender.send(upload(payload))
                self.assertEqual(started['status'],'CONNECTING_NOT_DELIVERED')
                deadline=time.monotonic()+4
                while time.monotonic()<deadline:
                    outgoing=sender.status()['transfers'][0]
                    if outgoing['status'] in ('ACKNOWLEDGED','FAILED'):break
                    time.sleep(0.02)
                self.assertEqual(outgoing['status'],'ACKNOWLEDGED',outgoing)
                inbox=receiver.status()['inbox']
                self.assertEqual(inbox['size'],len(payload))
                self.assertNotIn('data',inbox,'Raw file must not leak through status')
                self.assertEqual(receiver.download(inbox['id'])['data'],payload)
                receiver.forget({})
                self.assertIsNone(receiver.status()['inbox'])
                with self.assertRaises(BluetoothFileError):receiver.download(inbox['id'])
            finally:sender.close();receiver.close()

    def test_wrong_sender_and_tampered_bytes_never_create_download(self):
        wire=FakeWire()
        receiver=BluetoothFileManager(socket_factory=wire.factory)
        receiver._require=lambda:None
        receiver._paired=lambda _:None
        receiver._supported=lambda:True
        receiver._local_address_checked=time.monotonic()
        with mock.patch.object(socket,'AF_BLUETOOTH',31,create=True), \
             mock.patch.object(socket,'BTPROTO_RFCOMM',3,create=True):
            try:
                receiver.arm({'address':SENDER,'confirm':True})
                # Even a fully secure link with the wrong Bluetooth address is not accepted.
                lhs,rhs=socket.socketpair()
                wire.pending.put((FakeBluetoothSocket(wire,'accepted',rhs),('AA:00:00:00:00:01',22)))
                lhs.close()
                time.sleep(0.10)
                self.assertIsNone(receiver.status()['inbox'])
                # A recognized peer whose payload differs from declared SHA-256 is also refused.
                lhs,rhs=socket.socketpair()
                wire.pending.put((FakeBluetoothSocket(wire,'accepted',rhs),(SENDER,22)))
                lhs.sendall(_packet({'magic':MAGIC,'filename':'bad.bin','size':3,'sha256':'0'*64})+b'bad')
                lhs.close()
                time.sleep(0.15)
                self.assertIsNone(receiver.status()['inbox'])
                self.assertTrue(receiver.status()['receive_seconds']>0,
                    'Invalid/corrupt offers must not use up the one-file receive window')
                receiver.cancel({})
                self.assertEqual(receiver.status()['receive_seconds'],0)
            finally:receiver.close()

    def test_loopback_api_requires_consent_and_binary_download(self):
        with tempfile.TemporaryDirectory() as temp:
            server=create_server(Repository(Path(temp)/'db.sqlite3'),port=0)
            token='a'*32
            manager=server.bluetooth_file_manager
            manager._inbox={'id':token,'filename':'private-file.pdf','size':4,'peer':SENDER,
                            'sha256':'c'*64,'data':b'%PDF'}
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                client=HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                host={'Host':f'localhost:{server.server_port}'}
                client.request('GET','/api/bluetooth/status',headers=host)
                response=client.getresponse()
                self.assertEqual(response.status,200)
                self.assertIn(b'"mode":"BLUETOOTH_CLASSIC_RFCOMM_OPENRF_ONLY"',response.read())
                client.request('GET','/static/bluetooth-files.js',headers=host)
                response=client.getresponse()
                self.assertEqual(response.status,200)
                self.assertIn(b'bluetooth-file-panel',response.read())
                client.request('GET','/api/bluetooth/download/'+token,headers=host)
                response=client.getresponse()
                self.assertEqual(response.status,200)
                self.assertEqual(response.getheader('Content-Type'),'application/octet-stream')
                self.assertIn('attachment;',response.getheader('Content-Disposition'))
                self.assertEqual(response.read(),b'%PDF')
                client.request('POST','/api/bluetooth/cancel',body='{}',headers={**host,'Content-Type':'application/json'})
                response=client.getresponse();self.assertEqual(response.status,403);response.read()
                client.request('POST','/api/bluetooth/cancel',body='{}',headers={**host,'Content-Type':'application/json','X-OpenRF-Bluetooth-Consent':'cancel'})
                response=client.getresponse();self.assertEqual(response.status,200);response.read()
                client.close()
            finally:server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__':unittest.main()
