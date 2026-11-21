"""Operator-triggered, bounded receive-only rtl_433 weather sensor collection.

No receiver is opened on initialization/status. Decode reports remain transient
until a user explicitly selects a server-issued receipt and station to save.
No raw unknown remote-control codes, RF waveforms, or logs are persisted.
"""
from __future__ import annotations

import json
import secrets
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone

from .weather import WeatherError, normalize_measurements


FREQUENCIES = (433.92, 868.3, 915.0)
DURATIONS = (10, 20, 30)
MAX_OUTPUT_BYTES = 512_000
MAX_EVENTS = 300
MAX_CANDIDATES = 32
RECEIPT_TTL = 600


class WeatherReceiverError(ValueError):
    def __init__(self, message, code='weather_receiver_error', status=409):
        super().__init__(message)
        self.code, self.status = code, status


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def validate_settings(body):
    if not isinstance(body, dict) or set(body) != {'frequency_mhz', 'duration_seconds'}:
        raise WeatherReceiverError('Choose an allowed frequency and capture duration only.', 'invalid_settings', 400)
    freq, duration = body['frequency_mhz'], body['duration_seconds']
    if type(freq) not in (int, float) or freq not in FREQUENCIES or type(duration) is not int or duration not in DURATIONS:
        raise WeatherReceiverError('Frequency must be 433.92, 868.3 or 915 MHz; duration 10, 20 or 30 seconds.',
                                   'invalid_settings', 400)
    return {'frequency_mhz': float(freq), 'duration_seconds': duration}


def parse_weather_packet(packet):
    """Convert known rtl_433 weather fields to OpenRF SI; no cumulative->interval rain."""
    if not isinstance(packet, dict):
        return None
    model = packet.get('model')
    ident = packet.get('id')
    if not isinstance(model, str) or not 1 <= len(model.strip()) <= 72:
        return None
    # Without a decoder-reported ID, individual weather devices cannot be
    # distinguished reliably. Do not offer an ambiguous source for saving.
    if type(ident) not in (str, int) or isinstance(ident, str) and not 1 <= len(ident) <= 48:
        return None
    if any(ord(ch) < 32 or ord(ch) > 126 for ch in model + str(ident)):
        return None
    channel = packet.get('channel')
    if channel is not None and (type(channel) not in (int, str) or len(str(channel)) > 24):
        return None
    if channel is not None and any(ord(ch) < 32 or ord(ch) > 126 for ch in str(channel)):
        return None
    model = model.strip()
    readings = {}
    mappings = {
        'temperature_c': (('temperature_C', 1.0, 0.0), ('temperature_F', 5/9, -32 * 5/9)),
        'humidity_pct': (('humidity', 1.0, 0.0),),
        'pressure_hpa': (('pressure_hPa', 1.0, 0.0), ('pressure_kPa', 10, 0)),
        'wind_speed_mps': (('wind_avg_m_s', 1, 0), ('wind_avg_km_h', 1/3.6, 0),
                           ('wind_avg_mi_h', 1/2.2369362921, 0)),
        'wind_gust_mps': (('wind_max_m_s', 1, 0), ('wind_max_km_h', 1/3.6, 0),
                          ('wind_max_mi_h', 1/2.2369362921, 0)),
        'wind_direction_deg': (('wind_dir_deg', 1, 0),),
        'uv_index': (('uv_index', 1, 0), ('uvi', 1, 0)),
        'rain_rate_mm_h': (('rain_rate_mm_h', 1, 0), ('rain_rate_in_h', 25.4, 0)),
    }
    for target, alternatives in mappings.items():
        for key, factor, offset in alternatives:
            value = packet.get(key)
            if type(value) in (int, float):
                readings[target] = value * factor + offset
                break
    if not readings:
        return None
    try:
        values = normalize_measurements(readings)
    except (WeatherError, ValueError, TypeError):
        return None
    battery = packet.get('battery_ok')
    return {'model': model, 'device_id': str(ident),
            'channel': str(channel) if channel is not None else '',
            'battery_reported_ok': bool(battery) if battery in (0, 1, True, False) else None,
            'measurements': values, 'hardware_verified': False,
            'sample_time_basis': 'HOST_LISTEN_WINDOW_NOT_PACKET_TIMESTAMP',
            'sensor_time_verified': False}


