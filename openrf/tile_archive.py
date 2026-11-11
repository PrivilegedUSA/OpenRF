"""Create **local-only** raster MBTiles from a user-supplied XYZ/TMS tile ZIP.

No tile downloader, remote URL importer, or investigation-data writes. Tiles are
accepted only from an operator-selected local archive with explicit permission
attestation and provider attribution. ZIP entries are NEVER extracted to paths.
"""
from __future__ import annotations

import os
import re
import secrets
import sqlite3
import threading
import zipfile
from contextlib import closing
from pathlib import Path

from .map_areas import AreaError, _ranges, get_area, MAX_DERIVED_TILES
from .offline_maps import (MAP_ID, MAX_TILE_BYTES, MapBusy, MapExists,
                           _image_matches_format, _inspect_map)

MAX_ZIP_BYTES = 512 * 1024 * 1024
MAX_ZIP_ENTRIES = 15000
MAX_ZIP_UNPACKED = 512 * 1024 * 1024
MAX_ZIP_TILE_BYTES = 512 * 1024 * 1024
CHUNK = 1024 * 1024
# Optional single archive root and/or 'tiles' prefix. All coordinates are
# decimal integers with no signed fields; no arbitrary nested directory tree.
TILE_PATH = re.compile(r'(?:(?:[A-Za-z0-9][A-Za-z0-9_.-]{0,63})/)?(?:tiles/)?([0-9]{1,2})/([0-9]{1,8})/([0-9]{1,8})\.(png|jpg|jpeg|webp)\Z', re.I)
AUX_PATH = re.compile(r'(?:(?:[A-Za-z0-9][A-Za-z0-9_.-]{0,63})/)?(?:README|LICENSE|attribution|metadata)(?:\.(?:txt|md|json))?\Z', re.I)


class TileArchiveError(ValueError):
    """Archive format, licensing inputs, or tile limits invalid."""


def _validate_name(map_id: str):
    if not isinstance(map_id, str) or not MAP_ID.fullmatch(map_id) or map_id.endswith('.'):
        raise TileArchiveError('Choose an unused safe map filename (letters, numbers, dash, underscore, dot)')


def _validate_credit(value, *, label, maximum, minimum=1):
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise TileArchiveError(f'{label} must be {minimum}–{maximum} visible characters')
    return value.strip()


def _validate_archive(zfile, plan, scheme):
    infos = zfile.infolist()
    if not infos or len(infos) > MAX_ZIP_ENTRIES:
        raise TileArchiveError(f'ZIP must contain 1–{MAX_ZIP_ENTRIES:,} entries')
    total_unpacked = 0
    source_format = None
    seen = set()
    selected = []
    outside = 0
    all_tiles = 0
    bounds = plan['bounds']
    for info in infos:
        name = info.filename
        # Reject untrusted paths even for files outside the selected area.
        if (not name or '\\' in name or name.startswith('/') or '\x00' in name or
            any(part in ('.', '..') for part in name.split('/')) or
            ':' in name or len(name) > 240):
            raise TileArchiveError('ZIP contains an unsafe path or filename')
        if info.flag_bits & 1:
            raise TileArchiveError('Encrypted ZIP entries are unsupported')
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise TileArchiveError('Use a ZIP with stored or deflated entries only')
        # Unix external mode: symlinks/devices must never be accepted.
        mode = (info.external_attr >> 16) & 0o170000
        if mode not in (0, 0o100000, 0o040000):
            raise TileArchiveError('ZIP links and special files are unsupported')
        if info.is_dir():
            continue
        total_unpacked += info.file_size
        if total_unpacked > MAX_ZIP_UNPACKED:
            raise TileArchiveError('ZIP exceeds the 512 MiB expanded-data limit')
        match = TILE_PATH.fullmatch(name)
        if not match:
            if AUX_PATH.fullmatch(name):
                continue  # attribution is supplied explicitly in the UI
            raise TileArchiveError(f'Unsupported tile path: {name[:100]}. Expected z/x/y.png or tiles/z/x/y.png')
        all_tiles += 1
        z, x, input_y = map(int, match.groups()[:3])
        ext = match.group(4).lower()
        fmt = 'jpg' if ext in ('jpeg', 'jpg') else ext
        if source_format is None:
            source_format = fmt
        if fmt != source_format:
            raise TileArchiveError('Use one raster format per archive (PNG, JPEG or WebP), not mixed images')
        if z > 18 or x >= (1 << z) or input_y >= (1 << z):
            raise TileArchiveError(f'Invalid tile coordinate in ZIP: {name[:100]}')
        if info.file_size < 8 or info.file_size > MAX_TILE_BYTES:
            raise TileArchiveError(f'Tile exceeds the 8 MiB per-image limit or is empty: {name[:100]}')
        xyz_y = (1 << z) - 1 - input_y if scheme == 'tms' else input_y
        xyz = (z, x, xyz_y)
        if xyz in seen:
            raise TileArchiveError('Duplicate z/x/y tile paths; archive is ambiguous')
        seen.add(xyz)
        if z < plan['minzoom'] or z > plan['maxzoom']:
            outside += 1
            continue
        x0, x1, y0, y1 = _ranges(bounds, z)
        if not (x0 <= x <= x1 and y0 <= xyz_y <= y1):
            outside += 1
            continue
        selected.append((info, z, x, xyz_y))
        if len(selected) > MAX_DERIVED_TILES:
            raise TileArchiveError('More than 10,000 tiles fall within the selected plan')
    if not all_tiles or not selected:
        raise TileArchiveError('No matching raster tiles for this saved area and zoom range. Check area, zooms and tile-row scheme')
    return selected, source_format, outside


