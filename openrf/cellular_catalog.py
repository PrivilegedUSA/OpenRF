"""Offline public cellular reference datasets, not live RF observations.

FCC/HIFLD license-location snapshot via a public ArcGIS layer. OpenCellID
logical cells and user-imported modeled FCC coverage are separate datasets.
"""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import gzip
import json
import math
from pathlib import Path
import sqlite3
import threading
from contextlib import contextmanager
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

TOWER_URL = 'https://services.arcgis.com/0ZRg6WRC7mxSLyKX/ArcGIS/rest/services/Cellular_Towers/FeatureServer/0/query'
TOWER_SOURCE = 'FCC ULS / HIFLD public cellular tower layer'
ESTIMATE_SOURCE = 'OpenCellID (CC BY-SA 4.0)'
CARRIERS = ('att', 'tmobile', 'verizon', 'other', 'aggregate')
MAX_TOWERS = 500_000
MAX_CELLS = 10_000_000
MAX_FILE = 128 * 1024**2
MAX_VERTICES = 2_000_000
MAX_FEATURES = 100_000
MAX_VIEW_POINTS = 2500
MAX_VIEW_VERTICES = 150_000


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def number(v):
    if isinstance(v, bool): raise ValueError('Boolean coordinate')
    n = float(v)
    if not math.isfinite(n): raise ValueError('Non-finite coordinate')
    return n


def coords(lon, lat):
    x, y = number(lon), number(lat)
    if not (-180 <= x <= 180 and -85.05112878 <= y <= 85.05112878) or (x == 0 and y == 0):
        raise ValueError('Invalid geographic coordinate')
    return x, y


def arcgis(params):
    # ArcGIS query supports form POST. Long GET URLs can produce HTTP 404.
    encoded = urlencode({'f':'json', **params})
    headers = {'User-Agent':'OpenRF/0.2.238 (manual FCC public data download; https://openrf.app)', 'Accept':'application/json'}
    request = Request(TOWER_URL, data=encoded.encode('ascii'), headers={**headers,'Content-Type':'application/x-www-form-urlencoded'}, method='POST')
    # Some proxies reject POST. Only fall back to a deliberately short GET.
    for attempt in range(3):
        try:
            try:
                response = urlopen(request, timeout=35)
            except HTTPError as exc:
                if exc.code not in (404,405,413,414,501) or len(TOWER_URL)+1+len(encoded)>1800: raise
                exc.close()
                response = urlopen(Request(TOWER_URL+'?'+encoded,headers=headers),timeout=35)
            with response:
                raw = response.read(24 * 1024**2 + 1)
                if len(raw) > 24 * 1024**2: raise ValueError('Tower provider response too large')
            data = json.loads(raw)
            if not isinstance(data, dict) or 'error' in data:
                raise ValueError('Tower provider rejected request: ' + str(data.get('error','invalid response') if isinstance(data,dict) else 'invalid response')[:300])
            return data
        except (HTTPError, URLError, TimeoutError) as exc:
            if attempt == 2 or isinstance(exc, HTTPError) and exc.code not in (429, 500, 502, 503, 504): raise
            time.sleep(2 ** (attempt + 1))


def tower_records(progress, query=arcgis):
    data = query({'where':'1=1','returnIdsOnly':'true'})
    ids = data.get('objectIds')
    if not isinstance(ids,list) or not ids or len(ids)>MAX_TOWERS or any(type(i) is not int or i<0 for i in ids) or len(set(ids))!=len(ids):
        raise ValueError('Invalid or empty tower ID list; previous snapshot retained')
    total = len(ids); rejected = 0; completed = 0
    progress(phase='downloading', completed=0,total=total,rejected=0)
    # If a gateway rejects the large request, use smaller batches for the
    # remainder of this job. Do not restart or publish an incomplete snapshot.
    def pages(batch):
        nonlocal batch_size
        try:
            data = query({'objectIds':','.join(map(str,batch)), 'outFields':'FID,Licensee,Callsign,LocCity,LocState,LicStatus,StrucType', 'returnGeometry':'true','outSR':'4326'})
        except HTTPError as exc:
            if exc.code not in (404,405,413,414,501) or len(batch)<=50: raise
            exc.close()
            batch_size=50
            for start in range(0,len(batch),batch_size):
                yield from pages(batch[start:start+batch_size])
            return
        yield batch,data
    def all_pages():
        offset=0
        while offset<total:
            batch=ids[offset:offset+batch_size]
            yield from pages(batch)
            offset+=len(batch)
    batch_size=250
    for batch,data in all_pages():
        features = data.get('features')
        if not isinstance(features,list) or data.get('exceededTransferLimit') or {f.get('attributes',{}).get('FID') for f in features} != set(batch) or len(features)!=len(batch):
            raise ValueError('Incomplete tower provider page; previous snapshot retained')
        for f in features:
            a=f['attributes']; g=f.get('geometry') or {}
            try: lon,lat=coords(g.get('x'),g.get('y'))
            except (ValueError,TypeError): rejected+=1; continue
            details = {k:str(a.get(k) or '')[:254] for k in ('Licensee','Callsign','LocCity','LocState','LicStatus','StrucType')}
            yield str(a['FID']),lon,lat,details
        completed+=len(batch)
        progress(phase='downloading', completed=completed,total=total,rejected=rejected)


