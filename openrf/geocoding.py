"""Address search via local Photon or explicitly opted-in HTTPS provider.

Public Photon demo requests happen only after per-page consent. No remote
requests occur by default. Public Nominatim is never used for autocomplete.
"""
from __future__ import annotations

import json
import math
import os
import re
import tempfile
from pathlib import Path
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


def _config_file():
    """Local-only configuration, kept outside the updated Git/source tree."""
    home = os.environ.get('OPENRF_CONFIG_HOME')
    return (Path(home) if home else Path.home()/'.config'/'openrf') / 'geocoding.json'


def _stored_maptiler_key():
    path=_config_file()
    if path.is_symlink():
        return ''
    try:
        data=json.loads(path.read_text(encoding='utf-8'))
        key=data.get('maptiler_key') if isinstance(data,dict) else None
        return key if isinstance(key,str) and re.fullmatch(r'[A-Za-z0-9_.-]{8,256}',key) else ''
    except (OSError, ValueError, UnicodeError):
        return ''


def _maptiler_key():
    return os.environ.get('OPENRF_MAPTILER_KEY') or _stored_maptiler_key()


def configuration_status():
    env=bool(os.environ.get('OPENRF_MAPTILER_KEY'))
    key=bool(_maptiler_key())
    local=bool(os.environ.get('OPENRF_PHOTON_PORT'))
    return {
        'provider_when_enabled': provider(online_allowed=True),
        'provider':provider(online_allowed=False),
        'enabled':bool(provider(online_allowed=False)),
        'public_opt_in_available':True,
        'maptiler_configured':key,
        'credential_source':'environment' if env else ('private_file' if key else None),
        'local_photon':local,
        'external_consent_required':not local,
        'public_photon_guaranteed':False,
        'census_complete_street_address_only':True,
        'privacy':'External address requests require explicit opt-in. No browser GPS is sent to an address provider.'
    }


def save_maptiler_key(key):
    """Write only the credential, atomically, as a 0600 local file."""
    if not isinstance(key,str):
        raise GeocoderError('Expected a MapTiler API key string.')
    if key and not re.fullmatch(r'[A-Za-z0-9_.-]{8,256}',key):
        raise GeocoderError('MapTiler key must be 8–256 letters, numbers, dots, dashes or underscores.')
    path=_config_file()
    root=path.parent
    if path.is_symlink() or root.is_symlink():
        raise GeocoderError('Address provider configuration cannot be a symbolic link.')
    if not key:
        try: path.unlink(missing_ok=True)
        except OSError as exc: raise GeocoderError('Cannot remove private address provider configuration.') from exc
        return configuration_status()
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    if root.is_symlink():
        raise GeocoderError('Address provider configuration cannot be a symbolic link.')
    tmp=None
    try:
        fd,tmp=tempfile.mkstemp(prefix='.geocoding-',suffix='.tmp',dir=root)
        with os.fdopen(fd,'w',encoding='utf-8') as stream:
            os.fchmod(stream.fileno(),0o600)
            json.dump({'maptiler_key':key},stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp,path)
        tmp=None
    except OSError as exc:
        raise GeocoderError('Could not save the private address provider configuration.') from exc
    finally:
        if tmp:
            try: os.unlink(tmp)
            except OSError: pass
    return configuration_status()


def provider(online_allowed=False):
    if os.environ.get('OPENRF_PHOTON_PORT'):
        return 'local-photon'
    # A configured provider NEVER overrides the current page's consent toggle.
    if not online_allowed:
        return None
    if _maptiler_key():
        return 'maptiler-opt-in'
    return 'photon-public-opt-in'


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


def _full_us_street_address(query: str):
    # City-only queries and partial house numbers cannot be resolved by Census.
    # Its one-line endpoint requires a reasonably complete street address.
    return bool(re.match(r'^\d{1,8}[A-Za-z]?\s+\S+', query) and ',' in query and
                len(query.split(',')) >= 2)


