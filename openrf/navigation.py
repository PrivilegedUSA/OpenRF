"""Local-only navigation destinations. Not a road-routing or tracking service."""
from __future__ import annotations

from .storage import _optional_float, _string


def normalize_destination(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError('Destination must be a JSON object')
    if set(data) - {'name', 'latitude', 'longitude'}:
        raise ValueError('Unexpected destination fields')
    lat = _optional_float(data.get('latitude'), 'latitude', -90, 90)
    lon = _optional_float(data.get('longitude'), 'longitude', -180, 180)
    if lat is None or lon is None:
        raise ValueError('Destination requires both latitude and longitude')
    return {
        'name': _string(data.get('name'), 'name', 120, required=True),
        'latitude': lat, 'longitude': lon,
    }
