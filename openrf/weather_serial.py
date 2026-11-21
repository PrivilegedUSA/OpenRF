"""Explicit, one-shot weather observations from an OpenRF Weather Serial v1 bridge.

Any Linux-visible ttyACM/ttyUSB port is only a candidate. We exchange a strict
USB-only handshake before interpreting readings, never auto-open ports, and
never consider a reported hardware identifier authenticated. Firmware can be an
ESP32-S3 or another *explicitly programmed* USB weather bridge; arbitrary
commercial USB weather products are NOT presumed protocol-compatible.
"""
from __future__ import annotations

from datetime import datetime, timezone
import errno
import math
import os
import secrets
import threading
import time

from .drivers.serial_openrf import eligible_port, _configure, _exchange, _safe_text, SerialSensorError
from .weather import normalize_measurements, WeatherError, normalize_time, utc_now

PROTOCOL = 'openrf.weather.serial.v1'
MAX_SENSORS = 16
RECEIPT_SECONDS = 600
STALE_AFTER_SECONDS = 120


class WeatherSerialError(ValueError):
    def __init__(self, message, code='weather_serial_error', status=409):
        super().__init__(message)
        self.code, self.status = code, status


def _ident(text, name, limit=64):
    try:
        return _safe_text(text, name, limit)
    except SerialSensorError as exc:
        raise WeatherSerialError(str(exc), 'bad_weather_packet') from exc


def parse_weather_hello(packet):
    if not isinstance(packet, dict) or packet.get('protocol') != PROTOCOL or packet.get('type') != 'hello':
        raise WeatherSerialError('Port does not speak OpenRF Weather Serial v1; compatibility not confirmed.', 'protocol_mismatch')
    capabilities = packet.get('capabilities')
    if not isinstance(capabilities, list) or capabilities != ['WEATHER']:
        raise WeatherSerialError('Weather bridge did not negotiate the WEATHER capability.', 'capability_mismatch')
    return {'protocol': PROTOCOL, 'hardware_id': _ident(packet.get('hardware_id'), 'hardware_id'),
            'label': _ident(packet.get('label'), 'label', 100),
            'firmware_version': _ident(packet.get('firmware_version'), 'firmware_version', 32),
            'capabilities': ['WEATHER'], 'identity_verified': False,
            'note': 'USB handshake confirms only protocol response, not genuine hardware identity or sensor calibration.'}


def _reported_at(value):
    if value is None:
        return None
    try:
        return normalize_time(value)
    except WeatherError as exc:
        raise WeatherSerialError('Invalid device-reported UTC measurement timestamp.', 'invalid_sensor_time') from exc


def parse_weather_snapshot(packet, hello, received_at_utc):
    if isinstance(packet, dict) and packet.get('protocol') == PROTOCOL and packet.get('type') == 'error':
        code = packet.get('code', 'SENSOR_ERROR')
        if not isinstance(code, str) or not 2 <= len(code) <= 40 or not code.replace('_', '').isupper():
            code = 'SENSOR_ERROR'
        raise WeatherSerialError('Weather bridge reported ' + code + '; no observation saved.', 'device_reported_error')
    if not isinstance(packet, dict) or packet.get('protocol') != PROTOCOL or packet.get('type') != 'snapshot':
        raise WeatherSerialError('Device did not return a Weather Serial v1 snapshot.', 'protocol_mismatch')
    if packet.get('hardware_id') != hello['hardware_id']:
        raise WeatherSerialError('Weather hardware ID changed between probe and snapshot.', 'identity_changed')
    sensors = packet.get('sensors')
    if not isinstance(sensors, list) or not 0 <= len(sensors) <= MAX_SENSORS:
        raise WeatherSerialError('A weather snapshot must contain at most 16 sensor records.', 'bad_weather_packet')
    seen, candidates = set(), []
    received_at = datetime.fromisoformat(normalize_time(received_at_utc).replace('Z', '+00:00'))
    for sensor in sensors:
        if not isinstance(sensor, dict) or set(sensor) - {
            'sensor_id', 'model', 'measurements', 'reported_at_utc', 'measurement_age_seconds', 'channel'}:
            raise WeatherSerialError('Weather sensor contains unsupported fields or is not an object.', 'bad_weather_packet')
        sensor_id = _ident(sensor.get('sensor_id'), 'sensor_id')
        model = _ident(sensor.get('model'), 'model', 72)
        channel = sensor.get('channel', '')
        if channel != '':
            channel = _ident(channel, 'channel', 24)
        if not isinstance(channel, str):
            raise WeatherSerialError('Invalid weather sensor channel.', 'bad_weather_packet')
        if (sensor_id, channel) in seen:
            raise WeatherSerialError('Duplicate sensor ID/channel in one snapshot.', 'bad_weather_packet')
        seen.add((sensor_id, channel))
        try:
            values = normalize_measurements(sensor.get('measurements'))
        except WeatherError as exc:
            raise WeatherSerialError(str(exc), 'invalid_measurements') from exc
        reported = _reported_at(sensor.get('reported_at_utc'))
        supplied_age = sensor.get('measurement_age_seconds')
        if supplied_age is not None and (type(supplied_age) not in (int, float) or
                                        not math.isfinite(supplied_age) or not 0 <= supplied_age <= 86400):
            raise WeatherSerialError('Device measurement age must be 0–86400 seconds or null.', 'invalid_sensor_age')
        computed_age = (received_at - datetime.fromisoformat(reported.replace('Z', '+00:00'))).total_seconds() if reported else None
        if computed_age is not None and computed_age < -5:
            freshness, age, basis = 'CLOCK_SKEW_UNVERIFIED', None, 'HOST_RECEIVED_AT_UTC'
        else:
            age = max(0., computed_age) if computed_age is not None else supplied_age
            freshness = ('UNKNOWN_AGE' if age is None else
                         'STALE_DEVICE_REPORTED' if age > STALE_AFTER_SECONDS else 'FRESHNESS_DEVICE_REPORTED_UNVERIFIED')
            basis = 'HOST_RECEIVED_AT_UTC'
        candidates.append({'sensor_id': sensor_id, 'model': model, 'channel': channel,
                           'measurements': values, 'sensor_reported_at_utc': reported,
                           'measurement_age_seconds': round(float(age), 2) if age is not None else None,
                           'freshness': freshness, 'stale': freshness == 'STALE_DEVICE_REPORTED',
                           'timestamp_basis': basis, 'identity_verified': False,
                           'time_verified': False, 'units': 'SI_FIELD_NAMES'})
    return {'protocol': PROTOCOL, 'hardware_id': hello['hardware_id'], 'label': hello['label'],
            'firmware_version': hello['firmware_version'], 'received_at_utc': received_at_utc,
            'timestamp_basis': 'HOST_RECEIVED_AT_UTC', 'identity_verified': False,
            'candidates': candidates}


