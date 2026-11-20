"""One-shot local trip preflight; keep visual tiles separate from road routing."""
from __future__ import annotations

from datetime import datetime, timezone
import math
import sqlite3


def readiness_report(*, route_status: dict, vector_status: dict,
                     raster_maps: list[dict], now: datetime | None = None) -> dict:
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        raise ValueError('now must be timezone-aware')
    road_service = route_status.get('reachable') is True
    visual_vector = vector_status.get('ready') is True and vector_status.get('fonts_ready') is True
    raster_count = len(raster_maps)
    return {
        'schema_version': 1,
        'kind': 'OFFLINE_NAVIGATION_PREFLIGHT',
        'observed_at_utc': moment.astimezone(timezone.utc).isoformat(timespec='seconds'),
        'routing_service_reachable': road_service,
        'routing_service_detail': str(route_status.get('detail') or 'Not reported')[:180],
        'local_vector_basemap_ready': visual_vector,
        'local_vector_basemap_bounds': vector_status.get('bounds') if visual_vector else None,
        'local_raster_package_count': raster_count,
        'any_local_visual_map_available': visual_vector or raster_count > 0,
        'gps_fix_checked': False,
        'route_coverage_verified': False,
        'navigation_started': False,
        'external_requests': False,
        'read_only': True,
        'explanation': 'Offline map visuals and local Valhalla routing require separate datasets. A reachable routing server does not verify that road tiles cover the chosen origin/destination; only an actual route request can verify a drivable route. GPS fix is checked only with navigation consent.',
    }


def _route_samples(points: object) -> list[tuple[float, float]]:
    """Require a small, deliberately sampled route; do not persist GPS tracks."""
    if not isinstance(points, list) or not 2 <= len(points) <= 25:
        raise ValueError('Route coverage requires 2–25 sampled longitude/latitude points')
    checked = []
    for point in points:
        if (not isinstance(point, list) or len(point) != 2 or
                any(type(v) not in (int, float) or not math.isfinite(v) for v in point)):
            raise ValueError('Route samples must be finite [longitude, latitude] pairs')
        lon, lat = point
        if not -180 <= lon <= 180 or not -85 <= lat <= 85:
            raise ValueError('Route sample outside supported map coordinates')
        checked.append((float(lon), float(lat)))
    return checked


def _xyz(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    size = 1 << zoom
    x = min(size - 1, max(0, int((lon + 180) / 360 * size)))
    northing = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    y = min(size - 1, max(0, int((1 - northing / math.pi) / 2 * size)))
    return x, y


def route_coverage_report(*, points: object, route_status: dict, vector_status: dict,
                          raster_maps: list[dict], vector_probe, raster_probe) -> dict:
    """Probe installed map tile samples locally; no network, map import or GPS calls.

    Positive tile samples are *not* proof of unbroken route-wide tile coverage,
    a usable walking path, a correct GPS fix, or a connected rescue service.
    """
    samples = _route_samples(points)
    vector_ready = vector_status.get('ready') is True and vector_status.get('fonts_ready') is True
    vector_zoom = min(int(vector_status.get('maxzoom', 12)),
                      max(int(vector_status.get('minzoom', 0)), 12))
    vector_count = 0
    if vector_ready:
        for lon, lat in samples:
            x, y = _xyz(lon, lat, vector_zoom)
            try:
                if vector_probe(vector_zoom, x, y) is not None:
                    vector_count += 1
            except (OSError, ValueError, LookupError, sqlite3.Error):
                pass
    raster = []
    for entry in raster_maps:
        try:
            low, high = int(entry['minzoom']), int(entry['maxzoom'])
            if not 0 <= low <= high <= 22:
                continue
            zoom = min(high, max(low, 12))
            count = 0
            for lon, lat in samples:
                x, y = _xyz(lon, lat, zoom)
                try:
                    if raster_probe(entry['id'], zoom, x, y) is not None:
                        count += 1
                except (OSError, ValueError, LookupError, sqlite3.Error):
                    pass
            raster.append({'map_id': entry['id'], 'name': entry['name'],
                           'zoom_tested': zoom, 'sampled_tiles_present': count,
                           'sample_count': len(samples)})
        except (TypeError, KeyError, ValueError):
            continue
    best = max([vector_count] + [r['sampled_tiles_present'] for r in raster])
    return {
        'kind': 'OFFLINE_ROUTE_TILE_SAMPLES', 'schema_version': 1,
        'observed_at_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'sample_count': len(samples), 'vector_basemap': {
            'ready': vector_ready, 'zoom_tested': vector_zoom if vector_ready else None,
            'sampled_tiles_present': vector_count}, 'raster_basemaps': raster,
        'best_single_basemap_sampled_tiles_present': best,
        'some_basemap_has_all_sampled_tiles': best == len(samples),
        'routing_service_reachable': route_status.get('reachable') is True,
        'road_graph_coverage_verified': False, 'continuous_tile_coverage_verified': False,
        'gps_fix_checked': False, 'read_only': True, 'external_requests': False,
        'explanation': 'Checks a few actual tiles in each installed offline basemap. A full sample count does not prove every tile between samples exists. Route planning, terrain, current GPS accuracy and public access must be checked separately.',
    }
