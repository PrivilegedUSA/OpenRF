"""Explicit, offline analysis of an already saved Surveillance video.

Motion candidates are changes between sampled grayscale frames, not evidence of
people, activity at a particular location, or functioning camera hardware.
No live cameras are opened, no automatic jobs run, and no telemetry is invented.
"""
from __future__ import annotations

import shutil
import sqlite3
import subprocess
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .surveillance import SurveillanceError

WIDTH, HEIGHT = 128, 72
SAMPLE_FPS = 2
MAX_SCAN_SECONDS = 300
FRAME_BYTES = WIDTH * HEIGHT
MAX_OUTPUT_BYTES = MAX_SCAN_SECONDS * SAMPLE_FPS * FRAME_BYTES
SENSITIVITY = {'low': .12, 'medium': .06, 'high': .025}
PIXEL_DELTA = 36
MIN_GAP_FRAMES = 12  # six seconds between motion candidates


def detect_motion(raw: bytes, sensitivity: str):
    """Return (sampled seconds, frame-change evidence) for bounded raw frames."""
    if sensitivity not in SENSITIVITY:
        raise SurveillanceError('Choose low, medium or high motion sensitivity')
    if not raw or len(raw) % FRAME_BYTES or len(raw) > MAX_OUTPUT_BYTES:
        raise SurveillanceError('Video decoder returned invalid or oversized frames')
    frames = len(raw) // FRAME_BYTES
    if frames < 2:
        raise SurveillanceError('At least two decoded video frames are required')
    view = memoryview(raw)
    previous = view[:FRAME_BYTES]
    events = []
    last_event = -MIN_GAP_FRAMES
    for i in range(1, frames):
        current = view[i * FRAME_BYTES:(i + 1) * FRAME_BYTES]
        changed = sum(abs(a - b) > PIXEL_DELTA for a, b in zip(current, previous))
        fraction = changed / FRAME_BYTES
        if fraction >= SENSITIVITY[sensitivity] and i - last_event >= MIN_GAP_FRAMES:
            events.append({'offset_seconds': i / SAMPLE_FPS, 'changed_fraction': round(fraction, 4)})
            last_event = i
        previous = current
    return frames / SAMPLE_FPS, events


