"""Private, offline-first catalog of *reported* fixed camera infrastructure.

Camera map imports are explicitly requested by the operator. Network requests
never include the user's GPS position, and imported OSM data isn't "verified".
"""
from __future__ import annotations

import gzip
import http.client
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
    from . import national_alpr, national_traffic
    national_alpr.init(connection)
    national_traffic.init(connection)
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
        raise ValueError('Zoom into an area no larger than 8° × 8° before importing camera map data.')
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


def list_sites(repo, bounds, limit=1000, types=None):
    west,south,east,north=bbox_value(bounds)
    if type(limit) is not int or limit<1 or limit>1500: raise ValueError('Invalid result limit')
    if types is None: types = sorted(TYPES)
    if not isinstance(types, (list, tuple)) or not types or any(t not in TYPES for t in types):
        raise ValueError('Invalid camera categories')
    types = sorted(set(types))
    placeholders = ','.join('?' for _ in types)
    with repo._lock, repo._connect() as db:
        rows=db.execute('''SELECT id,type,state,label,latitude,longitude,direction,notes,source_id,
            source,source_url,updated_utc FROM camera_sites
            WHERE longitude>=? AND longitude<=? AND latitude>=? AND latitude<=?
            AND state!='REMOVED' AND type IN (''' + placeholders + ''') ORDER BY id DESC LIMIT ?''', (west,east,south,north,*types,limit+1)).fetchall()
    # Manual/local reports stay independent of public nationwide snapshots.
    # Use indexed local bounding-box lookups and never send the entire nationwide
    # collection to the browser. Preserve local reports ahead of public records.
    from . import national_alpr, national_traffic
    saved=[dict(row) for row in rows[:limit]]
    seen={str(row['source_id']) for row in rows if 'source_id' in row.keys() and row['source_id']}
    remaining=max(0,limit-len(saved))
    traffic=[]
    traffic_types=[t for t in types if t!='ALPR']
    if traffic_types:
        with repo._lock, repo._connect() as db:
            traffic=national_traffic.sites_in_bounds(db,(west,south,east,north),traffic_types,remaining+1)
    traffic_truncated=len(traffic)>remaining
    saved+=traffic[:remaining]
    remaining=max(0,limit-len(saved))
    national=[]
    if 'ALPR' in types:
        with repo._lock, repo._connect() as db:
            national=national_alpr.sites_in_bounds(db,(west,south,east,north),remaining+len(seen)+1)
        national=[site for site in national if site['id'] not in seen]
    combined=saved+national[:remaining]
    return {'sites':combined, 'truncated':len(rows)>limit or traffic_truncated or len(national)>remaining,
            'attribution':ATTRIBUTION + '; ' + national_alpr.ATTRIBUTION + '; ' + national_traffic.ATTRIBUTION,
            'camera_positions':'reported infrastructure; not RF detections or proof of operation'}


def remove(repo, ident):
    if type(ident) is not int or ident < 1: raise ValueError('Invalid camera ID')
    with repo._lock, repo._connect() as db:
        cur=db.execute('DELETE FROM camera_sites WHERE id=?', (ident,))
        return bool(cur.rowcount)


def import_types(types=None):
    """Validate explicit categories; legacy clients may omit the selection."""
    if types is None:
        return sorted(TYPES)
    if not isinstance(types, (list, tuple)) or not types or any(not isinstance(t,str) or t not in TYPES for t in types):
        raise ValueError('Invalid camera import categories')
    return sorted(set(types))


