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
import zipfile

from .fcc_coverage import open_pack, DDL, SOURCE

COMPACT_DDL=DDL.replace("user_version=1","user_version=2").replace("h3 TEXT","h3 INTEGER").replace(", UNIQUE(h3,geom)","")+"CREATE UNIQUE INDEX build_dedup ON shapes(h3,geom);"


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
        row=db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()
        if not row: raise ValueError("Missing coverage manifest")
        return json.loads(row[0])


def compact_target(folder,state):
    return Path(folder)/'compact-v2'/f'fcc-{state}-shared.sqlite3'


def compact_states(folder):
    # Include states that have no v1 pack at all. Inactive or invalid packs are
    # filtered by active_pack, not published merely because a file exists.
    return {p.name[4:6] for p in (Path(folder)/'compact-v2').glob('fcc-*-shared.active')
            if re.fullmatch(r'fcc-\d{2}-shared\.active',p.name)}


def validate_manifest(meta,state):
    if (not isinstance(meta,dict) or meta.get('format')!='openrf-fcc-h3'
            or meta.get('version')!=2 or meta.get('state')!=state
            or not isinstance(meta.get('originals'),list)
            or not isinstance(meta.get('layers'),list) or not meta['layers']
            or not all(isinstance(meta.get(k),str) and meta[k] for k in ('source','vintage','filing','saved_at'))):
        raise ValueError('Invalid compact pack manifest')
    for layer in meta['layers']:
        if (not isinstance(layer,dict) or not all(isinstance(layer.get(k),str) and layer[k] for k in ('carrier','technology','environment'))
                or not isinstance(layer.get('count'),int) or layer['count']<=0):
            raise ValueError('Invalid compact coverage profile')


def active_pack(folder,state,paths):
    """Legacy opt-in checks original stamps; standalone pins an explicit snapshot."""
    target=compact_target(folder,state); flag=target.with_suffix('.active')
    try:
        if not flag.is_file(): return None
        marker=json.loads(flag.read_text())
        if isinstance(marker,dict):
            if marker.get('mode')!='standalone' or marker.get('stamp')!=stamp(target): return None
        elif marker!=stamp(target): return None
        meta=manifest(target); validate_manifest(meta,state)
        if not isinstance(marker,dict) and meta['originals']!=[stamp(p) for p in paths]: return None
        return target,meta
    except (OSError,ValueError,KeyError,TypeError,sqlite3.Error): return None


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
            db.executescript(COMPACT_DDL)
            profiles={}; expected={}
            for path in paths:
                with open_pack(path) as old:
                    progress(f'Checking original {path.name}…')
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


def set_active(folder,state,enable,standalone=False,progress=lambda _:None):
    target=compact_target(folder,state); flag=target.with_suffix('.active')
    if not enable: flag.unlink(missing_ok=True); return
    progress('Reading compact manifest…')
    meta=manifest(target); validate_manifest(meta,state)
    current=[stamp(p) for p in originals(folder,state)]
    if standalone:
        # Existing originals may be removed, but a stale or newly added v1
        # pack must not accidentally be masked when opting in.
        if any(item not in meta['originals'] for item in current):
            raise ValueError('Original packs changed or were added; use a separate folder or rebuild before standalone activation')
    elif not meta['originals'] or meta['originals']!=current:
        raise ValueError('Compact pack is stale or standalone-only; use --standalone for a verified independent snapshot')
    initial=stamp(target)
    progress('Checking compact SQLite integrity (may take several minutes)…')
    with open_pack(target) as db:
        if db.execute('PRAGMA user_version').fetchone()!=(2,): raise ValueError('Invalid compact schema version')
        if db.execute('PRAGMA quick_check').fetchall()!=[('ok',)]: raise ValueError('Invalid compact pack')
        # Ensure all runtime tables are present without scanning millions of rows.
        for table,columns in [('shapes','id,h3,geom,vertices'),('profiles','id,carrier,brand,provider,technology,environment'),('membership','shape,profile'),('spatial','id,west,east,south,north')]:
            db.execute(f'SELECT {columns} FROM {table} LIMIT 0')
    if initial!=stamp(target) or current!=[stamp(p) for p in originals(folder,state)]: raise ValueError('Coverage files changed during activation')
    progress('Saving activation flag…')
    marker={'mode':'standalone','stamp':initial} if standalone else initial
    with tempfile.NamedTemporaryFile(mode='w',dir=target.parent,delete=False) as f:
        tmp=Path(f.name); json.dump(marker,f)
    try: os.replace(tmp,flag)
    finally: tmp.unlink(missing_ok=True)


