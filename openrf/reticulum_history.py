"""Private, opt-in Reticulum contacts and message history.

No file is created by status checks. Contacts are saved only on explicit user
action; message bodies are saved only after enabling local history. They are
never stored in Git or uploaded by this module.
"""
from __future__ import annotations

from contextlib import closing
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import sqlite3


ADDRESS = re.compile(r'[0-9a-fA-F]{32}\Z')
MAX_CONTACTS = 500
HISTORY_LIMIT = 1000
MAX_BODY_BYTES = 1024


class ContactExistsError(ValueError):
    """The destination is already saved; use an explicit edit to rename."""


class ContactMissingError(ValueError):
    """The requested destination no longer exists for editing."""


def _utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def valid_address(address):
    if not isinstance(address, str) or not ADDRESS.fullmatch(address):
        raise ValueError('LXMF address must contain exactly 32 hexadecimal characters.')
    return address.lower()


def valid_alias(alias):
    if not isinstance(alias, str):
        raise ValueError('Contact nickname must be text.')
    value = alias.strip()
    if not value or len(value) > 40 or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError('Contact nickname must be 1–40 printable characters.')
    try:
        value.encode('utf-8')
    except UnicodeError as exc:
        raise ValueError('Contact nickname contains invalid Unicode.') from exc
    return value


