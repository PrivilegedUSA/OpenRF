"""Stopped-app, operator-confirmed encrypted SQLite recovery tool (never HTTP)."""
from __future__ import annotations

import argparse
import fcntl
import getpass
import os
import secrets
import sqlite3
import tempfile
from contextlib import contextmanager, closing
from datetime import datetime, timezone
from pathlib import Path

from .emergency_backup import MAX_BACKUP_BYTES, decrypt_preview


def lock_path(database):
    return Path(database).parent / '.openrf-restore.lock'


@contextmanager
def exclusive_lock(database):
    path=lock_path(database)
    path.parent.mkdir(parents=True,exist_ok=True)
    descriptor=os.open(path,os.O_CREAT|os.O_RDWR,0o600)
    try:
        try:
            fcntl.flock(descriptor,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError('OpenRF is running or another recovery operation holds the database lock; stop it first') from exc
        yield descriptor
    finally:
        fcntl.flock(descriptor,fcntl.LOCK_UN)
        os.close(descriptor)


def _quick_check(path):
    with closing(sqlite3.connect(path)) as db:
        result=db.execute('PRAGMA quick_check(1)').fetchone()
    if not result or result[0]!='ok':
        raise ValueError('SQLite integrity check failed')


def restore(database_path, encrypted, passphrase, confirmation):
    """Atomic file replacement with retained safety copy. Caller must stop OpenRF."""
    if confirmation!='RESTORE OPENRF':
        raise ValueError('Explicit RESTORE OPENRF confirmation required')
    database=Path(database_path).resolve()
    if not database.is_file():
        raise ValueError('The live OpenRF database must already exist; no new database created')
    preview,plaintext=decrypt_preview(encrypted,passphrase)
    with exclusive_lock(database):
        if not database.is_file():
            raise ValueError('Live database disappeared; no restore performed')
        # Never strand WAL pages or replace a DB while uncheckpointed state exists.
        if any(Path(str(database)+suffix).exists() for suffix in ('-wal','-shm','-journal')):
            raise ValueError('SQLite journal/sidecar files still exist; safely close all connections and resolve them before restore')
        _quick_check(database)
        token=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(4)
        safety=database.with_name(database.name+'.before-restore-'+token+'.sqlite3')
        tmp_path=None
        try:
            file_descriptor,tmp_name=tempfile.mkstemp(prefix='.openrf-restore-',suffix='.sqlite3',dir=database.parent)
            tmp_path=Path(tmp_name)
            with os.fdopen(file_descriptor,'wb') as handle:
                handle.write(plaintext)
                handle.flush();os.fsync(handle.fileno())
            _quick_check(tmp_path)
            # SQLite online-backup API creates an internally consistent safety copy.
            old_umask=os.umask(0o077)
            try:
                with closing(sqlite3.connect(database)) as live, closing(sqlite3.connect(safety)) as saved:
                    live.backup(saved)
            finally:
                os.umask(old_umask)
            os.chmod(safety,0o600)
            _quick_check(safety)
            os.replace(tmp_path,database)
            tmp_path=None
            try:
                _quick_check(database)
            except Exception:
                # Safety copy remains available even if rollback encounters an error.
                os.replace(safety,database)
                raise
            return {'restored':True,'safety_copy':str(safety),'backup_preview':preview,
                    'warning':'Restart OpenRF. External map caches and radio histories were not restored.'}
        finally:
            if tmp_path is not None:
                tmp_path.unlink(missing_ok=True)


def main(argv=None):
    parser=argparse.ArgumentParser(description='Restore a verified OpenRF backup only while OpenRF is stopped')
    parser.add_argument('--backup',type=Path,required=True,help='Local .orfbak file')
    parser.add_argument('--db',type=Path,default=Path.home()/'.local/share/openrf/openrf.sqlite3')
    parser.add_argument('--preview',action='store_true',help='Inspect only; no files modified')
    args=parser.parse_args(argv)
    if not args.backup.is_file() or args.backup.stat().st_size>MAX_BACKUP_BYTES:
        parser.error('Missing or oversized encrypted backup')
    secret=getpass.getpass('Backup passphrase (hidden): ')
    blob=args.backup.read_bytes()
    details,_=decrypt_preview(blob,secret)
    print('Verified encrypted backup:',details['counts'])
    if args.preview:
        print('Preview only; no files restored.')
        return 0
    print('WARNING: This REPLACES the main OpenRF database. Stop every OpenRF process first.')
    confirmation=input('Type RESTORE OPENRF to continue: ')
    result=restore(args.db,blob,secret,confirmation)
    print('Recovery completed. Original database safety copy:',result['safety_copy'])
    print('Restart OpenRF and verify your records. Keep the safety copy privately.')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