def _overpass_query(bounds, types=None):
    west, south, east, north = bbox_value(bounds, narrow=True)
    types = import_types(types)
    box = f'{south:.6f},{west:.6f},{north:.6f},{east:.6f}'
    nodes, enforcement = [], []
    if 'ALPR' in types:
        nodes += [f'{kind}["man_made"="surveillance"]["surveillance:type"="ALPR"]({box});' for kind in ('node','way')]
    if 'SPEED' in types:
        nodes += [f'node["highway"="speed_camera"]({box});', f'node["enforcement"="maxspeed"]["surveillance:type"="camera"]({box});']
        enforcement += ['maxspeed']
    if 'RED_LIGHT' in types:
        nodes += [f'node["highway"="red_light_camera"]({box});', f'node["enforcement"="traffic_signals"]["surveillance:type"="camera"]({box});', f'node["man_made"="surveillance"]["surveillance"="red_light"]["surveillance:type"="camera"]({box});']
        enforcement += ['traffic_signals','red_light_camera']
    query = '[out:json][timeout:25];(' + ''.join(nodes) + ');out center qt;'
    if enforcement:
        tags = '|'.join(enforcement)
        query += (f'relation["type"="enforcement"]["enforcement"~"(^|;)[[:space:]]*({tags})[[:space:]]*(;|$)"]({box})'
                  '->.enforcement;.enforcement out body qt;node(r.enforcement:"device");out body qt;')
    return query


def _parse_overpass(document):
    if not isinstance(document, dict) or not isinstance(document.get('elements'), list):
        raise ValueError('Overpass did not return a valid OSM elements list.')
    if document.get('remark'):
        raise ValueError('Overpass reported a timeout or incomplete data; zoom in and retry.')
    elements = document['elements']
    if len(elements) > MAX_ELEMENTS:
        raise ValueError('Too many OSM camera records in view; zoom in and retry.')
    # Some responses also include standalone member nodes. Resolve only
    # explicitly tagged enforcement device references, not from/to positions.
    node_positions = {e['id']: e for e in elements if isinstance(e,dict)
                      and e.get('type')=='node' and type(e.get('id')) is int
                      and 'lat' in e and 'lon' in e}
    features = {}
    def add(kind, osm_id, coordinates, tags, category):
        if type(osm_id) is not int or osm_id < 1 or not isinstance(coordinates,dict): return
        try: lon,lat=float(coordinates['lon']),float(coordinates['lat'])
        except (KeyError,ValueError,TypeError): return
        if not (math.isfinite(lon) and math.isfinite(lat) and -180<=lon<=180 and -90<=lat<=90): return
        ident=f'{kind}/{osm_id}'
        features.setdefault((ident,category),{'type':'Feature','id':ident,
            'geometry':{'type':'Point','coordinates':[lon,lat]},'properties':{
                'camera_type':category,'brand':tags.get('brand') or tags.get('manufacturer') or '',
                'direction':tags.get('camera:direction') or tags.get('direction') or ''}})
        if len(features)>MAX_ELEMENTS: raise ValueError('Too many camera devices in view; zoom in and retry.')
    for element in elements:
        if not isinstance(element,dict): continue
        kind=element.get('type'); tags=element.get('tags')
        if not isinstance(tags,dict): continue
        if kind in ('node','way') and tags.get('man_made')=='surveillance' and str(tags.get('surveillance:type','')).upper()=='ALPR':
            # Preserve legacy center responses; out geom ways have bounds instead.
            coordinates=element if kind=='node' else element.get('center')
            if kind=='way' and not coordinates:
                bounds=element.get('bounds')
                if isinstance(bounds,dict):
                    try: coordinates={'lat':(float(bounds['minlat'])+float(bounds['maxlat']))/2,'lon':(float(bounds['minlon'])+float(bounds['maxlon']))/2}
                    except (KeyError,TypeError,ValueError): pass
            add(kind,element.get('id'),coordinates,tags,'ALPR')
        if kind=='node':
            if tags.get('highway')=='speed_camera' or (tags.get('surveillance:type')=='camera' and tags.get('enforcement')=='maxspeed'): add(kind,element.get('id'),element,tags,'SPEED')
            if tags.get('highway')=='red_light_camera' or (tags.get('surveillance:type')=='camera' and tags.get('enforcement')=='traffic_signals') or (tags.get('man_made')=='surveillance' and tags.get('surveillance')=='red_light' and tags.get('surveillance:type')=='camera'):
                add(kind,element.get('id'),element,tags,'RED_LIGHT')
        if kind=='relation' and tags.get('type')=='enforcement':
            categories={ {'maxspeed':'SPEED','traffic_signals':'RED_LIGHT','red_light_camera':'RED_LIGHT'}[tag.strip()] for tag in str(tags.get('enforcement','')).split(';') if tag.strip() in ('maxspeed','traffic_signals','red_light_camera') }
            members=element.get('members')
            if categories and isinstance(members,list):
                for member in members:
                    if isinstance(member,dict) and member.get('type')=='node' and member.get('role')=='device':
                        for category in sorted(categories):
                            add('node',member.get('ref'),member if 'lat' in member and 'lon' in member else node_positions.get(member.get('ref')),tags,category)
    return {'type':'FeatureCollection','features':list(features.values())}


