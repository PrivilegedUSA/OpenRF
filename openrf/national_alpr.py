"""User-triggered U.S. ALPR snapshot, separate from private/manual camera reports.

The remote address is fixed in source, never supplied by a browser. Downloads
run only after explicit opt-in. A validated snapshot is built in a separate
private SQLite file and atomically swapped into the app DB; failed refreshes
cannot erase the previous snapshot or private camera reports.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import sqlite3
import tempfile
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SNAPSHOT_URL = 'https://data.dontgetflocked.com/cameras.geojson.gz'
SOURCE = 'OpenStreetMap community ALPR mapping via FlockHopper daily snapshot'
UPLOAD_SOURCE = 'Operator-imported GeoJSON; upstream source unverified'
ATTRIBUTION = '© OpenStreetMap contributors (ODbL 1.0); FlockHopper/DeFlock-compatible OSM data'
MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024
MAX_EXPANDED_BYTES = 256 * 1024 * 1024
MAX_FEATURES = 300_000
MIN_NATIONAL_FEATURES = 10_000


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def init(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS national_alpr_sites (
      source_id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'ALPR',
      state TEXT NOT NULL DEFAULT 'COMMUNITY_MAPPED',
      label TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      direction TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      updated_utc TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS national_alpr_bounds ON national_alpr_sites(latitude,longitude);
    CREATE TABLE IF NOT EXISTS national_alpr_meta (
      id INTEGER PRIMARY KEY CHECK(id=1),
      count INTEGER NOT NULL,
      updated_utc TEXT NOT NULL,
      source_url TEXT NOT NULL,
      download_bytes INTEGER NOT NULL
    );
    ''')


def status(repo):
    with repo._lock, repo._connect() as db:
        row=db.execute('SELECT count,updated_utc,source_url,download_bytes FROM national_alpr_meta WHERE id=1').fetchone()
    return dict(row) if row else {'count':0,'updated_utc':None,'source_url':SNAPSHOT_URL,'download_bytes':0}


def sites_in_bounds(db, bounds, limit):
    west,south,east,north=bounds
    rows=db.execute('''SELECT source_id AS id,type,state,label,latitude,longitude,direction,notes,
        source,source_url,updated_utc FROM national_alpr_sites
        WHERE latitude>=? AND latitude<=? AND longitude>=? AND longitude<=?
        ORDER BY latitude,longitude LIMIT ?''',(south,north,west,east,limit)).fetchall()
    return [dict(r) for r in rows]


class SnapshotError(ValueError):
    pass


class _JSONReader:
    """Incrementally decode GeoJSON feature objects (no giant JSON allocation)."""
    def __init__(self, file):
        self.file=file
        self.buf=''
        self.offset=0
        self.eof=False
        self.decoder=json.JSONDecoder()

    def _more(self):
        if self.eof:return False
        if self.offset:
            self.buf=self.buf[self.offset:];self.offset=0
        chunk=self.file.read(65536)
        if not chunk:self.eof=True;return False
        self.buf+=chunk
        if len(self.buf)>2*1024*1024:
            raise SnapshotError('One GeoJSON feature exceeds the per-feature safety limit.')
        return True

    def peek(self):
        while True:
            while self.offset<len(self.buf) and self.buf[self.offset].isspace():self.offset+=1
            if self.offset<len(self.buf):return self.buf[self.offset]
            if not self._more():raise SnapshotError('Incomplete GeoJSON document.')

    def expect(self, char):
        if self.peek()!=char:raise SnapshotError('Malformed GeoJSON syntax.')
        self.offset+=1

    def value(self):
        self.peek()
        while True:
            try:
                value,end=self.decoder.raw_decode(self.buf,self.offset)
                if end == len(self.buf) and not self.eof:
                    if self._more():continue
                return value,end
            except json.JSONDecodeError:
                if not self._more():raise SnapshotError('Invalid or truncated GeoJSON value.') from None

    def take(self):
        value,end=self.value();self.offset=end;return value


def features(file):
    """Read an actual FeatureCollection; fail closed on incomplete downloads."""
    reader=_JSONReader(file)
    reader.expect('{')
    kind=None
    saw_features=False
    while reader.peek()!='}':
        key=reader.take()
        if not isinstance(key,str):raise SnapshotError('Invalid GeoJSON member name.')
        reader.expect(':')
        if key=='features':
            if saw_features:raise SnapshotError('Duplicate GeoJSON features field.')
            saw_features=True;reader.expect('[')
            while reader.peek()!=']':
                feat=reader.take()
                yield feat
                if reader.peek()==',':reader.expect(',')
                elif reader.peek()!=']':raise SnapshotError('Invalid GeoJSON features separator.')
            reader.expect(']')
        else:
            obj=reader.take()
            if key=='type':kind=obj
        if reader.peek()==',':reader.expect(',')
        elif reader.peek()!='}':raise SnapshotError('Invalid GeoJSON object separator.')
    reader.expect('}')
    while reader.offset<len(reader.buf) or not reader.eof:
        while reader.offset<len(reader.buf) and reader.buf[reader.offset].isspace():reader.offset+=1
        if reader.offset<len(reader.buf):raise SnapshotError('Extra content after GeoJSON document.')
        if not reader._more():break
    if kind!='FeatureCollection' or not saw_features:
        raise SnapshotError('Snapshot was not a GeoJSON FeatureCollection.')


def _normalize(feature, stamp, source=SOURCE):
    if not isinstance(feature,dict) or feature.get('type')!='Feature':return None
    geom=feature.get('geometry')
    if not isinstance(geom,dict) or geom.get('type')!='Point':return None
    coords=geom.get('coordinates')
    if not isinstance(coords,(list,tuple)) or len(coords)<2:return None
    try: lon,lat=float(coords[0]),float(coords[1])
    except (ValueError,TypeError):return None
    if not all(map(math.isfinite,(lat,lon))) or not (-90<=lat<=90 and -180<=lon<=180):return None
    props=feature.get('properties') or {}
    if not isinstance(props,dict):props={}
    external=props.get('osmId') or props.get('osm_id') or feature.get('id')
    external=str(external).strip()[:100] if external is not None else ''
    if external.startswith(('node/','way/')) and external.split('/',1)[1].isdigit():
        source_url='https://www.openstreetmap.org/'+external
    else:
        source_url='https://www.openstreetmap.org/'
    # Never invent a vendor label, and don't trust free-form HTML from external data.
    brand=props.get('brand') or props.get('manufacturer') or ''
    brand=str(brand).strip()[:70]
    direction=props.get('direction') or props.get('camera:direction') or ''
    direction=str(direction).strip()[:80]
    label=(f'Community-mapped {brand} ALPR' if brand else 'Community-mapped ALPR')[:160]
    ident='flockhopper-osm:'+external if external else 'flockhopper-point:'+hashlib.sha256(f'{lat:.7f}/{lon:.7f}'.encode()).hexdigest()[:32]
    return (ident,'ALPR','COMMUNITY_MAPPED',label,lat,lon,direction,'',source,source_url,stamp)


def _copy_capped(src,dst,limit,progress=None):
    total=0
    while True:
        block=src.read(65536)
        if not block:break
        total+=len(block)
        if total>limit:raise SnapshotError('Nationwide data exceeds the configured download/decompression safety limit.')
        dst.write(block)
        if progress:progress(total)
    return total


def _ingest(repo, archive_path, *, min_features=None, progress=None, cancelled=None, uploaded=False):
    """Ingest a local .geojson or .gz snapshot, preserving the current DB on any failure."""
    if min_features is None: min_features = MIN_NATIONAL_FEATURES
    def check():
        if cancelled and cancelled.is_set():raise SnapshotError('Update cancelled during shutdown.')
    directory=repo.path.parent
    files=[]
    try:
        with tempfile.NamedTemporaryFile(prefix='.alpr-json-',suffix='.json',dir=directory,delete=False) as output:
            json_path=Path(output.name);files.append(json_path)
            with open(archive_path,'rb') as source:
                magic=source.read(2);source.seek(0)
                reader=gzip.GzipFile(fileobj=source) if magic==b'\x1f\x8b' else source
                try:_copy_capped(reader,output,MAX_EXPANDED_BYTES)
                finally:
                    if reader is not source:reader.close()
        check()
        with tempfile.NamedTemporaryFile(prefix='.alpr-stage-',suffix='.sqlite3',dir=directory,delete=False) as output:
            stage=Path(output.name);files.append(stage)
        connection=sqlite3.connect(stage)
        try:
            connection.execute('CREATE TABLE sites(source_id TEXT PRIMARY KEY,type TEXT,state TEXT,label TEXT,latitude REAL,longitude REAL,direction TEXT,notes TEXT,source TEXT,source_url TEXT,updated_utc TEXT)')
            stamp=now_utc();batch=[];parsed=0;valid=0
            with open(json_path,encoding='utf-8') as doc:
                for feature in features(doc):
                    check();parsed+=1
                    if parsed>MAX_FEATURES:raise SnapshotError('Nationwide feed contains too many items.')
                    row=_normalize(feature,stamp,UPLOAD_SOURCE if uploaded else SOURCE)
                    if row:batch.append(row);valid+=1
                    if len(batch)>=1000:
                        connection.executemany('INSERT OR REPLACE INTO sites VALUES(?,?,?,?,?,?,?,?,?,?,?)',batch);batch=[]
                    if progress and parsed%1000==0:progress(parsed)
                if batch:connection.executemany('INSERT OR REPLACE INTO sites VALUES(?,?,?,?,?,?,?,?,?,?,?)',batch)
            connection.commit()
            count=connection.execute('SELECT COUNT(*) FROM sites').fetchone()[0]
        finally:connection.close()
        if count<min_features:
            raise SnapshotError(f'Only {count} usable camera positions; refusing to replace the previous nationwide snapshot (minimum {min_features}).')
        check()
        with repo._lock, repo._connect() as db:
            db.execute('ATTACH DATABASE ? AS alpr_stage',(str(stage),))
            try:
                # The DELETE, INSERT and metadata update commit together or not at all.
                db.execute('DELETE FROM national_alpr_sites')
                db.execute('''INSERT INTO national_alpr_sites
                  (source_id,type,state,label,latitude,longitude,direction,notes,source,source_url,updated_utc)
                  SELECT source_id,type,state,label,latitude,longitude,direction,notes,source,source_url,updated_utc
                  FROM alpr_stage.sites''')
                bytes_count=Path(archive_path).stat().st_size
                db.execute('''INSERT INTO national_alpr_meta(id,count,updated_utc,source_url,download_bytes)
                  VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                  count=excluded.count,updated_utc=excluded.updated_utc,
                  source_url=excluded.source_url,download_bytes=excluded.download_bytes''',
                  (count,stamp,'Local file (operator-provided, unverified origin)' if uploaded else SNAPSHOT_URL,bytes_count))
            finally:
                # Detach after the connection's context commits.
                pass
        return {'count':count,'read_features':parsed,'download_bytes':bytes_count,'updated_utc':stamp}
    finally:
        for path in files:
            try:path.unlink(missing_ok=True)
            except OSError:pass


class UpdateManager:
    def __init__(self,repo):
        self.repo=repo
        self._lock=threading.Lock()
        self._cancel=threading.Event()
        self._thread=None
        self._state={'phase':'idle','running':False,'processed':0,'downloaded_bytes':0,'error':None}

    def status(self):
        with self._lock:result=dict(self._state)
        result['snapshot']=status(self.repo)
        return result

    def _set(self,**updates):
        with self._lock:self._state.update(updates)

    def start(self):
        with self._lock:
            if self._state['running']:raise SnapshotError('A nationwide ALPR update is already running.')
            self._cancel.clear()
            self._state={'phase':'downloading','running':True,'processed':0,'downloaded_bytes':0,'error':None}
            self._thread=threading.Thread(target=self._run,name='OpenRF-ALPR-Download',daemon=True)
            self._thread.start()
        return self.status()

    def start_uploaded(self, path):
        """Take ownership of a browser-selected archive already stored privately."""
        with self._lock:
            if self._state['running']:
                raise SnapshotError('A nationwide ALPR update is already running.')
            self._cancel.clear()
            self._state={'phase':'validating','running':True,'processed':0,
                         'downloaded_bytes':Path(path).stat().st_size,'error':None}
            self._thread=threading.Thread(target=self._run_uploaded,args=(Path(path),),
                name='OpenRF-ALPR-File-Import',daemon=True)
            self._thread.start()
        return self.status()

    def _run_uploaded(self,path):
        try:
            result=_ingest(self.repo,path,progress=lambda n:self._set(processed=n),
                           cancelled=self._cancel,uploaded=True)
            self._set(phase='ready',running=False,processed=result['count'],
                      downloaded_bytes=result['download_bytes'],error=None)
        except (OSError,ValueError,TimeoutError,sqlite3.Error,UnicodeError) as exc:
            self._set(phase='failed',running=False,error=f'{type(exc).__name__}: {str(exc)[:240]}')
        finally:
            try:path.unlink(missing_ok=True)
            except OSError:pass

    def _run(self):
        path=None
        try:
            with tempfile.NamedTemporaryFile(prefix='.alpr-download-',suffix='.geojson.gz',
                dir=self.repo.path.parent,delete=False) as sink:
                path=Path(sink.name)
                req=urllib.request.Request(SNAPSHOT_URL,headers={
                    'User-Agent':'OpenRF/0.2.58 (+offline-first; user-initiated nationwide snapshot)',
                    'Accept':'application/geo+json, application/json, application/gzip, */*',
                    'Accept-Encoding':'identity'})
                with urllib.request.urlopen(req,timeout=40) as reply:
                    if hasattr(reply,'geturl') and not reply.geturl().startswith('https://'):
                        raise SnapshotError('Snapshot download redirected to an insecure destination.')
                    def progress(n):
                        if self._cancel.is_set():raise SnapshotError('Update cancelled during shutdown.')
                        self._set(downloaded_bytes=n)
                    _copy_capped(reply,sink,MAX_DOWNLOAD_BYTES,progress)
            self._set(phase='validating')
            result=_ingest(self.repo,path,progress=lambda n:self._set(processed=n),cancelled=self._cancel)
            self._set(phase='ready',running=False,processed=result['count'],downloaded_bytes=result['download_bytes'],error=None)
        except (OSError,ValueError,TimeoutError,urllib.error.URLError,sqlite3.Error,UnicodeError) as exc:
            self._set(phase='failed',running=False,error=f'{type(exc).__name__}: {str(exc)[:240]}')
        finally:
            if path is not None:
                try:path.unlink(missing_ok=True)
                except OSError:pass

    def close(self):
        self._cancel.set()
