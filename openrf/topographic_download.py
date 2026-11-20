"""Explicit, bounded USGS Topographic online preparation for offline raster viewing.

Only saved operator-selected areas may be fetched. The destination is a private
MBTiles archive, never the application's source tree or investigation database.
No URLs are supplied by callers, and failed/cancelled runs leave no published
partial package. USGS raster tiles are *not* a numeric terrain elevation model.
"""
from __future__ import annotations

import os
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler

from .map_areas import get_area, area_tile_manifest, AreaError
from .offline_maps import MAP_ID, MAX_TILE_BYTES, _image_matches_format, _inspect_map, MapBusy, MapExists

MAX_TOPO_TILES = 96
MAX_TOPO_BYTES = 64 * 1024 * 1024
MAX_JOB_SECONDS = 150
BASE_URL = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile'
ATTRIBUTION = 'USGS The National Map, USGSTopo; 3DEP; OpenStreetMap contributors (where applicable)'


class TopoError(ValueError):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise TopoError('Unexpected USGS redirect; download stopped')


_opener = build_opener(_NoRedirect())


def fetch_tile(z: int, x: int, y: int) -> bytes:
    """Trusted fixed host and numeric XYZ only; limit redirects and byte count."""
    if not (0 <= z <= 18 and 0 <= x < (1 << z) and 0 <= y < (1 << z)):
        raise TopoError('Invalid requested XYZ tile')
    request = Request(f'{BASE_URL}/{z}/{y}/{x}', headers={'User-Agent': 'OpenRF/0.2 offline-topo-preparation', 'Accept': 'image/png,image/jpeg,image/webp'})
    with _opener.open(request, timeout=5) as response:
        if response.status != 200:
            raise TopoError('Topographic tile service did not return a map image')
        image = response.read(MAX_TILE_BYTES + 1)
    if not (0 < len(image) <= MAX_TILE_BYTES and _image_matches_format(image, 'mixed')):
        raise TopoError('USGS returned an invalid or oversized raster tile')
    return image


def download_area(folder: Path, plan: dict, map_id: str, lock: threading.Lock,
                  progress=None, cancelled=lambda: False, fetch=fetch_tile) -> dict:
    """Build an atomic, non-overwriting raster MBTiles with bounded public tiles."""
    if not isinstance(map_id, str) or not MAP_ID.fullmatch(map_id) or map_id.endswith('.'):
        raise TopoError('Use a safe new map filename, without .mbtiles')
    manifest = area_tile_manifest(plan)
    count = manifest['candidate_tile_slots']
    if count < 1 or count > MAX_TOPO_TILES:
        raise TopoError(f'Area has {count:,} candidate tiles; choose no more than {MAX_TOPO_TILES} (smaller bounds or fewer zoom levels)')
    if not lock.acquire(blocking=False):
        raise MapBusy('Another offline map operation is in progress')
    try:
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f'{map_id}.mbtiles'
        if target.exists() or target.is_symlink():
            raise MapExists('A map with that filename already exists; nothing was replaced')
        stage = folder / ('.openrf-usgs-topo-' + secrets.token_hex(12) + '.part')
        begin = time.monotonic()
        downloaded = 0
        total_bytes = 0
        missing = 0
        try:
            fd = os.open(stage, os.O_WRONLY | os.O_EXCL | os.O_CREAT, 0o600)
            os.close(fd)
            with sqlite3.connect(stage) as db:
                db.execute('CREATE TABLE metadata (name TEXT, value TEXT)')
                db.execute('CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)')
                db.execute('CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)')
                for entry in manifest['tile_ranges']:
                    z = entry['z']
                    for x in range(entry['x_min'], entry['x_max'] + 1):
                        for y in range(entry['y_min_xyz'], entry['y_max_xyz'] + 1):
                            if cancelled():
                                raise TopoError('Download cancelled; no package installed')
                            if time.monotonic() - begin > MAX_JOB_SECONDS:
                                raise TopoError('Download timed out after 150 seconds; try a smaller area')
                            try:
                                tile = fetch(z, x, y)
                            except (HTTPError, URLError, OSError, TimeoutError, TopoError) as exc:
                                # One missing cache tile must not hide other downloaded coverage.
                                missing += 1
                                if progress:
                                    progress(downloaded, missing, count)
                                continue
                            if not isinstance(tile, bytes) or not 0 < len(tile) <= MAX_TILE_BYTES or not _image_matches_format(tile, 'mixed'):
                                raise TopoError('Received invalid raster image; no package installed')
                            total_bytes += len(tile)
                            if total_bytes > MAX_TOPO_BYTES:
                                raise TopoError('Offline package exceeds 64 MiB; select a smaller region')
                            db.execute('INSERT INTO tiles VALUES (?,?,?,?)', (z, x, (1 << z) - 1 - y, tile))
                            downloaded += 1
                            if progress:
                                progress(downloaded, missing, count)
                if downloaded == 0:
                    raise TopoError('USGS returned no usable topographic tiles; no package installed')
                metadata = {
                    'name': 'USGS Topographic · ' + plan['name'], 'type': 'baselayer',
                    'format': 'mixed', 'minzoom': str(manifest['minzoom']),
                    'maxzoom': str(manifest['maxzoom']),
                    'bounds': ','.join(str(v) for v in manifest['bounds_wgs84']),
                    'attribution': ATTRIBUTION, 'openrf_area_id': plan['id'],
                    'openrf_source': 'USGSTopo (user-initiated, online preparation)',
                }
                db.executemany('INSERT INTO metadata VALUES (?,?)', metadata.items())
                db.commit()
            _inspect_map(stage, map_id)
            try:
                os.link(stage, target)
            except FileExistsError as exc:
                raise MapExists('Map filename was occupied during download; existing file preserved') from exc
            return {'map': _inspect_map(target, map_id), 'tiles_downloaded': downloaded,
                    'tiles_missing': missing, 'candidate_tiles': count,
                    'complete': missing == 0, 'source': 'USGS Topographic'}
        finally:
            stage.unlink(missing_ok=True)
    finally:
        lock.release()