class AreaQueryError(ValueError):
    def __init__(self, message, retryable=False):
        super().__init__(message)
        self.retryable = retryable


def _read_osm_part(bounds, progress, errors, types=None):
    progress = progress or (lambda **kw: None)
    query = _overpass_query(bounds, types)
    payload = urllib.parse.urlencode({'data': query}).encode('utf-8')
    retryable = []
    for endpoint in OVERPASS_ENDPOINTS:
        progress(phase="connecting", provider=endpoint, errors=list(errors), received_bytes=0, total_bytes=None)
        request = urllib.request.Request(endpoint, data=payload, headers={
            'User-Agent': 'OpenRF/0.2.224 (offline-first; user-initiated OSM area lookup)',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=45) as reply:
                headers = getattr(reply, 'headers', {})
                try: total = int(headers.get('Content-Length', 0)) or None
                except (ValueError, TypeError): total = None
                progress(phase='downloading', total_bytes=total)
                chunks = bytearray()
                while True:
                    chunk = reply.read(min(65536, MAX_RESPONSE + 1 - len(chunks)))
                    if not chunk: break
                    chunks.extend(chunk)
                    progress(received_bytes=len(chunks))
                    if len(chunks)>MAX_RESPONSE: break
                raw = bytes(chunks)
                if total is not None and len(raw)!=total:
                    raise ValueError('Incomplete HTTP response')
            progress(phase='processing')
            if len(raw) > MAX_RESPONSE:
                raise ValueError('OSM area response is too large; zoom in and retry.')
            if raw[:2] == b'\x1f\x8b':
                with gzip.GzipFile(fileobj=io.BytesIO(raw)) as archive:
                    raw = archive.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise ValueError('OSM area response expands past the safety limit; zoom in.')
            return _parse_overpass(json.loads(raw))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError,
                json.JSONDecodeError, UnicodeError, http.client.HTTPException, EOFError) as exc:
            host=endpoint.split('/')[2]
            if isinstance(exc,urllib.error.HTTPError): reason=f'HTTP {exc.code}'
            elif isinstance(exc,TimeoutError) or (isinstance(exc,urllib.error.URLError) and isinstance(exc.reason,TimeoutError)): reason='network timeout'
            elif isinstance(exc,urllib.error.URLError): reason='network connection failed'
            elif isinstance(exc,ValueError) and not isinstance(exc,(json.JSONDecodeError,UnicodeError)): reason=str(exc)
            elif isinstance(exc,(json.JSONDecodeError,UnicodeError)): reason='invalid JSON response'
            else: reason=type(exc).__name__
            retryable.append(reason in ('HTTP 502','HTTP 503','HTTP 504','network timeout'))
            errors.append(f'{host}: {reason}')
            progress(errors=list(errors))
    raise AreaQueryError('Area query failed at both OSM servers (' + ', '.join(errors) +
                         '). Try again when online or zoom into a smaller area; saved camera pins remain offline.',
                         retryable=bool(retryable) and all(retryable))


