"""User-planned geographic areas and **local-only** raster MBTiles subsets.

No remote tile source, URL fetch, RF simulation, or SQLite investigation changes.
A plan is a survey **region**, not an RF transmitter position or recording.
"""
from __future__ import annotations

import json
import math
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from .offline_maps import (_connection, _image_matches_format, _inspect_map,
                           _map_path, MapBusy, MapExists, MapNotFound,
                           MAX_TILE_BYTES, SUPPORTED_FORMATS)

MAX_PLANS = 100
MAX_CATALOG_BYTES = 128 * 1024
MAX_DERIVED_TILES = 10000
MAX_DERIVED_BYTES = 512 * 1024 * 1024
MERCATOR_LAT = 85.05112878


class AreaError(ValueError):
    """Invalid area, unsafe/unavailable plan, or excessive requested coverage."""


def _valid_bounds(value):
    if not isinstance(value, list) or len(value) != 4 or any(type(v) not in (int, float) or not math.isfinite(v) for v in value):
        raise AreaError('Bounds must be four finite numbers [west, south, east, north]')
    west, south, east, north = (float(v) for v in value)
    if not (-180 <= west < east <= 180 and -MERCATOR_LAT <= south < north <= MERCATOR_LAT):
        raise AreaError('Area must be west < east, south < north, within Web Mercator limits; dateline-crossing areas are not supported')
    return [west, south, east, north]


def _valid_zooms(minzoom, maxzoom):
    if type(minzoom) is not int or type(maxzoom) is not int or not (0 <= minzoom <= maxzoom <= 18):
        raise AreaError('Zoom range must be integers 0–18 with minimum not exceeding maximum')
    return minzoom, maxzoom


def _ranges(bounds, zoom):
    """Inclusive XYZ tile ranges; east/south edges are exclusive for clean crops."""
    west, south, east, north = bounds
    n = 1 << zoom
    def lat_y(lat):
        radians = math.radians(lat)
        return (1 - math.asinh(math.tan(radians)) / math.pi) / 2 * n
    x0 = max(0, min(n-1, int(math.floor((west + 180) / 360 * n))))
    x1 = max(0, min(n-1, int(math.ceil((east + 180) / 360 * n - 1e-12)) - 1))
    y0 = max(0, min(n-1, int(math.floor(lat_y(north)))))
    y1 = max(0, min(n-1, int(math.ceil(lat_y(south) - 1e-12)) - 1))
    return x0, x1, y0, y1


def estimate(bounds, minzoom, maxzoom):
    bounds = _valid_bounds(bounds)
    lo, hi = _valid_zooms(minzoom, maxzoom)
    total = 0
    for zoom in range(lo, hi + 1):
        x0, x1, y0, y1 = _ranges(bounds, zoom)
        total += (x1-x0+1) * (y1-y0+1)
        if total > MAX_DERIVED_TILES:
            break
    return total


def _catalog_path(folder):
    return folder / '.openrf-map-areas.json'


