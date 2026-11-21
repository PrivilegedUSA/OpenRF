"""Explicit paired-device Bluetooth Classic RFCOMM file exchange.

Private OpenRF-to-OpenRF protocol, *not* Bluetooth OBEX, BLE advertisements or
generic phone file sharing. Requires authenticated/encrypted RFCOMM security;
never silently falls back to plaintext if the kernel or adapter lacks support.
Nothing listens until the local operator arms one exact peer for five minutes.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time

from .reticulum_attachments import filename_valid


MAX_FILE = 2 * 1024 * 1024
CHANNEL = 22
MAGIC = 'openrf.bt.files.v1'
MAX_HEADER = 512
WINDOW_SECONDS = 300
TRANSFER_SECONDS = 150
MAC = re.compile(r'(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\Z')
# Linux UAPI bluetooth.h: SOL_BLUETOOTH=274, BT_SECURITY=4,
# BT_SECURITY_HIGH=3 (authenticated and encrypted Classic link).
SOL_BLUETOOTH = 274
BT_SECURITY = 4
BT_SECURITY_HIGH = 3


class BluetoothFileError(Exception):
    def __init__(self, message, code='bluetooth_unavailable', status=503):
        super().__init__(message)
        self.code, self.status = code, status


def check_address(value):
    if not isinstance(value, str) or not MAC.fullmatch(value):
        raise BluetoothFileError('Enter a 17-character paired Bluetooth MAC address.', 'invalid_peer', 400)
    return value.upper()


def decode_file(payload):
    if not isinstance(payload, dict) or set(payload) != {'address', 'filename', 'data_base64', 'confirm'} or payload['confirm'] is not True:
        raise BluetoothFileError('Confirm one recipient and selected file.', 'invalid_send', 400)
    address = check_address(payload['address'])
    try:
        name = filename_valid(payload['filename'])
    except ValueError as exc:
        raise BluetoothFileError(str(exc), 'invalid_name', 400) from exc
    encoded = payload['data_base64']
    if not isinstance(encoded, str) or len(encoded) > ((MAX_FILE + 2) // 3) * 4:
        raise BluetoothFileError('Choose one file of 1 byte–2 MiB.', 'file_too_large', 413)
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise BluetoothFileError('Invalid Base64 file bytes.', 'invalid_file', 400) from exc
    if not 1 <= len(data) <= MAX_FILE:
        raise BluetoothFileError('Choose one file of 1 byte–2 MiB.', 'file_too_large', 413)
    return address, name, data


def _packet(value):
    data = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    if not 1 <= len(data) <= MAX_HEADER:
        raise BluetoothFileError('File header exceeded protocol limit.', 'invalid_header', 400)
    return struct.pack('!I', len(data)) + data


def _exact(conn, count, deadline, cancel):
    raw = bytearray()
    while len(raw) < count:
        if cancel.is_set():
            raise BluetoothFileError('Transfer cancelled.', 'cancelled', 409)
        if time.monotonic() > deadline:
            raise BluetoothFileError('Bluetooth transfer timed out.', 'timeout', 504)
        try:
            part = conn.recv(min(16384, count - len(raw)))
        except socket.timeout:
            continue
        if not part:
            raise BluetoothFileError('Peer disconnected during transfer.', 'peer_disconnected', 409)
        raw.extend(part)
    return bytes(raw)


def _read_packet(conn, deadline, cancel):
    count = struct.unpack('!I', _exact(conn, 4, deadline, cancel))[0]
    if not 1 <= count <= MAX_HEADER:
        raise BluetoothFileError('Invalid Bluetooth file header length.', 'invalid_header', 400)
    try:
        value = json.loads(_exact(conn, count, deadline, cancel))
    except (ValueError, UnicodeError) as exc:
        raise BluetoothFileError('Unreadable peer header.', 'invalid_header', 400) from exc
    if not isinstance(value, dict):
        raise BluetoothFileError('Expected a file header object.', 'invalid_header', 400)
    return value


def _high_security(conn):
    try:
        conn.setsockopt(SOL_BLUETOOTH, BT_SECURITY, struct.pack('BB', BT_SECURITY_HIGH, 0))
        security = conn.getsockopt(SOL_BLUETOOTH, BT_SECURITY, 2)
        if not security or security[0] < BT_SECURITY_HIGH:
            raise OSError('RFCOMM link security below authenticated/encrypted level')
    except (OSError, TypeError, ValueError) as exc:
        raise BluetoothFileError('This Bluetooth adapter/kernel cannot confirm authenticated encrypted RFCOMM; transfer refused.', 'bluetooth_security', 503) from exc


class BluetoothFileManager:
    def __init__(self, socket_factory=None, command=None):
        self._socket_factory = socket_factory or socket.socket
        self._command = command or subprocess.run
        self._lock = threading.RLock()
        self._cancel = threading.Event()
        self._listener = None
        self._connection = None
        self._receiver = None
        self._worker = None
        self._receive_until = 0.0
        self._expected_peer = None
        self._busy = None
        self._recent = []
        self._inbox = None
        self._closed = False
        self._local_address = None
        self._local_address_checked = 0.0

    def _supported(self):
        return (sys.platform.startswith('linux') and
                all(hasattr(socket, name) for name in ('AF_BLUETOOTH', 'BTPROTO_RFCOMM')) and
                shutil.which('bluetoothctl') is not None)

    def _require(self):
        if not self._supported():
            raise BluetoothFileError('Linux BlueZ Bluetooth Classic (RFCOMM) and bluetoothctl are required. WSL without a passed-through adapter cannot transfer files.')

    def _ctl(self, args):
        self._require()
        try:
            result = self._command(['bluetoothctl', *args], capture_output=True,
                                   text=True, timeout=5, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise BluetoothFileError('BlueZ is not responding. Check the Linux Bluetooth service and adapter.') from exc
        if result.returncode != 0:
            raise BluetoothFileError('Bluetooth controller unavailable or peer not known to BlueZ.')
        return result.stdout

    def _paired(self, address):
        # Never pair, trust, enable discovery, or change the OS automatically.
        info = self._ctl(['info', address])
        paired = re.search(r'^\s*Paired:\s*yes\s*$', info, re.MULTILINE)
        trusted = re.search(r'^\s*Trusted:\s*yes\s*$', info, re.MULTILINE)
        if not paired or not trusted:
            raise BluetoothFileError('Pair with and trust this exact device using Linux Bluetooth settings first.', 'peer_not_trusted', 403)

    def _socket(self):
        self._require()
        try:
            conn = self._socket_factory(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
        except OSError as exc:
            raise BluetoothFileError('Could not create a Linux Bluetooth RFCOMM socket; check Classic support and adapter.', 'no_rfcomm') from exc
        try:
            _high_security(conn)
            conn.settimeout(0.8)
            return conn
        except Exception:
            conn.close()
            raise

    def _recent_add(self, item):
        with self._lock:
            self._recent.insert(0, item)
            del self._recent[8:]

    def status(self):
        if self._supported() and time.monotonic() - self._local_address_checked > 30:
            try:
                match = re.search(r'\bController\s+((?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2})\b',
                                  self._ctl(['show']))
                address = match.group(1).upper() if match else None
            except BluetoothFileError:
                address = None
            with self._lock:
                self._local_address, self._local_address_checked = address, time.monotonic()
        with self._lock:
            return {'supported': self._supported(), 'mode': 'BLUETOOTH_CLASSIC_RFCOMM_OPENRF_ONLY',
                'pairing': 'Manual OS pairing and trust required before transfer; no BLE file transfer or auto discovery.',
                'channel': CHANNEL, 'limit_bytes': MAX_FILE, 'local_address': self._local_address,
                'receive_seconds': max(0, int(self._receive_until - time.monotonic())),
                'receive_peer': self._expected_peer if self._receive_until > time.monotonic() else None,
                'busy': bool(self._busy), 'transfers': [dict(x) for x in self._recent],
                'inbox': ({key: value for key, value in self._inbox.items() if key != 'data'} if self._inbox else None)}

    def arm(self, payload):
        if not isinstance(payload, dict) or set(payload) != {'address', 'confirm'} or payload['confirm'] is not True:
            raise BluetoothFileError('Confirm the exact paired sender before receiving.', 'invalid_arm', 400)
        peer = check_address(payload['address'])
        self._paired(peer)
        with self._lock:
            if self._closed or self._receiver and self._receiver.is_alive() or self._busy:
                raise BluetoothFileError('Another Bluetooth receive or send is active. Cancel first.', 'busy', 409)
            self._cancel = threading.Event()
            listener = self._socket()
            try:
                listener.bind(('00:00:00:00:00:00', CHANNEL))
                listener.listen(1)
            except OSError as exc:
                listener.close()
                raise BluetoothFileError('Could not open Bluetooth RFCOMM channel 22. Another service may own it.', 'listener_unavailable', 503) from exc
            self._listener = listener
            self._expected_peer = peer
            self._receive_until = time.monotonic() + WINDOW_SECONDS
            self._receiver = threading.Thread(target=self._receive_loop, daemon=True, name='openrf-bluetooth-receive')
            self._receiver.start()
            return {'status': 'RECEIVE_ARMED', 'note': 'One file from this paired device only, for five minutes; no automatic saving.'}

    def _receive_loop(self):
        with self._lock:
            listener, cancel, peer, deadline = self._listener, self._cancel, self._expected_peer, self._receive_until
        try:
            while not cancel.is_set() and time.monotonic() < deadline:
                try:
                    conn, address = listener.accept()
                except socket.timeout:
                    continue
                except OSError:
                    break
                with conn:
                    if cancel.is_set() or not address or str(address[0]).upper() != peer:
                        continue
                    try:
                        _high_security(conn)
                        conn.settimeout(0.8)
                        deadline_transfer = time.monotonic() + TRANSFER_SECONDS
                        header = _read_packet(conn, deadline_transfer, cancel)
                        if set(header) != {'magic', 'filename', 'size', 'sha256'} or header['magic'] != MAGIC:
                            raise BluetoothFileError('Unsupported OpenRF Bluetooth protocol.', 'invalid_header', 400)
                        filename = filename_valid(header['filename'])
                        size = header['size']
                        digest = header['sha256']
                        if type(size) is not int or not 1 <= size <= MAX_FILE or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
                            raise BluetoothFileError('Invalid incoming file metadata.', 'invalid_file', 400)
                        item = {'id': secrets.token_hex(16), 'filename': filename, 'size': size,
                                'peer': peer, 'direction': 'IN', 'status': 'RECEIVING', 'progress': 0}
                        self._recent_add(item)
                        raw = bytearray()
                        while len(raw) < size:
                            raw.extend(_exact(conn, min(16384, size - len(raw)), deadline_transfer, cancel))
                            with self._lock:
                                item['progress'] = round(len(raw) / size, 4)
                        if hashlib.sha256(raw).hexdigest() != digest:
                            raise BluetoothFileError('Incoming file checksum failed; nothing was saved.', 'checksum_failure', 400)
                        with self._lock:
                            self._inbox = {'id': item['id'], 'filename': filename,
                                           'size': size, 'peer': peer, 'sha256': digest, 'data': bytes(raw)}
                            item['status'] = 'RECEIVED_READY'; item['progress'] = 1
                        conn.sendall(_packet({'status': 'received', 'sha256': digest}))
                        return
                    except (BluetoothFileError, ValueError, OSError) as exc:
                        with self._lock:
                            if 'item' in locals() and item['status'] == 'RECEIVING':
                                item['status'] = 'FAILED'; item['error'] = str(exc)
                        # Invalid/off-path callers cannot consume the one-shot receive gate.
                        continue
        finally:
            with self._lock:
                if self._listener is listener:
                    self._listener = None
                    self._receive_until = 0
                    self._expected_peer = None
                try: listener.close()
                except OSError: pass

    def send(self, payload):
        peer, filename, data = decode_file(payload)
        self._paired(peer)
        with self._lock:
            if self._closed or self._busy or self._receiver and self._receiver.is_alive():
                raise BluetoothFileError('Another Bluetooth operation is active.', 'busy', 409)
            self._cancel = threading.Event()
            digest = hashlib.sha256(data).hexdigest()
            item = {'id': secrets.token_hex(16), 'filename': filename, 'size': len(data),
                    'peer': peer, 'direction': 'OUT', 'status': 'CONNECTING', 'progress': 0}
            self._recent_add(item)
            self._busy = item['id']
            self._worker = threading.Thread(target=self._send_loop,
                args=(peer, data, digest, item, self._cancel), daemon=True, name='openrf-bluetooth-send')
            self._worker.start()
            return {'status': 'CONNECTING_NOT_DELIVERED', 'id': item['id'],
                    'note': 'Trying the explicitly paired peer. Sender success requires its file-checksum acknowledgement.'}

    def _send_loop(self, peer, data, digest, item, cancel):
        conn = None
        try:
            conn = self._socket()
            with self._lock:
                self._connection = conn
            conn.settimeout(12)
            conn.connect((peer, CHANNEL))
            _high_security(conn)
            conn.settimeout(0.8)
            deadline = time.monotonic() + TRANSFER_SECONDS
            conn.sendall(_packet({'magic': MAGIC, 'filename': item['filename'],
                                  'size': len(data), 'sha256': digest}))
            with self._lock: item['status'] = 'TRANSFERRING'
            sent = 0
            while sent < len(data):
                if cancel.is_set() or time.monotonic() > deadline:
                    raise BluetoothFileError('Transfer cancelled or timed out.', 'cancelled', 409)
                try:
                    count = conn.send(data[sent:sent + 16384])
                except socket.timeout:
                    continue
                if count <= 0:
                    raise BluetoothFileError('Bluetooth peer disconnected.', 'peer_disconnected', 409)
                sent += count
                with self._lock: item['progress'] = round(sent / len(data), 4)
            ack = _read_packet(conn, deadline, cancel)
            if ack != {'status': 'received', 'sha256': digest}:
                raise BluetoothFileError('Peer did not confirm an intact file; delivery unverified.', 'no_receipt', 409)
            with self._lock:
                item['status'] = 'ACKNOWLEDGED'; item['progress'] = 1
        except (BluetoothFileError, OSError, ValueError) as exc:
            with self._lock:
                item['status'] = 'CANCELLED' if cancel.is_set() else 'FAILED'
                item['error'] = str(exc)
        finally:
            if conn:
                try: conn.close()
                except OSError: pass
            with self._lock:
                self._connection = None
                self._busy = None

    def cancel(self, payload):
        if payload != {}:
            raise BluetoothFileError('Cancel accepts no options.', 'invalid_cancel', 400)
        with self._lock:
            self._cancel.set()
            self._receive_until = 0
            self._expected_peer = None
            for conn in (self._listener, self._connection):
                if conn:
                    try: conn.close()
                    except OSError: pass
            return {'status': 'CANCEL_REQUESTED', 'note': 'Receiving disarmed and active transfer interrupted; already downloaded files remain yours.'}

    def download(self, token):
        with self._lock:
            if not self._inbox or not isinstance(token, str) or token != self._inbox['id']:
                raise BluetoothFileError('No such current-session received file.', 'file_missing', 404)
            return dict(self._inbox)

    def forget(self, payload):
        if payload != {}:
            raise BluetoothFileError('Discard accepts no options.', 'invalid_discard', 400)
        with self._lock:
            self._inbox = None
            return {'status': 'DISCARDED', 'note': 'Received file bytes removed from session memory.'}

    def close(self):
        with self._lock:
            self._closed = True
            self.cancel({})
            self._inbox = None
