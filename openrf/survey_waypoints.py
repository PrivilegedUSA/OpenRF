"""User-triggered browser geolocation waypoints for private, evidence-limited surveys.

These are *reported observer locations*, not validated GNSS fixes, movement
tracks, RF observations, or transmitter locations.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone


def normalize_waypoint(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError('Waypoint must be an object')
    if set(data) != {'session_id', 'latitude', 'longitude', 'accuracy_m', 'fix_age_seconds', 'fix_reported_at_utc', 'note'}:
        raise ValueError('Waypoint needs exactly the browser fix, active session and optional note; sensor measurements are not accepted')
    session = data['session_id']
    if type(session) is not int or session < 1:
        raise ValueError('An active investigation is required')
    values = {}
    for key, minimum, maximum in (
        ('latitude', -90, 90), ('longitude', -180, 180),
        ('accuracy_m', 0, 1_000_000), ('fix_age_seconds', 0, 60),
    ):
        value = data[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(f'Invalid {key}; a fresh geolocation fix is required')
        values[key] = float(value)
    note = data['note']
    if not isinstance(note, str) or len(note) > 500:
        raise ValueError('Waypoint note must be no more than 500 characters')
    timestamp = data['fix_reported_at_utc']
    if not isinstance(timestamp, str) or len(timestamp) > 50:
        raise ValueError('A timezone-aware browser fix time is required')
    try:
        parsed = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError('Invalid browser fix timestamp') from exc
    if parsed.tzinfo is None:
        raise ValueError('Browser fix timestamp requires a UTC offset')
    now = datetime.now(timezone.utc)
    server_age = (now - parsed.astimezone(timezone.utc)).total_seconds()
    if not -5 <= server_age <= 90:
        raise ValueError('Browser fix is stale or has an inconsistent timestamp; request a new location')
    return {'session_id': session, **values,
            'fix_reported_at_utc': parsed.astimezone(timezone.utc).isoformat(timespec='milliseconds'),
            'note': note.strip(), 'location_source': 'BROWSER_REPORTED',
            'source_device': 'Browser Geolocation API'}


def waypoints_geojson(waypoints: list[dict], session_id: int) -> dict:
    """Export only explicitly requested session waypoints; no inferred route lines."""
    features = []
    for w in reversed(waypoints):
        features.append({'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [w['longitude'], w['latitude']]},
            'properties': {key: w[key] for key in
                           ('id', 'session_id', 'note', 'recorded_at_utc', 'fix_reported_at_utc',
                            'fix_age_seconds', 'accuracy_m', 'location_source', 'source_device')}})
        features[-1]['properties']['coordinate_meaning'] = 'observer_waypoint_not_transmitter_location'
    return {'type': 'FeatureCollection', 'properties': {'session_id': session_id,
             'origin': 'MANUAL_USER_TRIGGERED_BROWSER_GEOLOCATION',
             'warning': 'These are separate observer fixes, not a measured travel route or verified GNSS track'},
            'features': features}
