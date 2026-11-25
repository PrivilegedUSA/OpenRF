"""Opt-in nationwide US OSM traffic-enforcement snapshot via SpeedCams.world.

Separate tables preserve ALPR, local reports and regional imports. No location
or device information is sent to the provider. ODbL 1.0 data, not live detections.
"""
import csv
import io
import math
import threading
import urllib.request
from .national_alpr import now_utc, SnapshotError

URL = 'https://speedcams.world/downloads/us/us-all.csv'
SOURCE = 'OpenStreetMap contributors via SpeedCams.world (ODbL 1.0)'
MAX_BYTES = 8 * 1024 * 1024
MIN_RECORDS = 100


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
    ''')


def status(repo):
    with repo._lock, repo._connect() as db:
        row = db.execute('SELECT speed_count,red_light_count,updated_utc,download_bytes FROM national_traffic_meta WHERE id=1').fetchone()
    return dict(row) if row else dict(speed_count=0,red_light_count=0,updated_utc=None,download_bytes=0)


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
        db.execute('DELETE FROM national_traffic_sites')
        db.executemany('INSERT INTO national_traffic_sites VALUES(?,?,?,?,?,?,?,?,?,?,?)',rows)
        db.execute('INSERT OR REPLACE INTO national_traffic_meta VALUES(1,?,?,?,?)',(counts['SPEED'],counts['RED_LIGHT'],now_utc(),len(raw)))
    return counts


class UpdateManager:
    def __init__(self,repo):
        self.repo=repo; self.lock=threading.Lock(); self.cancel=threading.Event()
        self.state=dict(phase='idle',running=False,downloaded_bytes=0,total_bytes=None,processed=0,error=None)
        self.thread=None
    def status(self):
        with self.lock: result=dict(self.state)
        result['snapshot']=status(self.repo); result['provider']=URL
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
    def run(self):
        try:
            req=urllib.request.Request(URL,headers={'User-Agent':'OpenRF/0.2.217 (user-initiated offline camera download)','Accept':'text/csv, */*','Accept-Encoding':'identity'})
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
                if total is not None and len(raw)!=total: raise SnapshotError('Incomplete traffic CSV HTTP response.')
            counts=ingest(self.repo,raw,self.update,self.cancel.is_set)
            self.update(phase='ready',running=False,processed=sum(counts.values()))
        except Exception as exc:
            self.update(phase='failed',running=False,error=f'{type(exc).__name__}: {str(exc)[:300]}')
    def close(self): self.cancel.set()