def decode_json_lines(raw: bytes):
    if not isinstance(raw, bytes) or len(raw) > MAX_OUTPUT_BYTES:
        raise WeatherReceiverError('rtl_433 output exceeded the bounded local buffer.', 'output_too_large')
    try:
        lines = raw.decode('utf-8').splitlines()
    except UnicodeDecodeError as exc:
        raise WeatherReceiverError('rtl_433 returned non-UTF8 output.', 'invalid_receiver_output') from exc
    if len(lines) > MAX_EVENTS:
        raise WeatherReceiverError('Too many decoded receiver events in one capture.', 'too_many_events')
    latest = {}
    for line in lines:
        if not line.strip():
            continue
        if len(line) > 4096:
            continue
        try:
            candidate = parse_weather_packet(json.loads(line))
        except json.JSONDecodeError:
            continue
        if candidate is None:
            continue
        key = (candidate['model'], candidate['device_id'], candidate['channel'])
        latest[key] = candidate
    return list(latest.values())[:MAX_CANDIDATES]


class WeatherRtl433Manager:
    def __init__(self, *, lookup=None, popen=None):
        self.lookup = lookup or shutil.which
        self.popen = popen or subprocess.Popen
        self._lock = threading.RLock()
        self._active = None
        self._last = None
        self._closed = False

    def _public(self, run):
        if not run:
            return None
        now = time.monotonic()
        expired = run.get('_completed_monotonic') is not None and now - run['_completed_monotonic'] > RECEIPT_TTL
        candidates = [] if expired else [dict(c, saved=bool(c['_saved_stations'])) for c in run.get('_candidates', [])]
        for candidate in candidates:
            candidate.pop('_saved_stations', None)
        return {'run_id': run['id'], 'state': 'EXPIRED' if expired and run['state'] == 'COMPLETE' else run['state'],
                'frequency_mhz': run['settings']['frequency_mhz'],
                'duration_seconds': run['settings']['duration_seconds'],
                'started_at_utc': run['started_at_utc'],
                'finished_at_utc': run.get('finished_at_utc'),
                'decoded_weather_sensor_count': len(candidates), 'candidates': candidates,
                'error': run.get('error'), 'receiver_identity_verified': False,
                'actual_packet_time_verified': False}

    def status(self):
        with self._lock:
            return {'available': bool(self.lookup('rtl_433')),
                    'running': self._active is not None,
                    'run': self._public(self._active or self._last),
                    'supported_frequencies_mhz': FREQUENCIES,
                    'durations_seconds': DURATIONS,
                    'device': 'RTL-SDR receiver index 0 (not verified)',
                    'automatic_collection': False,
                    'note': 'No hardware opens on status or startup. All identifiers/values are decoder-reported and unverified.'}

    def start(self, body):
        settings = validate_settings(body)
        with self._lock:
            if self._closed:
                raise WeatherReceiverError('Weather receiver is shutting down.', 'closed')
            if self._active:
                raise WeatherReceiverError('A weather listen is already running.', 'capture_busy')
            executable = self.lookup('rtl_433')
            if not executable:
                raise WeatherReceiverError('rtl_433 is not installed in this Linux environment.', 'rtl433_missing', 503)
            argv = [executable, '-d', '0', '-f', f"{settings['frequency_mhz']}M",
                    '-T', str(settings['duration_seconds']), '-C', 'si', '-F', 'json']
            try:
                process = self.popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, start_new_session=True)
            except OSError as exc:
                raise WeatherReceiverError('Cannot start rtl_433. Check Linux driver, permissions and USB passthrough.',
                                           'launch_failed') from exc
            run = {'id': secrets.token_urlsafe(18), 'state': 'RUNNING',
                   'settings': settings, 'started_at_utc': utc_now(),
                   '_process': process, '_candidates': []}
            self._active = run
            self._last = run
            watcher = threading.Thread(target=self._watch, args=(run, process),
                                       name='openrf-weather-rtl433', daemon=True)
            watcher.start()
            return self._public(run)

    def _watch(self, run, process):
        try:
            try:
                stdout, _ = process.communicate(timeout=run['settings']['duration_seconds'] + 8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate(timeout=3)
                raise WeatherReceiverError('Weather receiver exceeded its time limit.', 'capture_timeout')
            if run.get('_stop_requested'):
                raise WeatherReceiverError('Listen stopped by the user; partial output was discarded.', 'capture_stopped')
            if process.returncode != 0:
                raise WeatherReceiverError('rtl_433 did not complete successfully. Check SDR access and frequency.', 'capture_failed')
            candidates = decode_json_lines(stdout)
            with self._lock:
                for candidate in candidates:
                    candidate['candidate_id'] = secrets.token_urlsafe(16)
                    candidate['_saved_stations'] = set()
                run['_candidates'] = candidates
                run['state'] = 'COMPLETE'
        except (WeatherReceiverError, OSError, subprocess.TimeoutExpired) as exc:
            with self._lock:
                run['state'] = 'STOPPED' if run.get('_stop_requested') else 'FAILED'
                run['error'] = str(exc)[:200]
        finally:
            with self._lock:
                run['finished_at_utc'] = utc_now()
                run['_completed_monotonic'] = time.monotonic()
                run.pop('_process', None)
                run.pop('_stop_requested', None)
                if self._active is run:
                    self._active = None

    def stop(self):
        with self._lock:
            if not self._active:
                raise WeatherReceiverError('No weather listen is running.', 'not_running')
            run = self._active
            run['_stop_requested'] = True
            process = run['_process']
            if process.poll() is None:
                process.terminate()
            return self._public(run)

    def save(self, body, weather_store):
        if not isinstance(body, dict) or set(body) != {'run_id', 'candidate_id', 'station_id'}:
            raise WeatherReceiverError('Select a completed run, decoded sensor and local station only.',
                                       'invalid_save', 400)
        run_id, candidate_id, station_id = body['run_id'], body['candidate_id'], body['station_id']
        if not isinstance(run_id, str) or not isinstance(candidate_id, str) or type(station_id) is not int:
            raise WeatherReceiverError('Invalid weather sensor selection.', 'invalid_save', 400)
        with self._lock:
            run = self._last
            if not run or run['id'] != run_id or run['state'] != 'COMPLETE' or (
                time.monotonic() - run.get('_completed_monotonic', 0) > RECEIPT_TTL):
                raise WeatherReceiverError('Weather capture is missing, incomplete or expired. Listen again.', 'receipt_expired')
            candidate = next((c for c in run['_candidates'] if c['candidate_id'] == candidate_id), None)
            if candidate is None:
                raise WeatherReceiverError('This sensor was not decoded in the selected capture.', 'receipt_invalid')
            if station_id in candidate['_saved_stations']:
                raise WeatherReceiverError('This sensor was already saved under that station.', 'already_saved')
            try:
                reading = weather_store.save_rtl433_sample(station_id, candidate, run['finished_at_utc'],
                    run['settings']['frequency_mhz'])
            except WeatherError as exc:
                raise WeatherReceiverError(str(exc), 'save_failed', 400) from exc
            candidate['_saved_stations'].add(station_id)
            return reading

    def close(self):
        with self._lock:
            self._closed = True
            if self._active:
                process = self._active.get('_process')
                if process and process.poll() is None:
                    process.terminate()
