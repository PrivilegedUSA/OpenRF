"""Opt-in geocoding: loopback Photon or configured MapTiler API key.

No external requests are made by default. Public Nominatim is intentionally
excluded: its usage policy forbids client-side autocomplete.
"""
from __future__ import annotations

import json
import math
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


class GeocoderUnavailable(ValueError):
    pass


class GeocoderError(ValueError):
    pass


def provider():
    if os.environ.get('OPENRF_PHOTON_PORT'):
        return 'local-photon'
    if os.environ.get('OPENRF_MAPTILER_KEY'):
        return 'maptiler-opt-in'
    return None


def search(query: str, *, open_connection=None):
    if not isinstance(query, str):
        raise GeocoderError('Search text must be a string.')
    query = query.strip()
    if not 3 <= len(query) <= 120 or any(ord(c) < 32 for c in query):
        raise GeocoderError('Enter at least 3 characters, up to 120 characters.')
    active = provider()
    if active is None:
        raise GeocoderUnavailable('Address suggestions are not configured. Set up local Photon or opt in to MapTiler; saved places and coordinates still work.')
    if active == 'local-photon':
        try:
            port = int(os.environ['OPENRF_PHOTON_PORT'])
            if not 1 <= port <= 65535:
                raise ValueError()
        except ValueError:
            raise GeocoderError('Invalid OPENRF_PHOTON_PORT value.') from None
        url = f'http://127.0.0.1:{port}/api?' + urlencode({'q': query, 'limit': 5, 'lang': 'en'})
    else:
        key = os.environ['OPENRF_MAPTILER_KEY']
        url = f'https://api.maptiler.com/geocoding/{quote(query, safe="")}.json?' + urlencode({'key': key, 'limit': 5, 'language': 'en', 'autocomplete': 'true'})
    opener = open_connection or urlopen
    req = Request(url, headers={'User-Agent': 'OpenRF/0.2.25 (local private geocoding client)', 'Accept': 'application/json'})
    try:
        with opener(req, timeout=5) as response:
            raw = response.read(500_001)
            if len(raw) > 500_000:
                raise GeocoderError('Geocoder response too large.')
            data = json.loads(raw)
    except HTTPError as exc:
        raise GeocoderError(f'Address search failed (HTTP {exc.code}). Check the configured provider and quota.') from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise GeocoderUnavailable(f'{active} address search is unavailable. Check its local service or network access.') from exc
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise GeocoderError('Geocoder returned malformed JSON.') from exc
    result = []
    for f in (data.get('features') or [])[:10]:
        try:
            lon, lat = f['geometry']['coordinates'][:2]
            lon, lat = float(lon), float(lat)
            if not math.isfinite(lat) or not math.isfinite(lon) or abs(lat) > 90 or abs(lon) > 180:
                continue
            props = f.get('properties') or {}
            name = props.get('place_name') or props.get('name') or ''
            if active == 'local-photon':
                name = ', '.join(str(props[x]) for x in ('name', 'street', 'housenumber', 'city', 'state', 'country')
                                 if props.get(x) and str(props[x]) not in str(name).split(', ')) or str(name)
            if not isinstance(name, str) or not name.strip():
                continue
            result.append({'name': name[:200], 'latitude': lat, 'longitude': lon, 'source': active})
            if len(result) >= 5:
                break
        except (KeyError, ValueError, TypeError, IndexError):
            continue
    return {'results': result, 'provider': active, 'external_query': active == 'maptiler-opt-in',
            'attribution': data.get('attribution') if active == 'maptiler-opt-in' else '© OpenStreetMap contributors / Photon'}
