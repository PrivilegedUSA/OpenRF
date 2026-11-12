"""Address search via local Photon or explicitly opted-in HTTPS provider.

Public Photon demo requests happen only after per-page consent. No remote
requests occur by default. Public Nominatim is never used for autocomplete.
"""
from __future__ import annotations

import json
import math
import os
from urllib.error import HTTPError, URLError
from collections import deque
import threading
import time
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


class GeocoderUnavailable(ValueError):
    pass


class GeocoderError(ValueError):
    pass


_public_lock = threading.Lock()
_public_times = deque()


def _public_allowed():
    # The public Photon endpoint is a fair-use demonstration service. Keep a
    # per-server-process budget; callers should additionally debounce queries.
    with _public_lock:
        now = time.monotonic()
        while _public_times and now - _public_times[0] > 600:
            _public_times.popleft()
        if (len(_public_times) >= 40 or
                (_public_times and now - _public_times[-1] < 1.3)):
            raise GeocoderUnavailable('Public Photon is temporarily rate-limited. Pause your typing and try again, or use local Photon.')
        _public_times.append(now)


def provider(online_allowed=False):
    if os.environ.get('OPENRF_PHOTON_PORT'):
        return 'local-photon'
    if os.environ.get('OPENRF_MAPTILER_KEY'):
        return 'maptiler-opt-in'
    return 'photon-public-opt-in' if online_allowed else None


def _photon_label(props):
    street = str(props.get('street') or '').strip()
    number = str(props.get('housenumber') or '').strip()
    name = str(props.get('name') or '').strip()
    first = ' '.join(x for x in (number, street) if x)
    if not first:
        first = name
    elif name and name.casefold() not in first.casefold():
        first = first + ' (' + name + ')'
    parts = [first]
    for key in ('city', 'county', 'state', 'postcode', 'country'):
        val = str(props.get(key) or '').strip()
        if val and val.casefold() not in {x.casefold() for x in parts}:
            # Keep county optional for rural addresses, avoiding duplicate municipality labels.
            if key == 'county' and props.get('city'):
                continue
            parts.append(val)
    return ', '.join(parts)


def _explicitly_foreign(props):
    code = str(props.get('countrycode') or props.get('country_code') or '').upper().strip()
    if code and code != 'US':
        return True
    country = str(props.get('country') or '').strip().casefold()
    if country and country not in ('united states', 'united states of america', 'usa', 'us'):
        return True
    return False


def search(query: str, *, open_connection=None, online_allowed=False):
    if not isinstance(query, str):
        raise GeocoderError('Search text must be a string.')
    query = query.strip()
    if not 3 <= len(query) <= 120 or any(ord(c) < 32 for c in query):
        raise GeocoderError('Enter at least 3 characters, up to 120 characters.')
    active = provider(online_allowed=online_allowed)
    if active is None:
        raise GeocoderUnavailable('Address lookup is off. Enable Online address suggestions on the Map, or configure local Photon or MapTiler. Saved places and coordinates still work.')
    if active == 'local-photon':
        try:
            port = int(os.environ['OPENRF_PHOTON_PORT'])
            if not 1 <= port <= 65535:
                raise ValueError()
        except ValueError:
            raise GeocoderError('Invalid OPENRF_PHOTON_PORT value.') from None
        url = f'http://127.0.0.1:{port}/api?' + urlencode({'q': query, 'countrycode': 'US', 'limit': 8, 'lang': 'en'})
    elif active == 'photon-public-opt-in':
        if len(query) < 4:
            raise GeocoderError('Enter at least 4 characters for online Photon address search.')
        if open_connection is None:
            _public_allowed()
        url = 'https://photon.komoot.io/api/?' + urlencode({'q': query, 'countrycode': 'US', 'limit': 8, 'lang': 'en'})
    else:
        key = os.environ['OPENRF_MAPTILER_KEY']
        url = f'https://api.maptiler.com/geocoding/{quote(query, safe="")}.json?' + urlencode({'key': key, 'limit': 8, 'country': 'us', 'language': 'en', 'autocomplete': 'true'})
    opener = open_connection or urlopen
    req = Request(url, headers={'User-Agent': 'OpenRF/0.2.27 (opt-in US address search; personal project)', 'Accept': 'application/json'})
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
            if _explicitly_foreign(props):
                continue
            name = props.get('place_name') or props.get('name') or ''
            if active in {'local-photon', 'photon-public-opt-in'}:
                name = _photon_label(props)
            if not isinstance(name, str) or not name.strip():
                continue
            result.append({'name': name[:200], 'latitude': lat, 'longitude': lon, 'source': active,
                           'category': 'street_address' if props.get('housenumber') else 'place_or_street'})
            if len(result) >= 8:
                break
        except (KeyError, ValueError, TypeError, IndexError):
            continue
    # Specific addresses come before city-name matches, but we never silently select one.
    if any(c.isdigit() for c in query):
        result.sort(key=lambda row: row['category'] != 'street_address')
    return {'results': result, 'country_filter': 'US', 'provider': active, 'external_query': active in ('maptiler-opt-in', 'photon-public-opt-in'),
            'attribution': data.get('attribution') if active == 'maptiler-opt-in' else '© OpenStreetMap contributors / Photon (komoot)'}
