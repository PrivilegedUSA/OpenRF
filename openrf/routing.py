"""Explicit, receive-only local Valhalla route adapter; no external demo endpoints.

All route requests remain on loopback; GPS follow and rerouting decisions occur in the browser.
"""
from __future__ import annotations

import json
import math
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class RouteUnavailable(ValueError):
    pass


class RouteError(ValueError):
    pass


def coordinates(values):
    if not isinstance(values, list) or not 2 <= len(values) <= 12:
        raise RouteError('Enter a starting point, destination and no more than ten intermediate stops.')
    result = []
    for pos in values:
        if not isinstance(pos, dict) or set(pos) - {'latitude', 'longitude'}:
            raise RouteError('Every route location must contain latitude and longitude.')
        a, b = pos.get('latitude'), pos.get('longitude')
        if isinstance(a, bool) or isinstance(b, bool):
            raise RouteError('Invalid route coordinate.')
        try:
            lat, lon = float(a), float(b)
        except (ValueError, TypeError):
            raise RouteError('Invalid route coordinate.') from None
        if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
            raise RouteError('Route coordinates are outside the valid range.')
        result.append({'lat': lat, 'lon': lon})
    return result


def decode_polyline6(value: str):
    """Decode Valhalla lat/lon delta encoding into GeoJSON [lon, lat]."""
    if not isinstance(value, str) or len(value) > 1_000_000:
        raise RouteError('Valhalla returned invalid route geometry.')
    idx, latitude, longitude, result = 0, 0, 0, []
    while idx < len(value):
        deltas = []
        for _ in range(2):
            shift = 0
            number = 0
            while True:
                if idx >= len(value) or shift > 35:
                    raise RouteError('Valhalla returned malformed route geometry.')
                b = ord(value[idx]) - 63
                idx += 1
                if b < 0 or b > 63:
                    raise RouteError('Valhalla returned malformed route geometry.')
                number |= (b & 0x1f) << shift
                shift += 5
                if b < 32:
                    break
            deltas.append((number >> 1) ^ -(number & 1))
        latitude += deltas[0]
        longitude += deltas[1]
        lat, lon = latitude / 1e6, longitude / 1e6
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise RouteError('Valhalla returned out-of-range geometry.')
        result.append([lon, lat])
        if len(result) > 100_000:
            raise RouteError('Valhalla route geometry is too large.')
    if len(result) < 2:
        raise RouteError('Valhalla returned no road geometry.')
    return result


def _optional_verbal(value):
    """Valhalla-provided spoken guidance only; never synthesize missing directions."""
    if not isinstance(value, str):
        return None
    cleaned = ' '.join(value.split())
    return cleaned[:300] if cleaned else None


def _optional_lanes(value):
    """Ignore malformed or absent OSM turn-lane metadata, rather than guessing."""
    if not isinstance(value, list) or not 1 <= len(value) <= 12:
        return []
    result = []
    for lane in value:
        if not isinstance(lane, dict):
            return []
        directions = lane.get('directions')
        if type(directions) is not int or not 0 <= directions <= 2047:
            return []
        entry = {'directions': directions}
        for key in ('valid', 'active'):
            val = lane.get(key)
            if type(val) is int and 0 <= val <= 2047 and (val & ~directions) == 0:
                entry[key] = val
        result.append(entry)
    return result


def normalize_result(data: dict, requested: list):
    try:
        trip = data['trip']
        legs = trip['legs']
        if not isinstance(legs, list) or not legs or len(legs) > 11:
            raise ValueError('Invalid leg count')
        summary = trip['summary']
        distance = float(summary['length'])
        duration = float(summary['time'])
        if not all(math.isfinite(x) and x >= 0 for x in (distance, duration)):
            raise ValueError('Invalid summary')
        route = []
        directions = []
        for index, leg in enumerate(legs):
            part = decode_polyline6(leg['shape'])
            offset = len(route) - (1 if route and part[0] == route[-1] else 0)
            if route and part[0] == route[-1]:
                route.extend(part[1:])
            else:
                route.extend(part)
            for maneuver in leg.get('maneuvers', []):
                instruction = maneuver.get('instruction')
                if isinstance(instruction, str):
                    shape_index = maneuver.get('begin_shape_index', 0)
                    if isinstance(shape_index, bool) or not isinstance(shape_index, int) or shape_index < 0 or shape_index >= len(part):
                        raise ValueError('Invalid maneuver index')
                    entry = {'leg': index + 1, 'instruction': instruction[:400],
                             'length_miles': round(float(maneuver.get('length', 0)), 2),
                             'shape_index': offset + shape_index}
                    for name in ('verbal_transition_alert_instruction',
                                 'verbal_pre_transition_instruction',
                                 'verbal_post_transition_instruction'):
                        spoken = _optional_verbal(maneuver.get(name))
                        if spoken:
                            entry[name] = spoken
                    lanes = _optional_lanes(maneuver.get('lanes'))
                    if lanes:
                        entry['lanes'] = lanes
                    directions.append(entry)
            if len(route) > 100_000:
                raise ValueError('Route too long')
    except (KeyError, ValueError, TypeError, OverflowError) as exc:
        if isinstance(exc, RouteError):
            raise
        raise RouteError('Local Valhalla responded with an unsupported route format.') from exc
    return {'type': 'ROAD_ROUTE', 'provider': 'local-valhalla', 'is_driving_route': True,
            'live_traffic': False, 'traffic_status': 'NOT_CONFIGURED',
            'coordinates': route, 'origin': [requested[0]['lon'], requested[0]['lat']],
            'destination': [requested[-1]['lon'], requested[-1]['lat']],
            'stops': [[pt['lon'], pt['lat']] for pt in requested[1:-1]],
            'distance_miles': round(distance, 2), 'duration_seconds': round(duration),
            'maneuvers': directions[:250], 'warning': 'PLANNING ONLY — not live road guidance, traffic data, or a safety guarantee.'}


