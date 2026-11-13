"""Explicit, bounded rtl_power capture on the loopback-only Linux backend.

No background scan is started on boot. The only subprocess is a trusted local
rtl_power binary with validated fixed arguments, no shell or browser paths.
File timestamps reported by rtl_power have *unknown timezone*. Host UTC
start/finish timestamps must never be represented as per-bin measurement times.
"""
from __future__ import annotations

import json
import math
import os
import re
import secrets
import shutil
import subprocess
import threading
from datetime import date, datetime, time as clock, timezone
from pathlib import Path

from .sdr_survey import normalize_capture_fix

MAX_CSV_BYTES = 2 * 1024 * 1024
MAX_SAVED_CAPTURES = 50
CAPTURE_RANGE_MHZ = (24, 1766)  # conservative software input guard, NOT verified hardware coverage
CAPTURE_DURATION_SECONDS = (5, 30)
CAPTURE_STEPS_KHZ = (25, 500)
CAPTURE_MAX_BINS = 2048
_CAPTURE_ID = re.compile(r'[0-9a-f]{16}\Z')


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class CaptureError(Exception):
    def __init__(self, message: str, code: str = 'capture_unavailable', status: int = 409):
        super().__init__(message)
        self.code, self.status = code, status


def validate_settings(settings: dict) -> dict:
    if not isinstance(settings, dict) or set(settings) != {'start_mhz', 'stop_mhz', 'step_khz', 'duration_seconds'}:
        raise CaptureError('Provide start_mhz, stop_mhz, step_khz and duration_seconds only.', 'invalid_capture_settings', 400)
    result = {}
    for key in ('start_mhz', 'stop_mhz', 'step_khz', 'duration_seconds'):
        value = settings[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise CaptureError(f'{key} must be a finite number.', 'invalid_capture_settings', 400)
        if int(value) != value:
            raise CaptureError(f'{key} must be a whole number.', 'invalid_capture_settings', 400)
        result[key] = int(value)
    low, high = result['start_mhz'], result['stop_mhz']
    step, duration = result['step_khz'], result['duration_seconds']
    if not (CAPTURE_RANGE_MHZ[0] <= low < high <= CAPTURE_RANGE_MHZ[1]):
        raise CaptureError('Choose an input range within 24–1766 MHz (receiver coverage is unverified).', 'invalid_capture_settings', 400)
    if not CAPTURE_STEPS_KHZ[0] <= step <= CAPTURE_STEPS_KHZ[1] or (high - low) * 1000 / step > CAPTURE_MAX_BINS:
        raise CaptureError('Choose a 25–500 kHz step and no more than 2048 nominal bins.', 'invalid_capture_settings', 400)
    if not CAPTURE_DURATION_SECONDS[0] <= duration <= CAPTURE_DURATION_SECONDS[1]:
        raise CaptureError('Capture duration must be 5–30 seconds.', 'invalid_capture_settings', 400)
    return result


def validate_rtl_power_csv(raw: bytes) -> dict:
    """Validate rows actually written by a process, rather than trusting its exit code."""
    if not raw or len(raw) > MAX_CSV_BYTES:
        raise CaptureError('Capture has no data or exceeds the 2 MB safety limit.', 'invalid_capture_output')
    try:
        rows = raw.decode('utf-8-sig').splitlines()
    except UnicodeDecodeError as exc:
        raise CaptureError('Capture output is not valid UTF-8 CSV.', 'invalid_capture_output') from exc
    valid, bins, frames = 0, 0, set()
    for line in rows:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        fields = [cell.strip() for cell in line.split(',')]
        if not 7 <= len(fields) <= 4102:
            continue
        try:
            date.fromisoformat(fields[0])
            clock.fromisoformat(fields[1])
            lo, hi, step, samples = (float(field) for field in fields[2:6])
            values = [float(field) for field in fields[6:] if field]
            if len(values) != len(fields) - 6 or not all(math.isfinite(x) and -300 <= x <= 150 for x in values):
                continue
            if not all(map(math.isfinite, (lo, hi, step, samples))) or not (1000 <= lo < hi <= 3e10 and step > 0 and samples >= 1 and samples.is_integer()):
                continue
            if abs((hi - lo) / step - len(values)) > 2.25:
                continue
        except (TypeError, ValueError, OverflowError):
            continue
        valid += 1
        bins += len(values)
        frames.add((fields[0], fields[1]))
    if not valid:
        raise CaptureError('rtl_power produced no valid spectrum bins; receiver and drivers unverified.', 'invalid_capture_output')
    return {'accepted_rows': valid, 'reported_bins': bins, 'frames': len(frames),
            'reported_amplitude_unit': 'rtl_power dB (not calibrated dBm)',
            'sample_time_timezone': 'UNVERIFIED', 'receiver_identity_verified': False}


class SdrCaptureManager:
    def __init__(self, folder: Path, *, lookup=None, popen=None):
        self.folder = Path(folder)
        self.lookup = lookup or shutil.which
        self.popen = popen or subprocess.Popen
        self.lock = threading.RLock()
        self.active = None
        self.last = None
        self.closed = False

    def _record_path(self, capture_id: str, extension: str) -> Path:
        if not isinstance(capture_id, str) or not _CAPTURE_ID.fullmatch(capture_id):
            raise CaptureError('Invalid capture identifier.', 'invalid_capture_id', 400)
        return self.folder / (capture_id + extension)

    def _save(self, record: dict):
        target = self._record_path(record['id'], '.json')
        temp = self._record_path(record['id'], '.json.tmp')
        with open(temp, 'x', encoding='utf-8') as fp:
            json.dump(record, fp, ensure_ascii=True)
        os.replace(temp, target)

    def _public(self, record):
        if record is None:
            return None
        # no absolute paths, stderr, USB identifiers, raw device details or secrets exposed
        return {key: record[key] for key in ('id', 'state', 'settings', 'started_at_utc',
                  'finished_at_utc', 'summary', 'error', 'exit_code', 'observer_fix', 'session_id') if key in record}

    def status(self) -> dict:
        with self.lock:
            return {'current': self._public(self.active or self.last),
                    'running': bool(self.active), 'capture_type': 'USER_STARTED_BOUNDED_RTL_POWER',
                    'receiver_identity_verified': False, 'continuous_scan': False}

    def list_saved(self) -> list[dict]:
        if not self.folder.exists():
            return []
        records = []
        for p in sorted(self.folder.glob('*.json'), reverse=True):
            if p.is_symlink() or not _CAPTURE_ID.fullmatch(p.stem):
                continue
            try:
                if p.stat().st_size > 8192:
                    continue
                record = json.loads(p.read_text(encoding='utf-8'))
                if record.get('id') != p.stem:
                    continue
                item = self._public(record)
                if item['state'] == 'RUNNING' and not (self.active and self.active['id'] == p.stem):
                    item['state'] = 'INTERRUPTED'
                records.append(item)
            except (OSError, ValueError, TypeError, KeyError):
                continue
        return sorted(records, key=lambda r: r.get('started_at_utc', ''), reverse=True)[:MAX_SAVED_CAPTURES]

    def list_sites(self, session_id: int | None = None) -> list[dict]:
        """Only completed, explicitly located captures; failed sweeps are not evidence."""
        if session_id is not None and (type(session_id) is not int or session_id < 1):
            raise CaptureError('Invalid investigation ID', 'invalid_session_id', 400)
        return [capture for capture in self.list_saved()
                if capture.get('state') == 'COMPLETE' and capture.get('observer_fix') is not None
                and (session_id is None or capture.get('session_id') == session_id)]

    def start(self, settings: dict, *, survey_location=None, session_id=None) -> dict:
        settings = validate_settings(settings)
        try:
            fix = normalize_capture_fix(survey_location)
        except ValueError as exc:
            raise CaptureError(str(exc), 'invalid_survey_location', 400) from exc
        if session_id is not None and (type(session_id) is not int or not 1 <= session_id <= 2_147_483_647):
            raise CaptureError('Invalid investigation ID', 'invalid_session_id', 400)
        with self.lock:
            if self.closed:
                raise CaptureError('Capture manager is shutting down.')
            if self.active:
                raise CaptureError('Another RTL-SDR capture is already running.', 'capture_busy')
            executable = self.lookup('rtl_power')
            if not executable:
                raise CaptureError('rtl_power is not installed or not accessible from this Linux environment.', 'rtl_power_missing', 503)
            if len(self.list_saved()) >= MAX_SAVED_CAPTURES:
                raise CaptureError('50 saved captures reached. Delete an old capture before recording.', 'capture_limit')
            self.folder.mkdir(parents=True, exist_ok=True, mode=0o700)
            capture_id = secrets.token_hex(8)
            capture_file = self._record_path(capture_id, '.csv')
            record = {'id': capture_id, 'state': 'RUNNING', 'settings': settings,
                      'started_at_utc': utc_now(), 'receiver_identity_verified': False,
                      'sample_timestamp_timezone': 'UNVERIFIED',
                      'session_id': session_id, 'observer_fix': fix}
            # -d 0 is a user-authorized request for index 0, *not* a device identity claim.
            # rtl_power writes a CSV file; never accept an arbitrary filename or command from HTTP.
            argv = [executable, '-d', '0', '-f', f"{settings['start_mhz']}M:{settings['stop_mhz']}M:{settings['step_khz']}k",
                    '-i', '1s', '-e', f"{settings['duration_seconds']}s", str(capture_file)]
            try:
                self._save(record)
                process = self.popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.PIPE, start_new_session=True)
            except OSError as exc:
                self._record_path(capture_id, '.json').unlink(missing_ok=True)
                raise CaptureError('Unable to launch rtl_power on this Linux system.', 'capture_launch_failed') from exc
            self.active = record
            self.last = record
            runner = threading.Thread(target=self._watch, args=(record, process), daemon=True,
                                      name='openrf-rtl-power')
            record['_process'] = process
            record['_thread'] = runner
            runner.start()
            return self._public(record)

    def _watch(self, record, process):
        settings = record['settings']
        try:
            try:
                _, stderr = process.communicate(timeout=settings['duration_seconds'] + 15)
            except subprocess.TimeoutExpired:
                process.kill()
                _, stderr = process.communicate(timeout=3)
                raise CaptureError('rtl_power exceeded the bounded capture time.', 'capture_timeout')
            code = process.returncode
            if record.get('_stop_requested'):
                raise CaptureError('Capture stopped by user; partial data is not labeled a completed measurement.', 'capture_stopped')
            if code != 0:
                raise CaptureError('rtl_power exited without a successful capture; check USB passthrough and driver access.', 'rtl_power_failed')
            raw = self._record_path(record['id'], '.csv').read_bytes()
            summary = validate_rtl_power_csv(raw)
            with self.lock:
                record['state'] = 'COMPLETE'
                record['summary'] = summary
                record['bytes'] = len(raw)
        except (CaptureError, OSError, subprocess.TimeoutExpired) as exc:
            with self.lock:
                record['state'] = 'STOPPED' if record.get('_stop_requested') else 'FAILED'
                record['error'] = str(exc)[:260]
            # A failed or interrupted file is deliberately not downloadable as valid data.
            self._record_path(record['id'], '.csv').unlink(missing_ok=True)
        finally:
            with self.lock:
                record['exit_code'] = process.returncode
                record['finished_at_utc'] = utc_now()
                record.pop('_process', None)
                record.pop('_thread', None)
                record.pop('_stop_requested', None)
                try:
                    self._save(record)
                except OSError:
                    pass
                if self.active is record:
                    self.active = None

    def stop(self) -> dict:
        with self.lock:
            if not self.active:
                raise CaptureError('There is no active RTL-SDR capture.', 'capture_not_running')
            record = self.active
            record['_stop_requested'] = True
            process = record['_process']
            if process.poll() is None:
                process.terminate()
            return self._public(record)

    def csv(self, capture_id: str) -> bytes:
        path = self._record_path(capture_id, '.csv')
        meta = self._record_path(capture_id, '.json')
        if path.is_symlink() or meta.is_symlink() or not path.is_file() or not meta.is_file():
            raise CaptureError('Completed capture not found.', 'capture_not_found', 404)
        try:
            record = json.loads(meta.read_text(encoding='utf-8'))
            if record.get('id') != capture_id or record.get('state') != 'COMPLETE' or path.stat().st_size > MAX_CSV_BYTES:
                raise CaptureError('Completed capture not available.', 'capture_not_found', 404)
            return path.read_bytes()
        except (OSError, ValueError) as exc:
            raise CaptureError('Capture file cannot be read.', 'capture_not_found', 404) from exc

    def delete(self, capture_id: str) -> None:
        with self.lock:
            meta = self._record_path(capture_id, '.json')
            if self.active and self.active['id'] == capture_id:
                raise CaptureError('Stop the capture before deleting it.', 'capture_busy')
            if not meta.is_file() or meta.is_symlink():
                raise CaptureError('Capture not found.', 'capture_not_found', 404)
            for ext in ('.csv', '.json'):
                path = self._record_path(capture_id, ext)
                if path.is_symlink():
                    raise CaptureError('Symlink capture paths are not supported.', 'capture_not_found', 404)
                path.unlink(missing_ok=True)
            if self.last and self.last['id'] == capture_id:
                self.last = None

    def close(self):
        with self.lock:
            self.closed = True
            if self.active:
                self.active['_stop_requested'] = True
                process = self.active['_process']
                if process.poll() is None:
                    process.terminate()
                worker = self.active['_thread']
            else:
                worker = None
        if worker:
            worker.join(timeout=4)
            if worker.is_alive():
                with self.lock:
                    if self.active:
                        self.active['_process'].kill()
                worker.join(timeout=3)