class MotionHistory:
    """Scan saved videos only, keeping scan receipts and candidates in local SQLite."""

    def __init__(self, recording_manager):
        self.recordings = recording_manager
        self.db_path = Path(recording_manager.db_path)
        self.busy = threading.BoundedSemaphore(1)
        with self._db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS surveillance_motion_scans (
                recording_id INTEGER PRIMARY KEY, camera_id INTEGER NOT NULL,
                camera_name TEXT NOT NULL, recorded_utc TEXT NOT NULL,
                scanned_utc TEXT NOT NULL, sensitivity TEXT NOT NULL,
                sampled_seconds REAL NOT NULL, event_count INTEGER NOT NULL)''')
            db.execute('''CREATE TABLE IF NOT EXISTS surveillance_motion_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recording_id INTEGER NOT NULL, camera_id INTEGER NOT NULL,
                camera_name TEXT NOT NULL, offset_seconds REAL NOT NULL,
                changed_fraction REAL NOT NULL, scanned_utc TEXT NOT NULL)''')
            db.execute('CREATE INDEX IF NOT EXISTS surveillance_motion_events_rec ON surveillance_motion_events(recording_id)')

    @contextmanager
    def _db(self):
        db = sqlite3.connect(str(self.db_path), timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def history(self):
        with self._db() as db:
            db.row_factory = sqlite3.Row
            scans = [dict(row) for row in db.execute('SELECT * FROM surveillance_motion_scans ORDER BY scanned_utc DESC, recording_id DESC LIMIT 100')]
            events = [dict(row) for row in db.execute('SELECT * FROM surveillance_motion_events ORDER BY id DESC LIMIT 200')]
        # Report whether the source recording is still playable; never imply an
        # event remains backed by existing footage after media cleanup.
        with self.recordings.lock:
            with self.recordings._db() as db:
                present = {row['id']: (self.recordings.folder / row['filename']).is_file()
                           for row in db.execute("SELECT id, filename FROM surveillance_recordings WHERE kind='video'")}
        for scan in scans:
            scan['source_available'] = bool(present.get(scan['recording_id'], False))
        for event in events:
            event['source_available'] = bool(present.get(event['recording_id'], False))
        return {'scans': scans, 'events': events, 'mode': 'ON_DEMAND_SAVED_VIDEO_ONLY',
                'note': 'Frame changes are motion candidates, not person detection or live camera alerts.'}

    def scan(self, recording_id, sensitivity='medium'):
        if type(recording_id) is not int or not 1 <= recording_id <= 2147483647:
            raise SurveillanceError('Invalid recording ID')
        if type(sensitivity) is not str or sensitivity not in SENSITIVITY:
            raise SurveillanceError('Choose low, medium or high motion sensitivity')
        if not self.busy.acquire(blocking=False):
            raise SurveillanceError('A saved-video motion scan is already running')
        try:
            if not shutil.which('ffmpeg'):
                raise SurveillanceError('Install FFmpeg to analyze saved video')
            with self.recordings.lock:
                self.recordings._refresh()
                with self.recordings._db() as db:
                    row = db.execute('SELECT * FROM surveillance_recordings WHERE id=?', (recording_id,)).fetchone()
                    if not row or row['kind'] != 'video' or row['state'] not in ('STOPPED', 'FINISHED'):
                        raise SurveillanceError('Choose a completed local video recording (not a snapshot or active recording)')
                    record = dict(row)
                    path = self.recordings.folder / row['filename']
                    if not path.is_file() or path.stat().st_size == 0:
                        raise SurveillanceError('The saved video file is unavailable')
            args = [shutil.which('ffmpeg'), '-nostdin', '-hide_banner', '-loglevel', 'error',
                    '-i', str(path), '-t', str(MAX_SCAN_SECONDS), '-an', '-sn', '-dn',
                    '-vf', f'fps={SAMPLE_FPS},scale={WIDTH}:{HEIGHT}:flags=fast_bilinear,format=gray',
                    '-frames:v', str(MAX_SCAN_SECONDS * SAMPLE_FPS), '-f', 'rawvideo',
                    '-pix_fmt', 'gray', 'pipe:1']
            try:
                result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        timeout=45, check=False)
            except subprocess.TimeoutExpired as exc:
                raise SurveillanceError('Motion scan timed out; try a shorter recording') from exc
            except OSError as exc:
                raise SurveillanceError('Cannot launch FFmpeg motion decoder') from exc
            if result.returncode or not result.stdout:
                raise SurveillanceError('The saved video could not be decoded into motion samples')
            seconds, events = detect_motion(result.stdout, sensitivity)
            with self.recordings.lock:
                with self.recordings._db() as db:
                    current = db.execute('SELECT filename,kind,state FROM surveillance_recordings WHERE id=?', (recording_id,)).fetchone()
                    if (not current or current['filename'] != record['filename']
                            or current['kind'] != 'video' or current['state'] not in ('STOPPED', 'FINISHED')
                            or not path.is_file()):
                        raise SurveillanceError('Source video changed during motion scan; results were not saved')
                now = datetime.now(timezone.utc).isoformat()
                with self._db() as db:
                    db.execute('DELETE FROM surveillance_motion_events WHERE recording_id=?', (recording_id,))
                    db.execute('''INSERT OR REPLACE INTO surveillance_motion_scans
                        (recording_id,camera_id,camera_name,recorded_utc,scanned_utc,sensitivity,sampled_seconds,event_count)
                        VALUES (?,?,?,?,?,?,?,?)''', (recording_id, record['camera_id'], record['camera_name'],
                            record['started_utc'], now, sensitivity, seconds, len(events)))
                    db.executemany('''INSERT INTO surveillance_motion_events
                        (recording_id,camera_id,camera_name,offset_seconds,changed_fraction,scanned_utc)
                        VALUES (?,?,?,?,?,?)''', [(recording_id, record['camera_id'], record['camera_name'],
                            event['offset_seconds'], event['changed_fraction'], now) for event in events])
                    db.commit()
            return {'recording_id': recording_id, 'camera_name': record['camera_name'],
                    'sampled_seconds': seconds, 'sensitivity': sensitivity,
                    'event_count': len(events), 'sample_fps': SAMPLE_FPS, 'max_scan_seconds': MAX_SCAN_SECONDS,
                    'mode': 'ON_DEMAND_SAVED_VIDEO_ONLY',
                    'note': 'Candidates are based on sampled pixel changes. No live camera was monitored.'}
        finally:
            self.busy.release()

    def delete_history(self, recording_id):
        if type(recording_id) is not int or not 1 <= recording_id <= 2147483647:
            raise SurveillanceError('Invalid recording ID')
        with self._db() as db:
            db.execute('DELETE FROM surveillance_motion_events WHERE recording_id=?', (recording_id,))
            deleted = db.execute('DELETE FROM surveillance_motion_scans WHERE recording_id=?', (recording_id,)).rowcount
            db.commit()
        return bool(deleted)
