"""Read-only, local gpsd bridge for opt-in OpenRF route following.

No subprocess, no device probing, no persistence, no remote host configuration.
A gpsd process and compatible GNSS receiver must be installed separately.
The HTTP endpoint using this adapter is queried only by active navigation.
"""
from __future__ import annotations

import json
import math
import socket
import time
from datetime import datetime, timezone
from pathlib import PurePosixPath


def _finite(value, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    if minimum is not None and value < minimum:
        return None
    if maximum is not None and value > maximum:
        return None
    return float(value)


def parse_tpv(tpv: dict, *, now: datetime | None = None) -> dict:
    """Normalize gpsd TPV. Never infer an accuracy value from coordinate precision."""
    if not isinstance(tpv, dict) or tpv.get('class') != 'TPV':
        return {'status': 'invalid', 'source': 'gpsd', 'message': 'No valid GNSS report.'}
    if tpv.get('mode') not in (2, 3):
        return {'status': 'no_fix', 'source': 'gpsd', 'message': 'Receiver has no 2D/3D fix.'}
    lat = _finite(tpv.get('lat'), -90, 90)
    lon = _finite(tpv.get('lon'), -180, 180)
    if lat is None or lon is None:
        return {'status': 'no_fix', 'source': 'gpsd', 'message': 'Receiver has not reported valid coordinates.'}
    try:
        timestamp = datetime.fromisoformat(tpv['time'].replace('Z', '+00:00'))
        if timestamp.tzinfo is None:
            raise ValueError('UTC offset missing')
        age = ((now or datetime.now(timezone.utc)) - timestamp).total_seconds()
    except (TypeError, ValueError, KeyError, AttributeError):
        return {'status': 'stale', 'source': 'gpsd', 'message': 'GNSS UTC fix timestamp unavailable.'}
    if not -3 <= age <= 15:
        return {'status': 'stale', 'source': 'gpsd', 'fix_age_s': round(age, 1), 'message': 'GNSS fix is stale or has an invalid clock.'}
    # gpsd epx/epy may come from receiver estimates with uncertain confidence.
    # Report a conservative horizontal magnitude; never manufacture one.
    epx = _finite(tpv.get('epx'), 0, 100000)
    epy = _finite(tpv.get('epy'), 0, 100000)
    eph = _finite(tpv.get('eph'), 0, 100000)
    accuracy = math.hypot(epx, epy) if epx is not None and epy is not None else eph
    device = tpv.get('device') if isinstance(tpv.get('device'), str) else ''
    device = PurePosixPath(device[:160]).name if device.startswith('/dev/') else 'gpsd receiver'
    result = {
        'source': 'gpsd', 'source_device': device, 'mode': int(tpv['mode']),
        'utc_timestamp': timestamp.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'fix_age_s': round(max(0, age), 1), 'latitude': lat, 'longitude': lon,
        'accuracy_m': round(accuracy, 2) if accuracy is not None else None,
        'accuracy_description': 'gpsd horizontal error estimate; confidence level may vary',
        'speed_mps': _finite(tpv.get('speed'), 0, 100),
        'heading_degrees': _finite(tpv.get('track'), 0, 360),
        'saved': False,
    }
    # A 2D fix cannot report reliable height. gpsd distinguishes mean-sea-level
    # altitude (altMSL) from ellipsoidal height (altHAE); never silently mix them.
    if tpv['mode'] == 3:
        altitude = _finite(tpv.get('altMSL'), -500, 9000)
        reference = 'msl'
        if altitude is None:
            altitude = _finite(tpv.get('altHAE'), -500, 9000)
            reference = 'ellipsoid'
        if altitude is not None:
            result['altitude_m'] = round(altitude, 2)
            result['altitude_reference'] = reference
            vertical_error = _finite(tpv.get('epv'), 0, 10000)
            result['vertical_accuracy_m'] = round(vertical_error, 2) if vertical_error is not None else None
    result['status'] = 'fix' if accuracy is not None else 'no_accuracy'
    if accuracy is None:
        result['message'] = 'Fix present but the receiver did not report horizontal accuracy; guidance cannot use it.'
    return result


def read_local_gpsd(*, socket_factory=socket.create_connection, now: datetime | None = None) -> dict:
    """One short localhost request; gpsd is optional. Do not open serial ports."""
    try:
        with socket_factory(('127.0.0.1', 2947), timeout=1.1) as sock:
            sock.settimeout(1.1)
            sock.sendall(b'?WATCH={"enable":true,"json":true};\n?POLL;\n')
            chunks = bytearray()
            deadline = time.monotonic() + 1.5
            found = None
            while len(chunks) < 65536 and time.monotonic() < deadline:
                try:
                    data = sock.recv(4096)
                except socket.timeout:
                    break
                if not data:
                    break
                chunks.extend(data)
                while b'\n' in chunks:
                    line, _, tail = chunks.partition(b'\n')
                    chunks = bytearray(tail)
                    try:
                        obj = json.loads(line)
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        continue
                    if isinstance(obj, dict) and obj.get('class') == 'POLL':
                        found = obj
                        break
                if found is not None:
                    break
            try:
                sock.sendall(b'?WATCH={"enable":false};\n')
            except OSError:
                pass
    except (OSError, TimeoutError):
        return {'status': 'unavailable', 'source': 'gpsd', 'message': 'Local gpsd is not reachable on 127.0.0.1:2947. No GNSS receiver is assumed.'}
    if not found:
        return {'status': 'no_fix', 'source': 'gpsd', 'message': 'gpsd has not returned a POLL response.'}
    reports = found.get('tpv', [])
    if not isinstance(reports, list) or not reports:
        return {'status': 'no_fix', 'source': 'gpsd', 'message': 'gpsd reports no active device fix.'}
    parsed = [parse_tpv(x, now=now) for x in reports[:16]]
    # Use a fresh report with known accuracy over a stale or incomplete report.
    return next((p for p in parsed if p['status'] == 'fix'), parsed[0])
