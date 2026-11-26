"""Lossless shared FCC coverage packs. Original v1 packs are never modified.

Compact integer H3 keys and delta-coded coordinates preserve the existing v1
seven-decimal geometry, including clipped cells and holes. No H3 runtime needed.
"""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import time
import zlib

from .fcc_coverage import open_pack, DDL, SOURCE


def encode(rings):
    out=bytearray()
    def put(n):
        n=2*n if n>=0 else -2*n-1
        while n>=128:
            out.append((n&127)|128); n>>=7
        out.append(n)
    put(len(rings))
    for ring in rings:
        put(len(ring)); x=y=0
        for a,b in ring:
            nx,ny=round(a*10**7),round(b*10**7)
            put(nx-x); put(ny-y); x,y=nx,ny
    return bytes(out)


def decode(raw):
    pos=0
    def get():
        nonlocal pos
        n=shift=0
        while pos<len(raw) and shift<=63:
            v=raw[pos]; pos+=1; n|=(v&127)<<shift
            if v<128: return n//2 if n%2==0 else -(n//2)-1
            shift+=7
        raise ValueError('Invalid compact geometry')
    nr=get(); rings=[]
    if not 1<=nr<=len(raw): raise ValueError('Invalid ring count')
    for _ in range(nr):
        length=get(); x=y=0; ring=[]
        if not 4<=length<=len(raw)//2: raise ValueError('Invalid ring length')
        for _ in range(length):
            x+=get(); y+=get(); ring.append([x/10**7,y/10**7])
        if ring[0]!=ring[-1]: raise ValueError('Unclosed compact ring')
        rings.append(ring)
    if pos!=len(raw): raise ValueError('Trailing compact geometry data')
    return rings


def stamp(path):
    st=path.stat()
    return [path.name,st.st_size,st.st_mtime_ns,st.st_ino,st.st_dev]


def originals(folder,state):
    return sorted(p for p in Path(folder).glob(f'fcc-{state}*.sqlite3') if re.fullmatch(r'fcc-'+state+r'(?:-\d{6})?\.sqlite3',p.name))


def manifest(path):
    with open_pack(path) as db:
        return json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0])


def active_pack(folder,state,paths):
    """Opt-in only, automatically fall back to current originals on any change."""
    target=Path(folder)/'compact-v2'/f'fcc-{state}-shared.sqlite3'
    flag=target.with_suffix('.active')
    try:
        if not flag.is_file(): return None
        meta=manifest(target)
        if meta['format']!='openrf-fcc-h3' or meta['version']!=2 or meta['state']!=state: return None
        if meta['originals']!=[stamp(p) for p in paths]: return None
        if json.loads(flag.read_text())!=stamp(target): return None
        return target,meta
    except (OSError,ValueError,KeyError,sqlite3.Error): return None


def layers(db):
    out=[]
    for c,t,e,n in db.execute('SELECT p.carrier,p.technology,p.environment,count(DISTINCT m.shape) FROM profiles p JOIN membership m ON p.id=m.profile GROUP BY 1,2,3 ORDER BY 1,2,3'):
        out.append(dict(carrier=c,technology=t,environment=e,count=n))
    for c,t,n in db.execute('SELECT p.carrier,p.technology,count(DISTINCT m.shape) FROM profiles p JOIN membership m ON p.id=m.profile GROUP BY 1,2 ORDER BY 1,2'):
        out.append(dict(carrier=c,technology=t,environment='Outdoor stationary (all)',count=n))
    return out


