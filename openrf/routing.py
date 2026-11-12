"""Explicit, receive-only local Valhalla route adapter; no external demo endpoints.

No live navigation, rerouting, radar or police-position detection happens here.
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
            if route and part[0] == route[-1]:
                route.extend(part[1:])
            else:
                route.extend(part)
            for maneuver in leg.get('maneuvers', []):
                instruction = maneuver.get('instruction')
                if isinstance(instruction, str):
                    directions.append({'leg': index + 1, 'instruction': instruction[:400],
                                       'length_miles': round(float(maneuver.get('length', 0)), 2)})
            if len(route) > 100_000:
                raise ValueError('Route too long')
    except (KeyError, ValueError, TypeError, OverflowError) as exc:
        if isinstance(exc, RouteError):
            raise
        raise RouteError('Local Valhalla responded with an unsupported route format.') from exc
    return {'type': 'ROAD_ROUTE', 'provider': 'local-valhalla', 'is_driving_route': True,
            'coordinates': route, 'origin': [requested[0]['lon'], requested[0]['lat']],
            'destination': [requested[-1]['lon'], requested[-1]['lat']],
            'stops': [[pt['lon'], pt['lat']] for pt in requested[1:-1]],
            'distance_miles': round(distance, 2), 'duration_seconds': round(duration),
            'maneuvers': directions[:250], 'warning': 'PLANNING ONLY — not live road guidance, traffic data, or a safety guarantee.'}


def local_route(locations: list, *, open_connection=None, port=None):
    points = coordinates(locations)
    if port is None:
        port = os.environ.get('OPENRF_VALHALLA_PORT', '8002')
    try:
        port = int(port)
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        raise RouteUnavailable('Invalid local Valhalla port. Use OPENRF_VALHALLA_PORT=8002.') from None
    payload = {'locations': points, 'costing': 'auto', 'units': 'miles', 'language': 'en-US'}
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