def import_xyz_zip(folder: Path, area_id: str, output_id: str, source_stream, length: int,
                   attribution: str, source_name: str, scheme: str, rights_confirmed: bool,
                   lock: threading.Lock):
    """Stage, validate, clip and convert a **local** ZIP into standard TMS MBTiles.

    No destination is overwritten; incomplete output is unlinked. The original
    browser-selected ZIP is not modified and is never persisted after import.
    """
    _validate_name(output_id)
    if rights_confirmed is not True:
        raise TileArchiveError('Confirm your license permits offline storage and local map package creation')
    attribution = _validate_credit(attribution, label='Provider/data attribution', maximum=240, minimum=3)
    source_name = _validate_credit(source_name, label='Source/provider name', maximum=120)
    if scheme not in ('xyz', 'tms'):
        raise TileArchiveError('Tile row scheme must be XYZ or TMS')
    if type(length) is not int or not 100 <= length <= MAX_ZIP_BYTES:
        raise TileArchiveError('ZIP upload must be 100 bytes–512 MiB')
    if not lock.acquire(blocking=False):
        raise MapBusy('Another local map operation is in progress')
    try:
        plan = get_area(folder, area_id)
        folder.mkdir(parents=True, exist_ok=True)
        output = folder / f'{output_id}.mbtiles'
        if output.exists() or output.is_symlink():
            raise MapExists('Output map name already exists. Existing maps were preserved')
        archive = folder / ('.openrf-zip-' + secrets.token_hex(12) + '.part')
        staging = folder / ('.openrf-tiles-' + secrets.token_hex(12) + '.part')
        try:
            fd = os.open(archive, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'wb') as dest:
                remaining = length
                while remaining:
                    chunk = source_stream.read(min(CHUNK, remaining))
                    if not chunk:
                        raise TileArchiveError('Incomplete ZIP transfer; no map installed')
                    dest.write(chunk)
                    remaining -= len(chunk)
                dest.flush()
                os.fsync(dest.fileno())
            try:
                with zipfile.ZipFile(archive) as zfile:
                    items, fmt, outside = _validate_archive(zfile, plan, scheme)
                    fd = os.open(staging, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                    os.close(fd)
                    copied_bytes = 0
                    levels = set()
                    with closing(sqlite3.connect(staging)) as db:
                        db.execute('CREATE TABLE metadata (name text, value text)')
                        db.execute('CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)')
                        db.execute('CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)')
                        for info, z, x, y in items:
                            with zfile.open(info) as stream:
                                raw = stream.read(MAX_TILE_BYTES + 1)
                            if len(raw) != info.file_size or not _image_matches_format(raw, fmt):
                                raise TileArchiveError(f'Tile data is invalid or truncated: {info.filename[:90]}')
                            copied_bytes += len(raw)
                            if copied_bytes > MAX_ZIP_TILE_BYTES:
                                raise TileArchiveError('Selected tiles exceed 512 MiB')
                            db.execute('INSERT INTO tiles VALUES (?, ?, ?, ?)', (z, x, (1 << z) - 1 - y, raw))
                            levels.add(z)
                        credit = {'name': plan['name'], 'type': 'baselayer', 'format': fmt,
                                  'version': '1', 'description': 'Local tiles imported by OpenRF; partial coverage possible',
                                  'bounds': ','.join(str(x) for x in plan['bounds']),
                                  'minzoom': str(min(levels)), 'maxzoom': str(max(levels)),
                                  'attribution': attribution, 'openrf_source': source_name,
                                  'openrf_area_id': plan['id'], 'openrf_import': 'local-zip-only',
                                  'openrf_original_scheme': scheme}
                        db.executemany('INSERT INTO metadata VALUES (?, ?)', credit.items())
                        db.commit()
            except (zipfile.BadZipFile, EOFError, RuntimeError, OSError, sqlite3.DatabaseError) as exc:
                raise TileArchiveError('Invalid/corrupt ZIP or map tiles; no package installed') from exc
            _inspect_map(staging, output_id)
            try:
                os.link(staging, output)
            except FileExistsError as exc:
                raise MapExists('Output name became occupied; existing package preserved') from exc
            return {'map': _inspect_map(output, output_id), 'tiles_imported': len(items),
                    'tiles_ignored': outside, 'source_name': source_name, 'scheme': scheme,
                    'warning': 'Coverage is partial unless independently verified; matching tiles are local-only. Check attribution and provider license.'}
        finally:
            archive.unlink(missing_ok=True)
            staging.unlink(missing_ok=True)
    finally:
        lock.release()
