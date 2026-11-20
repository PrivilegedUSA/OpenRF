"""Opt-in USGS 3DEP terrain samples for planned routes, reusable offline.

Offline topographic *raster* map tiles are not a DEM and cannot be used to
claim numeric altitude. We query USGS EPQS only after the operator requests
it, and store a bounded profile keyed by a SHA-256 of sampled route geometry.
The private cache stores no coordinate list, RF data or personal GPS track.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler

EPQS_URL = 'https://epqs.nationalmap.gov/v1/json'
MAX_PROFILE_POINTS = 17
MAX_CACHE_ENTRIES = 80
MAX_CACHE_BYTES = 128 * 1024
ELEVATION_SOURCE = 'USGS 3DEP EPQS interpolated terrain elevations (not GNSS altitude)'


class ElevationError(ValueError):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ElevationError('USGS redirected the elevation request; stopped for safety')


_opener = build_opener(_NoRedirect())


def _validated(points):
    if not isinstance(points, list) or not 2 <= len(points) <= MAX_PROFILE_POINTS:
        raise ElevationError(f'Route profile requires 2–{MAX_PROFILE_POINTS} sampled points')
    clean = []
    for point in points:
        if (not isinstance(point, list) or len(point) != 2 or
            any(type(v) not in (int, float) or not math.isfinite(v) for v in point)):
            raise ElevationError('Route points must be [longitude, latitude] pairs')
        lon, lat = point
        if not -180 <= lon <= 180 or not -85.05112878 <= lat <= 85.05112878:
            raise ElevationError('Route coordinates outside the supported map range')
        clean.append([round(float(lon), 6), round(float(lat), 6)])
    if len(set(map(tuple, clean))) < 2:
        raise ElevationError('Elevation profile needs a route with distinct locations')
    return clean


def _key(points):
    return hashlib.sha256(json.dumps(points, separators=(',', ':')).encode('ascii')).hexdigest()


def fetch_height(lon: float, lat: float) -> float | None:
    # Fixed public HTTPS endpoint; no arbitrary URL, credentials or local host.
    url = f'{EPQS_URL}?x={lon:.6f}&y={lat:.6f}&units=Meters&wkid=4326&includeDate=False'
    request = Request(url, headers={'User-Agent': 'OpenRF/0.2 opt-in-terrain-profile', 'Accept': 'application/json'})
    with _opener.open(request, timeout=5) as response:
        if response.status != 200:
            raise ElevationError('USGS elevation service unavailable')
        data = json.loads(response.read(4097))
    height = data.get('value') if isinstance(data, dict) else None
    if type(height) not in (int, float) or not math.isfinite(height) or not -500 <= height <= 9000:
        return None
    return round(height, 2)


def _cache_file(folder):
    return folder / '.openrf-route-elevation.json'


def _read(folder):
    path = _cache_file(folder)
    if path.is_symlink():
        raise ElevationError('Elevation cache is an unsafe symlink')
    if not path.exists():
        return {}
    if path.stat().st_size > MAX_CACHE_BYTES:
        raise ElevationError('Elevation cache too large; original file preserved')
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, UnicodeError, ValueError) as exc:
        raise ElevationError('Elevation cache unreadable; original file preserved') from exc
    if not isinstance(data, dict) or len(data) > MAX_CACHE_ENTRIES:
        raise ElevationError('Elevation cache unreadable; original file preserved')
    return data


def _write(folder, data):
    folder.mkdir(parents=True, exist_ok=True)
    stage = folder / ('.openrf-elevation-' + secrets.token_hex(12) + '.tmp')
    try:
        fd = os.open(stage, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(data, stream, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(stage, _cache_file(folder))
    finally:
        stage.unlink(missing_ok=True)


def profile(folder: Path, points, allow_online: bool, lock: threading.Lock, fetch=fetch_height,
            *, terrain_folder: Path | None = None):
    clean = _validated(points)
    if type(allow_online) is not bool:
        raise ElevationError('The online-preparation choice must be true or false')
    key = _key(clean)
    if not lock.acquire(blocking=False):
        raise ElevationError('Another terrain-profile request is already in progress')
    try:
        cache = _read(folder)
        if key in cache:
            return {'status': 'cached', **cache[key]}
        if terrain_folder is not None:
            from .terrain_hgt import sample_route
            heights=sample_route(terrain_folder,clean)
            available=sum(h is not None for h in heights)
            if available>=2:
                return {'status':'local_terrain','elevations_m':heights,
                        'available_points':available,'sample_points':len(heights),
                        'partial':available!=len(heights),'source_verified':False,
                        'source':'Imported SRTM-compatible HGT terrain (operator source unverified; not GPS altitude)'}
        if not allow_online:
            return {'status': 'not_prepared', 'message': 'No cached profile or locally installed HGT terrain covers this route. Import a compatible HGT tile or prepare online if desired.'}
        samples = []
        for lon, lat in clean:
            try:
                value = fetch(lon, lat)
            except (OSError, TimeoutError, ValueError) as exc:
                value = None
            if type(value) not in (int, float) or not math.isfinite(value) or not -500 <= value <= 9000:
                value = None
            samples.append(value)
        available = sum(h is not None for h in samples)
        if available < 2:
            raise ElevationError('USGS did not return enough valid terrain elevations to draw a profile; no data saved')
        record = {'elevations_m': samples, 'available_points': available, 'sample_points': len(samples),
                  'source': ELEVATION_SOURCE, 'prepared_at_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                  'partial': available != len(samples)}
        if len(cache) >= MAX_CACHE_ENTRIES:
            oldest = min(cache, key=lambda k: cache[k].get('prepared_at_utc', ''))
            del cache[oldest]
        cache[key] = record
        _write(folder, cache)
        return {'status': 'prepared', **record}
    finally:
        lock.release()
