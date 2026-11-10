"""Read-only local raster MBTiles basemaps.

No network requests or prefetching. An operator supplies lawful MBTiles files under
<data directory>/maps. This is intentionally separate from investigation SQLite.
"""
from __future__ import annotations

import os
import re
import secrets
import sqlite3
import threading
from pathlib import Path
from urllib.parse import quote

# Filenames are stable opaque identifiers; never accept paths from HTTP requests.
MAP_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\Z")
SUPPORTED_FORMATS = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'}
MAX_TILE_BYTES = 8 * 1024 * 1024
# Bound upload size and memory use. This is a transport cap, not a map-size claim.
MAX_IMPORT_BYTES = 1024 * 1024 * 1024
COPY_CHUNK_BYTES = 1024 * 1024



class MapNotFound(ValueError):
    """Unknown or unsafe map identifier."""


class TileMissing(ValueError):
    """Tile is not present or outside the declared zoom range."""


def _connection(path: Path):
    # sqlite URI uses a percent-escaped absolute path; no creation or writes.
    return sqlite3.connect('file:' + quote(str(path), safe='/') + '?mode=ro&immutable=1', uri=True, timeout=1)


def _map_path(folder: Path, map_id: str) -> Path:
    if not isinstance(map_id, str) or not MAP_ID.fullmatch(map_id) or map_id.endswith('.'):
        raise MapNotFound('Invalid offline map name')
    folder = folder.resolve()
    path = folder / f'{map_id}.mbtiles'
    # Symlinks must not let an HTTP path reach the user's private files.
    if path.is_symlink() or not path.is_file() or path.resolve().parent != folder:
        raise MapNotFound('Offline map not available')
    return path


def _int_field(metadata: dict, name: str, default: int):
    try:
        val = int(metadata.get(name, default))
        return val if 0 <= val <= 22 else default
    except (ValueError, TypeError):
        return default


def _inspect_map(path: Path, map_id: str) -> dict:
    """Validate a local file as a raster MBTiles archive, without trusting its metadata."""
    try:
        with _connection(path) as db:
            metadata = dict(db.execute('SELECT name, value FROM metadata'))
            # Verify canonical tile table exists; precompiled/alternative vector
            # layouts are deliberately not accepted as a raster package.
            db.execute('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles LIMIT 0')
            if not db.execute('SELECT 1 FROM tiles LIMIT 1').fetchone():
                raise MapNotFound('MBTiles contains no map tiles')
    except (sqlite3.Error, OSError) as exc:
        raise MapNotFound('Unreadable or incomplete MBTiles database') from exc
    fmt = str(metadata.get('format', '')).lower()
    if fmt not in SUPPORTED_FORMATS or metadata.get('type', 'baselayer') not in ('baselayer', ''):
        raise MapNotFound('Only raster PNG/JPEG/WebP basemap MBTiles files are supported')
    minzoom = _int_field(metadata, 'minzoom', 0)
    maxzoom = _int_field(metadata, 'maxzoom', 18)
    if minzoom > maxzoom:
        raise MapNotFound('Invalid MBTiles zoom range')
    bounds = None
    try:
        points = [float(x) for x in metadata.get('bounds', '').split(',')]
        if len(points) == 4 and -180 <= points[0] < points[2] <= 180 and -90 <= points[1] < points[3] <= 90:
            bounds = points
    except (ValueError, TypeError):
        pass
    # Validate image data as well as declared metadata before listing or import.
    try:
        with _connection(path) as db:
            sample = db.execute('SELECT tile_data FROM tiles LIMIT 1').fetchone()
        raw = sample[0] if sample else b''
        if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_TILE_BYTES or not _image_matches_format(raw, fmt):
            raise MapNotFound('MBTiles sample tile is missing or does not match image format')
    except (sqlite3.Error, OSError) as exc:
        raise MapNotFound('Cannot read MBTiles sample image') from exc
    # No absolute file system path, private location, or untrusted attribution HTML.
    return {'id': map_id, 'name': str(metadata.get('name') or map_id)[:120],
            'format': fmt, 'minzoom': minzoom, 'maxzoom': maxzoom,
            'bounds': bounds, 'attribution': str(metadata.get('attribution') or '')[:240],
            'size_bytes': path.stat().st_size}


def map_info(folder: Path, map_id: str) -> dict:
    return _inspect_map(_map_path(folder, map_id), map_id)