def estimate_records(path):
    opener = gzip.open if str(path).lower().endswith('.gz') else open
    with opener(path,'rt',encoding='utf-8-sig',newline='') as stream:
        for i,row in enumerate(csv.reader(stream)):
            if i==0 and row and row[0].lower()=='radio': continue
            if i>=MAX_CELLS: raise ValueError('Cell file exceeds 10 million rows; use country exports')
            if len(row)!=14: raise ValueError('Expected OpenCellID 14-column CSV format')
            radio,mcc,net,area,cell,unit,lon,lat,rng,samples,_,created,updated,_=row
            try:
                lon,lat=coords(lon,lat)
                mcc,net,area,cell=int(mcc),int(net),int(area),int(cell)
                if not 310<=mcc<=316: continue  # US MCCs only
                if min(net,area,cell)<0 or radio not in ('GSM','UMTS','LTE','CDMA','NR','5G'): continue
                detail={'radio':radio,'mcc':mcc,'mnc_or_sid':net,'area':area,'cell':cell,'unit':unit[:16],'range_m':int(rng),'samples':int(samples),'updated_unix':int(updated)}
            except (ValueError,TypeError): continue
            yield f'{radio}:{mcc}:{net}:{area}:{cell}',lon,lat,detail


def coverage_records(path):
    if Path(path).stat().st_size>MAX_FILE: raise ValueError('Coverage GeoJSON exceeds 128 MiB; split by state or region')
    data=json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if not isinstance(data,dict) or data.get('type')!='FeatureCollection' or not isinstance(data.get('features'),list): raise ValueError('Expected GeoJSON FeatureCollection')
    if 'crs' in data: raise ValueError('Export WGS84 RFC 7946 GeoJSON without custom CRS')
    if len(data['features'])>MAX_FEATURES: raise ValueError('Too many coverage features')
    vertices=0
    for i,f in enumerate(data['features']):
        g=f.get('geometry') or {}; typ=g.get('type'); polygons=g.get('coordinates')
        if typ=='Polygon': polygons=[polygons]
        elif typ!='MultiPolygon': raise ValueError('Coverage must contain only Polygon or MultiPolygon geometry')
        if not isinstance(polygons,list) or not polygons: raise ValueError('Empty coverage polygon')
        # Store separate polygon components to allow spatial filtering. Holes preserved.
        for j,polygon in enumerate(polygons):
            if not isinstance(polygon,list) or not polygon: raise ValueError('Empty coverage polygon')
            clean=[]; xs=[]; ys=[]
            for ring in polygon:
                if not isinstance(ring,list) or len(ring)<4: raise ValueError('Invalid coverage ring')
                points=[]
                for p in ring:
                    x,y=coords(*p[:2]); points.append([x,y]); xs.append(x);ys.append(y);vertices+=1
                    if vertices>MAX_VERTICES: raise ValueError('Too many vertices; simplify or split regional file')
                if points[0]!=points[-1]: raise ValueError('Unclosed coverage ring')
                clean.append(points)
            if max(xs)-min(xs)>180: raise ValueError('Split antimeridian polygons before importing')
            yield f'{i}:{j}',min(xs),min(ys),max(xs),max(ys),sum(map(len,clean)),clean