def _read_osm_area(bounds, progress=None, types=None):
    progress = progress or (lambda **kw: None)
    west,south,east,north = bbox_value(bounds, narrow=True)
    errors = []
    try:
        return _read_osm_part(bounds, progress, errors, types)
    except AreaQueryError as exc:
        # One bounded subdivision only, and only for gateway/timeouts, not
        # offline, malformed responses or rate limits. Never save partial areas.
        if not exc.retryable or max(east-west,north-south) < 0.75:
            raise
    midx,midy=(west+east)/2,(south+north)/2
    parts=[(west,south,midx,midy),(midx,south,east,midy),
           (west,midy,midx,north),(midx,midy,east,north)]
    features={}
    for index, part in enumerate(parts,1):
        progress(phase='connecting', part=index, parts=len(parts), completed_parts=index-1,
                 received_bytes=0,total_bytes=None)
        try:
            document=_read_osm_part(part, progress, errors, types)
        except AreaQueryError as exc:
            raise ValueError(f'Smaller-area retry failed in section {index} of {len(parts)}. No partial import saved. {exc}') from exc
        for feature in document['features']:
            features[(feature['id'],feature['properties']['camera_type'])]=feature
        if len(features)>MAX_ELEMENTS:
            raise ValueError('Combined OSM result is too large; zoom in. No partial import saved.')
        progress(completed_parts=index)
    return {'type':'FeatureCollection','features':list(features.values())}


def import_feed(repo, bounds, fetch=None, progress=None, types=None):
    progress = progress or (lambda **kw: None)
    west,south,east,north=bbox_value(bounds,narrow=True)
    types = import_types(types)
    document=fetch() if fetch is not None else _read_osm_area(bounds, progress, types)
    if not isinstance(document,dict) or document.get('type')!='FeatureCollection' or not isinstance(document.get('features'),list):
        raise ValueError('Published feed did not contain GeoJSON features.')
    progress(phase='processing')
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
        category=prop.get('camera_type','ALPR')
        if category not in types: continue
        # Use stable geometry signature if the published feed has no OSM id.
        source_id='flockhopper-osm:'+str(ext) if ext is not None else 'flockhopper-point:'+hashlib.sha256(f'{lat:.6f}/{lon:.6f}'.encode()).hexdigest()[:24]
        if category!='ALPR': source_id='osm-enforcement:'+category+':'+source_id
        brand=str(prop.get('brand') or prop.get('manufacturer') or '').strip()[:70]
        label=(f'Community-mapped {brand} ALPR' if brand else 'Community-mapped ALPR')[:160]
        if category!='ALPR': label='Community-mapped '+('speed camera' if category=='SPEED' else 'red-light camera')
        direction=str(prop.get('direction') or '').strip()[:80]
        rows.append((category,'COMMUNITY_MAPPED',label,lat,lon,direction,'',
                     ('OpenStreetMap community surveillance mapping (Overpass/DeFlock compatible)' if category=='ALPR' else 'OpenStreetMap community enforcement mapping (Overpass)'),
                     ('https://www.openstreetmap.org/'+str(ext) if isinstance(ext,str) and ext.startswith(('node/','way/')) and ext.split('/',1)[1].isdigit() else 'https://www.openstreetmap.org/'),source_id,utc_now()))
        if len(rows)>=20000:break  # single-area ingest safety cap
    progress(phase='saving')
    with repo._lock, repo._connect() as db:
        db.executemany('''INSERT INTO camera_sites
        (type,state,label,latitude,longitude,direction,notes,source,source_url,source_id,updated_utc)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source_id) DO UPDATE SET
          latitude=excluded.latitude,longitude=excluded.longitude,direction=excluded.direction,
          label=excluded.label,updated_utc=excluded.updated_utc
        WHERE camera_sites.state='COMMUNITY_MAPPED' ''',rows)
    return {'matched':len(rows),'counts':{kind:sum(row[0]==kind for row in rows) for kind in TYPES},'types':types,'source':FEED_URL,'state':'COMMUNITY_MAPPED',
            'note':'Community-mapped OSM coordinates, not independently verified; may be outdated.',
            'attribution':ATTRIBUTION}