def _image_matches_format(raw: bytes, fmt: str) -> bool:
    return (fmt == 'png' and raw.startswith(b'\x89PNG\r\n\x1a\n') or
            fmt in ('jpg', 'jpeg') and raw.startswith(b'\xff\xd8\xff') or
            fmt == 'webp' and raw.startswith(b'RIFF') and raw[8:12] == b'WEBP')


def import_map(folder: Path, map_id: str, source, length: int, lock: threading.Lock) -> dict:
    """Atomic bounded upload of a user-supplied raster MBTiles. No external downloads.

    A server-generated hidden staging file is verified before being linked into
    the catalog. os.link refuses to replace any existing file even across races.
    """
    if not isinstance(map_id, str) or not MAP_ID.fullmatch(map_id) or map_id.endswith('.'):
        raise ValueError('Use a map filename beginning with a letter or digit, followed by ASCII letters, digits, dots, underscores or dashes')
    if not isinstance(length, int) or length < 100 or length > MAX_IMPORT_BYTES:
        raise ValueError('MBTiles file must be between 100 bytes and 1 GiB')
    if not lock.acquire(blocking=False):
        raise MapBusy('Another map operation is in progress')
    try:
        folder.mkdir(parents=True, exist_ok=True)
        destination = folder / f'{map_id}.mbtiles'
        if destination.exists() or destination.is_symlink():
            raise MapExists('Map name already installed. Rename the file or remove the old map first')
        staging = folder / ('.openrf-upload-' + secrets.token_hex(16) + '.part')
        try:
            fd = os.open(staging, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as out:
                remaining = length
                while remaining:
                    chunk = source.read(min(COPY_CHUNK_BYTES, remaining))
                    if not chunk:
                        raise ValueError('Incomplete upload; original file was not installed')
                    out.write(chunk)
                    remaining -= len(chunk)
                out.flush()
                os.fsync(out.fileno())
            _inspect_map(staging, map_id)
            # Atomic no-overwrite publish. Prevent a concurrent/other process
            # from silently replacing an existing user map package.
            try:
                os.link(staging, destination)
            except FileExistsError as exc:
                raise MapExists('Map name already exists; existing map was preserved') from exc
            return map_info(folder, map_id)
        finally:
            try:
                staging.unlink(missing_ok=True)
            except OSError:
                pass
    finally:
        lock.release()


class MapExists(ValueError):
    """A different local archive already owns that name."""


class MapBusy(ValueError):
    """Another map import/removal holds the lock."""


def remove_map(folder: Path, map_id: str, lock: threading.Lock) -> bool:
    """Explicitly remove only one verified, non-symlinked .mbtiles path."""
    if not lock.acquire(blocking=False):
        raise MapBusy('Another map operation is in progress')
    try:
        path = _map_path(folder, map_id)
        path.unlink()
        return True
    finally:
        lock.release()


def available_maps(folder: Path) -> list[dict]:
    if not folder.is_dir():
        return []
    maps = []
    for path in sorted(folder.glob('*.mbtiles')):
        if not MAP_ID.fullmatch(path.stem):
            continue
        try:
            maps.append(map_info(folder, path.stem))
        except (MapNotFound, OSError):
            # A damaged/non-raster map must not make the application unusable.
            continue
    return maps


def tile_bytes(folder: Path, map_id: str, zoom: int, x: int, y: int) -> tuple[bytes, str]:
    info = map_info(folder, map_id)
    if (not all(isinstance(v, int) for v in (zoom, x, y)) or
            zoom < info['minzoom'] or zoom > info['maxzoom'] or
            x < 0 or y < 0 or x >= 2 ** zoom or y >= 2 ** zoom):
        raise TileMissing('Tile outside package zoom or coordinate range')
    path = _map_path(folder, map_id)
    with _connection(path) as db:
        row = db.execute('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1',
                         (zoom, x, (2 ** zoom - 1 - y))).fetchone()
    if not row or not isinstance(row[0], bytes) or not 0 < len(row[0]) <= MAX_TILE_BYTES:
        raise TileMissing('Tile not included in local package')
    raw = row[0]
    fmt = info['format']
    if not _image_matches_format(raw, fmt):
        raise TileMissing('Local tile image does not match declared format')
    return raw, SUPPORTED_FORMATS[fmt]
