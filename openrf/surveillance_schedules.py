"""Opt-in, process-lifetime recording schedules for locally configured cameras.

Definitions persist in private SQLite; *arming never persists*. On each app restart,
all schedules are disarmed until a user explicitly arms them again. This service
never opens a camera during construction, listing or schedule creation.
"""
from __future__ import annotations

import re
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .surveillance import SurveillanceError

MAX_SCHEDULES = 16
DAY_SET = frozenset(range(7))  # Monday = 0, Sunday = 6


def _minute(value):
    if not isinstance(value, str) or not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]', value):
        raise SurveillanceError('Enter a 24-hour time in HH:MM format')
    return int(value[:2]) * 60 + int(value[-2:])


def _timezone(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_+\-]{1,36}(?:/[A-Za-z0-9_+\-]{1,36}){0,3}', value) or len(value) > 80:
        raise SurveillanceError('Choose a valid IANA time zone')
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise SurveillanceError('Time zone data is unavailable for this schedule') from exc
    return value


def in_window(schedule, utc_now):
    """Same-day local wall-clock windows; no ambiguous overnight schedules."""
    local = utc_now.astimezone(ZoneInfo(schedule['time_zone']))
    minutes = local.hour * 60 + local.minute
    return (local.weekday() in schedule['weekdays'] and
            _minute(schedule['start_time']) <= minutes < _minute(schedule['end_time']))


