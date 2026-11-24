"""Explicit, bounded local camera recording and still capture; no network discovery.

Private recordings live beside OpenRF's local SQLite database, never in source/Git.
"""
import os
import shutil
import signal
import sqlite3
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from .surveillance import SurveillanceError, validate_rtsp, validate_usb_device

MAX_RECORD_SECONDS = 3600
MAX_RECORDINGS = 2000


def _now():
    return datetime.now(timezone.utc).isoformat()


def _input_args(source, location):
    if source == 'USB':
        return ['-f', 'video4linux2', '-i', validate_usb_device(location)]
    if source == 'RTSP':
        return ['-rtsp_transport', 'tcp', '-timeout', '5000000', '-i', validate_rtsp(location)]
    raise SurveillanceError('Unsupported camera source')


class RecordingManager:
    def __init__(self, db_path):
        self.db_path = Path(db_path)
        self.folder = self.db_path.parent / 'surveillance-recordings'
        self.folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = threading.RLock()
        self.active = {}
        self.preview_stopper = None  # Configured by the local server; no background capture.
        with self._db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS surveillance_recordings (
                id INTEGER PRIMARY KEY AUTOINCREMENT, camera_id INTEGER NOT NULL,
                camera_name TEXT NOT NULL, kind TEXT NOT NULL, filename TEXT NOT NULL UNIQUE,
                started_utc TEXT NOT NULL, ended_utc TEXT, state TEXT NOT NULL)''')
            db.execute("UPDATE surveillance_recordings SET state='INTERRUPTED', ended_utc=? WHERE state='RECORDING'", (_now(),))

    def _db(self):
        db = sqlite3.connect(str(self.db_path), timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def _refresh(self):
        for cam_id, (ident, proc) in list(self.active.items()):
            if proc.poll() is not None:
                self.active.pop(cam_id, None)
                output = self.folder / f'video-{ident:08d}.mp4'
                valid_output = output.is_file() and output.stat().st_size > 0
                with self._db() as db:
                    db.execute("UPDATE surveillance_recordings SET state=?, ended_utc=? WHERE id=? AND state='RECORDING'",
                               ('FINISHED' if proc.returncode == 0 and valid_output else 'FAILED', _now(), ident))
                    db.commit()

    def _public(self, row):
        file = self.folder / row['filename']
        return {'id': row['id'], 'camera_id': row['camera_id'], 'camera_name': row['camera_name'],
                'kind': row['kind'], 'started_utc': row['started_utc'], 'ended_utc': row['ended_utc'],
                'state': row['state'], 'bytes': file.stat().st_size if file.is_file() else 0}

    def list(self, limit=100):
        with self.lock:
            self._refresh()
            with self._db() as db:
                rows = db.execute('SELECT * FROM surveillance_recordings ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
            return [self._public(row) for row in rows]

    def storage(self):
        usage = shutil.disk_usage(self.folder)
        with self._db() as db:
            names = [row[0] for row in db.execute('SELECT filename FROM surveillance_recordings')]
        return {'recording_bytes': sum((self.folder / name).stat().st_size for name in names if (self.folder / name).is_file()),
                'free_bytes': usage.free, 'filesystem_total_bytes': usage.total,
                'max_recording_seconds': MAX_RECORD_SECONDS, 'max_recordings': MAX_RECORDINGS}

    def start(self, camera):
        with self.lock:
            self._refresh()
            if camera['id'] in self.active:
                raise SurveillanceError('This camera is already recording')
            if len(self.active) >= 2:
                raise SurveillanceError('At most two simultaneous recordings')
            if not shutil.which('ffmpeg'):
                raise SurveillanceError('FFmpeg is required for local recording')
            if camera['source'] == 'USB' and not Path(camera['location']).exists():
                raise SurveillanceError('USB camera device is not connected')
            if camera['source'] == 'USB' and self.preview_stopper:
                self.preview_stopper(camera['id'])
            if self.storage()['free_bytes'] < 512 * 1024 * 1024:
                raise SurveillanceError('At least 512 MiB free space is required to start recording')
            with self._db() as db:
                if db.execute('SELECT COUNT(*) FROM surveillance_recordings').fetchone()[0] >= MAX_RECORDINGS:
                    raise SurveillanceError('Recording count limit reached; delete old recordings first')
                started = _now()
                cursor = db.execute('INSERT INTO surveillance_recordings (camera_id,camera_name,kind,filename,started_utc,state) VALUES (?,?,?,?,?,?)',
                                    (camera['id'], camera['name'], 'video', 'pending', started, 'RECORDING'))
                ident = cursor.lastrowid
                filename = f'video-{ident:08d}.mp4'
                db.execute('UPDATE surveillance_recordings SET filename=? WHERE id=?', (filename, ident))
                db.commit()
            output = self.folder / filename
            try:
                # H.264/MP4 maximizes standard browser playback; stop gracefully to write MP4 metadata.
                proc = subprocess.Popen([shutil.which('ffmpeg'), '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
                    *_input_args(camera['source'], camera['location']), '-t', str(MAX_RECORD_SECONDS),
                    '-an', '-sn', '-dn', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart', '-f', 'mp4', str(output)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            except (OSError, SurveillanceError):
                with self._db() as db:
                    db.execute("UPDATE surveillance_recordings SET state='FAILED', ended_utc=? WHERE id=?", (_now(), ident))
                    db.commit()
                raise SurveillanceError('Could not start FFmpeg recording; check camera/device and encoder availability')
            self.active[camera['id']] = (ident, proc)
            return {'id': ident, 'state': 'STARTING', 'note': 'FFmpeg process launched; frames and connectivity have not yet been verified.'}

    def stop(self, camera_id):
        with self.lock:
            self._refresh()
            entry = self.active.pop(camera_id, None)
            if not entry:
                raise SurveillanceError('No active recording for this camera')
            ident, proc = entry
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGINT)
                except ProcessLookupError:
                    pass
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=3)
            output = self.folder / f'video-{ident:08d}.mp4'
            bytes_written = output.stat().st_size if output.is_file() else 0
            state = 'STOPPED' if bytes_written and proc.returncode in (0, 255) else 'FAILED'
            # FFmpeg often reports SIGINT as 255 after correctly finalizing MP4.
            with self._db() as db:
                db.execute('UPDATE surveillance_recordings SET state=?, ended_utc=? WHERE id=?',
                           (state, _now(), ident))
                db.commit()
            return {'id': ident, 'state': state, 'bytes': bytes_written}

    def snapshot(self, camera):
        with self.lock:
            if not shutil.which('ffmpeg'):
                raise SurveillanceError('FFmpeg is required for screenshots')
            if camera['source'] == 'USB' and not Path(camera['location']).exists():
                raise SurveillanceError('USB camera device is not connected')
            self._refresh()
            if camera['source'] == 'USB' and camera['id'] in self.active:
                raise SurveillanceError('Stop USB recording before taking another snapshot')
            if camera['source'] == 'USB' and self.preview_stopper:
                self.preview_stopper(camera['id'])
            with self._db() as db:
                if db.execute('SELECT COUNT(*) FROM surveillance_recordings').fetchone()[0] >= MAX_RECORDINGS:
                    raise SurveillanceError('Recording count limit reached')
                cur = db.execute('INSERT INTO surveillance_recordings (camera_id,camera_name,kind,filename,started_utc,state) VALUES (?,?,?,?,?,?)',
                    (camera['id'], camera['name'], 'image', 'pending', _now(), 'CAPTURING'))
                ident = cur.lastrowid
                filename = f'snapshot-{ident:08d}.jpg'
                db.execute('UPDATE surveillance_recordings SET filename=? WHERE id=?', (filename, ident))
                db.commit()
            path = self.folder / filename
            try:
                result = subprocess.run([shutil.which('ffmpeg'), '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
                    *_input_args(camera['source'], camera['location']), '-frames:v', '1', str(path)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=16, check=False)
                success = result.returncode == 0 and path.is_file() and path.stat().st_size > 0
            except (subprocess.TimeoutExpired, OSError):
                success = False
            with self._db() as db:
                db.execute('UPDATE surveillance_recordings SET state=?, ended_utc=? WHERE id=?',
                           ('FINISHED' if success else 'FAILED', _now(), ident))
                db.commit()
            if not success:
                path.unlink(missing_ok=True)
                raise SurveillanceError('Screenshot failed; camera stream or FFmpeg image capture unavailable')
            return {'id': ident, 'state': 'FINISHED'}

    def file(self, ident):
        if type(ident) is not int or ident < 1:
            raise SurveillanceError('Invalid recording ID')
        with self.lock:
            self._refresh()
            with self._db() as db:
                row = db.execute('SELECT * FROM surveillance_recordings WHERE id=?', (ident,)).fetchone()
            if not row or row['state'] in ('RECORDING', 'CAPTURING'):
                raise SurveillanceError('Recording is unavailable or still in progress')
            path = self.folder / row['filename']
            if not path.is_file():
                raise SurveillanceError('Recording file is missing')
            return path, 'image/jpeg' if row['kind'] == 'image' else 'video/mp4'

    def delete(self, ident):
        with self.lock:
            self._refresh()
            with self._db() as db:
                row = db.execute('SELECT * FROM surveillance_recordings WHERE id=?', (ident,)).fetchone()
                if not row:
                    return False
                if row['state'] in ('RECORDING', 'CAPTURING'):
                    raise SurveillanceError('Stop the recording before deleting it')
                (self.folder / row['filename']).unlink(missing_ok=True)
                db.execute('DELETE FROM surveillance_recordings WHERE id=?', (ident,))
                db.commit()
            return True

    def cleanup_preview(self, days):
        """User-requested, read-only age review; never touches active recordings."""
        if type(days) is not int or not 1 <= days <= 3650:
            raise SurveillanceError('Retention age must be 1–3650 days')
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with self.lock:
            self._refresh()
            with self._db() as db:
                rows = db.execute("SELECT * FROM surveillance_recordings WHERE started_utc < ? AND state NOT IN ('RECORDING','CAPTURING') ORDER BY id", (cutoff,)).fetchall()
            # Confirm IDs from DB and exclude even stale records that are active in this process.
            active_ids = {ident for ident, _ in self.active.values()}
            eligible = [row for row in rows if row['id'] not in active_ids]
            return {'days': days, 'ids': [row['id'] for row in eligible],
                    'count': len(eligible), 'bytes': sum(self._public(row)['bytes'] for row in eligible),
                    'note': 'Preview only. Nothing was deleted. You must confirm cleanup explicitly.'}

    def cleanup_apply(self, days, ids):
        """Explicit deletion of precisely reviewed IDs, rechecking age and activity."""
        if type(ids) is not list or len(ids) > MAX_RECORDINGS or any(type(i) is not int or i < 1 for i in ids) or len(set(ids)) != len(ids):
            raise SurveillanceError('Invalid cleanup selection')
        with self.lock:
            current = set(self.cleanup_preview(days)['ids'])
            if not set(ids).issubset(current):
                raise SurveillanceError('Cleanup selection is no longer eligible; review again')
            # Do not let a failed unlink silently discard media history.
            for ident in ids:
                self.delete(ident)
            return {'deleted': len(ids)}

    def close(self):
        with self.lock:
            for camera_id in list(self.active):
                try:
                    self.stop(camera_id)
                except (SurveillanceError, OSError):
                    pass
