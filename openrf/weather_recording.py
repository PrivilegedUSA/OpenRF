"""Explicitly started local weather recording; never resumes after reboot.

Only a selected private-LAN Ecowitt gateway or exact OpenRF Weather Serial v1
sensor can be polled. No SDR scanning, discovery or network traffic on import,
server startup, status queries or page navigation. Samples are source-tagged.
"""
from __future__ import annotations

import threading
import time

from .weather import WeatherError, utc_now
from .weather_ecowitt import private_gateway_ip, EcowittError
from .drivers.serial_openrf import eligible_port, SerialSensorError

INTERVALS = (60, 120, 300, 600, 900)
MAX_SESSION_SECONDS = 72 * 3600
MAX_SESSION_SAMPLES = 5000
MAX_CONSECUTIVE_FAILURES = 3


class WeatherRecordingError(WeatherError):
    pass


class WeatherRecorder:
    def __init__(self, store, *, ports, serial_snapshot):
        self.store = store
        self.ports = ports
        self.serial_snapshot = serial_snapshot
        self._lock = threading.RLock()
        self._active = None

    def status(self):
        with self._lock:
            active = self._active
            return {'running': active is not None,
                    'session_id': active['id'] if active else None,
                    'station_id': active['station'] if active else None,
                    'interval_seconds': active['interval'] if active else None,
                    'started_at_utc': active['started_at_utc'] if active else None,
                    'stopping': bool(active and active['stop'].is_set()),
                    'automatic_restart': False,
                    'allowed_intervals_seconds': list(INTERVALS),
                    'max_session_hours': MAX_SESSION_SECONDS // 3600,
                    'max_session_samples': MAX_SESSION_SAMPLES,
                    'note': 'Recording requires an explicit Start each time. Source identity and sensor freshness are not independently verified.'}

    def sessions(self):
        return self.store.recordings()

    def start(self, body):
        if not isinstance(body, dict) or set(body) - {
                'station_id','source_kind','source_address','interval_seconds','sensor_id','channel'}:
            raise WeatherRecordingError('Choose a saved station, supported source and recording interval.')
        station = self.store._station_id(body.get('station_id'))
        source = body.get('source_kind')
        interval = body.get('interval_seconds')
        address = body.get('source_address')
        if source not in ('ECOWITT', 'SERIAL') or type(interval) is not int or interval not in INTERVALS:
            raise WeatherRecordingError('Recording requires ECOWITT or SERIAL and a 60–900 second listed interval.')
        if source == 'ECOWITT':
            if 'sensor_id' in body or 'channel' in body:
                raise WeatherRecordingError('Ecowitt recording does not accept USB sensor identifiers.')
            try:
                address = private_gateway_ip(address)
            except EcowittError as exc:
                raise WeatherRecordingError(str(exc)) from exc
            sensor_id, channel = None, ''
        else:
            sensor_id, channel = body.get('sensor_id'), body.get('channel', '')
            if (not isinstance(sensor_id, str) or not 1 <= len(sensor_id) <= 64 or
                    any(ord(c) < 33 or ord(c) > 126 for c in sensor_id) or
                    not isinstance(channel, str) or len(channel) > 24 or
                    any(ord(c) < 33 or ord(c) > 126 for c in channel)):
                raise WeatherRecordingError('Select one exact OpenRF Weather Serial v1 sensor ID and channel.')
            try:
                eligible_port(address, self.ports())
            except SerialSensorError as exc:
                raise WeatherRecordingError(str(exc)) from exc
        with self._lock:
            if self._active is not None:
                raise WeatherRecordingError('A weather recording is already running or stopping. Stop it first.')
            label = address if source == 'ECOWITT' else f'{address} / sensor={sensor_id} / channel={channel}'
            ident = self.store.create_recording(station, source, label[:240], interval)
            run = {'id': ident, 'station': station, 'source': source, 'address': address,
                   'sensor_id': sensor_id, 'channel': channel, 'interval': interval,
                   'stop': threading.Event(), 'started': time.monotonic(),
                   'started_at_utc': utc_now(),
                   'count': 0, 'last_device_time': None}
            self._active = run
            thread = threading.Thread(target=self._run, args=(run,),
                                      name=f'openrf-weather-recording-{ident}', daemon=True)
            run['thread'] = thread
            try:
                thread.start()
            except Exception:
                self._active = None
                self.store.update_recording(ident, state='FAILED', error='Could not start recorder thread.')
                raise
        return {'session_id': ident, 'state': 'RUNNING', 'interval_seconds': interval,
                'source_kind': source, 'first_sample': 'PENDING',
                'note': 'Polling starts only after this operator request; readings may fail or be stale.'}

    def stop(self):
        with self._lock:
            run = self._active
            if run is None:
                return {'state': 'NOT_RUNNING'}
            run['stop'].set()
            self.store.update_recording(run['id'], state='STOPPING')
            return {'state': 'STOPPING', 'session_id': run['id'],
                    'note': 'An in-flight bounded read may finish before the recorder stops.'}

    def close(self):
        with self._lock:
            run = self._active
        if run:
            self.stop()
            run['thread'].join(timeout=10)

    def _sample(self, run):
        if run['source'] == 'ECOWITT':
            self.store.read_ecowitt({'station_id': run['station'],
                'gateway_ip': run['address'], 'save': True}, recording_session_id=run['id'])
            return True
        capture = self.serial_snapshot(run['address'])
        candidates = [item for item in capture['candidates'] if
                      item['sensor_id'] == run['sensor_id'] and item['channel'] == run['channel']]
        if len(candidates) != 1:
            raise WeatherRecordingError('Selected sensor ID/channel was not present in this USB snapshot.')
        item = candidates[0]
        if (item['freshness'] != 'FRESHNESS_DEVICE_REPORTED_UNVERIFIED' or
                item['measurement_age_seconds'] is None):
            return False  # Never archive known-stale, unknown-age, or clock-skew samples automatically.
        reported = item['sensor_reported_at_utc']
        if reported and reported == run['last_device_time']:
            return False  # Identical device timestamp cannot be counted as another distinct sample.
        self.store.save_serial_sample(run['station'], capture, item,
                                      recording_session_id=run['id'])
        run['last_device_time'] = reported
        return True

    def _run(self, run):
        failures = 0
        end_state = 'STOPPED'
        try:
            while not run['stop'].is_set():
                if time.monotonic() - run['started'] >= MAX_SESSION_SECONDS or run['count'] >= MAX_SESSION_SAMPLES:
                    end_state = 'LIMIT_REACHED'
                    break
                try:
                    if self._sample(run):
                        run['count'] += 1
                        self.store.update_recording(run['id'], saved=1)
                    else:
                        self.store.update_recording(run['id'], skipped=1,
                                                    error='USB sample had stale/unknown age or repeated device time.')
                    failures = 0
                except Exception as exc:
                    failures += 1
                    # Do not record credentials, raw packets, or third-party response bodies.
                    self.store.update_recording(run['id'], failure=1,
                        error=f'{type(exc).__name__}: {str(exc)[:150]}')
                    if failures >= MAX_CONSECUTIVE_FAILURES:
                        end_state = 'FAILED'
                        break
                if run['stop'].wait(run['interval']):
                    break
        finally:
            with self._lock:
                self.store.update_recording(run['id'], state=end_state)
                if self._active is run:
                    self._active = None
