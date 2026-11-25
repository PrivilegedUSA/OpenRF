"""Private, explicitly requested offline raster tiles following a planned route.

Only bounded route-corridor tile keys are accepted. Preview is local and does
not fetch or persist positions. Download goes to a private MBTiles archive,
with an atomic publish only after *all* planned tile slots are received.
It does not download Valhalla graphs, numeric terrain, or GPS observations.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import secrets
import sqlite3
from contextlib import closing
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

from .offline_maps import MAP_ID, MAX_TILE_BYTES, _image_matches_format, _inspect_map, MapBusy, MapExists
from .topographic_download import _NoRedirect

MAX_TRIP_TILES = 384
MAX_TRIP_BYTES = 128 * 1024 * 1024
MAX_JOB_SECONDS = 300
MAX_ROUTE_POINTS = 257
MAX_ROUTE_STEPS = 12000
SOURCES = {
    'topographic': ('USGSTopo', 'USGS The National Map · USGSTopo · 3DEP · OpenStreetMap contributors'),
    'satellite': ('USGSImageryOnly', 'USGS The National Map · USGS Imagery Only · USDA NAIP'),
}
_opener = build_opener(_NoRedirect())


class TripMapError(ValueError):
    pass


def _validated(points, corridor_miles, minzoom, maxzoom, source):
    if not isinstance(points, list) or not 2 <= len(points) <= MAX_ROUTE_POINTS:
        raise TripMapError(f'Use 2–{MAX_ROUTE_POINTS} sampled route points')
    route = []
    for point in points:
        if (not isinstance(point, list) or len(point) != 2 or
                any(type(v) not in (float, int) or not math.isfinite(v) for v in point)):
            raise TripMapError('Route points must be numeric [longitude, latitude] pairs')
        lon, lat = point
        if not -180 <= lon <= 180 or not -80 <= lat <= 80:
            raise TripMapError('Route outside supported Web Mercator latitude/longitude limits')
        if route and abs(lon - route[-1][0]) > 180:
            raise TripMapError('Dateline-crossing routes are not supported')
        route.append((float(lon), float(lat)))
    if type(corridor_miles) not in (float, int) or corridor_miles not in (0.5, 1, 2):
        raise TripMapError('Choose a 0.5, 1 or 2 mile route corridor')
    if type(minzoom) is not int or type(maxzoom) is not int or (minzoom, maxzoom) not in ((9, 11), (9, 12), (9, 13)):
        raise TripMapError('Choose compact, standard or detailed offline map zoom')
    if not isinstance(source, str) or source not in SOURCES:
        raise TripMapError('Only approved USGS topographic and satellite raster sources are supported')
    if all(point == route[0] for point in route):
        raise TripMapError('Selected route contains no geographic movement')
    return route


def _tile_xy(lon, lat, zoom):
    n = 1 << zoom
    return ((lon + 180) / 360 * n,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def trip_tile_plan(points, corridor_miles, minzoom, maxzoom, source):
    """Build bounded, de-duplicated XYZ tile keys along route segments.

    The squared tile neighborhood slightly overfetches around a route rather
    than falsely implying exact real-world corridor or complete road coverage.
    """
    route = _validated(points, corridor_miles, minzoom, maxzoom, source)
    tiles = set()
    operations = 0
    for zoom in range(minzoom, maxzoom + 1):
        n = 1 << zoom
        projected = [_tile_xy(lon, lat, zoom) for lon, lat in route]
        for i in range(1, len(projected)):
            ax, ay = projected[i - 1]
            bx, by = projected[i]
            steps = max(1, math.ceil(max(abs(bx - ax), abs(by - ay)) * 2))
            operations += steps
            if operations > MAX_ROUTE_STEPS:
                raise TripMapError('Route too long for one trip pack; split the journey into shorter legs')
            for index in range(steps + 1):
                ratio = index / steps
                x = ax + (bx - ax) * ratio
                y = ay + (by - ay) * ratio
                lat = route[i - 1][1] + (route[i][1] - route[i - 1][1]) * ratio
                meters_per_tile = 40_075_016.686 * max(0.17, math.cos(math.radians(lat))) / n
                radius = math.ceil(corridor_miles * 1609.344 / meters_per_tile)
                if radius > 12:
                    raise TripMapError('Route corridor requires too many tiles at this latitude and zoom')
                for tx in range(math.floor(x) - radius, math.floor(x) + radius + 1):
                    if not 0 <= tx < n:
                        continue
                    for ty in range(math.floor(y) - radius, math.floor(y) + radius + 1):
                        if 0 <= ty < n:
                            tiles.add((zoom, tx, ty))
                if len(tiles) > MAX_TRIP_TILES:
                    raise TripMapError(f'Trip requires more than {MAX_TRIP_TILES} tiles. Choose a smaller corridor, less detail, or shorter route')
    if not tiles:
        raise TripMapError('No map tile coverage for this route')
    lons = [p[0] for p in route]
    lats = [p[1] for p in route]
    degree_lat = corridor_miles / 69.0
    degree_lon = degree_lat / max(0.17, math.cos(math.radians(max(map(abs, lats)))))
    bounds = [max(-180, min(lons) - degree_lon), max(-80, min(lats) - degree_lat),
              min(180, max(lons) + degree_lon), min(80, max(lats) + degree_lat)]
    if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
        raise TripMapError('Route bounds unavailable; choose a supported area')
    encoded = json.dumps([route, corridor_miles, minzoom, maxzoom, source], separators=(',', ':'))
    digest = hashlib.sha256(encoded.encode('utf-8')).hexdigest()[:24]
    return {'source': source, 'corridor_miles': corridor_miles, 'minzoom': minzoom,
            'maxzoom': maxzoom, 'tile_count': len(tiles), 'tiles': sorted(tiles),
            'bounds': bounds, 'preview_id': digest}


def estimate_trip(points, corridor_miles, minzoom, maxzoom, source):
    plan = trip_tile_plan(points, corridor_miles, minzoom, maxzoom, source)
    count = plan['tile_count']
    return {'kind': 'OPENRF_TRIP_MAP_ESTIMATE', 'source': source,
            'preview_id': plan['preview_id'], 'tile_count': count,
            'corridor_miles': corridor_miles, 'minzoom': minzoom, 'maxzoom': maxzoom,
            'estimated_bytes_low': count * 40 * 1024,
            'estimated_bytes_high': count * 300 * 1024,
            'hard_limit_bytes': MAX_TRIP_BYTES, 'read_only': True,
            'external_requests': False, 'gps_fix_checked': False,
            'graph_coverage_verified': False,
            'warning': 'Size is illustrative, not measured. Full tiles around sampled route segments may exceed the chosen corridor. No Valhalla graphs, GPS fixes or trail safety are included.'}


def fetch_trip_tile(source: str, z: int, x: int, y: int) -> bytes:
    if source not in SOURCES or not (0 <= z <= 18 and 0 <= x < 1 << z and 0 <= y < 1 << z):
        raise TripMapError('Invalid trip tile source or coordinates')
    service = SOURCES[source][0]
    url = f'https://basemap.nationalmap.gov/arcgis/rest/services/{service}/MapServer/tile/{z}/{y}/{x}'
    req = Request(url, headers={'User-Agent': 'OpenRF/0.2 explicit-trip-map-download',
                                'Accept': 'image/png,image/jpeg,image/webp'})
    with _opener.open(req, timeout=5) as response:
        if response.status != 200:
            raise TripMapError('USGS did not return the requested tile')
        tile = response.read(MAX_TILE_BYTES + 1)
    if not (0 < len(tile) <= MAX_TILE_BYTES and _image_matches_format(tile, 'mixed')):
        raise TripMapError('USGS tile image is invalid or too large')
    return tile


def download_trip(folder: Path, plan: dict, map_id: str, lock: threading.Lock,
                  progress=None, cancelled=lambda: False, fetch=fetch_trip_tile,
                  clock=time.monotonic):
    if not isinstance(map_id, str) or not MAP_ID.fullmatch(map_id) or map_id.endswith('.'):
        raise TripMapError('Choose a safe new offline map filename')
    if not lock.acquire(blocking=False):
        raise MapBusy('Another map operation is in progress')
    try:
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f'{map_id}.mbtiles'
        if target.exists() or target.is_symlink():
            raise MapExists('Offline map filename already exists; original was preserved')
        stage = folder / ('.openrf-trip-' + secrets.token_hex(12) + '.part')
        began = clock()
        downloaded = 0
        total_bytes = 0
        try:
            fd = os.open(stage, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
            with closing(sqlite3.connect(stage)) as db, db:
                db.execute('CREATE TABLE metadata (name TEXT, value TEXT)')
                db.execute('CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)')
                db.execute('CREATE UNIQUE INDEX tile_index ON tiles (zoom_level,tile_column,tile_row)')
                for z, x, y in plan['tiles']:
                    if cancelled():
                        raise TripMapError('Trip map download cancelled; no package installed')
                    if clock() - began > MAX_JOB_SECONDS:
                        raise TripMapError('Trip download exceeded 300 seconds; choose a shorter route')
                    try:
                        image = fetch(plan['source'], z, x, y)
                    except (HTTPError, URLError, OSError, TimeoutError, TripMapError) as exc:
                        raise TripMapError('USGS tile unavailable; incomplete trip package was not installed') from exc
                    if not isinstance(image, bytes) or not 0 < len(image) <= MAX_TILE_BYTES or not _image_matches_format(image, 'mixed'):
                        raise TripMapError('Invalid tile; incomplete trip package was not installed')
                    total_bytes += len(image)
                    if total_bytes > MAX_TRIP_BYTES:
                        raise TripMapError('Trip package exceeded 128 MiB; choose a smaller pack')
                    db.execute('INSERT INTO tiles VALUES (?,?,?,?)', (z, x, (1 << z) - 1 - y, image))
                    downloaded += 1
                    if progress:
                        progress(downloaded, plan['tile_count'])
                metadata = {
                    'name': 'Offline trip · ' + plan['source'].title(),
                    'type': 'baselayer', 'format': 'mixed',
                    'minzoom': str(plan['minzoom']), 'maxzoom': str(plan['maxzoom']),
                    'bounds': ','.join(str(round(value, 6)) for value in plan['bounds']),
                    'attribution': SOURCES[plan['source']][1],
                    'openrf_source': 'USGS explicit route-corridor preparation',
                    'openrf_trip_tiles': str(downloaded),
                }
                db.executemany('INSERT INTO metadata VALUES (?,?)', metadata.items())
                db.commit()
            _inspect_map(stage, map_id)
            try:
                os.link(stage, target)
            except FileExistsError as exc:
                raise MapExists('Map filename was occupied during download; existing map preserved') from exc
            return {'map': _inspect_map(target, map_id), 'tiles_downloaded': downloaded,
                    'candidate_tiles': plan['tile_count'], 'complete': True,
                    'source': plan['source'], 'max_bytes': MAX_TRIP_BYTES}
        finally:
            stage.unlink(missing_ok=True)
    finally:
        lock.release()


class TripMapJobs:
    """Only one in-memory job, with cancellation and no saved route geometry."""
    def __init__(self, folder: Path, map_lock: threading.Lock):
        self.folder, self.map_lock = folder, map_lock
        self.guard = threading.Lock()
        self.cancel_event = threading.Event()
        self.job = {'state': 'idle'}

    def status(self):
        with self.guard:
            return dict(self.job)

    def start(self, body: dict):
        if body.get('confirm_network') is not True:
            raise TripMapError('Confirm USGS tile download for this specific trip')
        plan = trip_tile_plan(body['points'], body['corridor_miles'], body['minzoom'],
                              body['maxzoom'], body['source'])
        if body.get('preview_id') != plan['preview_id']:
            raise TripMapError('Trip map settings changed; review a new estimate first')
        map_id = body['map_id']
        if not isinstance(map_id, str) or not MAP_ID.fullmatch(map_id) or map_id.endswith('.'):
            raise TripMapError('Choose a safe new offline map filename')
        if (self.folder / f'{map_id}.mbtiles').exists():
            raise MapExists('An offline map already has that filename')
        with self.guard:
            if self.job.get('state') == 'running':
                raise MapBusy('A trip map download is already running')
            self.cancel_event = threading.Event()
            self.job = {'state': 'running', 'map_id': map_id, 'source': plan['source'],
                        'preview_id': plan['preview_id'],
                        'downloaded': 0, 'candidate_tiles': plan['tile_count']}

        def run():
            try:
                def progress(count, total):
                    with self.guard:
                        self.job.update(downloaded=count, candidate_tiles=total)
                result = download_trip(self.folder, plan, map_id, self.map_lock,
                                       progress=progress, cancelled=self.cancel_event.is_set)
                with self.guard:
                    self.job.update(state='complete', result=result)
            except Exception as exc:
                with self.guard:
                    self.job.update(state='cancelled' if self.cancel_event.is_set() else 'failed',
                                    error=str(exc)[:180])
        threading.Thread(target=run, name='OpenRF-trip-offline-map', daemon=True).start()
        return self.status()

    def cancel(self):
        self.cancel_event.set()
        return self.status()
