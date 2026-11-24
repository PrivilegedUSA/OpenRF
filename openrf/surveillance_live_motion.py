"""Opt-in, bounded live motion *candidate* detection and local clip requests.

The only source is an explicitly selected saved camera. No scheduled jobs, cloud
requests or automatic resume. Frame-change evidence is NOT person detection.
"""
from __future__ import annotations

import shutil
import sqlite3
import subprocess
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .surveillance import SurveillanceError
from .surveillance_motion import FRAME_BYTES, PIXEL_DELTA, SENSITIVITY, WIDTH, HEIGHT, SAMPLE_FPS
from .surveillance_recording import _input_args

MAX_MONITOR_SECONDS = 20 * 60
CLIP_SECONDS = 20
COOLDOWN_SECONDS = 30
WARMUP_FRAMES = 4


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def frame_change(previous: bytes, current: bytes) -> float:
    if len(previous) != FRAME_BYTES or len(current) != FRAME_BYTES:
        raise SurveillanceError('Invalid sampled video frame size')
    return sum(abs(a - b) > PIXEL_DELTA for a, b in zip(previous, current)) / FRAME_BYTES


def read_frame(stream):
    result = bytearray()
    while len(result) < FRAME_BYTES:
        data = stream.read(FRAME_BYTES - len(result))
        if not data:
            return None
        result.extend(data)
    return bytes(result)