class TopographicJobs:
    """One bounded background download at a time; state stays in process memory."""
    def __init__(self, folder: Path, map_lock: threading.Lock):
        self.folder = folder
        self.map_lock = map_lock
        self.guard = threading.Lock()
        self.cancel_event = threading.Event()
        self.job = {'state': 'idle'}

    def status(self) -> dict:
        with self.guard:
            return dict(self.job)

    def start(self, area_id: str, map_id: str, confirmed: bool):
        if confirmed is not True:
            raise TopoError('Confirm an online USGS download to the selected private map area')
        plan = get_area(self.folder, area_id)
        candidate = area_tile_manifest(plan)['candidate_tile_slots']
        if candidate < 1 or candidate > MAX_TOPO_TILES:
            raise TopoError(f'Area needs {candidate:,} tiles; prepare a smaller saved area (maximum {MAX_TOPO_TILES})')
        if not isinstance(map_id, str) or not MAP_ID.fullmatch(map_id) or map_id.endswith('.'):
            raise TopoError('Invalid output map filename')
        if (self.folder / f'{map_id}.mbtiles').exists():
            raise MapExists('That map name already exists')
        with self.guard:
            if self.job.get('state') == 'running':
                raise MapBusy('A topographic download is already running')
            self.cancel_event = threading.Event()
            self.job = {'state': 'running', 'area_id': area_id, 'map_id': map_id,
                        'downloaded': 0, 'missing': 0, 'candidate_tiles': candidate}
        def run():
            try:
                def progress(done, missing, total):
                    with self.guard:
                        self.job.update(downloaded=done, missing=missing, candidate_tiles=total)
                result = download_area(self.folder, plan, map_id, self.map_lock,
                                       progress=progress, cancelled=self.cancel_event.is_set)
                with self.guard:
                    self.job.update(state='complete', result=result)
            except Exception as exc:
                with self.guard:
                    self.job.update(state='cancelled' if self.cancel_event.is_set() else 'failed',
                                    error=str(exc)[:200])
        threading.Thread(target=run, name='OpenRF-topographic-download', daemon=True).start()
        return self.status()

    def cancel(self):
        self.cancel_event.set()
        return self.status()
