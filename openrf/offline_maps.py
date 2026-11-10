"""Read-only local raster MBTiles basemaps.

No network requests or prefetching. An operator supplies lawful MBTiles files under
<data directory>/maps. This is intentionally separate from investigation SQLite.
"""
from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from urllib.parse import quote

# Filenames are stable opaque identifiers; never accept paths from HTTP requests.
MAP_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\Z")
SUPPORTED_FORMATS = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'}
MAX_TILE_BYTES = 8 * 1024 * 1024


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


def map_info(folder: Path, map_id: str) -> dict:
    path = _map_path(folder, map_id)
    try:
        with _connection(path) as db:
            metadata = dict(db.execute('SELECT name, value FROM metadata'))
            # Verify canonical tile table exists; precompiled/alternative vector
            # layouts are deliberately not accepted as a raster package.
            db.execute('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles LIMIT 0')
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
    # No absolute file system path, private location, or untrusted attribution HTML.
    return {'id': map_id, 'name': str(metadata.get('name') or map_id)[:120],
            'format': fmt, 'minzoom': minzoom, 'maxzoom': maxzoom,
            'bounds': bounds, 'attribution': str(metadata.get('attribution') or '')[:240],
            'size_bytes': path.stat().st_size}


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
    signature_ok = (fmt == 'png' and raw.startswith(b'\x89PNG\r\n\x1a\n') or
                    fmt in ('jpg', 'jpeg') and raw.startswith(b'\xff\xd8\xff') or
                    fmt == 'webp' and raw.startswith(b'RIFF') and raw[8:12] == b'WEBP')
    if not signature_ok:
        raise TileMissing('Local tile image does not match declared format')
    return raw, SUPPORTED_FORMATS[fmt]