class ReticulumLocalStore:
    """Small SQLite sidecar under the local data directory, not in the repo."""

    def __init__(self, root):
        self.root = Path(root)
        self.path = self.root / 'reticulum-messages.sqlite3'

    def _connection(self, create=False):
        if self.root.is_symlink() or self.path.is_symlink():
            raise ValueError('Reticulum local-data paths cannot be symlinks.')
        if not create and not self.path.is_file():
            return None
        if create:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            self.root.chmod(0o700)
        connection = sqlite3.connect(self.path, timeout=5)
        if create:
            os.chmod(self.path, 0o600)
            with connection:
                connection.executescript('''
                    CREATE TABLE IF NOT EXISTS preferences (
                        key TEXT PRIMARY KEY, value TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS contacts (
                        address TEXT PRIMARY KEY, alias TEXT NOT NULL,
                        updated_at_utc TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        worker_id TEXT NOT NULL, event_id INTEGER NOT NULL,
                        direction TEXT NOT NULL, destination TEXT NOT NULL,
                        body TEXT NOT NULL, utc TEXT NOT NULL, status TEXT NOT NULL,
                        UNIQUE(worker_id, event_id)
                    );
                ''')
        return connection

    def history_enabled(self):
        connection = self._connection()
        if connection is None:
            return False
        with closing(connection) as db:
            result = db.execute("SELECT value FROM preferences WHERE key='history_enabled'").fetchone()
            return bool(result and result[0] == '1')

    def history_status(self):
        connection = self._connection()
        if connection is None:
            return {'enabled': False, 'saved_count': 0, 'storage': 'MEMORY_ONLY'}
        with closing(connection) as db:
            enabled = db.execute("SELECT value FROM preferences WHERE key='history_enabled'").fetchone()
            count = db.execute('SELECT COUNT(*) FROM messages').fetchone()[0]
            return {'enabled': bool(enabled and enabled[0] == '1'),
                    'saved_count': count,
                    'storage': 'PRIVATE_LOCAL_SQLITE_OPT_IN' if enabled and enabled[0] == '1' else 'MEMORY_ONLY'}

    def set_history(self, enabled):
        if type(enabled) is not bool:
            raise ValueError('History setting must be true or false.')
        connection = self._connection(create=enabled)
        if connection is None:
            return self.history_status()
        with closing(connection) as db, db:
            db.execute("INSERT INTO preferences(key,value) VALUES('history_enabled',?) "
                       "ON CONFLICT(key) DO UPDATE SET value=excluded.value", ('1' if enabled else '0',))
            if not enabled:
                db.execute('DELETE FROM messages')
        return self.history_status()

    def contacts(self):
        connection = self._connection()
        if connection is None:
            return []
        with closing(connection) as db:
            rows = db.execute('SELECT address, alias, updated_at_utc FROM contacts ORDER BY alias COLLATE NOCASE, address').fetchall()
            return [dict(address=a, alias=n, updated_at_utc=t) for a, n, t in rows]

    def save_contact(self, address, alias, *, update=False):
        address, alias = valid_address(address), valid_alias(alias)
        if type(update) is not bool:
            raise ValueError('Contact update mode must be true or false.')
        connection = self._connection(create=True)
        with closing(connection) as db, db:
            existing = db.execute('SELECT 1 FROM contacts WHERE address=?', (address,)).fetchone()
            if update:
                if not existing:
                    raise ContactMissingError('Contact no longer exists. Add it as a new contact instead.')
            else:
                if existing:
                    raise ContactExistsError('This LXMF address is already saved. Use Edit to change its nickname.')
                if db.execute('SELECT COUNT(*) FROM contacts').fetchone()[0] >= MAX_CONTACTS:
                    raise ValueError(f'Contact limit reached ({MAX_CONTACTS}).')
            timestamp = _utc()
            if update:
                db.execute('UPDATE contacts SET alias=?,updated_at_utc=? WHERE address=?',
                           (alias, timestamp, address))
            else:
                try:
                    db.execute('INSERT INTO contacts(address,alias,updated_at_utc) VALUES(?,?,?)',
                               (address, alias, timestamp))
                except sqlite3.IntegrityError as exc:
                    raise ContactExistsError('This LXMF address is already saved. Use Edit to change its nickname.') from exc
        return {'address': address, 'alias': alias, 'updated_at_utc': timestamp}

    def delete_contact(self, address):
        address = valid_address(address)
        connection = self._connection()
        if connection is None:
            return False
        with closing(connection) as db, db:
            return db.execute('DELETE FROM contacts WHERE address=?', (address,)).rowcount > 0

    def save_events(self, worker_id, events, *, after_event=0):
        """Idempotent import of server-returned REAL worker events only."""
        if not self.history_enabled():
            return 0
        if not isinstance(worker_id, str) or not re.fullmatch(r'[0-9a-f]{32}', worker_id):
            raise ValueError('Invalid worker identifier.')
        if not isinstance(events, list):
            return 0
        accepted = []
        for row in events[:HISTORY_LIMIT]:
            if not isinstance(row, dict):
                continue
            event_id, direction, address = row.get('event_id'), row.get('direction'), row.get('destination')
            content, status, timestamp = row.get('text'), row.get('status'), row.get('utc')
            if type(event_id) is not int or not after_event < event_id <= 2**63-1 or direction not in ('IN','OUT'):
                continue
            try:
                address = valid_address(address)
            except ValueError:
                continue
            if not isinstance(content, str):
                continue
            try:
                if len(content.encode('utf-8')) > MAX_BODY_BYTES:
                    continue
            except UnicodeError:
                continue
            if not isinstance(status, str) or status not in ('RECEIVED_VALID_SIGNATURE','QUEUED_WITH_LXMF_NOT_DELIVERED'):
                continue
            if not isinstance(timestamp, str) or not 1 <= len(timestamp) <= 50:
                continue
            accepted.append((worker_id, event_id, direction, address, content, timestamp, status))
        if not accepted:
            return 0
        connection = self._connection(create=True)
        with closing(connection) as db, db:
            before = db.total_changes
            db.executemany('''INSERT OR IGNORE INTO messages
                (worker_id,event_id,direction,destination,body,utc,status) VALUES(?,?,?,?,?,?,?)''', accepted)
            inserted = db.total_changes-before
            db.execute('''DELETE FROM messages WHERE id IN (
                SELECT id FROM messages ORDER BY id DESC LIMIT -1 OFFSET ?)''', (HISTORY_LIMIT,))
            return inserted

    def messages(self):
        connection = self._connection()
        if connection is None:
            return []
        with closing(connection) as db:
            rows = db.execute('''SELECT id,direction,destination,body,utc,status FROM messages
                ORDER BY id DESC LIMIT ?''', (HISTORY_LIMIT,)).fetchall()
            return [dict(id=ident,direction=direction,destination=address,text=body,utc=utc,status=status)
                    for ident,direction,address,body,utc,status in reversed(rows)]

    def clear_messages(self):
        connection = self._connection()
        if connection is None:
            return 0
        with closing(connection) as db, db:
            return db.execute('DELETE FROM messages').rowcount