class LiveMotionService:
    """At most one opt-in monitoring session; state only lives in this process."""

    def __init__(self, db_path, recordings):
        self.db_path = Path(db_path)
        self.recordings = recordings
        self.lock = threading.RLock()
        self.current = None
        self.last = {'state': 'OFF', 'detail': 'Live motion monitoring is off.'}
        with self._db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS surveillance_live_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, camera_id INTEGER NOT NULL,
                camera_name TEXT NOT NULL, detected_utc TEXT NOT NULL,
                changed_fraction REAL NOT NULL, sensitivity TEXT NOT NULL,
                action TEXT NOT NULL, recording_id INTEGER)''')
            db.execute('CREATE INDEX IF NOT EXISTS surveillance_live_events_camera ON surveillance_live_events(camera_id, id)')

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
            rows = db.execute('SELECT * FROM surveillance_live_events ORDER BY id DESC LIMIT 100').fetchall()
            events = [dict(item) for item in rows]
        # A historical event is not proof that the video still exists after cleanup.
        if hasattr(self.recordings, 'folder'):
            with self.recordings.lock, self.recordings._db() as db:
                present = {row['id']: (self.recordings.folder / row['filename']).is_file()
                           for row in db.execute("SELECT id, filename FROM surveillance_recordings WHERE kind='video'")}
            for event in events:
                event['source_available'] = bool(present.get(event['recording_id'], False))
        else:
            for event in events:
                event['source_available'] = False  # Synthetic/mock recording receipts aren't playable.

        return events

    def status(self):
        with self.lock:
            if self.current is None:
                return dict(self.last)
            ctx = self.current
            return {'state': ctx['state'], 'camera_id': ctx['camera']['id'],
                    'camera_name': ctx['camera']['name'], 'started_utc': ctx['started_utc'],
                    'last_frame_utc': ctx['last_frame_utc'], 'candidates': ctx['candidates'],
                    'sensitivity': ctx['sensitivity'], 'detail': ctx['detail'],
                    'recording_id': ctx['owned_recording_id'],
                    'max_session_seconds': MAX_MONITOR_SECONDS,
                    'clip_seconds': CLIP_SECONDS}

    def start(self, camera, sensitivity):
        if type(sensitivity) is not str or sensitivity not in SENSITIVITY:
            raise SurveillanceError('Choose low, medium or high motion sensitivity')
        if not shutil.which('ffmpeg'):
            raise SurveillanceError('Install FFmpeg before starting live motion monitoring')
        if camera['source'] == 'USB' and not Path(camera['location']).exists():
            raise SurveillanceError('USB video device not present')
        # Validate location before starting a thread, including explicit RFC1918 RTSP.
        _input_args(camera['source'], camera['location'])
        with self.lock:
            if self.current is not None:
                raise SurveillanceError('Stop the existing live motion monitor first (maximum one camera)')
            ctx = {'camera': camera, 'sensitivity': sensitivity, 'stop': threading.Event(),
                   'process': None, 'state': 'STARTING', 'detail': 'FFmpeg starting; no frames verified yet.',
                   'started_utc': utc_now(), 'last_frame_utc': None, 'candidates': 0,
                   'owned_recording_id': None, 'clip_deadline': 0, 'event_id': None,
                   'thread': None, 'expired': False, 'clip_timer': None}
            thread = threading.Thread(target=self._run, args=(ctx,), daemon=True, name='openrf-live-motion')
            ctx['thread'] = thread
            self.current = ctx
            try:
                thread.start()
            except RuntimeError:
                self.current = None
                raise SurveillanceError('Could not start live motion worker')
            return self.status()

    def stop(self, camera_id=None):
        with self.lock:
            ctx = self.current
            if ctx is None:
                return self.status()
            if camera_id is not None and ctx['camera']['id'] != camera_id:
                raise SurveillanceError('This camera is not the active motion monitor')
            ctx['stop'].set()
            ctx['state'] = 'STOPPING'
            ctx['detail'] = 'Stopping monitor and any recording it started.'
            process = ctx['process']
            thread = ctx['thread']
        if process and process.poll() is None:
            try:
                process.terminate()
            except OSError:
                pass
        if thread and thread is not threading.current_thread():
            thread.join(timeout=7)
        return self.status()

    def _event(self, ctx, changed):
        action, recording_id = 'RECORDING_NOT_STARTED', None
        if not ctx['stop'].is_set():
            try:
                receipt = self.recordings.start(ctx['camera'])
                recording_id = receipt['id']
                action = 'RECORDING_REQUESTED'  # FFmpeg launch is NOT proof of saved footage.
                ctx['owned_recording_id'] = recording_id
                ctx['clip_deadline'] = time.monotonic() + CLIP_SECONDS
            except (SurveillanceError, OSError):
                action = 'RECORDING_UNAVAILABLE'
        with self._db() as db:
            cur = db.execute('''INSERT INTO surveillance_live_events
                (camera_id,camera_name,detected_utc,changed_fraction,sensitivity,action,recording_id)
                VALUES (?,?,?,?,?,?,?)''',
                (ctx['camera']['id'], ctx['camera']['name'], utc_now(), round(changed, 4),
                 ctx['sensitivity'], action, recording_id))
            ctx['event_id'] = cur.lastrowid if recording_id is not None else None
        with self.lock:
            if recording_id is not None:
                # Independent wall-clock clip stop: no stream frames are needed to end a clip.
                timer = threading.Timer(CLIP_SECONDS, self._finish_owned_clip, args=(ctx,))
                timer.daemon = True
                ctx['clip_timer'] = timer
                timer.start()
            ctx['candidates'] += 1
            ctx['detail'] = 'Frame change detected; short recording requested.' if recording_id else 'Frame change detected; recording could not start.'

    def _finish_owned_clip(self, ctx):
        with self.lock:
            ident = ctx['owned_recording_id']
            if ident is None:
                return
            ctx['owned_recording_id'] = None
            event_id = ctx['event_id']
            timer = ctx['clip_timer']
            ctx['clip_timer'] = None
        if timer:
            timer.cancel()
        try:
            self.recordings.stop(ctx['camera']['id'])
        except SurveillanceError:
            pass
        # Only call it saved once actual media bytes exist in the local library.
        media = next((item for item in self.recordings.list() if item['id'] == ident), None)
        action = 'MEDIA_SAVED' if media and media['bytes'] > 0 and media['state'] in ('STOPPED', 'FINISHED') else 'CAPTURE_FAILED'
        with self._db() as db:
            db.execute('UPDATE surveillance_live_events SET action=? WHERE id=? AND recording_id=?',
                       (action, event_id, ident))
        with self.lock:
            ctx['detail'] = 'Motion clip saved locally.' if action == 'MEDIA_SAVED' else 'Motion clip did not produce verified playable media.'

    def _run(self, ctx):
        proc = None
        watchdog = None
        reason = 'ENDED'
        try:
            ffmpeg = shutil.which('ffmpeg')
            if not ffmpeg:
                raise SurveillanceError('FFmpeg became unavailable')
            args = [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error',
                    *_input_args(ctx['camera']['source'], ctx['camera']['location']),
                    '-t', str(MAX_MONITOR_SECONDS), '-an', '-sn', '-dn',
                    '-vf', f'fps={SAMPLE_FPS},scale={WIDTH}:{HEIGHT}:flags=fast_bilinear,format=gray',
                    '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1']
            proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    stdin=subprocess.DEVNULL, start_new_session=True, bufsize=0)
            with self.lock:
                ctx['process'] = proc
            def expire():
                with self.lock:
                    ctx['expired'] = True
                    ctx['stop'].set()
                if proc.poll() is None:
                    try:
                        proc.terminate()
                    except OSError:
                        pass
            # Enforce wall-clock expiration even if FFmpeg stalls before emitting frames.
            watchdog = threading.Timer(MAX_MONITOR_SECONDS, expire)
            watchdog.daemon = True
            watchdog.start()
            previous = None
            seen = 0
            last_trigger = -COOLDOWN_SECONDS
            began = time.monotonic()
            while not ctx['stop'].is_set():
                if time.monotonic() - began >= MAX_MONITOR_SECONDS:
                    reason = 'EXPIRED'
                    break
                frame = read_frame(proc.stdout)
                if frame is None:
                    reason = 'STREAM_ENDED' if seen else 'NO_FRAMES'
                    break
                with self.lock:
                    ctx['state'] = 'MONITORING'
                    ctx['last_frame_utc'] = utc_now()
                    if seen == 0:
                        ctx['detail'] = 'Receiving decoded frames. Monitoring until stopped or session expires.'
                seen += 1
                now = time.monotonic()
                if ctx['owned_recording_id'] and now >= ctx['clip_deadline']:
                    self._finish_owned_clip(ctx)
                if previous is not None and seen > WARMUP_FRAMES and not ctx['owned_recording_id']:
                    fraction = frame_change(previous, frame)
                    if fraction >= SENSITIVITY[ctx['sensitivity']] and now - last_trigger >= COOLDOWN_SECONDS:
                        if ctx['stop'].is_set():
                            break
                        last_trigger = now
                        self._event(ctx, fraction)
                previous = frame
        except (OSError, SurveillanceError, sqlite3.Error) as exc:
            reason = 'UNAVAILABLE'
            with self.lock:
                ctx['detail'] = f'Live motion worker stopped ({type(exc).__name__}). Check FFmpeg, camera and local storage.'
        finally:
            if watchdog:
                watchdog.cancel()
            if proc:
                if proc.poll() is None:
                    try:
                        proc.terminate()
                        proc.wait(timeout=3)
                    except (OSError, subprocess.TimeoutExpired):
                        try:
                            proc.kill()
                            proc.wait(timeout=2)
                        except (OSError, subprocess.TimeoutExpired):
                            pass
                if proc.stdout:
                    proc.stdout.close()
            self._finish_owned_clip(ctx)
            with self.lock:
                if ctx['expired']:
                    reason = 'EXPIRED'
                elif ctx['stop'].is_set():
                    reason = 'STOPPED'
                ctx['state'] = reason
                ctx['process'] = None
                self.last = {'state': reason, 'camera_id': ctx['camera']['id'],
                             'camera_name': ctx['camera']['name'],
                             'last_frame_utc': ctx['last_frame_utc'],
                             'candidates': ctx['candidates'], 'detail': ctx['detail']}
                if self.current is ctx:
                    self.current = None

    def close(self):
        self.stop()
