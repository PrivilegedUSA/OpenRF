"""Opt-in, session-only peer file transfers using Reticulum Resource.

Separate ``openrf.files`` destination: an LXMF address is NOT a file address.
No resource is accepted unless the user has armed a one-file receive window.
Reticulum itself may use temporary spool files; OpenRF never saves a received
file permanently until the operator explicitly downloads it.
"""
from __future__ import annotations

import base64
import binascii
from collections import OrderedDict
import hashlib
import re
import secrets
import threading
import time

from .reticulum_attachments import filename_valid, image_mime


MAX_RESOURCE_BYTES = 2 * 1024 * 1024
MAX_SESSION_BYTES = 8 * 1024 * 1024
RECEIVE_WINDOW_SECONDS = 300
ADDRESS = re.compile(r'[0-9a-fA-F]{32}\Z')
TOKEN = re.compile(r'[0-9a-f]{32}\Z')
SHA256 = re.compile(r'[0-9a-f]{64}\Z')
FINAL = frozenset({'RECEIVED_READY', 'SENT_COMPLETE', 'FAILED_TRANSFER',
                   'FAILED_LINK', 'FAILED_VALIDATION', 'CANCELED'})


def validate_resource_offer(body):
    if not isinstance(body, dict) or set(body) != {'destination', 'filename', 'data_base64', 'confirm'} or body['confirm'] is not True:
        raise ValueError('Select one file and explicitly confirm the recipient file address.')
    target = body['destination']
    if not isinstance(target, str) or not ADDRESS.fullmatch(target):
        raise ValueError('Recipient file address must be exactly 32 hexadecimal characters (not an LXMF address).')
    name = filename_valid(body['filename'])
    encoded = body['data_base64']
    if not isinstance(encoded, str) or len(encoded) > ((MAX_RESOURCE_BYTES + 2) // 3) * 4:
        raise ValueError('A peer file transfer is limited to 2 MiB in this release.')
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError('Malformed file content.') from exc
    if not 1 <= len(data) <= MAX_RESOURCE_BYTES:
        raise ValueError('Choose one nonempty file no larger than 2 MiB.')
    return {'destination': target.lower(), 'filename': name, 'data': data}


def validate_received_resource(metadata, data):
    """Reject files with missing/ambiguous metadata or a mismatched SHA-256."""
    if not isinstance(metadata, dict) or set(metadata) != {'openrf_file_v1', 'filename', 'size', 'sha256'}:
        raise ValueError('Not an OpenRF file transfer.')
    if metadata['openrf_file_v1'] != 1 or type(metadata['size']) is not int:
        raise ValueError('Unsupported file transfer metadata.')
    name = filename_valid(metadata['filename'])
    digest = metadata['sha256']
    if not isinstance(digest, str) or not SHA256.fullmatch(digest):
        raise ValueError('Missing SHA-256 digest.')
    if not isinstance(data, bytes) or not 1 <= len(data) <= MAX_RESOURCE_BYTES or len(data) != metadata['size']:
        raise ValueError('Received file size does not match the offer.')
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Received file checksum mismatch.')
    return name


class ResourceSession:
    """Owns one explicit outbound transfer, one inbound slot and bounded memory."""

    def __init__(self, rns, identity, clock=time.monotonic):
        self.rns = rns
        self.clock = clock
        self.lock = threading.RLock()
        self.armed_until = 0.0
        self.incoming = None
        self.outgoing = None
        self.records = OrderedDict()
        self.blobs = OrderedDict()
        self.stored_bytes = 0
        self.destination = rns.Destination(identity, rns.Destination.IN, rns.Destination.SINGLE,
                                           'openrf', 'files')
        self.destination.set_link_established_callback(self._inbound_link)

    @property
    def address(self):
        return self.destination.hash.hex()

    def announce(self):
        self.destination.announce()
        return {'requested': True, 'peer_reception_verified': False}

    def arm(self, enabled):
        if type(enabled) is not bool:
            raise ValueError('Receiving must be explicitly enabled or disabled.')
        with self.lock:
            if enabled and self.incoming is not None:
                raise ValueError('A file is already being received. Wait or cancel it first.')
            self.armed_until = self.clock() + RECEIVE_WINDOW_SECONDS if enabled else 0
            return self.snapshot()

    def _record(self, name, direction, status, size):
        token = secrets.token_hex(16)
        self.records[token] = {'id': token, 'filename': name, 'direction': direction,
                               'status': status, 'size': size, 'progress': None}
        while len(self.records) > 20:
            old_token = next((key for key, row in self.records.items()
                              if row['status'] in FINAL), None)
            if old_token is None:
                break  # Never evict an active Resource's transfer record.
            self.records.pop(old_token)
            old = self.blobs.pop(old_token, None)
            if old:
                self.stored_bytes -= len(old['data'])
        return token

    def _update(self, ident, **fields):
        with self.lock:
            if ident in self.records and self.records[ident]['status'] not in FINAL:
                self.records[ident].update(fields)

    def _inbound_link(self, link):
        link.set_resource_strategy(self.rns.Link.ACCEPT_APP)
        link.set_resource_callback(self._accept)
        link.set_resource_started_callback(self._started)
        link.set_resource_concluded_callback(self._received)

    def _accept(self, resource):
        with self.lock:
            if self.clock() >= self.armed_until or self.incoming is not None:
                return False
            try:
                size = resource.get_data_size()
                transfer_size = resource.get_transfer_size()
            except (AttributeError, TypeError, ValueError):
                return False
            if type(size) is not int or type(transfer_size) is not int or not (1 <= size <= MAX_RESOURCE_BYTES and 1 <= transfer_size <= MAX_RESOURCE_BYTES * 2):
                return False
            self.armed_until = 0  # One acceptance, not an open receive server.
            ident = self._record('Incoming file · checking metadata', 'IN', 'RECEIVING', size)
            self.incoming = (ident, resource)
            return True

    def _started(self, resource):
        with self.lock:
            if self.incoming and self.incoming[1] is resource:
                self._update(self.incoming[0], status='RECEIVING', progress=0)

    def _received(self, resource):
        with self.lock:
            if not self.incoming or self.incoming[1] is not resource:
                return
            ident = self.incoming[0]
            self.incoming = None
            if resource.status != self.rns.Resource.COMPLETE:
                self._update(ident, status='FAILED_TRANSFER')
                return
            try:
                resource.data.seek(0)
                data = resource.data.read(MAX_RESOURCE_BYTES + 1)
                name = validate_received_resource(resource.metadata, data)
                while self.blobs and self.stored_bytes + len(data) > MAX_SESSION_BYTES:
                    _, old = self.blobs.popitem(last=False)
                    self.stored_bytes -= len(old['data'])
                self.blobs[ident] = {'filename': name, 'data': data,
                                     'mime': image_mime(data) or 'application/octet-stream',
                                     'sha256': hashlib.sha256(data).hexdigest()}
                self.stored_bytes += len(data)
                self._update(ident, filename=name, status='RECEIVED_READY', progress=1)
            except (AttributeError, OSError, ValueError, TypeError):
                self._update(ident, status='FAILED_VALIDATION')

    def send(self, offer):
        target = bytes.fromhex(offer['destination'])
        if not self.rns.Transport.has_path(target):
            self.rns.Transport.request_path(target)
            return {'status': 'PATH_REQUESTED_NOT_SENT', 'note': 'Ask the other device to announce its separate file address, then retry.'}
        peer = self.rns.Identity.recall(target)
        if peer is None:
            return {'status': 'IDENTITY_UNKNOWN_NOT_SENT'}
        with self.lock:
            if self.outgoing and self.records[self.outgoing[0]]['status'] not in FINAL:
                raise ValueError('Another file is still being sent. Cancel or wait before trying again.')
            dest = self.rns.Destination(peer, self.rns.Destination.OUT, self.rns.Destination.SINGLE,
                                        'openrf', 'files')
            if dest.hash != target:
                raise ValueError('File address does not match the recalled identity.')
            ident = self._record(offer['filename'], 'OUT', 'CONNECTING', len(offer['data']))
            link = self.rns.Link(dest)
            self.outgoing = (ident, link, None)
            link.set_link_established_callback(lambda established: self._outbound_connected(ident, established, offer))
            link.set_link_closed_callback(lambda closed: self._outbound_closed(ident, closed))
            return {'status': 'LINK_CONNECTING_NOT_SENT', 'id': ident}

    def _outbound_connected(self, ident, link, offer):
        with self.lock:
            if not self.outgoing or self.outgoing[0] != ident or self.records[ident]['status'] in FINAL:
                return
            try:
                data = offer['data']
                metadata = {'openrf_file_v1': 1, 'filename': offer['filename'], 'size': len(data),
                            'sha256': hashlib.sha256(data).hexdigest()}
                resource = self.rns.Resource(data, link, metadata=metadata,
                    progress_callback=lambda r: self._outbound_progress(ident, r),
                    callback=lambda r: self._outbound_concluded(ident, r))
                self.outgoing = (ident, link, resource)
                self._update(ident, status='TRANSFERRING', progress=0)
            except Exception:
                self._update(ident, status='FAILED_TRANSFER')
                link.teardown()

    def _outbound_progress(self, ident, resource):
        with self.lock:
            if ident in self.records and self.records[ident]['status'] not in FINAL:
                value = resource.get_progress()
                if isinstance(value, (int, float)):
                    self._update(ident, progress=max(0.0, min(1.0, float(value))))

    def _outbound_concluded(self, ident, resource):
        self._update(ident, status='SENT_COMPLETE' if resource.status == self.rns.Resource.COMPLETE
                     else 'FAILED_TRANSFER', progress=1 if resource.status == self.rns.Resource.COMPLETE else None)

    def _outbound_closed(self, ident, _link):
        self._update(ident, status='FAILED_LINK')

    def cancel(self, ident):
        if not isinstance(ident, str) or not TOKEN.fullmatch(ident):
            raise ValueError('Choose a valid active transfer.')
        with self.lock:
            if self.outgoing and self.outgoing[0] == ident and self.records[ident]['status'] not in FINAL:
                _, link, resource = self.outgoing
                self._update(ident, status='CANCELED')
                if resource: resource.cancel()
                link.teardown()
            elif self.incoming and self.incoming[0] == ident:
                _, resource = self.incoming
                self._update(ident, status='CANCELED')
                resource.cancel()
                self.incoming = None
            else:
                raise ValueError('This transfer is no longer active.')
            return self.snapshot()

    def download(self, ident):
        with self.lock:
            if not isinstance(ident, str) or not TOKEN.fullmatch(ident) or ident not in self.blobs:
                return None
            return dict(self.blobs[ident])

    def snapshot(self):
        with self.lock:
            if self.incoming and self.incoming[0] in self.records:
                ident, resource = self.incoming
                try:
                    value = resource.get_progress()
                    if isinstance(value, (int, float)):
                        self._update(ident, progress=max(0.0, min(1.0, float(value))))
                except (AttributeError, ValueError, TypeError):
                    pass
            return {'file_address': self.address,
                    'receiving_armed_seconds': max(0, int(self.armed_until - self.clock())),
                    'transfers': [{**row, 'available': ident in self.blobs}
                                  for ident, row in reversed(self.records.items())],
                    'bytes_in_memory': self.stored_bytes,
                    'max_file_bytes': MAX_RESOURCE_BYTES,
                    'note': 'Only one authorized incoming transfer, for 5 minutes. No automatic persistent file saving.'}