def build_direct(folder,state,input_dir,preferred='auto',release=None,progress=print):
    """Build a new state directly from FCC ZIPs, without any v1 intermediates.

    Existing state packs are never replaced by this first direct-build path.
    Build to an isolated folder to benchmark or prepare a replacement.
    """
    from datetime import datetime, timezone
    from . import fcc_coverage as f
    folder=Path(folder); target=compact_target(folder,state)
    if target.exists() or originals(folder,state):
        raise ValueError('State already has coverage packs; direct build requires a new state or isolated --folder')
    groups=f.discover(input_dir,preferred)
    selected=f.select_groups(groups,state,release)
    # Match the v1 compiler default: prefer provider-specific sources; use
    # aggregate-only archives only when no provider files are available.
    if len({key[1:3] for key,_ in selected})!=1:
        raise ValueError('Selected source groups have different filing/release dates; specify a common --release')
    filing,vintage=selected[0][0][1:3]
    sources=[]; jobs=[]
    for key,files in selected:
        provider=key[3] if len(key)==4 else None
        for kind,path in sorted(files.items()):
            if f.source_identity(path)!=provider: raise ValueError('Source provider mismatch')
            progress(f'Preflight {path.name}…')
            total,_,_=f.inspect_zip(path,kind)
            jobs.append((provider,kind,path,total,stamp(path)))
    target.parent.mkdir(parents=True,exist_ok=True)
    start=time.monotonic()
    with tempfile.TemporaryDirectory(prefix='.direct-',dir=target.parent) as tmp:
        work=Path(tmp); dbpath=work/'pack.sqlite3'
        with closing(sqlite3.connect(dbpath)) as db:
            db.execute('PRAGMA synchronous=NORMAL'); db.execute('PRAGMA temp_store=FILE'); db.executescript(COMPACT_DDL)
            profiles={}
            for provider,kind,path,expected,source_stamp in jobs:
                progress(f'Extracting {path.name}…')
                count=0
                with f.source_rows(path,work,kind) as (total,names,records,transform,members,fmt):
                    if total!=expected: raise ValueError('Source row count changed since preflight')
                    for row,geometry in records:
                        count+=1
                        try:
                            cell,*profile=f.attributes(row,kind,provider); profile=tuple(profile)
                            pid=profiles.get(profile)
                            if pid is None:
                                pid=db.execute('INSERT INTO profiles(carrier,brand,provider,technology,environment) VALUES (?,?,?,?,?)',profile).lastrowid
                                profiles[profile]=pid
                            for w,s,e,n,v,rings in f.polygon_parts(geometry,transform,encode_geometry=lambda x:x):
                                raw=encode(rings)
                                if decode(raw)!=rings: raise ValueError('Geometry round-trip mismatch')
                                h3=int(cell,16)
                                cur=db.execute('INSERT OR IGNORE INTO shapes(h3,geom,vertices) VALUES (?,?,?)',(h3,raw,v))
                                if cur.rowcount:
                                    sid=cur.lastrowid; db.execute('INSERT INTO spatial VALUES (?,?,?,?,?)',(sid,w,e,s,n))
                                else: sid=db.execute('SELECT id FROM shapes WHERE h3=? AND geom=?',(h3,raw)).fetchone()[0]
                                db.execute('INSERT OR IGNORE INTO membership VALUES (?,?)',(pid,sid))
                        except Exception as exc: raise ValueError(f'{path.name}, source row {count}: {exc}') from exc
                        if count%25000==0:
                            db.commit(); progress(f'{path.name}: {count:,}/{total:,} rows ({100*count/total:.1f}%)')
                if count!=expected or stamp(path)!=source_stamp: raise ValueError('Source changed or incomplete; no pack installed')
                db.commit(); progress(f'{path.name}: {count:,}/{expected:,} rows (100%)')
                sources.append(dict(file=path.name,rows=count,bytes=source_stamp[1],format=fmt,members=members,provider_id=provider))
            meta=dict(format='openrf-fcc-h3',version=2,state=state,provider_id=None,filing=filing,vintage=vintage,source=SOURCE,saved_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),layers=layers(db),originals=[],sources=sources,geometry='delta-varint exact v1 coordinate precision')
            validate_manifest(meta,state)
            db.execute('INSERT INTO metadata VALUES (?,?)',('manifest',json.dumps(meta)))
            db.execute('DROP INDEX build_dedup'); db.commit()
            progress('Compacting database and validating…'); db.execute('VACUUM')
            if db.execute('PRAGMA quick_check').fetchall()!=[('ok',)]: raise ValueError('Compact pack validation failed')
        if target.exists() or originals(folder,state): raise ValueError('State packs appeared during build; refusing to overwrite')
        if any(stamp(path)!=source_stamp for _,_,path,_,source_stamp in jobs): raise ValueError('Source files changed during build')
        # Hard link is atomic and refuses a concurrent destination. Both files
        # are on the same filesystem (including NTFS through WSL).
        os.link(dbpath,target)
    progress(f'{target}: {target.stat().st_size:,} bytes · elapsed {time.monotonic()-start:.1f}s')
    progress('Use activate --standalone to enable the new state pack.')
    return target


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['build','build-direct','activate','deactivate','status'])
    p.add_argument('--state',required=True); p.add_argument('--folder',type=Path,default=Path.home()/'.local/share/openrf/fcc-coverage')
    p.add_argument('--standalone',action='store_true',help='Pin the validated compact snapshot without requiring original packs')
    p.add_argument('--input-dir',type=Path); p.add_argument('--format',choices=['auto','shapefile','geopackage'],default='auto'); p.add_argument('--release')
    a=p.parse_args()
    if not re.fullmatch(r'\d{2}',a.state): p.error('Two-digit state FIPS required')
    if a.standalone and a.command!='activate': p.error('--standalone is only for activate')
    if a.command=='build-direct' and not a.input_dir: p.error('build-direct requires --input-dir')
    def progress(msg): print(msg,flush=True)
    try:
        if a.command=='build': optimize(a.folder,a.state,progress)
        elif a.command=='build-direct': build_direct(a.folder,a.state,a.input_dir,a.format,a.release,progress)
        elif a.command=='status':
            paths=originals(a.folder,a.state); active=active_pack(a.folder,a.state,paths)
            if active:
                target,meta=active; marker=json.loads(target.with_suffix('.active').read_text()); mode='standalone' if isinstance(marker,dict) else 'original-linked'
                print(f'Active compact coverage: {mode} · {target} · {len(meta["layers"])} profiles · {len(paths)} original pack(s) present')
            else: print(f'Compact coverage not active; {len(paths)} original pack(s) present')
        else:
            set_active(a.folder,a.state,a.command=='activate',a.standalone,progress)
            print('Compact coverage '+('enabled (standalone)' if a.standalone else 'enabled' if a.command=='activate' else 'disabled')+'; reload saved cellular data.')
        return 0
    except (OSError,ValueError,sqlite3.Error,KeyError,TypeError,RuntimeError,ImportError,zipfile.BadZipFile) as e:
        print(f'Coverage optimizer stopped: {e}. Original packs retained.',flush=True); return 1

if __name__=='__main__': raise SystemExit(main())