def optimize(folder,state,progress=print):
    folder=Path(folder); paths=originals(folder,state)
    if not paths: raise ValueError('No original state coverage packs')
    stamps=[stamp(p) for p in paths]; metas=[manifest(p) for p in paths]
    if any(m['version']!=1 or m['format']!='openrf-fcc-h3' or m['state']!=state for m in metas): raise ValueError('Expected original v1 state packs')
    if len({(m['filing'],m['vintage']) for m in metas})!=1: raise ValueError('State packs have different filing/release dates; refusing to merge')
    dest=folder/'compact-v2'; dest.mkdir(exist_ok=True)
    target=dest/f'fcc-{state}-shared.sqlite3'
    started=time.monotonic(); original_bytes=sum(p.stat().st_size for p in paths)
    with tempfile.TemporaryDirectory(prefix='.optimize-',dir=dest) as tmp:
        working=Path(tmp)/'pack.sqlite3'
        with closing(sqlite3.connect(working)) as db:
            db.execute('PRAGMA synchronous=NORMAL'); db.execute('PRAGMA temp_store=FILE')
            ddl=DDL.replace('user_version=1','user_version=2').replace('h3 TEXT','h3 INTEGER').replace(', UNIQUE(h3,geom)','')
            db.executescript(ddl+'CREATE UNIQUE INDEX build_dedup ON shapes(h3,geom);')
            profiles={}; expected={}
            for path in paths:
                with open_pack(path) as old:
                    if old.execute('PRAGMA quick_check').fetchone()!=('ok',): raise ValueError('Invalid original pack '+path.name)
                    ids={}
                    for pid,*fields in old.execute('SELECT id,carrier,brand,provider,technology,environment FROM profiles'):
                        key=tuple(fields)
                        if key in profiles: raise ValueError('Duplicate profile in multiple originals; refusing ambiguous merge')
                        new=db.execute('INSERT INTO profiles(carrier,brand,provider,technology,environment) VALUES (?,?,?,?,?)',key).lastrowid
                        profiles[key]=new; ids[pid]=new
                        expected[new]=old.execute('SELECT count(*) FROM membership WHERE profile=?',(pid,)).fetchone()[0]
                    total=old.execute('SELECT count(*) FROM shapes').fetchone()[0]
                    # Stream shapes and their memberships in shape order; no state-sized Python arrays.
                    rows=old.execute('''SELECT g.id,g.h3,g.geom,g.vertices,r.west,r.east,r.south,r.north,
                        (SELECT group_concat(profile) FROM membership WHERE shape=g.id)
                        FROM shapes g JOIN spatial r ON r.id=g.id ORDER BY g.id''')
                    count=0
                    for _,cell,raw,v,w,e,s,n,members in rows:
                        rings=json.loads(zlib.decompress(raw)); compact=encode(rings)
                        if decode(compact)!=rings or sum(map(len,rings))!=v: raise ValueError('Geometry round-trip mismatch')
                        if not re.fullmatch(r'89[0-9a-f]{13}',cell): raise ValueError('Invalid source H3 key')
                        cur=db.execute('INSERT OR IGNORE INTO shapes(h3,geom,vertices) VALUES (?,?,?)',(int(cell,16),compact,v))
                        if cur.rowcount:
                            sid=cur.lastrowid; db.execute('INSERT INTO spatial VALUES (?,?,?,?,?)',(sid,w,e,s,n))
                        else:
                            sid=db.execute('SELECT id FROM shapes WHERE h3=? AND geom=?',(int(cell,16),compact)).fetchone()[0]
                            if db.execute('SELECT west,east,south,north FROM spatial WHERE id=?',(sid,)).fetchone()!=(w,e,s,n): raise ValueError('Shared geometry bounds mismatch')
                        if not members: raise ValueError('Source geometry has no coverage membership')
                        db.executemany('INSERT INTO membership VALUES (?,?)',((ids[int(i)],sid) for i in members.split(',')))
                        count+=1
                        if count%25000==0:
                            db.commit(); progress(f'{path.name}: {count:,}/{total:,} shapes ({100*count/total:.1f}%)')
                    if count!=total: raise ValueError('Source shape count mismatch')
                    db.commit(); progress(f'{path.name}: {count:,}/{total:,} shapes (100%) verified')
            actual=dict(db.execute('SELECT profile,count(*) FROM membership GROUP BY profile'))
            if actual!={k:v for k,v in expected.items() if v}: raise ValueError('Coverage profile membership count mismatch')
            meta={'format':'openrf-fcc-h3','version':2,'state':state,'provider_id':None,'filing':metas[0]['filing'],'vintage':metas[0]['vintage'],'source':SOURCE,'saved_at':max(m['saved_at'] for m in metas),'layers':layers(db),'originals':stamps,'source_manifests':metas,'geometry':'delta-varint exact v1 coordinate precision'}
            db.execute('INSERT INTO metadata VALUES (?,?)',('manifest',json.dumps(meta)))
            db.execute('DROP INDEX build_dedup'); db.commit()
            progress('Compacting database and validating…'); db.execute('VACUUM')
            if db.execute('PRAGMA quick_check').fetchone()!=('ok',): raise ValueError('Compact pack validation failed')
        if stamps!=[stamp(p) for p in originals(folder,state)]: raise ValueError('Original packs changed during optimization')
        os.replace(working,target)
    size=target.stat().st_size
    progress(f'Originals: {original_bytes:,} bytes; compact: {size:,} bytes; reduction: {100*(1-size/original_bytes):.1f}%; elapsed: {time.monotonic()-started:.1f}s')
    digest=hashlib.sha256()
    with target.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): digest.update(block)
    progress(f'{target}\nSHA-256 {digest.hexdigest()}\nOriginals retained. Use activate to test on the map.')
    return target


def set_active(folder,state,enable):
    target=Path(folder)/'compact-v2'/f'fcc-{state}-shared.sqlite3'; flag=target.with_suffix('.active')
    if not enable: flag.unlink(missing_ok=True); return
    meta=manifest(target)
    if meta['originals']!=[stamp(p) for p in originals(folder,state)]: raise ValueError('Compact pack is stale; optimize again')
    if meta['version']!=2 or meta['state']!=state: raise ValueError('Invalid compact pack')
    with open_pack(target) as db:
        if db.execute('PRAGMA quick_check').fetchone()!=('ok',): raise ValueError('Invalid compact pack')
    with tempfile.NamedTemporaryFile(mode='w',dir=target.parent,delete=False) as f:
        tmp=Path(f.name); json.dump(stamp(target),f)
    try: os.replace(tmp,flag)
    finally: tmp.unlink(missing_ok=True)


def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('command',choices=['build','activate','deactivate']); p.add_argument('--state',required=True); p.add_argument('--folder',type=Path,default=Path.home()/'.local/share/openrf/fcc-coverage'); a=p.parse_args()
    if not re.fullmatch(r'\d{2}',a.state): p.error('Two-digit state FIPS required')
    try:
        if a.command=='build': optimize(a.folder,a.state,lambda msg:print(msg,flush=True))
        else: set_active(a.folder,a.state,a.command=='activate'); print('Compact coverage '+('enabled' if a.command=='activate' else 'disabled')+'; reload saved cellular data.')
        return 0
    except (OSError,ValueError,sqlite3.Error,KeyError) as e:
        print(f'Coverage optimizer stopped: {e}. Original packs retained.',flush=True); return 1

if __name__=='__main__': raise SystemExit(main())
