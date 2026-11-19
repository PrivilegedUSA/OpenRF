"""Opt-in encrypted SQLite snapshot for private offline emergency recovery."""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

MAX_DB_BYTES=16*1024*1024
MAX_BACKUP_BYTES=24*1024*1024
ITERATIONS=600_000
FORMAT='OpenRF-encrypted-sqlite-v1'


def available():
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # noqa:F401
        return True
    except ImportError:
        return False


def _password(value):
    if not isinstance(value,str) or not 12<=len(value)<=256 or not value.strip():
        raise ValueError('Use a nonempty backup passphrase of 12–256 characters')
    return value


def _cipher():
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        return AESGCM
    except ImportError as exc:
        raise ValueError('Encrypted backup unavailable: install optional cryptography package') from exc


def _snapshot(path):
    source=sqlite3.connect(f'file:{Path(path).resolve()}?mode=ro',uri=True,timeout=3)
    memory=sqlite3.connect(':memory:')
    try:
        size=source.execute('PRAGMA page_count').fetchone()[0]*source.execute('PRAGMA page_size').fetchone()[0]
        if size>MAX_DB_BYTES:
            raise ValueError('Database too large for emergency in-memory backup (16 MiB max)')
        source.backup(memory)
        # SQLite deserialize(':memory:') cannot open an image with WAL journal mode.
        memory.execute('PRAGMA journal_mode=DELETE')
        if memory.execute('PRAGMA quick_check(1)').fetchone()[0]!='ok':
            raise ValueError('Database quick-check failed; no backup created')
        plaintext=bytearray(memory.serialize())
        if plaintext[:16]!=b'SQLite format 3\x00':
            raise ValueError('Unexpected SQLite snapshot format')
        # A backup of a WAL-mode database may retain WAL flags in the serialized
        # header. In-memory deserialize has no -wal sidecar, so normalize the
        # consistent snapshot image to rollback-journal header values.
        plaintext[18:20]=b'\x01\x01'
        if len(plaintext)>MAX_DB_BYTES:
            raise ValueError('Database too large for emergency in-memory backup (16 MiB max)')
        return bytes(plaintext)
    finally:
        memory.close()
        source.close()


def create(path,passphrase):
    _password(passphrase)
    AESGCM=_cipher()
    plain=_snapshot(path)
    salt=secrets.token_bytes(16)
    nonce=secrets.token_bytes(12)
    key=hashlib.pbkdf2_hmac('sha256',passphrase.encode('utf-8'),salt,ITERATIONS,dklen=32)
    cipher=AESGCM(key).encrypt(nonce,plain,FORMAT.encode('ascii'))
    envelope={'format':FORMAT,'kdf':'PBKDF2-HMAC-SHA256','iterations':ITERATIONS,
              'cipher':'AES-256-GCM','salt':base64.b64encode(salt).decode('ascii'),
              'nonce':base64.b64encode(nonce).decode('ascii'),
              'ciphertext':base64.b64encode(cipher).decode('ascii')}
    return json.dumps(envelope,separators=(',',':')).encode('ascii')


def decrypt_preview(envelope,passphrase):
    """Decrypt only in memory and provide schema/count preview; never restore or write."""
    _password(passphrase)
    AESGCM=_cipher()
    if not isinstance(envelope,(bytes,bytearray)) or not 100<=len(envelope)<=MAX_BACKUP_BYTES:
        raise ValueError('Encrypted backup file size is invalid')
    try:
        data=json.loads(envelope)
        if not isinstance(data,dict) or set(data)!={'format','kdf','iterations','cipher','salt','nonce','ciphertext'}:
            raise ValueError('Invalid backup envelope')
        if (data['format'],data['kdf'],data['iterations'],data['cipher'])!=(FORMAT,'PBKDF2-HMAC-SHA256',ITERATIONS,'AES-256-GCM'):
            raise ValueError('Unsupported encrypted backup format')
        salt=base64.b64decode(data['salt'],validate=True)
        nonce=base64.b64decode(data['nonce'],validate=True)
        ciphertext=base64.b64decode(data['ciphertext'],validate=True)
        if len(salt)!=16 or len(nonce)!=12 or len(ciphertext)>MAX_DB_BYTES+16:
            raise ValueError('Invalid encrypted payload parameters')
        key=hashlib.pbkdf2_hmac('sha256',passphrase.encode('utf-8'),salt,ITERATIONS,dklen=32)
        plain=AESGCM(key).decrypt(nonce,ciphertext,FORMAT.encode('ascii'))
        memory=sqlite3.connect(':memory:')
        try:
            memory.deserialize(plain)
            if memory.execute('PRAGMA quick_check(1)').fetchone()[0]!='ok':
                raise ValueError('Encrypted database integrity check failed')
            tables={row[0] for row in memory.execute('SELECT name FROM sqlite_master WHERE type=?',('table',))}
            expected=('emergency_records','emergency_checkins','emergency_outbox','emergency_team_members')
            if not all(table in tables for table in expected):
                raise ValueError('Not a compatible OpenRF emergency database')
            counts={table:memory.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in expected}
        finally:
            memory.close()
        return {'format':FORMAT,'verified_integrity':True,'counts':counts,
                'restored':False,'live_database_modified':False,
                'note':'Decrypted and checked in memory only. Does not restore data, files, map caches or radio histories.'},plain
    except (UnicodeError, TypeError, KeyError, sqlite3.Error, ValueError) as exc:
        if isinstance(exc,ValueError) and str(exc).startswith(('Unsupported','Not a compatible')):
            raise
        raise ValueError('Backup could not be verified: wrong passphrase, damaged file or invalid format') from None
    except Exception as exc:
        # AES-GCM InvalidTag must not leak password / payload details.
        raise ValueError('Backup could not be verified: wrong passphrase, damaged file or invalid format') from None


def inspect(envelope,passphrase):
    summary,_=decrypt_preview(envelope,passphrase)
    return summary