def _census_search(query, opener):
    """One-shot U.S. Census street geocoder, not an autocomplete endpoint.

    Explicitly opted-in and only used for a complete street address at route
    submission. Coordinates are approximate TIGER address ranges.
    """
    url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' + urlencode({
        'address': query, 'benchmark': 'Public_AR_Current', 'format': 'json'})
    req = Request(url, headers={'User-Agent': 'OpenRF/0.2.28 (opt-in US street lookup)', 'Accept': 'application/json'})
    try:
        with opener(req, timeout=12) as response:
            raw = response.read(500_001)
            if len(raw) > 500_000:
                raise GeocoderError('U.S. Census response exceeded size limit.')
            data = json.loads(raw)
    except HTTPError as exc:
        raise GeocoderUnavailable(f'U.S. Census address service returned HTTP {exc.code}.') from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise GeocoderUnavailable('U.S. Census address service is unreachable from this Ubuntu session.') from exc
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise GeocoderError('U.S. Census returned malformed JSON.') from exc
    matches = (data.get('result') or {}).get('addressMatches') or []
    result=[]
    for match in matches[:8]:
        try:
            point=match['coordinates']
            lon,lat=float(point['x']),float(point['y'])
            name=str(match['matchedAddress']).strip()
            if not name or not math.isfinite(lat) or not math.isfinite(lon) or not (-90<=lat<=90 and -180<=lon<=180):
                continue
            # U.S. Census's public street-address geocoder covers U.S. TIGER ranges.
            result.append({'name':name[:200], 'latitude':lat, 'longitude':lon,
                           'source':'us-census-opt-in', 'category':'street_address',
                           'accuracy_note':'Approximate address-range geocode; verify pin on map.'})
        except (ValueError, TypeError, KeyError):
            continue
    return {'results':result, 'country_filter':'US', 'provider':'us-census-opt-in',
            'external_query':True,
            'attribution':'U.S. Census Bureau / TIGER address ranges',
            'accuracy_note':'Interpolated street address position, not verified building or entrance.'}


def search(query: str, *, open_connection=None, online_allowed=False, final=False):
    if not isinstance(query, str):
        raise GeocoderError('Search text must be a string.')
    query = query.strip()
    if not 3 <= len(query) <= 120 or any(ord(c) < 32 for c in query):
        raise GeocoderError('Enter at least 3 characters, up to 120 characters.')
    active = provider(online_allowed=online_allowed)
    # A complete typed street address may be submitted even if Photon is blocked.
    # Require explicit network consent; do not send partial typed strings to Census.
    if final and online_allowed and not os.environ.get('OPENRF_PHOTON_PORT') and \
       not _maptiler_key() and _full_us_street_address(query):
        census = _census_search(query, open_connection or urlopen)
        if census['results']:
            return census
        # No Census match: Photon may still index this specific address.
        # Never substitute an unverified location automatically.
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
        key = _maptiler_key()
        url = f'https://api.maptiler.com/geocoding/{quote(query, safe="")}.json?' + urlencode({'key': key, 'limit': 8, 'country': 'us', 'language': 'en', 'autocomplete': 'true'})
    opener = open_connection or urlopen
    req = Request(url, headers={'User-Agent': 'OpenRF/0.2.28 (opt-in US address search; personal project)', 'Accept': 'application/json'})
    try:
        with opener(req, timeout=9) as response:
            raw = response.read(500_001)
            if len(raw) > 500_000:
                raise GeocoderError('Geocoder response too large.')
            data = json.loads(raw)
    except HTTPError as exc:
        raise GeocoderUnavailable(f'{active} returned HTTP {exc.code}. Check service availability, API-key restrictions or quota in Address search setup.') from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise GeocoderUnavailable(f'{active} cannot reach its address service from Ubuntu (connection, TLS, DNS or proxy issue). Check internet access, or configure a MapTiler key under Address search setup.') from exc
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
            name = f.get('place_name') or props.get('place_name') or props.get('name') or ''
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
