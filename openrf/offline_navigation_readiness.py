"""One-shot local trip preflight; keep visual tiles separate from road routing."""
from __future__ import annotations

from datetime import datetime, timezone


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
