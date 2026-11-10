"""Opt-in OpenRF Serial v1 USB sensor transport (Linux stdlib only).

Control messages travel over USB serial, never over an RF transmitter. Only an
attached module that speaks this strict protocol can supply snapshot records.
A handshake is protocol compatibility, NOT proof of genuine hardware identity,
calibration, physical detection, or trustworthy sensor firmware.

No device is opened automatically, and this module does not continuously scan.
"""
from __future__ import annotations

from datetime import datetime, timezone
import errno
import json
import errno
import math
import os
from pathlib import Path
import re
import select
import termios
import time

PROTOCOL = 'openrf.serial.v1'
PORT_NAME = re.compile(r'tty(?:ACM|USB)\d{1,3}\Z')
KNOWN_KINDS = frozenset({'WIFI', 'BLE', 'RF'})
MAX_RECORDS = 128
MAX_LINE = 32768


class SerialSensorError(ValueError):
    """User-facing USB failure with a stable diagnostic code (not proof of cause)."""
    def __init__(self, message: str, code: str = 'serial_error'):
        super().__init__(message)
        self.code = code


def eligible_port(name: str, available: list[str]) -> Path:
    """Reject arbitrary filesystem paths; permit only inventoried ttyUSB/ttyACM."""
    if not isinstance(name, str) or not PORT_NAME.fullmatch(name) or name not in available:
        raise SerialSensorError('Select an inventoried Linux USB-serial port; arbitrary paths are not allowed.', 'not_in_inventory')
    return Path('/dev') / name


def _configure(fd: int) -> None:
    try:
        attrs = termios.tcgetattr(fd)
        attrs[0] &= ~(termios.IXON | termios.IXOFF | termios.ICRNL | termios.INLCR | termios.IGNCR)
        attrs[1] &= ~termios.OPOST
        attrs[2] |= termios.CLOCAL | termios.CREAD | termios.CS8
        attrs[2] &= ~(termios.PARENB | termios.CSTOPB)
        attrs[3] &= ~(termios.ECHO | termios.ICANON | termios.ISIG | termios.IEXTEN)
        attrs[4] = attrs[5] = termios.B115200
        attrs[6][termios.VMIN] = 0
        attrs[6][termios.VTIME] = 0
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        termios.tcflush(fd, termios.TCIFLUSH)
    except (OSError, termios.error) as exc:
        raise SerialSensorError('Could not configure USB serial at 115200 baud. Check Linux driver and port state.', 'configure_failed') from exc


def _exchange(fd: int, command: bytes, timeout_s: float = 3.0) -> dict:
    deadline = time.monotonic() + timeout_s
    try:
        while command:
            if time.monotonic() >= deadline:
                raise SerialSensorError('USB serial write timed out; check connection and whether the device has rebooted.', 'write_timeout')
            _, writable, _ = select.select([], [fd], [], max(0, deadline - time.monotonic()))
            if writable:
                command = command[os.write(fd, command):]
        received = bytearray()
        while time.monotonic() < deadline:
            readable, _, _ = select.select([fd], [], [], max(0, deadline - time.monotonic()))
            if not readable:
                continue
            chunk = os.read(fd, 4096)
            if not chunk:
                continue
            received.extend(chunk)
            if len(received) > MAX_LINE:
                raise SerialSensorError('USB sensor response exceeds the maximum frame size.', 'frame_too_large')
            if b'\n' in received:
                raw = bytes(received).split(b'\n', 1)[0].strip()
                try:
                    obj = json.loads(raw.decode('utf-8'))
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise SerialSensorError('USB sensor returned invalid JSON framing. Confirm ESP32 firmware, USB CDC settings, and 115200 baud.', 'invalid_frame') from exc
                if not isinstance(obj, dict):
                    raise SerialSensorError('USB response must be a JSON object.', 'invalid_frame')
                return obj
    except OSError as exc:
        raise SerialSensorError('USB serial device disconnected or stopped responding. Refresh inventory and reconnect the board.', 'disconnected') from exc
    raise SerialSensorError('No OpenRF response before timeout. Check that the firmware is running, close Serial Monitor, and retry after any USB reset.', 'no_response')


