"""Opt-in nationwide US OSM traffic-enforcement snapshot via SpeedCams.world.

Separate tables preserve ALPR, local reports and regional imports. No location
or device information is sent to the provider. ODbL 1.0 data, not live detections.
"""
import csv
import io
import hashlib
import json
import math
import threading
import urllib.request
import urllib.error
import time
from email.utils import parsedate_to_datetime
from .national_alpr import now_utc, SnapshotError

URL = 'https://speedcams.world/downloads/us/us-all.csv'
SOURCE = 'OpenStreetMap contributors via SpeedCams.world (ODbL 1.0)'
MAX_BYTES = 8 * 1024 * 1024
MIN_RECORDS = 100
CHICAGO = {
    'SPEED': 'https://data.cityofchicago.org/resource/4i42-qv3h.json?$limit=5000',
    'RED_LIGHT': 'https://data.cityofchicago.org/resource/thvf-6diy.json?$limit=5000',
}
CITY_SOURCE = 'City of Chicago Data Portal (agency-reported; portal terms apply)'
ATTRIBUTION = SOURCE + '; ' + CITY_SOURCE


def init(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS national_traffic_sites (
      source_id TEXT PRIMARY KEY, type TEXT NOT NULL, state TEXT NOT NULL,
      label TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
      direction TEXT NOT NULL, notes TEXT NOT NULL, source TEXT NOT NULL,
      source_url TEXT NOT NULL, updated_utc TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS national_traffic_bounds ON national_traffic_sites(type,latitude,longitude);
    CREATE TABLE IF NOT EXISTS national_traffic_meta (
      id INTEGER PRIMARY KEY CHECK(id=1), speed_count INTEGER NOT NULL,
      red_light_count INTEGER NOT NULL, updated_utc TEXT NOT NULL,
      download_bytes INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS national_traffic_supplement_meta (
      category TEXT PRIMARY KEY, count INTEGER NOT NULL, updated_utc TEXT NOT NULL,
      download_bytes INTEGER NOT NULL);
    ''')


def status(repo):
    with repo._lock, repo._connect() as db:
        row = db.execute('SELECT speed_count,red_light_count,updated_utc,download_bytes FROM national_traffic_meta WHERE id=1').fetchone()
        supplements = [dict(r) for r in db.execute('SELECT * FROM national_traffic_supplement_meta ORDER BY category')]
    result = dict(row) if row else dict(speed_count=0,red_light_count=0,updated_utc=None,download_bytes=0)
    result['osm_count'] = result['speed_count'] + result['red_light_count']
    result['supplements'] = supplements
    for item in supplements:
        result['speed_count' if item['category']=='SPEED' else 'red_light_count'] += item['count']
        result['updated_utc'] = max(result['updated_utc'] or '', item['updated_utc'])
        result['download_bytes'] += item['download_bytes']
    return result


def sites_in_bounds(db, bounds, types, limit):
    w,s,e,n = bounds
    marks = ','.join('?' for _ in types)
    return [dict(r) for r in db.execute('''SELECT t.source_id AS id,t.type,t.state,t.label,t.latitude,t.longitude,t.direction,t.notes,t.source,t.source_url,t.updated_utc
      FROM national_traffic_sites t WHERE t.type IN (''' + marks + ''') AND t.latitude BETWEEN ? AND ? AND t.longitude BETWEEN ? AND ?
      AND NOT EXISTS (SELECT 1 FROM camera_sites c WHERE c.source_id=t.source_id AND c.type=t.type)
      ORDER BY t.latitude,t.longitude LIMIT ?''', (*types,s,n,w,e,limit))]


def parse(raw, progress=lambda **kw: None, minimum=MIN_RECORDS):
    if len(raw)>MAX_BYTES: raise SnapshotError('Traffic CSV exceeds size limit.')
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''), strict=True)
    fields = {'id','latitude','longitude','name','type','maxspeed','unit','country_code','source'}
    if not reader.fieldnames or not fields.issubset(reader.fieldnames):
        raise SnapshotError('Unexpected traffic-camera CSV header.')
    rows = {}; stamp = now_utc(); skipped=0
    for i, row in enumerate(reader,1):
        if i>50000: raise SnapshotError('Traffic CSV exceeds record limit.')
        if None in row or any(row.get(f) is None for f in fields): raise SnapshotError('Incomplete traffic CSV row.')
        if row['country_code'].strip().upper()!='US': raise SnapshotError('Unexpected non-US camera record.')
        kind = row['type'].strip().lower()
        # Mobile checks aren't documented fixed infrastructure.
        if kind not in ('fixed','average','red_light'):
            if kind=='mobile': skipped+=1; continue
            raise SnapshotError('Unknown traffic camera type: '+kind[:60])
        category = 'RED_LIGHT' if kind=='red_light' else 'SPEED'
        ident=row['id'].strip()
        if not ident.isascii() or not ident.isdecimal() or not 1<=len(ident)<=20 or int(ident)==0: raise SnapshotError('Invalid OSM node ID.')
        lat,lon=float(row['latitude']),float(row['longitude'])
        if not (math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180): raise SnapshotError('Invalid camera coordinates.')
        sid=f'osm-enforcement:{category}:flockhopper-osm:node/{int(ident)}'
        label=(row['name'].strip() or ('Red-light camera' if category=='RED_LIGHT' else 'Speed camera'))[:160]
        notes=('Average-speed report; mapped point only. ' if kind=='average' else '') + 'Community mapped; not verified or necessarily operational.'
        record=(sid,category,'COMMUNITY_MAPPED',label,lat,lon,'',notes,SOURCE,'https://www.openstreetmap.org/node/'+str(int(ident)),stamp)
        if sid in rows and rows[sid]!=record: raise SnapshotError('Conflicting duplicate OSM camera ID.')
        rows[sid]=record
        if i%100==0: progress(processed=i)
    counts={k:sum(r[1]==k for r in rows.values()) for k in ('SPEED','RED_LIGHT')}
    if len(rows)<minimum or not all(counts.values()): raise SnapshotError('Incomplete traffic snapshot: too few usable records or a missing category; saved data kept.')
    return list(rows.values()),counts,skipped


def ingest(repo, raw, progress=lambda **kw: None, cancelled=lambda:False, minimum=MIN_RECORDS):
    progress(phase='validating')
    rows,counts,skipped=parse(raw,progress,minimum)
    progress(phase='saving',processed=len(rows),skipped=skipped)
    if cancelled(): raise SnapshotError('Update cancelled during shutdown.')
    with repo._lock, repo._connect() as db:
        old=db.execute('SELECT speed_count,red_light_count FROM national_traffic_meta WHERE id=1').fetchone()
        if old and (counts['SPEED']*2<old['speed_count'] or counts['RED_LIGHT']*2<old['red_light_count']):
            raise SnapshotError('Traffic snapshot unexpectedly lost over half of a category; saved data kept.')
        db.execute("DELETE FROM national_traffic_sites WHERE source_id LIKE 'osm-enforcement:%'")
        db.executemany('INSERT INTO national_traffic_sites VALUES(?,?,?,?,?,?,?,?,?,?,?)',rows)
        db.execute('INSERT OR REPLACE INTO national_traffic_meta VALUES(1,?,?,?,?)',(counts['SPEED'],counts['RED_LIGHT'],now_utc(),len(raw)))
    return counts


def parse_chicago(raw, category, minimum=20):
    if len(raw)>MAX_BYTES or category not in CHICAGO:
        raise SnapshotError('Invalid supplemental camera snapshot.')
    records=json.loads(raw)
    if not isinstance(records,list) or not minimum<=len(records)<5000:
        raise SnapshotError('Incomplete or oversized Chicago snapshot.')
    rows={}; stamp=now_utc()
    for item in records:
        if not isinstance(item,dict): raise SnapshotError('Invalid Chicago camera row.')
        loc=item.get('location') or {}
        if not isinstance(loc,dict): loc={}
        try:
            lat=float(item.get('latitude') or loc.get('latitude'))
            lon=float(item.get('longitude') or loc.get('longitude'))
        except (ValueError,TypeError): raise SnapshotError('Missing Chicago camera coordinates.')
        if not (41.6<=lat<=42.1 and -88.0<=lon<=-87.4):
            raise SnapshotError('Unexpected Chicago camera coordinates.')
        label=str(item.get('address') or item.get('intersection') or item.get('location_id') or 'Chicago camera')[:160]
        approach=str(item.get('approaches') or item.get('approach') or '')[:80]
        # Source-specific ID, never infer lens heading from travel approach.
        key=json.dumps([item.get('location_id'),round(lat,7),round(lon,7),label,approach],sort_keys=True)
        sid=f'chicago:{category}:'+hashlib.sha256(key.encode()).hexdigest()[:32]
        notes='Agency-published location; not independently verified or proof of current operation.'
        if approach: notes+=' Reported travel approach: '+approach
        rows[sid]=(sid,category,'REPORTED',label,lat,lon,'',notes,CITY_SOURCE,CHICAGO[category].split('?')[0],stamp)
    if len(rows)<minimum: raise SnapshotError('Too few distinct Chicago camera reports.')
    return list(rows.values())


def ingest_chicago(repo, raw, category, progress=lambda **kw:None, cancelled=lambda:False, minimum=20):
    progress(phase='validating')
    rows=parse_chicago(raw,category,minimum)
    progress(phase='saving',processed=len(rows))
    if cancelled(): raise SnapshotError('Update cancelled during shutdown.')
    with repo._lock,repo._connect() as db:
        old=db.execute('SELECT count FROM national_traffic_supplement_meta WHERE category=?',(category,)).fetchone()
        if old and len(rows)*2<old['count']: raise SnapshotError('Chicago snapshot unexpectedly lost over half its reports; saved data kept.')
        db.execute('DELETE FROM national_traffic_sites WHERE source_id LIKE ?',('chicago:'+category+':%',))
        db.executemany('INSERT INTO national_traffic_sites VALUES(?,?,?,?,?,?,?,?,?,?,?)',rows)
        db.execute('INSERT OR REPLACE INTO national_traffic_supplement_meta VALUES(?,?,?,?)',(category,len(rows),now_utc(),len(raw)))
    return len(rows)


class UpdateManager:
    def __init__(self,repo):
        self.repo=repo; self.lock=threading.Lock(); self.cancel=threading.Event()
        self.state=dict(phase='idle',running=False,downloaded_bytes=0,total_bytes=None,processed=0,error=None)
        self.thread=None
    def status(self):
        with self.lock: result=dict(self.state)
        result['snapshot']=status(self.repo); result.setdefault('provider',URL)
        return result
    def update(self,**kw):
        with self.lock: self.state.update(kw)
    def start(self):
        with self.lock:
            if self.state['running']: raise SnapshotError('A nationwide traffic-camera update is already running.')
            self.cancel.clear()
            self.state=dict(phase='connecting',running=True,downloaded_bytes=0,total_bytes=None,processed=0,error=None)
            self.thread=threading.Thread(target=self.run,daemon=True,name='OpenRF-US-Traffic-Cameras');self.thread.start()
        return self.status()
    def download(self,url,accept):
        self.update(phase='connecting',provider=url,downloaded_bytes=0,total_bytes=None,processed=0)
        req=urllib.request.Request(url,headers={'User-Agent':'OpenRF/0.2.233 (user-initiated offline camera download)','Accept':accept,'Accept-Encoding':'identity'})
        with urllib.request.urlopen(req,timeout=40) as reply:
            if not reply.geturl().startswith('https://'): raise SnapshotError('Insecure traffic download redirect.')
            try: total=int(reply.headers.get('Content-Length','0')) or None
            except (TypeError,ValueError): total=None
            if total is not None and not 0<total<=MAX_BYTES: raise SnapshotError('Traffic download exceeds size limit.')
            self.update(phase='downloading',total_bytes=total)
            raw=bytearray()
            while True:
                if self.cancel.is_set(): raise SnapshotError('Update cancelled during shutdown.')
                chunk=reply.read(65536)
                if not chunk: break
                raw.extend(chunk)
                if len(raw)>MAX_BYTES: raise SnapshotError('Traffic download exceeds size limit.')
                self.update(downloaded_bytes=len(raw))
            if total is not None and len(raw)!=total: raise SnapshotError('Incomplete traffic HTTP response.')
        return raw
    def download_with_retry(self,url,accept):
        # Only retry transient network/gateway failures; never retry bad data.
        for attempt in range(1,4):
            if self.cancel.is_set(): raise SnapshotError('Update cancelled during shutdown.')
            try:
                self.update(attempt=attempt,retry_seconds=0)
                return self.download(url,accept)
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                delay=2**attempt
                if isinstance(exc,urllib.error.HTTPError):
                    if exc.code not in (408,429,500,502,503,504): raise
                    header=exc.headers.get('Retry-After') if exc.headers else None
                    if header:
                        try:
                            requested=int(header) if header.isdecimal() else math.ceil(parsedate_to_datetime(header).timestamp()-time.time())
                        except (TypeError,ValueError,OverflowError): requested=delay
                        delay=max(delay,requested)
                if attempt==3 or delay>30: raise
                self.update(phase='retrying',attempt=attempt+1,retry_seconds=delay,downloaded_bytes=0,total_bytes=None)
                if self.cancel.wait(delay): raise SnapshotError('Update cancelled during shutdown.')
    def supplements(self):
        return [(f'Chicago {category}',url,category) for category,url in CHICAGO.items()]
    def run(self):
        errors=[]; successes=0; processed=0
        for name,url,category in [('SpeedCams.world',URL,None),*self.supplements()]:
            if self.cancel.is_set(): break
            try:
                self.update(provider_name=name)
                raw=self.download_with_retry(url,'application/json' if category else 'text/csv, */*')
                if category:
                    processed+=ingest_chicago(self.repo,raw,category,self.update,self.cancel.is_set)
                else:
                    processed+=sum(ingest(self.repo,raw,self.update,self.cancel.is_set).values())
                successes+=1
            except Exception as exc:
                errors.append(f'{name}: {type(exc).__name__}: {str(exc)[:160]}')
        self.update(phase='ready' if successes else 'failed',running=False,processed=processed,
                    error='; '.join(errors) or None,partial=bool(successes and errors))
    def close(self): self.cancel.set()