class Catalog:
    def __init__(self,path):
        self.path=Path(path); self.path.parent.mkdir(parents=True,exist_ok=True)
        self.lock=threading.Lock(); self.job={'phase':'idle'}
        with self.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS points (kind TEXT,id TEXT,lon REAL,lat REAL,detail TEXT,PRIMARY KEY(kind,id));
            CREATE INDEX IF NOT EXISTS points_view ON points(kind,lat,lon);
            CREATE TABLE IF NOT EXISTS coverage (pack TEXT,id TEXT,west REAL,south REAL,east REAL,north REAL,vertices INTEGER,polygon TEXT,PRIMARY KEY(pack,id));
            CREATE INDEX IF NOT EXISTS coverage_view ON coverage(pack,south,north);
            CREATE TABLE IF NOT EXISTS datasets (key TEXT PRIMARY KEY,meta TEXT NOT NULL);''')

    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=30)
        try:
            db.execute('PRAGMA journal_mode=WAL')
            with db: yield db
        finally: db.close()

    def metadata(self):
        from .fcc_coverage import pack_metadata
        with self.connect() as db: result={k:json.loads(m) for k,m in db.execute('SELECT key,meta FROM datasets')}
        result.update(pack_metadata(self.path.parent/'fcc-coverage'))
        return result

    def status(self):
        return {'datasets':self.metadata(),'job':dict(self.job)}

    def _meta(self,db,key,info):
        db.execute('INSERT OR REPLACE INTO datasets VALUES (?,?)',(key,json.dumps(info)))

    def replace_points(self,kind,records,source):
        if kind not in ('towers','estimates'): raise ValueError('Unknown dataset')
        # One transaction: failure/empty result never replaces a working snapshot.
        with self.connect() as db:
            db.execute('DELETE FROM points WHERE kind=?',(kind,))
            db.executemany('INSERT OR REPLACE INTO points VALUES (?,?,?,?,?)',((kind,i,x,y,json.dumps(d,separators=(',',':'))) for i,x,y,d in records))
            count=db.execute('SELECT count(*) FROM points WHERE kind=?',(kind,)).fetchone()[0]
            if not count: raise ValueError('No valid geographic records; previous snapshot retained')
            self._meta(db,kind,{'count':count,'source':source,'saved_at':now()})
        return count

    def replace_coverage(self,carrier,pack,path,vintage,technology,environment):
        if carrier not in CARRIERS or not pack or len(pack)>80 or not vintage or not technology or not environment: raise ValueError('Carrier, pack, date, technology and environment required')
        key='coverage:'+carrier+':'+pack
        with self.connect() as db:
            db.execute('DELETE FROM coverage WHERE pack=?',(key,))
            db.executemany('INSERT INTO coverage VALUES (?,?,?,?,?,?,?,?)',((key,i,w,s,e,n,v,json.dumps(p,separators=(',',':'))) for i,w,s,e,n,v,p in coverage_records(path)))
            count=db.execute('SELECT count(*) FROM coverage WHERE pack=?',(key,)).fetchone()[0]
            if not count: raise ValueError('Empty coverage file; previous pack retained')
            self._meta(db,key,{'count':count,'carrier':carrier,'pack':pack,'source':'User-imported FCC BDC modeled coverage (declared source)','vintage':vintage[:40],'technology':technology[:60],'environment':environment[:80],'saved_at':now()})
        return count

    def refresh(self):
        with self.lock:
            if self.job['phase'] in ('connecting','downloading','saving'): return self.status()
            self.job={'phase':'connecting'}
            threading.Thread(target=self._run,daemon=True).start()
        return self.status()

    def _progress(self,**fields): self.job={**self.job,**fields}

    def _run(self):
        try:
            def records():
                yield from tower_records(self._progress)
                self._progress(phase='saving')
            count=self.replace_points('towers',records(),TOWER_SOURCE)
            self._progress(phase='complete',count=count)
        except Exception as exc:
            completed=self.job.get('completed',0); total=self.job.get('total',0)
            saved='previous snapshot retained' if 'towers' in self.metadata() else 'no tower snapshot saved'
            self._progress(phase='failed',error=f'FCC/HIFLD tower download: {type(exc).__name__}: {str(exc)[:200]}; {completed:,}/{total:,} records fetched; {saved}')

    def view(self,bounds,kinds,carriers,profiles=()):
        w,s,e,n=map(number,bounds)
        if not (-180<=w<=180 and -180<=e<=180 and -90<=s<n<=90): raise ValueError('Invalid viewport')
        if not set(kinds)<= {'towers','estimates'} or not set(carriers)<=set(CARRIERS): raise ValueError('Unknown layer')
        chosen={}
        for profile in profiles:
            v=json.loads(profile)
            if not isinstance(v,list) or len(v)!=4 or v[0] not in carriers or not all(isinstance(x,str) and len(x)<=80 for x in v) or v[0] in chosen:
                raise ValueError('Invalid coverage profile')
            chosen[v[0]]=tuple(v[1:])
        pts=[]; polygons=[]; limited=[]; overviews=[]; meta=self.metadata()
        with self.connect() as db:
            for kind in dict.fromkeys(kinds):
                longitude='lon BETWEEN ? AND ?' if w<=e else '(lon>=? OR lon<=?)'
                rows=db.execute(f'SELECT id,lon,lat,detail FROM points WHERE kind=? AND lat BETWEEN ? AND ? AND {longitude} LIMIT ?', (kind,s,n,w,e,MAX_VIEW_POINTS+1)).fetchall()
                if len(rows)>MAX_VIEW_POINTS: limited.append(kind); continue  # never silently sample
                pts.extend({'kind':kind,'id':i,'lon':x,'lat':y,'detail':json.loads(d)} for i,x,y,d in rows)
            for carrier in dict.fromkeys(carriers):
                matches=[(k,(m['vintage'],m['technology'],m['environment'])) for k,m in meta.items() if k.startswith('coverage:') and m.get('carrier')==carrier]
                profile=chosen.get(carrier) or (sorted({v for _,v in matches})[-1] if matches else None)
                packs=[k for k,v in matches if v==profile]
                from .coverage_overview import overview, wide_view
                from .fcc_coverage import view_pack
                fcc=[k for k in packs if meta[k].get('fcc_file')]
                manual=[k for k in packs if k not in fcc]
                box=(w,s,e,n)
                total=0; current=[]; overflow=False
                use_overview=bool(fcc and wide_view(box))
                if not use_overview:
                    for pack in fcc:
                        for item in view_pack(self.path.parent/'fcc-coverage'/meta[pack]['fcc_file'],meta[pack],box,MAX_VIEW_VERTICES-total):
                            if item is None:
                                use_overview=True; break
                            v,polygon=item; total+=v
                            current.append({'carrier':carrier,'pack':pack,'polygon':polygon})
                        if use_overview: break
                if use_overview:
                    total=0; current=[]
                    cells,step=overview([(self.path.parent/'fcc-coverage'/meta[k]['fcc_file'],meta[k]) for k in fcc],box,MAX_VIEW_VERTICES)
                    if cells is None: overflow=True
                    else:
                        total=5*len(cells)
                        current=[{'carrier':carrier,'pack':'FCC overview',**cell} for cell in cells]
                        if cells: overviews.append({'carrier':carrier,'degrees':step})
                for pack in manual:
                    longitude='west<=? AND east>=?' if w<=e else '(east>=? OR west<=?)'
                    args=(e,w) if w<=e else (w,e)
                    manual_rows=[]; cost=0
                    for v,raw in db.execute(f'SELECT vertices,polygon FROM coverage WHERE pack=? AND south<=? AND north>=? AND {longitude}',(pack,n,s,*args)):
                        cost+=v
                        if total+cost>MAX_VIEW_VERTICES: break
                        manual_rows.append({'carrier':carrier,'pack':pack,'polygon':json.loads(raw)})
                    if total+cost>MAX_VIEW_VERTICES:
                        overflow=True
                        if not fcc: current=[]; break
                    else: total+=cost; current.extend(manual_rows)
                if overflow: limited.append('coverage:'+carrier)
                polygons.extend(current)
        return {'points':pts,'coverage':polygons,'limited':limited,'overviews':overviews}



def main():
    from .server import DEFAULT_DB
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('--db',type=Path,default=DEFAULT_DB)
    sub=p.add_subparsers(dest='command',required=True)
    e=sub.add_parser('estimates'); e.add_argument('file',type=Path)
    c=sub.add_parser('coverage'); c.add_argument('file',type=Path); c.add_argument('--carrier',choices=CARRIERS,required=True); c.add_argument('--pack',required=True); c.add_argument('--date',required=True); c.add_argument('--technology',required=True); c.add_argument('--environment',required=True)
    a=p.parse_args(); catalog=Catalog(a.db.parent/'cellular-reference.sqlite3')
    if a.command=='estimates': count=catalog.replace_points('estimates',estimate_records(a.file),ESTIMATE_SOURCE)
    else: count=catalog.replace_coverage(a.carrier,a.pack,a.file,a.date,a.technology,a.environment)
    print(f'Saved {count:,} records offline. Source: {catalog.path}')

if __name__=='__main__': main()