def _safe_text(value, field: str, limit=100, required=True) -> str:
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > limit:
        raise SerialSensorError('Invalid USB sensor ' + field)
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
        raise SerialSensorError('Invalid control characters in ' + field)
    return value.strip()


def _raise_device_error(packet: dict) -> None:
    """A compatible firmware error is not an empty/valid measurement snapshot."""
    if packet.get('type') != 'error':
        return
    if packet.get('protocol') != PROTOCOL:
        raise SerialSensorError('Device sent an incompatible protocol error.', 'protocol_mismatch')
    code = _safe_text(packet.get('code'), 'error code', 40)
    if not re.fullmatch(r'[A-Z_]{2,40}', code):
        raise SerialSensorError('Invalid firmware error code.', 'invalid_frame')
    message = _safe_text(packet.get('message', 'Firmware reported an error'), 'error message', 120)
    raise SerialSensorError(f'Firmware reported {code}: {message}', 'firmware_' + code.lower())


def parse_hello(packet: dict) -> dict:
    _raise_device_error(packet)
    if packet.get('type') != 'hello' or packet.get('protocol') != PROTOCOL:
        raise SerialSensorError('USB device does not implement OpenRF Serial v1.', 'protocol_mismatch')
    hardware_id = _safe_text(packet.get('hardware_id'), 'hardware_id', 64)
    capabilities = packet.get('capabilities')
    if not isinstance(capabilities, list) or len(capabilities) > 12 or any(not isinstance(k, str) for k in capabilities):
        raise SerialSensorError('Invalid device capabilities')
    supported = sorted(set(capabilities) & KNOWN_KINDS)
    return {'protocol': PROTOCOL, 'hardware_id': hardware_id,
            'label': _safe_text(packet.get('label', 'Unverified OpenRF serial device'), 'label', 100),
            'capabilities': supported,
            'firmware_version': _safe_text(packet['firmware_version'], 'firmware_version', 32) if 'firmware_version' in packet else None,
            'scan_mode': _safe_text(packet['scan_mode'], 'scan_mode', 32) if 'scan_mode' in packet else None,
            'identity_verified': False,
            'warning': 'Identity and capabilities are device-reported, not cryptographically verified. No RF measurements were taken by this probe.'}


def _valid_number(value, field: str, low: float, high: float):
    if value is None:
        return None
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise SerialSensorError(f'Invalid sensor {field} (expected measured numeric value).')
    return float(value)


