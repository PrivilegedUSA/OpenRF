"""Private, local GPX trail references. Imported geometry is never a live location fix."""
from __future__ import annotations

import json
import math
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

MAX_TRAILS = 50
MAX_POINTS = 5000
MAX_SEGMENTS = 100
MAX_GPX_BYTES = 500_000


def _tag(element):
    return element.tag.rsplit('}', 1)[-1] if isinstance(element.tag, str) else ''


def _meters(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    dlat, dlon = lat2-lat1, lon2-lon1
    sin2 = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 12742000*math.asin(min(1, math.sqrt(sin2)))


def parse_gpx(xml):
    """Extract GPX track/route segments only; never connect segment gaps."""
    if not isinstance(xml, str) or not xml.strip():
        raise ValueError('Select a nonempty GPX file')
    if len(xml.encode('utf-8')) > MAX_GPX_BYTES:
        raise ValueError('GPX exceeds 500 kB local import limit')
    if '<!doctype' in xml.lower() or '<!entity' in xml.lower():
        raise ValueError('GPX entity declarations and DTDs are not supported')
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as exc:
        raise ValueError('GPX is malformed XML') from exc
    if _tag(root) != 'gpx':
        raise ValueError('Expected a GPX file, not another XML format')
    groups = []
    count = 0
    for item in root:
        if _tag(item) == 'trk':
            candidates = [segment for segment in item if _tag(segment) == 'trkseg']
            point_tag = 'trkpt'
        elif _tag(item) == 'rte':
            candidates = [item]
            point_tag = 'rtept'
        else:
            continue
        for segment in candidates:
            points = []
            for element in segment:
                if _tag(element) != point_tag:
                    continue
                try:
                    latitude, longitude = float(element.attrib['lat']), float(element.attrib['lon'])
                except (TypeError, ValueError, KeyError) as exc:
                    raise ValueError('GPX contains missing or invalid coordinates') from exc
                if (not math.isfinite(latitude) or not math.isfinite(longitude) or
                        not -90 <= latitude <= 90 or not -180 <= longitude <= 180):
                    raise ValueError('GPX coordinate is outside the Earth')
                count += 1
                if count > MAX_POINTS:
                    raise ValueError('GPX exceeds 5,000 points per imported trail')
                points.append([round(longitude, 7), round(latitude, 7)])
            if len(points) >= 2:
                groups.append(points)
                if len(groups) > MAX_SEGMENTS:
                    raise ValueError('GPX exceeds 100 separate trail segments')
    if not groups:
        raise ValueError('GPX must contain a route or a track segment with at least two positions')
    distance = sum(_meters(a, b) for segment in groups for a, b in zip(segment, segment[1:]))
    all_points = [point for segment in groups for point in segment]
    bounds = [min(p[0] for p in all_points), min(p[1] for p in all_points),
              max(p[0] for p in all_points), max(p[1] for p in all_points)]
    return {'segments':groups, 'point_count':len(all_points),
            'distance_m':round(distance), 'bounds':bounds}


class TrailStore:
    """Separate local SQLite store; offline files do not inflate the emergency backup."""
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        with closing(self._connect()) as db, db:
            db.execute('''CREATE TABLE IF NOT EXISTS imported_trails (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                attribution TEXT NOT NULL, added_utc TEXT NOT NULL,
                segments_json TEXT NOT NULL, bounds_json TEXT NOT NULL,
                point_count INTEGER NOT NULL, distance_m INTEGER NOT NULL)''')

    def _connect(self):
        db = sqlite3.connect(str(self.path), timeout=5)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def _summary(row):
        return {'id':row['id'], 'name':row['name'], 'attribution':row['attribution'],
                'added_utc':row['added_utc'], 'point_count':row['point_count'],
                'distance_m':row['distance_m'], 'bounds':json.loads(row['bounds_json']),
                'source':'USER_IMPORTED_GPX_UNVERIFIED'}

    def list(self):
        with self.lock, closing(self._connect()) as db:
            rows = db.execute('''SELECT id,name,attribution,added_utc,point_count,distance_m,bounds_json
                FROM imported_trails ORDER BY id DESC LIMIT ?''', (MAX_TRAILS,)).fetchall()
        return [self._summary(row) for row in rows]

    def import_gpx(self, payload):
        if not isinstance(payload, dict) or set(payload) != {'name','attribution','gpx'}:
            raise ValueError('Import requires trail name, source attribution and GPX file contents')
        name, attribution = payload['name'], payload['attribution']
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
            raise ValueError('Trail name must be 1–100 characters')
        if not isinstance(attribution, str) or not 1 <= len(attribution.strip()) <= 240:
            raise ValueError('Enter the original trail source or creator (1–240 characters)')
        parsed = parse_gpx(payload['gpx'])
        stamp = datetime.now(timezone.utc).isoformat(timespec='seconds')
        with self.lock, closing(self._connect()) as db, db:
            if db.execute('SELECT COUNT(*) FROM imported_trails').fetchone()[0] >= MAX_TRAILS:
                raise ValueError('Offline trail limit reached. Export or remove an old trail first')
            cursor = db.execute('''INSERT INTO imported_trails
                (name,attribution,added_utc,segments_json,bounds_json,point_count,distance_m)
                VALUES (?,?,?,?,?,?,?)''', (name.strip(),attribution.strip(),stamp,
                json.dumps(parsed['segments'],separators=(',',':')),
                json.dumps(parsed['bounds']),parsed['point_count'],parsed['distance_m']))
            return {'id':cursor.lastrowid,'name':name.strip(),'attribution':attribution.strip(),
                'added_utc':stamp,'point_count':parsed['point_count'],
                'distance_m':parsed['distance_m'],'bounds':parsed['bounds'],
                'source':'USER_IMPORTED_GPX_UNVERIFIED'}

    def get(self, ident):
        if type(ident) is not int or ident < 1:
            raise ValueError('Invalid offline trail ID')
        with self.lock, closing(self._connect()) as db:
            row = db.execute('SELECT * FROM imported_trails WHERE id=?', (ident,)).fetchone()
        if not row:
            raise ValueError('Offline trail not found')
        return {**self._summary(row),'segments':json.loads(row['segments_json']),
                'warning':'User-imported GPX path. Not verified as an accessible or safe hiking trail.'}

    def geojson(self, ident):
        data = self.get(ident)
        geometry = ({'type':'LineString','coordinates':data['segments'][0]} if len(data['segments']) == 1
                    else {'type':'MultiLineString','coordinates':data['segments']})
        return {'type':'FeatureCollection','features':[{'type':'Feature','geometry':geometry,
            'properties':{'name':data['name'],'attribution':data['attribution'],
                'source':data['source'],'distance_m':data['distance_m'],
                'warning':data['warning']}}]}

    def delete(self, ident):
        if type(ident) is not int or ident < 1:
            raise ValueError('Invalid offline trail ID')
        with self.lock, closing(self._connect()) as db, db:
            return bool(db.execute('DELETE FROM imported_trails WHERE id=?', (ident,)).rowcount)
