"""Bounded, in-memory LXMF file attachment interoperability (Sideband field 0x05).

No incoming file is written to disk automatically. The transfer is a normal
LXMF message, *not* a generic unlimited-size RNS Resource file transfer.
"""
from __future__ import annotations

import base64
import binascii
from collections import OrderedDict
import re
import secrets


MAX_ATTACHMENT_BYTES = 128 * 1024
MAX_BUFFER_BYTES = 4 * 1024 * 1024
MAX_BUFFER_ENTRIES = 100
TOKEN = re.compile(r"[0-9a-f]{32}\Z")


def filename_valid(value):
    if (not isinstance(value, str) or not 1 <= len(value) <= 100 or
            value in ('.', '..') or '/' in value or '\\' in value or
            any(ord(c) < 32 or ord(c) == 127 for c in value)):
        raise ValueError('File name must be 1–100 characters with no paths or control characters.')
    try:
        value.encode('utf-8')
    except UnicodeError as exc:
        raise ValueError('File name is not valid Unicode.') from exc
    return value


def image_mime(data):
    """Only allow real recognized images to be rendered inline; no SVG/HTML."""
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return None


def validate_browser_attachment(payload):
    if not isinstance(payload, dict) or set(payload) != {'filename', 'data_base64'}:
        raise ValueError('Provide a selected file name and its Base64 content only.')
    name = filename_valid(payload['filename'])
    encoded = payload['data_base64']
    if not isinstance(encoded, str) or len(encoded) > ((MAX_ATTACHMENT_BYTES + 2)//3)*4:
        raise ValueError('This first release supports one attachment up to 128 KiB.')
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError('Invalid file data.') from exc
    if not 1 <= len(data) <= MAX_ATTACHMENT_BYTES:
        raise ValueError('This first release supports one attachment of 1–128 KiB.')
    return {'filename': name, 'data': data}


def lxmf_attachment(fields, lxmf_module):
    """Accept Sideband-compatible file or image fields; ignore unsafe data."""
    if isinstance(fields, dict):
        image = fields.get(getattr(lxmf_module, 'FIELD_IMAGE', 0x06))
        if isinstance(image, (list, tuple)) and len(image) == 2:
            extension, data = image
            if isinstance(extension, str) and isinstance(data, bytes) and 1<=len(data)<=MAX_ATTACHMENT_BYTES:
                expected = {'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg',
                            'webp':'image/webp'}.get(extension.lower())
                if expected and image_mime(data)==expected:
                    return {'filename': 'received-image.'+extension.lower(), 'data': data}
    entries = fields.get(getattr(lxmf_module, 'FIELD_FILE_ATTACHMENTS', 0x05)) if isinstance(fields, dict) else None
    if not isinstance(entries, (list, tuple)):
        return None
    for entry in entries[:1]:
        if not isinstance(entry, (list, tuple)) or len(entry) != 2:
            continue
        name, data = entry
        try:
            filename_valid(name)
        except ValueError:
            continue
        if isinstance(data, bytes) and 1 <= len(data) <= MAX_ATTACHMENT_BYTES:
            return {'filename': name, 'data': data}
    return None


def outbound_fields(lxmf_module, attachment):
    """Use native Sideband image field for true raster images, else file field."""
    mime = image_mime(attachment['data'])
    if mime:
        extension = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime]
        return {getattr(lxmf_module,'FIELD_IMAGE',0x06):[extension,attachment['data']]}
    return {getattr(lxmf_module,'FIELD_FILE_ATTACHMENTS',0x05):
            [[attachment['filename'],attachment['data']]]}


class SessionAttachmentBuffer:
    """Ephemeral, bounded file bytes; no implicit filesystem persistence."""
    def __init__(self):
        self._files = OrderedDict()
        self._total = 0

    def add(self, filename, data):
        filename_valid(filename)
        if not isinstance(data, bytes) or not 1 <= len(data) <= MAX_ATTACHMENT_BYTES:
            raise ValueError('Attachment exceeds the safe per-message bound.')
        while self._files and (len(self._files) >= MAX_BUFFER_ENTRIES or
                               self._total + len(data) > MAX_BUFFER_BYTES):
            _, removed = self._files.popitem(last=False)
            self._total -= len(removed['data'])
        token = secrets.token_hex(16)
        item = {'id': token, 'filename': filename, 'size': len(data),
                'mime': image_mime(data) or 'application/octet-stream', 'data': data}
        self._files[token] = item
        self._total += len(data)
        return {key: value for key, value in item.items() if key != 'data'}

    def get(self, token):
        return self._files.get(token) if isinstance(token, str) and TOKEN.fullmatch(token) else None

    def clear(self):
        self._files.clear()
        self._total = 0