def _utc_time(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise SerialSensorError('Invalid device measurement timestamp')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise SerialSensorError('Invalid device measurement timestamp') from exc
    if parsed.tzinfo is None:
        raise SerialSensorError('Device measurement timestamp must include UTC offset')
    return parsed.astimezone(timezone.utc).isoformat(timespec='seconds')


def parse_snapshot(packet: dict, hello: dict, received_at_utc: str) -> dict:
    _raise_device_error(packet)
    if packet.get('type') != 'snapshot' or packet.get('protocol') != PROTOCOL:
        raise SerialSensorError('Device did not return an OpenRF Serial v1 snapshot.', 'protocol_mismatch')
    if packet.get('hardware_id') != hello['hardware_id']:
        raise SerialSensorError('USB device identity changed during snapshot.')
    rows = packet.get('records')
    if not isinstance(rows, list) or len(rows) > MAX_RECORDS:
        raise SerialSensorError('Snapshot records must be an array of at most 128 readings.')
    reported = _utc_time(packet.get('captured_at_utc'))
    retrieved = datetime.fromisoformat(received_at_utc)
    age = (retrieved - datetime.fromisoformat(reported)).total_seconds() if reported else None
    if age is None:
        basis = 'HOST_RETRIEVAL_ONLY'
        freshness = 'UNKNOWN — no device measurement timestamp; host retrieval time only'
        used_time = received_at_utc
    elif age < -5:
        basis = 'HOST_RETRIEVAL_ONLY'
        freshness = 'CLOCK_SKEW — device timestamp is in the future; host retrieval time used'
        used_time = received_at_utc
    else:
        basis = 'DEVICE_REPORTED_UNVERIFIED'
        freshness = ('STALE — device-reported capture was over 60 seconds before retrieval' if age > 60 else
                     'DEVICE_TIME_UNVERIFIED — device-reported capture timestamp, not independently calibrated')
        used_time = reported
    validated = []
    for row in rows:
        if not isinstance(row, dict):
            raise SerialSensorError('Snapshot contains a non-object reading.')
        kind = row.get('kind')
        if kind not in KNOWN_KINDS or kind not in hello['capabilities']:
            raise SerialSensorError('Reading category is not negotiated with this sensor.')
        identifier = _safe_text(row.get('identifier', ''), 'identifier', 160, required=False)
        label = _safe_text(row.get('label') or f'{kind} observation', 'label', 100)
        freq = _valid_number(row.get('frequency_mhz'), 'frequency_mhz', 0.001, 100000)
        rssi = _valid_number(row.get('rssi_dbm'), 'rssi_dbm', -200, 50)
        if freq is None and rssi is None:
            raise SerialSensorError('Sensor observation has neither a frequency nor a measured RSSI.')
        validated.append({'kind': kind, 'identifier': identifier, 'label': label,
                          'frequency_mhz': freq, 'rssi_dbm': rssi})
    return {'source': 'OPENRF_SERIAL_V1', 'protocol': PROTOCOL,
            'hardware_id': hello['hardware_id'], 'interface': '',
            'retrieved_at_utc': received_at_utc, 'captured_at_utc': reported,
            'observed_at_utc': used_time, 'timestamp_basis': basis,
            'freshness': freshness, 'measurement_age_seconds': round(age, 3) if age is not None else None,
            'records': validated, 'identity_verified': False,
            'coordinate_meaning': 'No sensor GPS supplied; optional browser location is observer position only'}


def query_port(port: str, allowed_ports: list[str], *, snapshot=False, timeout_s=3.0) -> dict:
    """Each call opens an inventoried port, checks firmware and optionally retrieves ONE snapshot.

    The optional allowed_ports parameter permits unit tests with pseudo-terminals;
    production always supplies its read-only inventory. No arbitrary port path
    is accepted via the API.
    """
    path = eligible_port(port, allowed_ports)
    try:
        flags = os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK | getattr(os, 'O_NOFOLLOW', 0)
        fd = os.open(str(path), flags)
    except OSError as exc:
        if exc.errno in (errno.EACCES, errno.EPERM):
            raise SerialSensorError('USB serial access denied. Check Linux dialout/uucp group membership and udev permissions.', 'permission_denied') from exc
        if exc.errno in (errno.ENOENT, errno.ENODEV, errno.EIO):
            raise SerialSensorError('USB serial device disappeared or disconnected. Refresh Linux inventory.', 'disconnected') from exc
        if exc.errno in (errno.EBUSY, errno.EAGAIN):
            raise SerialSensorError('USB serial device is busy. Close Serial Monitor or another process using it.', 'port_busy') from exc
        raise SerialSensorError('USB serial device could not be opened; check host driver and USB connection.', 'open_failed') from exc
    try:
        _configure(fd)
        hello = parse_hello(_exchange(fd, b'OPENRF HELLO 1\n', timeout_s))
        hello['port'] = port
        if not snapshot:
            return hello
        response = _exchange(fd, b'OPENRF SNAPSHOT 1\n', timeout_s)
        received_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
        capture = parse_snapshot(response, hello, received_at)
        capture['interface'] = port
        return capture
    finally:
        os.close(fd)