class SurveillanceSchedules:
    def __init__(self, db_path, cameras, recordings, *, start_thread=True):
        self.db_path = Path(db_path)
        self.cameras, self.recordings = cameras, recordings
        self.lock = threading.RLock()
        self.armed = False
        self.owned = {}  # camera id -> recording id; never stop a user's separate recording
        self.suppressed = set()
        self.errors = {}
        self.last_attempt = {}
        self.wake = threading.Event()
        self.closed = False
        with self._db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS surveillance_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT, camera_id INTEGER NOT NULL UNIQUE,
                weekdays TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
                time_zone TEXT NOT NULL, created_utc TEXT NOT NULL)''')
        self.thread = None
        if start_thread:
            self.thread = threading.Thread(target=self._worker, daemon=True, name='openrf-surveillance-schedule')
            self.thread.start()

    @contextmanager
    def _db(self):
        db = sqlite3.connect(str(self.db_path), timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def _schedules(self):
        with self._db() as db:
            rows = db.execute('SELECT * FROM surveillance_schedules ORDER BY id').fetchall()
        return [dict(row, weekdays=[int(day) for day in row['weekdays'].split(',')]) for row in rows]

    def status(self):
        with self.lock:
            schedules = self._schedules()
            for item in schedules:
                cam = item['camera_id']
                item['state'] = ('RECORDING' if cam in self.owned else
                                 'DISARMED' if not self.armed else
                                 'ERROR' if cam in self.errors else 'ARMED_WAITING')
                item['detail'] = self.errors.get(cam, '') if self.armed else 'Arm schedules to enable recording this session.'
            return {'armed': self.armed, 'schedules': schedules,
                    'active_camera_ids': sorted(self.owned),
                    'note': 'Schedule definitions persist. Arming is intentionally reset at every application start; times use each schedule’s IANA time zone.'}

    def add(self, data):
        if not isinstance(data, dict) or set(data) != {'camera_id', 'weekdays', 'start_time', 'end_time', 'time_zone'}:
            raise SurveillanceError('Provide camera, weekdays, start, end, and time zone')
        cam = data['camera_id']
        if type(cam) is not int or cam <= 0:
            raise SurveillanceError('Choose a saved camera')
        self.cameras.get_source(cam)  # Read only; never connect.
        days = data['weekdays']
        if (not isinstance(days, list) or not days or len(days) > 7 or
                any(type(day) is not int or day not in DAY_SET for day in days) or len(set(days)) != len(days)):
            raise SurveillanceError('Choose one or more unique weekdays')
        start, end = _minute(data['start_time']), _minute(data['end_time'])
        if end <= start:
            raise SurveillanceError('End must be later on the same day; overnight windows are not supported yet')
        tz = _timezone(data['time_zone'])
        with self.lock, self._db() as db:
            if db.execute('SELECT COUNT(*) FROM surveillance_schedules').fetchone()[0] >= MAX_SCHEDULES:
                raise SurveillanceError('At most 16 camera schedules are supported')
            if db.execute('SELECT 1 FROM surveillance_schedules WHERE camera_id=?', (cam,)).fetchone():
                raise SurveillanceError('This camera already has a schedule; delete it before adding another')
            cursor = db.execute('INSERT INTO surveillance_schedules (camera_id,weekdays,start_time,end_time,time_zone,created_utc) VALUES (?,?,?,?,?,?)',
                        (cam, ','.join(map(str, sorted(days))), data['start_time'], data['end_time'], tz,
                         datetime.now(timezone.utc).isoformat()))
            ident = cursor.lastrowid
        self.wake.set()
        return {'id': ident, 'state': 'SAVED', 'note': 'Saved but not automatically armed.'}

    def remove(self, ident):
        if type(ident) is not int or ident <= 0:
            raise SurveillanceError('Invalid schedule ID')
        with self.lock, self._db() as db:
            row = db.execute('SELECT camera_id FROM surveillance_schedules WHERE id=?', (ident,)).fetchone()
            if not row:
                return False
            self._stop_owned(row['camera_id'])
            self.suppressed.discard(row['camera_id'])
            self.errors.pop(row['camera_id'], None)
            db.execute('DELETE FROM surveillance_schedules WHERE id=?', (ident,))
        self.wake.set()
        return True

    def remove_camera(self, camera_id):
        with self.lock, self._db() as db:
            self._stop_owned(camera_id)
            db.execute('DELETE FROM surveillance_schedules WHERE camera_id=?', (camera_id,))
            self.suppressed.discard(camera_id)
            self.errors.pop(camera_id, None)

    def arm(self, enabled):
        if type(enabled) is not bool:
            raise SurveillanceError('Armed must be true or false')
        with self.lock:
            if self.closed:
                raise SurveillanceError('Schedule service is closed')
            if not enabled:
                self.armed = False
                for cam in list(self.owned):
                    self._stop_owned(cam)
                self.errors.clear()
                self.suppressed.clear()
            else:
                if not self._schedules():
                    raise SurveillanceError('Create a recording schedule before arming')
                self.armed = True
            self.wake.set()
            return self.status()

    def pause_camera(self, camera_id):
        """Stop a schedule-owned recording; suppress restart until window ends."""
        with self.lock:
            if camera_id not in self.owned:
                return False
            self.suppressed.add(camera_id)
            self._stop_owned(camera_id)
            return True

    def _stop_owned(self, camera_id):
        ident = self.owned.pop(camera_id, None)
        if ident is None:
            return
        # Hold recording lock across ID check & stop so a manual recording
        # started concurrently can never be stopped by schedule cleanup.
        with self.recordings.lock:
            self.recordings._refresh()
            current = self.recordings.active.get(camera_id)
            if current and current[0] == ident:
                try:
                    self.recordings.stop(camera_id)
                except (SurveillanceError, OSError):
                    pass

    def tick(self, now=None):
        """Run a single schedule evaluation; separately testable without hardware."""
        now = now or datetime.now(timezone.utc)
        with self.lock:
            if not self.armed or self.closed:
                return
            schedules = self._schedules()
            for item in schedules:
                cam = item['camera_id']
                active = in_window(item, now)
                if not active:
                    self.suppressed.discard(cam)
                    self.errors.pop(cam, None)
                    self.last_attempt.pop(cam, None)
                    self._stop_owned(cam)
                    continue
                if cam in self.suppressed:
                    continue
                if cam in self.owned:
                    with self.recordings.lock:
                        self.recordings._refresh()
                        current = self.recordings.active.get(cam)
                    if current and current[0] == self.owned[cam]:
                        continue
                    self.owned.pop(cam, None)  # FFmpeg may have reached one-hour cap.
                if time.monotonic() - self.last_attempt.get(cam, float('-inf')) < 60:
                    continue
                self.last_attempt[cam] = time.monotonic()
                try:
                    source = self.cameras.get_source(cam)
                    receipt = self.recordings.start(source)
                    self.owned[cam] = receipt['id']
                    self.errors.pop(cam, None)
                except (SurveillanceError, OSError):
                    # Do not expose camera URLs or credentials from exceptions.
                    self.errors[cam] = 'Could not start camera recording. Check device, FFmpeg, camera availability and storage.'

    def _worker(self):
        while not self.closed:
            self.wake.wait(timeout=3)
            self.wake.clear()
            try:
                self.tick()
            except (SurveillanceError, sqlite3.Error, OSError):
                pass

    def close(self):
        with self.lock:
            self.armed = False
            self.closed = True
            self.wake.set()
            for cam in list(self.owned):
                self._stop_owned(cam)
        if self.thread and self.thread is not threading.current_thread():
            self.thread.join(timeout=5)
