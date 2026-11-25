"""Opt-in local inventory snapshots, not packet captures or live measurements."""
import json
import sqlite3
import time
from pathlib import Path
import logging
import os
import stat
from contextlib import closing
from .mesh_dashboard import validated_telemetry

MAX_BYTES = 64 * 1024 * 1024
MAX_ROWS = 100000

def _connect(path):
    db = sqlite3.connect(path, timeout=10)
    db.execute("PRAGMA synchronous=FULL")
    return db

def _size(db):
    return db.execute("PRAGMA page_count").fetchone()[0] * db.execute("PRAGMA page_size").fetchone()[0]

def _used(db):
    return _size(db) - db.execute("PRAGMA freelist_count").fetchone()[0] * db.execute("PRAGMA page_size").fetchone()[0]

class MeshHistory:
    def __init__(self, path):
        self.path = str(path)
        # Pre-create the private file so SQLite journal permissions inherit it.
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR | os.O_NONBLOCK | getattr(os,'O_NOFOLLOW',0), 0o600)
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode): raise ValueError('Mesh history must be a regular file')
            os.fchmod(fd,0o600)
        finally: os.close(fd)
        with closing(_connect(self.path)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS mesh_history_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL, days INTEGER NOT NULL)')
            db.execute('INSERT OR IGNORE INTO mesh_history_settings (id,enabled,days) VALUES (1,0,30)')
            if 'interval_seconds' not in [r[1] for r in db.execute('PRAGMA table_info(mesh_history_settings)')]:
                db.execute('ALTER TABLE mesh_history_settings ADD COLUMN interval_seconds INTEGER NOT NULL DEFAULT 30')
            if 'background_enabled' not in [r[1] for r in db.execute('PRAGMA table_info(mesh_history_settings)')]:
                db.execute('ALTER TABLE mesh_history_settings ADD COLUMN background_enabled INTEGER NOT NULL DEFAULT 0')
            db.execute('CREATE TABLE IF NOT EXISTS mesh_history_samples (protocol TEXT, node_id TEXT, captured REAL, payload TEXT, PRIMARY KEY(protocol,node_id,captured))')
            db.execute('CREATE INDEX IF NOT EXISTS mesh_history_age ON mesh_history_samples(captured)')

    @classmethod
    def separate(cls, main_path):
        """Copy legacy history durably before removing it; no auto background consent."""
        main_path = Path(main_path)
        h = cls(main_path.with_name(main_path.name + '.mesh-nodes.sqlite3'))
        with closing(_connect(main_path)) as main:
            tables = {r[0] for r in main.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if 'mesh_history_samples' in tables:
                main.execute('BEGIN IMMEDIATE')
                with closing(_connect(h.path)) as dest, dest:
                    dest.execute('CREATE TABLE IF NOT EXISTS mesh_migration (id INTEGER PRIMARY KEY)')
                    if not dest.execute('SELECT id FROM mesh_migration WHERE id=1').fetchone():
                        cols = {r[1] for r in main.execute('PRAGMA table_info(mesh_history_settings)')}
                        if 'mesh_history_settings' in tables:
                            enabled, days = main.execute('SELECT enabled,days FROM mesh_history_settings WHERE id=1').fetchone()
                            interval = main.execute('SELECT interval_seconds FROM mesh_history_settings WHERE id=1').fetchone()[0] if 'interval_seconds' in cols else 30
                            dest.execute('UPDATE mesh_history_settings SET enabled=?,days=?,interval_seconds=?,background_enabled=0 WHERE id=1',(enabled,days,interval))
                    # Also import data from a deliberately restored older main DB.
                    # Never remove legacy rows if there is a conflicting same-key payload.
                    dest.executemany('INSERT OR IGNORE INTO mesh_history_samples VALUES (?,?,?,?)', main.execute('SELECT protocol,node_id,captured,payload FROM mesh_history_samples'))
                    dest.execute('ATTACH DATABASE ? AS legacy_read', (str(main_path),))
                    mismatch = dest.execute('SELECT 1 FROM legacy_read.mesh_history_samples AS old LEFT JOIN mesh_history_samples AS new USING(protocol,node_id,captured) WHERE new.payload IS NULL OR new.payload != old.payload LIMIT 1').fetchone()
                    if mismatch or dest.execute('PRAGMA main.quick_check(1)').fetchone()[0] != 'ok':
                        raise sqlite3.DatabaseError('Mesh history migration integrity check failed')
                    dest.execute('INSERT OR IGNORE INTO mesh_migration VALUES (1)')
                with main:
                    main.execute('DROP TABLE mesh_history_samples')
                    main.execute('DROP TABLE IF EXISTS mesh_history_settings')
                    main.execute('CREATE TABLE IF NOT EXISTS mesh_migration_cleanup (id INTEGER PRIMARY KEY)')
                    main.execute('INSERT OR IGNORE INTO mesh_migration_cleanup VALUES (1)')
            if 'mesh_migration_cleanup' in tables or 'mesh_history_samples' in tables:
                try:
                    main.execute('VACUUM')
                    main.execute('PRAGMA wal_checkpoint(TRUNCATE)')
                    with main: main.execute('DROP TABLE IF EXISTS mesh_migration_cleanup')
                except sqlite3.Error:
                    logging.warning('Mesh history migrated; main database compaction deferred until next startup')
        return h

    def settings(self):
        with closing(_connect(self.path)) as db:
            enabled, days, interval, background = db.execute('SELECT enabled,days,interval_seconds,background_enabled FROM mesh_history_settings WHERE id=1').fetchone()
            return dict(enabled=bool(enabled), days=days, interval_seconds=interval, background_enabled=bool(background))

    def configure(self, data):
        if not isinstance(data,dict) or not {'enabled','days'} <= set(data) <= {'enabled','days','interval_seconds','background_enabled'} or type(data['enabled']) is not bool or type(data['days']) is not int or not 1 <= data['days'] <= 365:
            raise ValueError('Provide enabled and retention days (1–365).')
        interval = data.get('interval_seconds', self.settings()['interval_seconds'])
        if type(interval) is not int or not 15 <= interval <= 600:
            raise ValueError('Collection interval must be 15–600 seconds.')
        background = data.get('background_enabled', self.settings()['background_enabled'])
        if type(background) is not bool: raise ValueError('Background recording must be true or false.')
        with closing(_connect(self.path)) as db, db:
            db.execute('UPDATE mesh_history_settings SET enabled=?,days=?,interval_seconds=?,background_enabled=? WHERE id=1',(data['enabled'],data['days'],interval,background and data['enabled']))
            db.execute('DELETE FROM mesh_history_samples WHERE captured < ?', (time.time()-data['days']*86400,))
        return self.settings()

    def record(self, nodes, now=None, *, background=False):
        now = time.time() if now is None else now
        with closing(_connect(self.path)) as db, db:
            db.execute('BEGIN IMMEDIATE')
            enabled,days,consent = db.execute('SELECT enabled,days,background_enabled FROM mesh_history_settings WHERE id=1').fetchone()
            db.execute('DELETE FROM mesh_history_samples WHERE captured < ?', (now-days*86400,))
            if not enabled or (background and not consent): return
            for n in nodes:
                if n['source'] not in ('RADIO_NODE_DATABASE','RADIO_CONTACT_LIST','RNS_PATH_CACHE'): continue
                # Do not use changing derived age/quality labels as evidence of a new sample.
                payload = json.dumps({k:n.get(k) for k in ('source','last_heard','advert_timestamp','position','telemetry','role') } | {'path_updated': (n.get('route') or {}).get('updated'), 'telemetry': validated_telemetry(n.get('telemetry') or {}), 'route': {k:(n.get('route') or {}).get(k) for k in ('via','interface','hops','updated','expires')} if n.get('route') else None}, sort_keys=True, allow_nan=False)
                if len(payload.encode("utf-8")) > 8192: continue
                prev = db.execute('SELECT payload,captured FROM mesh_history_samples WHERE protocol=? AND node_id=? ORDER BY captured DESC LIMIT 1',(n['protocol'],n['id'])).fetchone()
                if prev and (prev[0]==payload or now<=prev[1]): continue
                db.execute('INSERT INTO mesh_history_samples VALUES (?,?,?,?)',(n['protocol'],n['id'],now,payload))
            # Bound storage even on a busy network.
            excess = db.execute('SELECT count(*) FROM mesh_history_samples').fetchone()[0] - MAX_ROWS
            if excess > 0:
                db.execute('DELETE FROM mesh_history_samples WHERE rowid IN (SELECT rowid FROM mesh_history_samples ORDER BY captured,rowid LIMIT ?)', (excess,))
            while _used(db) > MAX_BYTES and db.execute('SELECT 1 FROM mesh_history_samples LIMIT 1').fetchone():
                db.execute('DELETE FROM mesh_history_samples WHERE rowid IN (SELECT rowid FROM mesh_history_samples ORDER BY captured,rowid LIMIT 1000)')
        self.compact_if_needed()

    def compact_if_needed(self, force=False):
        with closing(_connect(self.path)) as db:
            if force or (_size(db) > MAX_BYTES and _used(db) < _size(db)):
                db.execute('VACUUM')

    def prune(self):
        with closing(_connect(self.path)) as db, db:
            days = db.execute('SELECT days FROM mesh_history_settings WHERE id=1').fetchone()[0]
            db.execute('DELETE FROM mesh_history_samples WHERE captured < ?', (time.time()-days*86400,))
        self.compact_if_needed()

    def usage(self):
        with closing(_connect(self.path)) as db:
            return dict(file_bytes=_size(db), live_bytes=_used(db), target_bytes=MAX_BYTES,
                        samples=db.execute('SELECT count(*) FROM mesh_history_samples').fetchone()[0], max_rows=MAX_ROWS)

    def history(self, protocol, ident):
        with closing(_connect(self.path)) as db:
            days = db.execute('SELECT days FROM mesh_history_settings WHERE id=1').fetchone()[0]
            args=(protocol,ident,time.time()-days*86400)
            where=' WHERE protocol=? AND node_id=? AND captured>=?'
            first,last,count=db.execute('SELECT min(captured),max(captured),count(*) FROM mesh_history_samples'+where,args).fetchone()
            rows=db.execute('SELECT captured,payload FROM mesh_history_samples'+where+' ORDER BY captured DESC LIMIT 200',args).fetchall()
        return dict(first_saved=first,last_saved=last,count=count,samples=[dict(captured=t,**(json.loads(p) | {"telemetry": validated_telemetry(json.loads(p).get("telemetry") or {})})) for t,p in rows])

    def clear(self):
        with closing(_connect(self.path)) as db, db:
            db.execute('UPDATE mesh_history_settings SET enabled=0,background_enabled=0 WHERE id=1')
            db.execute('DELETE FROM mesh_history_samples')
        self.compact_if_needed(force=True)
        return {'cleared':True,'recording_disabled':True}
