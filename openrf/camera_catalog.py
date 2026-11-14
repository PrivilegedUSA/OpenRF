"""Private, offline-first catalog of *reported* fixed camera infrastructure.

ALPR map imports are explicitly requested by the operator. Network requests
never include the user's GPS position, and imported OSM data isn't "verified".
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
import sqlite3
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone

TYPES = {'ALPR', 'RED_LIGHT', 'SPEED'}
STATES = {'REPORTED', 'COMMUNITY_MAPPED', 'VERIFIED', 'REMOVED'}
# Query OSM's public Overpass API for only the operator-selected viewport.
# DeFlock/FlockHopper also use OpenStreetMap surveillance tags; these are NOT
# independent/verified Flock records. No nationwide snapshot is downloaded.
FEED_URL = 'https://overpass-api.de/api/interpreter'
OVERPASS_ENDPOINTS = (FEED_URL, 'https://overpass.private.coffee/api/interpreter')
ATTRIBUTION = '© OpenStreetMap contributors (ODbL); opt-in area query via Overpass API (DeFlock-compatible OSM tagging)'
MAX_RESPONSE = 12 * 1024 * 1024
MAX_ELEMENTS = 20000


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def init(connection):
    connection.executescript('''
    CREATE TABLE IF NOT EXISTS camera_sites (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('ALPR','RED_LIGHT','SPEED')),
      state TEXT NOT NULL CHECK (state IN ('REPORTED','COMMUNITY_MAPPED','VERIFIED','REMOVED')),
      label TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      direction TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      source_id TEXT UNIQUE,
      updated_utc TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS camera_sites_bounds ON camera_sites(latitude, longitude);
    ''')


def bbox_value(value, *, narrow=False):
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError('Provide visible area as [west, south, east, north].')
    try:
        west, south, east, north = (float(v) for v in value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Invalid map bounds') from exc
    if not all(map(math.isfinite, (west, south, east, north))) or not (
        -180 <= west < east <= 180 and -90 <= south < north <= 90
    ):
        raise ValueError('Map bounds must be valid and may not cross the date line.')
    if narrow and (east-west > 8 or north-south > 8):
        raise ValueError('Zoom into an area no larger than 8° × 8° before importing ALPR map data.')
    return west, south, east, north


def _text(value, label, size, required=False):
    if value is None: value = ''
    if not isinstance(value, str): raise ValueError(f'{label} must be text')
    value = value.strip()
    if len(value) > size or (required and not value):
        raise ValueError(f'{label} must contain {"1–" if required else "0–"}{size} characters')
    return value


def add_manual(repo, record):
    if not isinstance(record, dict) or set(record) - {
        'type','state','label','latitude','longitude','direction','notes','source','source_url'
    }:
        raise ValueError('Unsupported camera fields')
    kind = _text(record.get('type'), 'type', 16, True).upper()
    state = _text(record.get('state', 'REPORTED'), 'state', 24, True).upper()
    if kind not in TYPES or state not in {'REPORTED','VERIFIED','REMOVED'}:
        raise ValueError('Unsupported camera type or verification state')
    if any(isinstance(record.get(k),bool) for k in ('latitude','longitude')):
        raise ValueError('Camera coordinates must be numbers')
    try: lat,lon=(float(record[k]) for k in ('latitude','longitude'))
    except (KeyError,ValueError,TypeError) as exc:
        raise ValueError('Camera coordinates are required') from exc
    if not (math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180):
        raise ValueError('Camera coordinates outside valid latitude/longitude bounds')
    source = _text(record.get('source'), 'source', 140, True)
    url = _text(record.get('source_url'), 'source_url', 500)
    if url and not url.startswith(('https://','http://')):
        raise ValueError('Source URL must use https:// or http://')
    if state == 'VERIFIED' and not url:
        raise ValueError('Verified requires a linked documentary source; otherwise use Reported.')
    with repo._lock, repo._connect() as db:
        cur = db.execute('''INSERT INTO camera_sites
        (type,state,label,latitude,longitude,direction,notes,source,source_url,updated_utc)
        VALUES(?,?,?,?,?,?,?,?,?,?)''', (kind,state,_text(record.get('label'),'label',160,True),
          lat,lon,_text(record.get('direction'),'direction',80),_text(record.get('notes'),'notes',1000),
          source,url,utc_now()))
        return {'id':cur.lastrowid,'type':kind,'state':state}


def list_sites(repo, bounds, limit=1000):
    west,south,east,north=bbox_value(bounds)
    if type(limit) is not int or limit<1 or limit>1500: raise ValueError('Invalid result limit')
    with repo._lock, repo._connect() as db:
        rows=db.execute('''SELECT id,type,state,label,latitude,longitude,direction,notes,
            source,source_url,updated_utc FROM camera_sites
            WHERE longitude>=? AND longitude<=? AND latitude>=? AND latitude<=?
            AND state!='REMOVED' ORDER BY id DESC LIMIT ?''', (west,east,south,north,limit+1)).fetchall()
    return {'sites':[dict(row) for row in rows[:limit]], 'truncated':len(rows)>limit,
            'attribution':ATTRIBUTION, 'camera_positions':'reported infrastructure; not RF detections or proof of operation'}


def remove(repo, ident):
    if type(ident) is not int or ident < 1: raise ValueError('Invalid camera ID')
    with repo._lock, repo._connect() as db:
        cur=db.execute('DELETE FROM camera_sites WHERE id=?', (ident,))
        return bool(cur.rowcount)


def _overpass_query(bounds):
    # Validated and normalized; never inject user-controlled query fragments.
    west, south, east, north = bbox_value(bounds, narrow=True)
    box = f'{south:.6f},{west:.6f},{north:.6f},{east:.6f}'
    # Same OSM tags read by the FlockHopper ingestion pipeline. Ways are
    # represented by Overpass-calculated centers, NOT exact lens positions.
    return (f'[out:json][timeout:25];('
            f'node["man_made"="surveillance"]["surveillance:type"="ALPR"]({box});'
            f'way["man_made"="surveillance"]["surveillance:type"="ALPR"]({box});'
            f');out center tags;')


def _parse_overpass(document):
    if not isinstance(document, dict) or not isinstance(document.get('elements'), list):
        raise ValueError('Overpass did not return a valid OSM elements list.')
    if document.get('remark'):
        raise ValueError('Overpass reported a timeout or incomplete data; zoom in and retry.')
    elements = document['elements']
    if len(elements) > MAX_ELEMENTS:
        raise ValueError('Too many OSM camera records in view; zoom in and retry.')
    features = []
    for element in elements:
        if not isinstance(element, dict) or element.get('type') not in ('node', 'way'):
            continue
        kind = element['type']
        coordinates = element if kind == 'node' else element.get('center')
        if not isinstance(coordinates, dict):
            continue
        tags = element.get('tags')
        if not isinstance(tags, dict):
            continue
        if tags.get('man_made') != 'surveillance' or str(tags.get('surveillance:type', '')).upper() != 'ALPR':
            continue
        try:
            lon = float(coordinates['lon'])
            lat = float(coordinates['lat'])
        except (KeyError, ValueError, TypeError):
            continue
        if not (math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90):
            continue
        osm_id = element.get('id')
        if type(osm_id) is not int or osm_id < 1:
            continue
        features.append({'type': 'Feature', 'id': f'{kind}/{osm_id}',
                         'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
                         'properties': {
                             'brand': tags.get('brand') or tags.get('manufacturer') or '',
                             'direction': tags.get('camera:direction') or tags.get('direction') or ''}})
    return {'type': 'FeatureCollection', 'features': features}


def _read_osm_area(bounds):
    query = _overpass_query(bounds)
    payload = urllib.parse.urlencode({'data': query}).encode('utf-8')
    errors = []
    for endpoint in OVERPASS_ENDPOINTS:
        request = urllib.request.Request(endpoint, data=payload, headers={
            'User-Agent': 'OpenRF/0.2.55 (offline-first; user-initiated OSM area lookup)',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=20) as reply:
                raw = reply.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise ValueError('OSM area response is too large; zoom in and retry.')
            if raw[:2] == b'\x1f\x8b':
                with gzip.GzipFile(fileobj=io.BytesIO(raw)) as archive:
                    raw = archive.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise ValueError('OSM area response expands past the safety limit; zoom in.')
            return _parse_overpass(json.loads(raw))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError,
                json.JSONDecodeError, UnicodeError) as exc:
            errors.append(f'{endpoint.split("/")[2]}: {type(exc).__name__}')
    raise ValueError('Area query failed at both OSM servers (' + ', '.join(errors) +
                     '). Try again when online or zoom into a smaller area; saved camera pins remain offline.')


def import_feed(repo, bounds, fetch=None):
    west,south,east,north=bbox_value(bounds,narrow=True)
    document=fetch() if fetch is not None else _read_osm_area(bounds)
    if not isinstance(document,dict) or document.get('type')!='FeatureCollection' or not isinstance(document.get('features'),list):
        raise ValueError('Published feed did not contain GeoJSON features.')
    rows=[]
    for feature in document['features']:
        if not isinstance(feature,dict):continue
        geom=feature.get('geometry') or {}
        if geom.get('type')!='Point':continue
        pos=geom.get('coordinates')
        if not isinstance(pos,list) or len(pos)<2:continue
        try: lon,lat=float(pos[0]),float(pos[1])
        except (TypeError,ValueError):continue
        if not (math.isfinite(lon) and math.isfinite(lat) and west<=lon<=east and south<=lat<=north):continue
        prop=feature.get('properties') or {}
        if not isinstance(prop,dict):prop={}
        ext=prop.get('osmId') or prop.get('osm_id') or feature.get('id')
        # Use stable geometry signature if the published feed has no OSM id.
        source_id='flockhopper-osm:'+str(ext) if ext is not None else 'flockhopper-point:'+hashlib.sha256(f'{lat:.6f}/{lon:.6f}'.encode()).hexdigest()[:24]
        brand=str(prop.get('brand') or prop.get('manufacturer') or '').strip()[:70]
        label=(f'Community-mapped {brand} ALPR' if brand else 'Community-mapped ALPR')[:160]
        direction=str(prop.get('direction') or '').strip()[:80]
        rows.append(('ALPR','COMMUNITY_MAPPED',label,lat,lon,direction,'',
                     'OpenStreetMap community surveillance mapping (Overpass/DeFlock compatible)',
                     ('https://www.openstreetmap.org/'+str(ext) if isinstance(ext,str) and ext.startswith(('node/','way/')) and ext.split('/',1)[1].isdigit() else 'https://www.openstreetmap.org/'),source_id,utc_now()))
        if len(rows)>=20000:break  # single-area ingest safety cap
    with repo._lock, repo._connect() as db:
        db.executemany('''INSERT INTO camera_sites
        (type,state,label,latitude,longitude,direction,notes,source,source_url,source_id,updated_utc)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source_id) DO UPDATE SET
          latitude=excluded.latitude,longitude=excluded.longitude,direction=excluded.direction,
          label=excluded.label,updated_utc=excluded.updated_utc
        WHERE camera_sites.state='COMMUNITY_MAPPED' ''',rows)
    return {'matched':len(rows),'source':FEED_URL,'state':'COMMUNITY_MAPPED',
            'note':'Community-mapped OSM coordinates, not independently verified; may be outdated.',
            'attribution':ATTRIBUTION}