def route_preferences(value):
    """Strictly bounded route modifiers; no remote services or arbitrary URLs."""
    if value is None:
        return {'avoid_highways': False, 'avoid_tolls': False, 'exclude_locations': []}
    if not isinstance(value, dict) or set(value) - {'avoid_highways', 'avoid_tolls', 'exclude_locations'}:
        raise RouteError('Unsupported routing preference setting.')
    highways = value.get('avoid_highways', False)
    tolls = value.get('avoid_tolls', False)
    if type(highways) is not bool or type(tolls) is not bool:
        raise RouteError('Routing avoidance switches must be true or false.')
    locations = value.get('exclude_locations', [])
    if not isinstance(locations, list) or len(locations) > 8:
        raise RouteError('Choose up to eight mapped road avoidance points.')
    result = []
    for point in locations:
        if not isinstance(point, dict) or set(point) != {'latitude','longitude'}:
            raise RouteError('Road avoidance needs a valid mapped coordinate.')
        result.append(coordinates([point,point])[0])
    return {'avoid_highways':highways,'avoid_tolls':tolls,'exclude_locations':result}


def local_route(locations: list, *, open_connection=None, port=None, exclude_locations=None, options=None):
    points = coordinates(locations)
    prefs = route_preferences(options)
    exclusions = list(prefs['exclude_locations'])
    if exclude_locations is not None:
        if not isinstance(exclude_locations,list) or len(exclude_locations)>8:
            raise RouteError('Up to eight camera-aware exclusion points are permitted.')
        extra = [coordinates([point,point])[0] for point in exclude_locations]
        if len(exclusions) + len(extra) > 8:
            raise RouteError('Too many combined road/camera exclusions. Reduce selected points.')
        exclusions.extend(extra)

    if port is None:
        port = os.environ.get('OPENRF_VALHALLA_PORT', '8002')
    try:
        port = int(port)
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        raise RouteUnavailable('Invalid local Valhalla port. Use OPENRF_VALHALLA_PORT=8002.') from None
    payload = {'locations': points, 'costing': 'auto', 'units': 'miles',
               'language': 'en-US', 'turn_lanes': True}
    if exclusions: payload['exclude_locations'] = exclusions
    if prefs['avoid_highways'] or prefs['avoid_tolls']:
        payload['costing_options'] = {'auto': {}}
        if prefs['avoid_highways']: payload['costing_options']['auto']['use_highways'] = 0
        if prefs['avoid_tolls']: payload['costing_options']['auto']['use_tolls'] = 0
    # Hardcoded loopback: do not turn this endpoint into a general URL fetcher.
    req = Request(f'http://127.0.0.1:{port}/route', json.dumps(payload).encode(),
                  {'Content-Type': 'application/json', 'Accept': 'application/json'}, method='POST')
    opener = open_connection or urlopen
    try:
        with opener(req, timeout=7) as response:
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                raise RouteError('Routing response exceeded the size limit.')
            data = json.loads(body)
    except HTTPError as exc:
        raise RouteError(f'Local Valhalla could not find a drivable route (HTTP {exc.code}). Check regional road tiles and endpoints.') from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise RouteUnavailable('Local Valhalla is unavailable on 127.0.0.1. Start Valhalla with regional road tiles, or use a direct-line preview.') from exc
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise RouteError('Local Valhalla returned an invalid JSON response.') from exc
    return normalize_result(data, points)


def local_status(*, open_connection=None, port=None):
    """Probe only the loopback Valhalla HTTP service. Reachable != tile coverage."""
    if port is None:
        port = os.environ.get('OPENRF_VALHALLA_PORT', '8002')
    try:
        port = int(port)
        if not 1 <= port <= 65535:
            raise ValueError()
    except (TypeError, ValueError):
        return {'reachable': False, 'detail': 'Invalid local Valhalla port setting.'}
    req = Request(f'http://127.0.0.1:{port}/status', headers={'Accept': 'application/json'})
    try:
        with (open_connection or urlopen)(req, timeout=2) as reply:
            if reply.status != 200:
                return {'reachable': False, 'detail': 'Local Valhalla HTTP service is not ready.'}
            reply.read(4096)
    except (HTTPError, URLError, TimeoutError, OSError):
        return {'reachable': False, 'detail': 'No local Valhalla service responding. See docs/LOCAL_VALHALLA_WSL.md.'}
    return {'reachable': True, 'detail': 'Local Valhalla responds. Road tile coverage is verified only by an actual route request.'}
