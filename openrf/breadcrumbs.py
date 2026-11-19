"""Opt-in private walking/driving browser-position tracks; never inferred safe routes."""
from __future__ import annotations

import math
import sqlite3
import threading
from datetime import datetime, timezone
from xml.sax.saxutils import escape

MAX_POINTS=5000
MAX_SESSIONS=100


def _utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def _distance(a,b):
    lat1,lon1,lat2,lon2=map(math.radians,(a[0],a[1],b[0],b[1]))
    delta_lat=lat2-lat1
    delta_lon=lon2-lon1
    t=math.sin(delta_lat/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(delta_lon/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(t)))


class BreadcrumbStore:
    def __init__(self,path):
        self.path=str(path)
        self.lock=threading.RLock()
        with self._connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS breadcrumb_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL, state TEXT NOT NULL,
                started_utc TEXT NOT NULL, stopped_utc TEXT,
                source_device TEXT NOT NULL DEFAULT 'BROWSER_GEOLOCATION',
                travel_mode TEXT NOT NULL DEFAULT 'pedestrian')''')
            # Preserve existing v0.2.131 walking tracks on upgrades. Old rows
            # default to pedestrian; no location points are copied or rewritten.
            cols={row['name'] for row in db.execute('PRAGMA table_info(breadcrumb_sessions)')}
            if 'travel_mode' not in cols:
                db.execute("ALTER TABLE breadcrumb_sessions ADD COLUMN travel_mode TEXT NOT NULL DEFAULT 'pedestrian'")
            db.execute('''CREATE TABLE IF NOT EXISTS breadcrumb_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL, received_utc TEXT NOT NULL,
                observed_utc TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,
                accuracy_m REAL NOT NULL, fix_age_seconds REAL NOT NULL,
                FOREIGN KEY (session_id) REFERENCES breadcrumb_sessions(id))''')
            db.execute('CREATE INDEX IF NOT EXISTS breadcrumb_session_points ON breadcrumb_points(session_id,id)')
            # A browser watch cannot survive process termination; never mark stale records LIVE.
            db.execute("UPDATE breadcrumb_sessions SET state='INTERRUPTED',stopped_utc=? WHERE state='RECORDING'",(_utc(),))

    def _connect(self):
        db=sqlite3.connect(self.path,timeout=5)
        db.row_factory=sqlite3.Row
        return db

    def sessions(self):
        with self.lock,self._connect() as db:
            return [dict(row) for row in db.execute('''SELECT s.*,COUNT(p.id) AS point_count
                FROM breadcrumb_sessions s LEFT JOIN breadcrumb_points p ON p.session_id=s.id
                GROUP BY s.id ORDER BY s.id DESC LIMIT 100''')]

    def start(self,label,travel_mode='pedestrian'):
        if not isinstance(label,str) or not 1<=len(label.strip())<=80:
            raise ValueError('Track name must be 1–80 characters')
        if travel_mode not in ('pedestrian','auto') or type(travel_mode) is not str:
            raise ValueError('Track mode must be pedestrian or auto')
        stamp=_utc()
        with self.lock,self._connect() as db:
            if db.execute("SELECT 1 FROM breadcrumb_sessions WHERE state='RECORDING' LIMIT 1").fetchone():
                raise ValueError('A breadcrumb recording session is already active')
            if db.execute('SELECT COUNT(*) FROM breadcrumb_sessions').fetchone()[0]>=MAX_SESSIONS:
                raise ValueError('Track limit reached; export and delete an old track before recording')
            cursor=db.execute('INSERT INTO breadcrumb_sessions(label,state,started_utc,travel_mode) VALUES (?,?,?,?)',
                              (label.strip(),'RECORDING',stamp,travel_mode))
            return {'id':cursor.lastrowid,'label':label.strip(),'state':'RECORDING','started_utc':stamp,
                    'point_count':0,'travel_mode':travel_mode}

    def append(self,ident,payload):
        if type(ident) is not int or ident<=0 or not isinstance(payload,dict) or set(payload)!={
                'latitude','longitude','accuracy_m','fix_age_seconds','observed_utc','source_device'}:
            raise ValueError('Invalid browser position payload')
        if payload['source_device']!='BROWSER_GEOLOCATION':
            raise ValueError('Only explicitly requested browser positions are accepted')
        fields={}
        for name,minimum,maximum in (('latitude',-90,90),('longitude',-180,180),
                                      ('accuracy_m',0,100),('fix_age_seconds',0,30)):
            value=payload[name]
            if type(value) not in (int,float) or not math.isfinite(value) or not minimum<=value<=maximum:
                raise ValueError(f'Invalid or inaccurate browser position: {name}')
            fields[name]=float(value)
        observed=payload['observed_utc']
        try:
            if not isinstance(observed,str) or len(observed)>40:
                raise ValueError()
            date=datetime.fromisoformat(observed.replace('Z','+00:00'))
            if date.tzinfo is None or abs((datetime.now(timezone.utc)-date).total_seconds())>65:
                raise ValueError()
        except (ValueError,TypeError):
            raise ValueError('Browser fix UTC is missing or stale') from None
        now=_utc()
        with self.lock,self._connect() as db:
            session=db.execute('SELECT state FROM breadcrumb_sessions WHERE id=?',(ident,)).fetchone()
            if not session or session['state']!='RECORDING':
                raise ValueError('Track is stopped or does not exist')
            row=db.execute('SELECT COUNT(*) AS total FROM breadcrumb_points WHERE session_id=?',(ident,)).fetchone()
            if row['total']>=MAX_POINTS:
                raise ValueError('Maximum track points reached; stop and export this track')
            previous=db.execute('SELECT latitude,longitude,received_utc FROM breadcrumb_points WHERE session_id=? ORDER BY id DESC LIMIT 1',(ident,)).fetchone()
            if previous:
                seconds=(datetime.fromisoformat(now)-datetime.fromisoformat(previous['received_utc'])).total_seconds()
                meters=_distance((previous['latitude'],previous['longitude']),(fields['latitude'],fields['longitude']))
                if seconds<3 or meters<3:
                    return {'saved':False,'reason':'TOO_FREQUENT_OR_CLOSE','point_count':row['total']}
                if meters/max(seconds,1)>45:
                    raise ValueError('Impossible jump detected; point rejected')
            db.execute('''INSERT INTO breadcrumb_points(session_id,received_utc,observed_utc,
                latitude,longitude,accuracy_m,fix_age_seconds) VALUES (?,?,?,?,?,?,?)''',
                (ident,now,observed,fields['latitude'],fields['longitude'],fields['accuracy_m'],fields['fix_age_seconds']))
            return {'saved':True,'point_count':row['total']+1,'received_utc':now}

    def stop(self,ident):
        with self.lock,self._connect() as db:
            cursor=db.execute("UPDATE breadcrumb_sessions SET state='STOPPED',stopped_utc=? WHERE id=? AND state='RECORDING'",(_utc(),ident))
            return bool(cursor.rowcount)

    def delete(self,ident):
        with self.lock,self._connect() as db:
            session=db.execute('SELECT state FROM breadcrumb_sessions WHERE id=?',(ident,)).fetchone()
            if not session or session['state']=='RECORDING':
                return False
            db.execute('DELETE FROM breadcrumb_points WHERE session_id=?',(ident,))
            db.execute('DELETE FROM breadcrumb_sessions WHERE id=?',(ident,))
            return True

    def geometry(self,ident):
        with self.lock,self._connect() as db:
            session=db.execute('SELECT * FROM breadcrumb_sessions WHERE id=?',(ident,)).fetchone()
            if not session:
                raise ValueError('Unknown track ID')
            points=[dict(row) for row in db.execute('''SELECT observed_utc,received_utc,latitude,longitude,
                accuracy_m,fix_age_seconds FROM breadcrumb_points WHERE session_id=? ORDER BY id LIMIT ?''',(ident,MAX_POINTS))]
        length=sum(_distance((a['latitude'],a['longitude']),(b['latitude'],b['longitude']))
                   for a,b in zip(points,points[1:]))
        return {'session':dict(session),'points':points,'distance_m':round(length),
                'point_count':len(points),'source':'BROWSER_REPORTED_UNVERIFIED',
                'warning':'Historical reported positions only. Track is not a verified safe or navigable route.'}

    def geojson(self,ident):
        data=self.geometry(ident)
        return {'type':'FeatureCollection','features':[{'type':'Feature',
            'geometry':{'type':'LineString','coordinates':[[p['longitude'],p['latitude']] for p in data['points']]},
            'properties':{'label':data['session']['label'],'state':data['session']['state'],
                'travel_mode':data['session']['travel_mode'],
                'source':'BROWSER_REPORTED_UNVERIFIED','point_count':data['point_count'],
                'distance_m':data['distance_m'],'warning':data['warning']}}]}

    def gpx(self,ident):
        """Interoperable, explicitly exported GPX with browser-position provenance."""
        data=self.geometry(ident)
        label=escape(data['session']['label'])
        mode='Driving' if data['session']['travel_mode']=='auto' else 'Walking'
        # Do not present browser-reported accuracy as genuine GNSS DOP.
        points=''.join(
            f'<trkpt lat="{p["latitude"]:.8f}" lon="{p["longitude"]:.8f}">'
            f'<time>{escape(p["observed_utc"])}</time>'
            f'<extensions><openrf:accuracy_m>{p["accuracy_m"]:.1f}</openrf:accuracy_m>'
            f'<openrf:fix_age_seconds>{p["fix_age_seconds"]:.1f}</openrf:fix_age_seconds>'
            f'</extensions></trkpt>' for p in data['points'])
        return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<gpx version="1.1" creator="OpenRF" '
                f'xmlns="http://www.topografix.com/GPX/1/1" xmlns:openrf="urn:openrf:breadcrumb:1">'
                f'<metadata><desc>Browser-reported unverified locations; not a surveyed safe trail.</desc></metadata>'
                f'<trk><name>{label}</name><type>{mode} browser geolocation history</type>'
                f'<trkseg>{points}</trkseg></trk></gpx>')
