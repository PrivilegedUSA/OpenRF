"""Opt-in browser observer-location association for completed RTL-SDR sweeps.

This is NOT GNSS-verified receiver position, emitter location, RF direction or
range. Each fix is requested once at sweep start; no tracking is performed.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math


FIX_KEYS = frozenset({'latitude', 'longitude', 'accuracy_m', 'fix_age_seconds', 'fix_reported_at_utc'})


def normalize_capture_fix(data: dict | None) -> dict | None:
    if data is None:
        return None
    if not isinstance(data, dict) or set(data) != FIX_KEYS:
        raise ValueError('Only a fresh browser fix with time, coordinates and accuracy is accepted')
    fields = {}
    for key, minimum, maximum in (
        ('latitude', -90, 90), ('longitude', -180, 180),
        ('accuracy_m', 0, 1_000_000), ('fix_age_seconds', 0, 60),
    ):
        value = data[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(f'Invalid browser {key}; location was not attached')
        fields[key] = float(value)
    text = data['fix_reported_at_utc']
    if not isinstance(text, str) or not 10 <= len(text) <= 50:
        raise ValueError('A timezone-aware browser fix timestamp is required')
    try:
        reported = datetime.fromisoformat(text.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError('Browser fix timestamp is invalid') from exc
    if reported.tzinfo is None:
        raise ValueError('Browser fix timestamp needs a timezone')
    now = datetime.now(timezone.utc)
    age = (now - reported.astimezone(timezone.utc)).total_seconds()
    if not -5 <= age <= 90:
        raise ValueError('Browser fix too old or device clock inconsistent; retry location')
    # A spoofed browser cannot be cryptographically verified; this guards
    # ordinary stale/cached fixes and obvious inconsistent clock metadata.
    if abs(age - fields['fix_age_seconds']) > 20:
        raise ValueError('Browser fix time and reported age disagree; retry location')
    return {**fields,
        'fix_reported_at_utc': reported.astimezone(timezone.utc).isoformat(timespec='milliseconds'),
        'attached_at_utc': now.isoformat(timespec='seconds'),
        'location_source': 'BROWSER_REPORTED',
        'position_meaning': 'operator_browser_position_at_sweep_start_not_transmitter_or_verified_receiver',
        'gnss_verified': False}


def capture_sites_geojson(sites: list[dict], session_id: int | None = None) -> dict:
    """One point per *completed* geotagged sweep; never a route or emitter fix."""
    features = []
    for capture in sites:
        fix = capture['observer_fix']
        features.append({'type': 'Feature', 'geometry': {
            'type': 'Point', 'coordinates': [fix['longitude'], fix['latitude']]},
            'properties': {
                'capture_id': capture['id'], 'session_id': capture.get('session_id'),
                'sweep_started_at_utc': capture['started_at_utc'],
                'sweep_finished_at_utc': capture['finished_at_utc'],
                'start_mhz': capture['settings']['start_mhz'],
                'stop_mhz': capture['settings']['stop_mhz'],
                'accuracy_m': fix['accuracy_m'], 'fix_age_seconds': fix['fix_age_seconds'],
                'fix_reported_at_utc': fix['fix_reported_at_utc'],
                'attached_at_utc': fix['attached_at_utc'],
                'location_source': fix['location_source'],
                'position_meaning': fix['position_meaning'],
                'gnss_verified': False,
                'measurement_provenance': 'RECORDED_RTL_POWER_UNCALIBRATED_D_B',
                'receiver_identity_verified': False}})
    return {'type': 'FeatureCollection', 'properties': {
        'session_id': session_id,
        'data_type': 'COMPLETED_SDR_SWEEPS_WITH_OPT_IN_BROWSER_OBSERVER_LOCATION',
        'not_live': True, 'no_inferred_transmitter_location': True,
        'warning': 'Precise operator browser coordinates, not verified RTL-SDR antenna positions. Never use as transmitter locations, direction, range or a route.'},
        'features': features}
