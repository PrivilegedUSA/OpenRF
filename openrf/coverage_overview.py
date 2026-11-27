"""Bounded multiscale display of FCC coverage reports from existing offline packs.

Overview bins count reported H3 cells whose polygon bounding-box centers fall
inside a grid cell. They do not assert coverage throughout that square or a
coverage probability. Shading scales with nominal H3 area density. Detailed geometry remains authoritative at local scales.
Derived caches are disposable, source-fingerprinted and atomically published.
"""
from collections import defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import tempfile
import threading

from .fcc_coverage import open_pack

BASE = 128  # cells per degree; grid is anchored at (-180, -90)
MAX_CELLS = 18000
_LOCK = threading.Lock()


def wide_view(bounds):
    w,s,e,n=bounds
    return max((e-w) if e>=w else (e-w+360),n-s)>4


def _fingerprint(path):
    st=path.stat()
    return [st.st_size,st.st_mtime_ns,st.st_ino,st.st_dev]


def _base_cells(path, layer):
    path=Path(path)
    key=[layer[k] for k in ('carrier','technology','environment')]
    token=hashlib.sha256(json.dumps([path.name,key]).encode()).hexdigest()[:24]
    folder=path.parent/'.overview-v2'
    cache=folder/(token+'.json')
    with _LOCK:
        stamp=_fingerprint(path)
        try:
            saved=json.loads(cache.read_text())
            if saved['source']==stamp and saved['profile']==key:
                return saved['cells']
        except (OSError,ValueError,KeyError,TypeError): pass
        with open_pack(path) as db:
            all_outdoor=key[2]=='Outdoor stationary (all)'
            env='' if all_outdoor else ' AND p.environment=?'
            # Group unique source H3 IDs in each base cell. R-tree bounds are
            # sufficient for the overview; no geometry decompression needed.
            rows=db.execute(f'''SELECT CAST((r.west+r.east+360)*64 AS INTEGER) AS x,
                CAST((r.south+r.north+180)*64 AS INTEGER) AS y, count(DISTINCT g.h3)
                FROM profiles p JOIN membership m ON m.profile=p.id
                JOIN shapes g ON g.id=m.shape JOIN spatial r ON r.id=g.id
                WHERE p.carrier=? AND p.technology=?{env}
                GROUP BY x,y''',key[:2] if all_outdoor else key).fetchall()
        # An atomic pack replacement during the query invalidates this result.
        if _fingerprint(path)!=stamp:
            raise OSError('FCC pack changed while preparing overview; reload saved data')
        cells=[[min(360*BASE-1,max(0,x)),min(180*BASE-1,max(0,y)),count] for x,y,count in rows]
        tmp=None
        try:
            folder.mkdir(exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w',dir=folder,prefix='.build-',delete=False) as out:
                tmp=Path(out.name)
                json.dump({'source':stamp,'profile':key,'cells':cells},out,separators=(',',':'))
            os.replace(tmp,cache)
        except OSError:
            # Read-only installations can still display a freshly computed view.
            pass
        finally:
            if tmp is not None: tmp.unlink(missing_ok=True)
        return cells


def _intersects(w,s,e,n,bounds):
    bw,bs,be,bn=bounds
    return s<=bn and n>=bs and ((w<=be and e>=bw) if bw<=be else (e>=bw or w<=be))


def _has_spatial_candidates(path,bounds):
    w,s,e,n=bounds
    lon='west<=? AND east>=?' if w<=e else '(east>=? OR west<=?)'
    args=(e,w) if w<=e else (w,e)
    with open_pack(path) as db:
        return db.execute(f'SELECT 1 FROM spatial WHERE south<=? AND north>=? AND {lon} LIMIT 1',(n,s,*args)).fetchone() is not None


def overview(packs,bounds,budget):
    """Return bounded display polygons and grid size; never alter source packs."""
    limit=min(MAX_CELLS,budget//5)
    if limit<1: return None, None
    w,s,e,n=bounds
    span=max(e-w if e>=w else e-w+360,n-s)
    factor=1
    while span*BASE/factor>300: factor*=2
    sources=[]
    for path,layer in packs:
        if _has_spatial_candidates(path,bounds): sources.append(_base_cells(path,layer))
    while True:
        bins=defaultdict(int)
        step=factor/BASE
        for cells in sources:
            for x,y,count in cells:
                ix,iy=x//factor,y//factor
                west=ix*step-180; south=iy*step-90
                east=min(180,west+step); north=min(90,south+step)
                if _intersects(west,south,east,north,bounds): bins[ix,iy]+=count
        if len(bins)<=limit: break
        factor*=2
    polygons=[]
    for (ix,iy),count in sorted(bins.items()):
        west=ix*step-180; south=iy*step-90
        east=min(180,west+step); north=min(90,south+step)
        # Nominal H3 resolution-9 cell area (km²), divided by geographic
        # bin area. Center assignment and variable H3 areas make this an
        # approximate density proxy, NOT an exact area fraction or service
        # probability. No minimum fill for sparse bins.
        area=6371.0088**2*math.radians(east-west)*abs(math.sin(math.radians(north))-math.sin(math.radians(south)))
        density=min(1.0,count*0.1053325/max(area,1e-12))
        opacity=round(0.38*density,6)
        polygons.append({'polygon':[[[west,south],[east,south],[east,north],[west,north],[west,south]]],
                         'overview':True,'reports':count,'density':density,'opacity':opacity})
    return polygons,step