def query_weather_port(port, allowed_ports, *, snapshot=False, timeout_s=3):
    """Open a selected inventoried USB node ONLY for the requested exchange."""
    try:
        path = eligible_port(port, allowed_ports)
    except SerialSensorError as exc:
        raise WeatherSerialError(str(exc), exc.code, 400) from exc
    try:
        fd = os.open(str(path), os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK | getattr(os, 'O_NOFOLLOW', 0))
    except OSError as exc:
        code = ('permission_denied' if exc.errno in (errno.EACCES, errno.EPERM) else
                'port_busy' if exc.errno in (errno.EBUSY, errno.EAGAIN) else 'open_failed')
        raise WeatherSerialError('Cannot open Linux USB weather port. Check passthrough, permissions or competing programs.', code) from exc
    try:
        try:
            _configure(fd)
            hello = parse_weather_hello(_exchange(fd, b'OPENRF WEATHER HELLO 1\n', timeout_s))
            hello['port'] = port
            if not snapshot:
                return hello
            response = _exchange(fd, b'OPENRF WEATHER SNAPSHOT 1\n', timeout_s)
            result = parse_weather_snapshot(response, hello, utc_now())
            result['port'] = port
            return result
        except SerialSensorError as exc:
            raise WeatherSerialError(str(exc), exc.code) from exc
    finally:
        os.close(fd)


class WeatherSerialReceipts:
    """Temporary server-owned observations; browser may select, never invent."""
    def __init__(self, ttl=RECEIPT_SECONDS):
        self._lock = threading.RLock()
        self._latest = None
        self.ttl = ttl

    def remember(self, capture):
        if capture.get('protocol') != PROTOCOL or not isinstance(capture.get('candidates'), list):
            raise WeatherSerialError('Unrecognized weather snapshot.', 'bad_weather_packet')
        with self._lock:
            run_id = secrets.token_urlsafe(20)
            records = [{**row, 'candidate_id': secrets.token_urlsafe(16), '_saved': False}
                       for row in capture['candidates']]
            self._latest = {'run_id': run_id, 'created': time.monotonic(),
                            'capture': {**capture, 'candidates': records}}
            return self._public(self._latest)

    def _public(self, receipt):
        capture = receipt['capture']
        return {**{key: value for key, value in capture.items() if key != 'candidates'},
                'run_id': receipt['run_id'], 'expires_in_seconds': self.ttl,
                'candidates': [{**{k: v for k, v in c.items() if k != '_saved'},
                                'saved': c['_saved']} for c in capture['candidates']]}

    def summary(self):
        with self._lock:
            if not self._latest:
                return {'last_read': None, 'candidate_count': 0, 'receipt_valid': False}
            expired = time.monotonic() - self._latest['created'] > self.ttl
            return {'last_read': self._latest['capture']['received_at_utc'],
                    'candidate_count': len(self._latest['capture']['candidates']),
                    'receipt_valid': not expired}

    def save(self, body, store):
        if not isinstance(body, dict) or set(body) != {'run_id', 'candidate_id', 'station_id'} or (
            not isinstance(body.get('run_id'), str) or not isinstance(body.get('candidate_id'), str)
            or type(body.get('station_id')) is not int):
            raise WeatherSerialError('Choose a completed weather receipt, sensor and station only.', 'invalid_save', 400)
        with self._lock:
            receipt = self._latest
            if not receipt or not secrets.compare_digest(body['run_id'], receipt['run_id']) or (
                    time.monotonic() - receipt['created'] > self.ttl):
                raise WeatherSerialError('Weather snapshot receipt is missing or expired. Read again.', 'receipt_expired')
            candidate = next((c for c in receipt['capture']['candidates'] if c['candidate_id'] == body['candidate_id']), None)
            if not candidate or candidate['_saved']:
                raise WeatherSerialError('Selected weather sensor is invalid or already saved.', 'candidate_invalid')
            try:
                result = store.save_serial_sample(body['station_id'], receipt['capture'], candidate)
            except WeatherError as exc:
                raise WeatherSerialError(str(exc), 'weather_save_failed', 400) from exc
            candidate['_saved'] = True
            return result
