"""One-shot local trip preflight; keep visual tiles separate from road routing."""
from __future__ import annotations

from datetime import datetime, timezone


def readiness_report(*, route_status: dict, vector_status: dict,
                     raster_maps: list[dict], imported_trail_count: int = 0, now: datetime | None = None) -> dict:
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        raise ValueError('now must be timezone-aware')
    road_service = route_status.get('reachable') is True
    visual_vector = vector_status.get('ready') is True and vector_status.get('fonts_ready') is True
    raster_count = len(raster_maps)
    if type(imported_trail_count) is not int or imported_trail_count < 0:
        raise ValueError('imported_trail_count must be a nonnegative integer')
    return {
        'schema_version': 1,
        'kind': 'OFFLINE_NAVIGATION_PREFLIGHT',
        'observed_at_utc': moment.astimezone(timezone.utc).isoformat(timespec='seconds'),
        'routing_service_reachable': road_service,
        'routing_service_detail': str(route_status.get('detail') or 'Not reported')[:180],
        'local_vector_basemap_ready': visual_vector,
        'local_vector_basemap_bounds': vector_status.get('bounds') if visual_vector else None,
        'local_raster_package_count': raster_count,
        'imported_gpx_reference_count': imported_trail_count,
        'pedestrian_router_reachable': road_service,
        'pedestrian_graph_coverage_verified': False,
        'trail_access_or_closures_verified': False,
        'walking_follow_supported': False,
        'any_local_visual_map_available': visual_vector or raster_count > 0,
        'gps_fix_checked': False,
        'route_coverage_verified': False,
        'navigation_started': False,
        'external_requests': False,
        'read_only': True,
        'explanation': 'Offline map visuals, imported GPX references and Valhalla pedestrian routing are distinct. A reachable router does not verify pedestrian graph coverage; check a real walking route between the intended endpoints. Imported GPX is not a routable trail network and does not establish access, closures or safety. Walking GPS-follow is not implemented; no GPS fix is requested by this check.',
    }
