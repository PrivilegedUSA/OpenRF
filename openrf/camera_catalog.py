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
from datetime import datetime, timezone

TYPES = {'ALPR', 'RED_LIGHT', 'SPEED'}
STATES = {'REPORTED', 'COMMUNITY_MAPPED', 'VERIFIED', 'REMOVED'}
# Public FlockHopper snapshot derived from OSM; not an official Flock feed.
FEED_URL = 'https://data.dontgetflocked.com/cameras.geojson.gz'
ATTRIBUTION = '© OpenStreetMap contributors (ODbL); ALPR snapshot distributed by FlockHopper / DeFlock community mapping'
MAX_COMPRESSED = 32 * 1024 * 1024
MAX_UNCOMPRESSED = 150 * 1024 * 1024


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


def _read_published_feed():
    # The URL is fixed in source; no arbitrary URL fetch/SSRF. User must opt in.
    request=urllib.request.Request(FEED_URL, headers={'User-Agent':'OpenRF/0.2.54 (+offline first; explicit import only)', 'Accept':'application/gzip,application/octet-stream'})
    with urllib.request.urlopen(request, timeout=25) as reply:
        compressed=reply.read(MAX_COMPRESSED+1)
    if len(compressed)>MAX_COMPRESSED:
        raise ValueError('ALPR feed is too large; import cancelled.')
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as archive:
            decoded=archive.read(MAX_UNCOMPRESSED+1)
    except (OSError, EOFError) as exc:
        raise ValueError('ALPR feed is not readable gzip data.') from exc
    if len(decoded)>MAX_UNCOMPRESSED:
        raise ValueError('ALPR feed expands beyond the safe local limit.')
    try:
        return json.loads(decoded)
    except (UnicodeDecodeError,json.JSONDecodeError) as exc:
        raise ValueError('ALPR feed is not valid GeoJSON.') from exc


def import_feed(repo, bounds, fetch=None):
    west,south,east,north=bbox_value(bounds,narrow=True)
    document=(fetch or _read_published_feed)()
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
                     'FlockHopper / DeFlock community map (OpenStreetMap)',
                     'https://deflock.org/',source_id,utc_now()))
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
            'note':'Community-mapped coordinates, not independently verified; may be outdated.',
            'attribution':ATTRIBUTION}