def _read(folder):
    file = _catalog_path(folder)
    if file.is_symlink():
        raise AreaError('Area catalog is a symlink; refusing to access')
    if not file.exists():
        return []
    if file.stat().st_size > MAX_CATALOG_BYTES:
        raise AreaError('Area catalog is unexpectedly large')
    try:
        content = json.loads(file.read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise AreaError('Area catalog unreadable; original catalog preserved') from exc
    if not isinstance(content, list) or len(content) > MAX_PLANS:
        raise AreaError('Invalid area catalog; original catalog preserved')
    return content


def _write(folder, plans):
    folder.mkdir(parents=True, exist_ok=True)
    staging = folder / ('.openrf-areas-' + secrets.token_hex(12) + '.tmp')
    try:
        fd = os.open(staging, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(plans, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(staging, _catalog_path(folder))
    finally:
        staging.unlink(missing_ok=True)


def list_areas(folder):
    return _read(folder)


def get_area(folder, area_id):
    if not isinstance(area_id, str) or len(area_id) != 16 or any(c not in '0123456789abcdef' for c in area_id):
        raise AreaError('Invalid saved area identifier')
    result = next((p for p in _read(folder) if p.get('id') == area_id), None)
    if result is None:
        raise AreaError('Saved area not found')
    return result


def save_area(folder, name, bounds, minzoom, maxzoom, lock: threading.Lock):
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80 or any(ord(c) < 32 for c in name):
        raise AreaError('Area name must be 1–80 visible characters')
    bounds = _valid_bounds(bounds)
    lo, hi = _valid_zooms(minzoom, maxzoom)
    count = estimate(bounds, lo, hi)
    if count > MAX_DERIVED_TILES:
        raise AreaError(f'Area needs more than {MAX_DERIVED_TILES:,} candidate tiles. Choose a smaller region or fewer zoom levels')
    if not lock.acquire(blocking=False):
        raise MapBusy('Another map operation is in progress')
    try:
        plans = _read(folder)
        if len(plans) >= MAX_PLANS:
            raise AreaError(f'Maximum {MAX_PLANS} saved areas reached')
        new = {'id': secrets.token_hex(8), 'name': name.strip(), 'bounds': bounds,
               'minzoom': lo, 'maxzoom': hi, 'candidate_tiles': count,
               'created_at_utc': datetime.now(timezone.utc).isoformat(timespec='seconds')}
        _write(folder, plans + [new])
        return new
    finally:
        lock.release()


def remove_area(folder, area_id, lock: threading.Lock):
    if not lock.acquire(blocking=False):
        raise MapBusy('Another map operation is in progress')
    try:
        plan = get_area(folder, area_id)
        _write(folder, [a for a in _read(folder) if a.get('id') != area_id])
        return plan
    finally:
        lock.release()


def area_geojson(plan):
    w, s, e, n = plan['bounds']
    return {'type': 'FeatureCollection', 'features': [{
        'type': 'Feature', 'properties': {'name': plan['name'], 'openrf_area_id': plan['id'],
                                        'minzoom': plan['minzoom'], 'maxzoom': plan['maxzoom'],
                                        'note': 'User-planned map area; not a transmitter position or an RF observation'},
        'geometry': {'type': 'Polygon', 'coordinates': [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}
    }]}


def area_tile_manifest(plan):
    """Provider-neutral compact XYZ acquisition plan; **not** a download list.

    The count describes tile *slots*, not actual coverage. Only a small range
    per zoom is exported, not thousands of filenames or remote tile URLs.
    """
    bounds = _valid_bounds(plan['bounds'])
    lo, hi = _valid_zooms(plan['minzoom'], plan['maxzoom'])
    zooms = []
    for z in range(lo, hi + 1):
        x0, x1, y0, y1 = _ranges(bounds, z)
        zooms.append({'z': z, 'x_min': x0, 'x_max': x1,
                      'y_min_xyz': y0, 'y_max_xyz': y1,
                      'candidate_tiles': (x1-x0+1)*(y1-y0+1)})
    return {'schema': 'openrf.offline-area-plan.v1', 'title': plan['name'],
            'area_id': plan['id'], 'bounds_wgs84': bounds,
            'scheme': 'XYZ', 'minzoom': lo, 'maxzoom': hi,
            'candidate_tile_slots': sum(z['candidate_tiles'] for z in zooms),
            'tile_ranges': zooms, 'provider': None, 'tile_urls': None,
            'warning': 'NOT a map or proof of coverage. No tile requests made. Obtain tiles only from a provider permitting offline use and archive creation. Acknowledgement does not grant rights.'}


def build_subset(folder: Path, area_id: str, source_id: str, dest_id: str,
                 rights_confirmed: bool, lock: threading.Lock):
    """Copy only locally available, allowed raster tiles; no network or overwrite.

    User attestation is a prompt, not a machine-verifiable license decision.
    Source and target are independent files; errors leave source untouched.
    """
    from .offline_maps import MAP_ID
    if rights_confirmed is not True:
        raise AreaError('Confirm that your source map license permits creating local derivative packages')
    if not isinstance(dest_id, str) or not MAP_ID.fullmatch(dest_id) or dest_id.endswith('.'):
        raise AreaError('Choose a safe output filename (letters/digits/dashes/underscores/dots)')
    if not lock.acquire(blocking=False):
        raise MapBusy('Another map operation is in progress')
    try:
        plan = get_area(folder, area_id)
        source = _map_path(folder, source_id)
        info = _inspect_map(source, source_id)
        target = folder / f'{dest_id}.mbtiles'
        if target.exists() or target.is_symlink() or dest_id == source_id:
            raise MapExists('Output map name already exists; existing maps were preserved')
        lo, hi = max(plan['minzoom'], info['minzoom']), min(plan['maxzoom'], info['maxzoom'])
        if lo > hi:
            raise AreaError('No overlapping zoom levels between planned area and source map')
        candidate = estimate(plan['bounds'], lo, hi)
        if candidate > MAX_DERIVED_TILES:
            raise AreaError('Too many tiles; reduce area or zoom levels')
        stage = folder / ('.openrf-subset-' + secrets.token_hex(12) + '.part')
        try:
            fd = os.open(stage, os.O_WRONLY | os.O_EXCL | os.O_CREAT, 0o600)
            os.close(fd)
            count = 0
            total_bytes = 0
            actual_zooms = set()
            with _connection(source) as src, sqlite3.connect(stage) as dst:
                dst.execute('CREATE TABLE metadata (name text, value text)')
                dst.execute('CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)')
                dst.execute('CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)')
                # Small bounded candidate query avoids unbounded iteration of a large source.
                for z in range(lo, hi + 1):
                    x0, x1, y0, y1 = _ranges(plan['bounds'], z)
                    # XYZ north/south become TMS inverted rows in MBTiles.
                    a, b = (1 << z) - 1 - y1, (1 << z) - 1 - y0
                    for x, tmsy, data in src.execute(
                        'SELECT tile_column, tile_row, tile_data FROM tiles WHERE zoom_level=? AND tile_column BETWEEN ? AND ? AND tile_row BETWEEN ? AND ?',
                        (z, x0, x1, a, b)):
                        if not isinstance(data, bytes) or not 0 < len(data) <= MAX_TILE_BYTES or not _image_matches_format(data, info['format']):
                            raise AreaError('Source contains an invalid raster tile; output was not installed')
                        count += 1
                        total_bytes += len(data)
                        if count > MAX_DERIVED_TILES or total_bytes > MAX_DERIVED_BYTES:
                            raise AreaError('Subset exceeds local tile or 512 MiB payload limit')
                        dst.execute('INSERT OR IGNORE INTO tiles VALUES(?,?,?,?)', (z, x, tmsy, data))
                        actual_zooms.add(z)
                if not count:
                    raise AreaError('Source map has no tiles within this area and zoom range; no map was created')
                metadata = {'name': plan['name'], 'type': 'baselayer', 'format': info['format'],
                            'minzoom': str(min(actual_zooms)), 'maxzoom': str(max(actual_zooms)),
                            'bounds': ','.join(str(v) for v in plan['bounds']),
                            'attribution': info['attribution'],
                            'description': 'Local subset of ' + info['name'],
                            'openrf_source_map': source_id,
                            'openrf_area_id': area_id}
                dst.executemany('INSERT INTO metadata VALUES (?,?)', metadata.items())
                dst.commit()
            _inspect_map(stage, dest_id)
            try:
                os.link(stage, target)
            except FileExistsError as exc:
                raise MapExists('Output filename became occupied; existing map was preserved') from exc
            result = _inspect_map(target, dest_id)
            return {'map': result, 'tiles_copied': count, 'candidate_tiles': candidate,
                    'source_map_id': source_id, 'area_id': area_id,
                    'warning': 'Only tiles found in source were copied. Bounds do not guarantee full geographic coverage. Review attribution and license.'}
        finally:
            stage.unlink(missing_ok=True)
    finally:
        lock.release()
