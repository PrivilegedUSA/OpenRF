"""Compile local FCC state H3 shapefile or GeoPackage ZIPs into indexed offline coverage packs.

Only the compiler needs PyShp/pyproj or Shapely/pyproj. The map reader uses the stdlib.
No network requests, extraction of arbitrary paths, or changes to source files.
"""
from __future__ import annotations
import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import struct
import tempfile
import zipfile
import zlib

PATTERN = re.compile(r'bdc_(\d{2})_(?:(\d{6})_)?(4GLTE|5GNR(?:_7_1|_35_3)?|MobileVoice)_mobile_(?:broadband|voice)_h3_([JD]\d{2})_(\d{1,2}[a-z]{3}\d{4})(?:[-_ ]?geo(?:package)?|[-_ ]?gpkg)?(?:\s*\(\d+\))?\.zip', re.I)
# FCC provider/holding-company identifiers, not MCC/MNC identifiers.
# https://docs.fcc.gov/public/attachments/FCC-20-40A1.pdf
PROVIDERS = {'130077': ('att','AT&T'), '130403': ('tmobile','T-Mobile'), '131425': ('verizon','Verizon')}

def source_identity(path):
    match=PATTERN.fullmatch(Path(path).name)
    return match.group(2) if match else None

def base_kind(kind):
    return kind.split('_',1)[0]

SOURCE = 'FCC BDC H3 resolution 9 (provider-modeled; not measured reception)'
SCHEMA = 1


def archive_format(path):
    with zipfile.ZipFile(path) as z:
        gpkg=[i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith('.gpkg')]
        shp=[i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith('.shp')]
        if len(gpkg)==1 and not shp: return 'geopackage'
        if len(shp)==1 and not gpkg: return 'shapefile'
        raise ValueError('Expected one H3 GeoPackage or shapefile')


def discover(folder, preferred='auto'):
    groups = {}
    for path in sorted(Path(folder).iterdir()):
        m = PATTERN.fullmatch(path.name)
        if not m or not path.is_file(): continue
        state, provider, kind, filing, release = m.groups()
        date = datetime.strptime(release,'%d%b%Y').date().isoformat()
        key=(state,filing.upper(),date)+((provider,) if provider else ())
        group = groups.setdefault(key,{})
        kind=kind.lower()
        if preferred!='auto':
            try:
                if archive_format(path)!=preferred: continue
            except (ValueError,zipfile.BadZipFile):
                continue
        if kind in group:
            old=group[kind]
            try: old_fmt=archive_format(old)
            except (ValueError,zipfile.BadZipFile): old_fmt='invalid'
            try: new_fmt=archive_format(path)
            except (ValueError,zipfile.BadZipFile): new_fmt='invalid'
            if old_fmt==new_fmt: raise ValueError('Ambiguous duplicate archives; keep one copy per format: '+str((old.name,path.name)))
            if old_fmt=='shapefile' or new_fmt=='invalid' or (old_fmt=='geopackage' and new_fmt!='shapefile'): continue
        group[kind] = path
    return {k:v for k,v in groups.items() if v}


def auto_folder():
    options = [Path.home()/'Downloads', *Path('/mnt/c/Users').glob('*/Downloads')]
    found = [p for p in options if p.is_dir() and discover(p)]
    if len(found)!=1: raise ValueError('Cannot identify a single FCC Downloads folder; use --input-dir PATH. Found: '+str(found))
    return found[0]


def matching_groups(groups, state=None, release=None, provider=None, aggregate=False):
    matches={k:v for k,v in groups.items() if (not state or k[0]==state) and (not release or k[2]==release)}
    if provider: return {k:v for k,v in matches.items() if len(k)==4 and k[3]==provider}
    if aggregate: return {k:v for k,v in matches.items() if len(k)==3}
    # Prefer provider-specific data when available, but retain aggregate-only states.
    states={k[0] for k in matches if len(k)==4}
    return {k:v for k,v in matches.items() if len(k)==4 or k[0] not in states}


def select_groups(groups, state=None, release=None, provider=None, aggregate=False):
    selected={}
    for key,files in sorted(matching_groups(groups,state,release,provider,aggregate).items(),key=lambda item:item[0][2]):
        selected[(key[0],key[3] if len(key)==4 else '')]=(key,files)
    if not selected: raise ValueError('No matching FCC H3 archives found')
    return list(selected.values())


def members(z):
    shp = [i for i in z.infolist() if i.filename.lower().endswith('.shp') and not i.is_dir()]
    if len(shp)!=1: raise ValueError('Expected exactly one shapefile in FCC ZIP')
    stem=shp[0].filename[:-4].casefold()
    out={}
    for i in z.infolist():
        base,ext=os.path.splitext(i.filename.casefold())
        if base==stem and ext in ('.shp','.shx','.dbf','.prj','.cpg'):
            if ext in out: raise ValueError('Duplicate shapefile component '+ext)
            out[ext]=i
    if not {'.shp','.shx','.dbf','.prj'}<=out.keys(): raise ValueError('Missing SHP/SHX/DBF/PRJ in archive')
    return out


def check_fields(names,kind,path):
    required=[('h3_res9_id','h3_res9','h3id','h3_id'),('environmnt','environment','environmen')]
    if not source_identity(path):
        has_brand=bool(set(names)&{'brandname','brand_name'}); has_provider=bool(set(names)&{'providerid','provider_id','provider_i'})
        if has_brand != has_provider: raise ValueError('Incomplete carrier identity fields; cannot classify statewide coverage')
    if base_kind(kind)!='mobilevoice': required.extend([('technology','tech'),('mindown','min_down'),('minup','min_up')])
    missing=['/'.join(aliases) for aliases in required if not set(aliases)&set(names)]
    if missing: raise ValueError('Missing coverage fields '+', '.join(missing)+'; found '+', '.join(names))


def quote_sql(identifier):
    return '"'+identifier.replace('"','""')+'"'


@contextmanager
def gpkg_source(path,work):
    with zipfile.ZipFile(path) as z:
        members=[i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith('.gpkg')]
        if len(members)!=1: raise ValueError('Expected one GeoPackage')
        info=members[0]; target=Path(work)/'source.gpkg'
        if shutil.disk_usage(work).free<info.file_size+128*1024**2: raise ValueError('Insufficient disk space to extract GeoPackage')
        with z.open(info) as src,target.open('wb') as dst: shutil.copyfileobj(src,dst,1024*1024)
    try:
        with open_pack(target) as db:
            tables=db.execute("SELECT table_name,column_name,geometry_type_name,srs_id FROM gpkg_geometry_columns").fetchall()
            if len(tables)!=1: raise ValueError('Expected one GeoPackage feature table')
            table,geom,typ,srs=tables[0]
            if typ.upper() not in ('POLYGON','MULTIPOLYGON','GEOMETRY'): raise ValueError('Expected polygon GeoPackage')
            fields=[r[1] for r in db.execute('PRAGMA table_info('+quote_sql(table)+')') if r[1]!=geom]
            count=db.execute('SELECT count(*) FROM '+quote_sql(table)).fetchone()[0]
            if not count: raise ValueError('Empty GeoPackage')
            crs=db.execute('SELECT organization,organization_coordsys_id,definition FROM gpkg_spatial_ref_sys WHERE srs_id=?',(srs,)).fetchone()
            if not crs: raise ValueError('Missing GeoPackage CRS')
            yield db,table,geom,fields,count,crs,info.filename,info.file_size,srs
    finally: target.unlink(missing_ok=True)


def gpkg_geometry(blob,srs):
    from shapely import wkb
    if not isinstance(blob,bytes) or len(blob)<8 or blob[:2]!=b'GP' or blob[2]!=0: raise ValueError('Invalid GeoPackage geometry header')
    flags=blob[3]; envelope=(flags>>1)&7
    if flags&0xf0 or envelope>4: raise ValueError('Empty or unsupported GeoPackage geometry')
    if struct.unpack_from(('<' if flags&1 else '>')+'i',blob,4)[0]!=srs: raise ValueError('Geometry CRS conflicts with feature table')
    offset=8+(0,32,48,48,64)[envelope]
    shape=wkb.loads(blob[offset:])
    if shape.is_empty or shape.has_z or shape.geom_type not in ('Polygon','MultiPolygon'): raise ValueError('Expected nonempty 2D polygon')
    return shape.__geo_interface__


def inspect_zip(path, kind):
    """Inspect DBF headers or extract GeoPackage to inspect its schema."""
    if archive_format(path)=='geopackage':
        with tempfile.TemporaryDirectory(prefix='.fcc-inspect-',dir=Path(path).parent) as tmp:
            with gpkg_source(path,tmp) as (_,_,_,fields,count,_,_,size,_):
                names=[x.lower() for x in fields]; check_fields(names,kind,path)
                return count,names,size
    with zipfile.ZipFile(path) as z:
        parts=members(z)
        with z.open(parts['.dbf']) as f:
            header=f.read(32)
            if len(header)!=32: raise ValueError('Truncated DBF header')
            count,header_size,record_size=struct.unpack_from('<IHH',header,4)
            if not count or header_size<33 or not record_size or header_size+count*record_size>parts['.dbf'].file_size: raise ValueError('Invalid DBF header or truncated attribute table')
            fields=f.read(header_size-32)
            if len(fields)!=header_size-32: raise ValueError('Truncated DBF fields')
            names=[]
            for pos in range(0,len(fields),32):
                if fields[pos]==13: break
                if len(fields)-pos<32: raise ValueError('Invalid DBF field descriptor')
                names.append(fields[pos:pos+11].split(b'\0',1)[0].decode('ascii').lower())
            check_fields(names,kind,path)
        return count,names,sum(i.file_size for i in parts.values())


def carrier(brand):
    b=re.sub(r'[^a-z0-9]','',brand.lower())
    if b in ('att','attmobility','attwireless','attmobilityllc','attmobilityii','attmobilityiillc'): return 'att'
    if b in ('tmobile','tmobileusa','tmobileusainc','tmobileus','tmobileusinc'): return 'tmobile'
    if b in ('verizon','verizonwireless','verizonwirelessllc','cellcopartnership','cellcopartnershipdbaverizonwireless'): return 'verizon'
    return 'other'


def field(row,*aliases):
    for k in aliases:
        if k in row and row[k] not in (None,''): return row[k]
    raise ValueError('Missing required FCC field '+ '/'.join(aliases)+'; available: '+', '.join(sorted(row)))


def attributes(row,kind,source_provider=None):
    row={k.lower():v for k,v in row.items()}
    brand_value=next((row[k] for k in ('brandname','brand_name') if row.get(k) not in (None,'')),None)
    provider_value=next((row[k] for k in ('providerid','provider_id','provider_i') if row.get(k) not in (None,'')),None)
    if source_provider:
        if provider_value is not None and str(provider_value).strip().removesuffix('.0')!=source_provider:
            raise ValueError('Provider ID in row conflicts with archive filename')
        provider=source_provider
        group,brand=PROVIDERS.get(provider,('other',str(brand_value or f'FCC provider {provider}').strip()))
        if brand_value and carrier(str(brand_value)) not in ('other',group): raise ValueError('Carrier name conflicts with archive provider ID')
    elif brand_value is None and provider_value is None:
        if any(k in row for k in ('brandname','brand_name','providerid','provider_id','provider_i')): raise ValueError('Blank provider identity in attributed statewide data')
        group,brand,provider='aggregate','Any provider (statewide aggregate)','aggregate'
    else:
        if brand_value is None or provider_value is None: raise ValueError('Incomplete provider identity')
        brand,provider=str(brand_value).strip(),str(provider_value).strip()
        group=carrier(brand)
    if not brand or len(brand)>200 or not provider: raise ValueError('Invalid provider identity')
    tier=kind
    kind=base_kind(kind)
    raw_cell=field(row,'h3_res9_id','h3_res9','h3id','h3_id')
    cell=format(raw_cell,'x') if isinstance(raw_cell,int) else str(raw_cell).strip().lower()
    if not re.fullmatch(r'89[0-9a-f]{13}',cell): raise ValueError('Expected H3 resolution 9 index: '+cell[:60])
    env=str(field(row,'environmnt','environment','environmen')).strip()
    if env in ('0','0.0'): env='Outdoor stationary only'
    elif env in ('1','1.0'): env='Outdoor stationary + in-vehicle'
    else: raise ValueError('Unknown modeled environment code '+env)
    if kind=='mobilevoice': tech='Mobile voice'
    else:
        code=float(field(row,'technology','tech'))
        down=float(field(row,'mindown','min_down')); up=float(field(row,'minup','min_up'))
        options={'4glte':{(400,5,1):'4G LTE 5/1 Mbps'},'5gnr':{(500,7,1):'5G NR 7/1 Mbps',(500,35,3):'5G NR 35/3 Mbps'}}
        tech=options[kind].get((code,down,up))
        if not tech: raise ValueError(f'Unexpected {kind} technology/speed profile: {code}, {down}, {up}')
    if tier=='5gnr_7_1' and tech!='5G NR 7/1 Mbps' or tier=='5gnr_35_3' and tech!='5G NR 35/3 Mbps': raise ValueError('5G speed tier conflicts with archive filename')
    return cell,group,brand,provider,tech,env


def polygon_parts(geometry, transform):
    typ=geometry['type']; polys=geometry['coordinates']
    if typ=='Polygon': polys=[polys]
    elif typ!='MultiPolygon': raise ValueError('Expected polygon geometry, found '+typ)
    for polygon in polys:
        rings=[]; xs=[]; ys=[]
        for ring_index,ring in enumerate(polygon):
            if len(ring)<4: raise ValueError('Invalid ring')
            x,y=transform([p[0] for p in ring],[p[1] for p in ring])
            points=[[round(a,7),round(b,7)] for a,b in zip(x,y)]
            if points[0]!=points[-1] or len(set(map(tuple,points)))<3: raise ValueError('Invalid closed ring')
            if any(not math.isfinite(a) or not math.isfinite(b) or not -180<=a<=180 or not -85.051129<=b<=85.051129 for a,b in points): raise ValueError('Invalid WGS84 coordinates')
            xs.extend(a for a,b in points); ys.extend(b for a,b in points)
            # Canonical start/direction for geometry sharing across providers.
            core=points[:-1]; i=min(range(len(core)),key=core.__getitem__); core=core[i:]+core[:i]
            # RFC 7946: exterior CCW, holes CW; canonical direction by role.
            signed=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(core,core[1:]+core[:1]))
            if signed==0: raise ValueError('Zero-area coverage ring')
            if (signed>0)!=(ring_index==0): core=core[:1]+core[:0:-1]
            rings.append(core+[core[0]])
        if not rings or max(xs)-min(xs)>180: raise ValueError('Empty or unsplit antimeridian polygon; source not installed')
        yield (min(xs),min(ys),max(xs),max(ys),sum(map(len,rings)),zlib.compress(json.dumps(rings,separators=(',',':')).encode(),level=3))


DDL='''PRAGMA user_version=1;
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE shapes(id INTEGER PRIMARY KEY, h3 TEXT NOT NULL, geom BLOB NOT NULL, vertices INTEGER NOT NULL, UNIQUE(h3,geom));
CREATE VIRTUAL TABLE spatial USING rtree(id,west,east,south,north);
CREATE TABLE profiles(id INTEGER PRIMARY KEY, carrier TEXT, brand TEXT, provider TEXT, technology TEXT, environment TEXT, UNIQUE(carrier,brand,provider,technology,environment));
CREATE TABLE membership(profile INTEGER NOT NULL, shape INTEGER NOT NULL, PRIMARY KEY(profile,shape)) WITHOUT ROWID;
CREATE INDEX membership_shape ON membership(shape,profile);
'''


@contextmanager
def source_rows(path,work,kind):
    from pyproj import CRS,Transformer
    if archive_format(path)=='geopackage':
        with gpkg_source(path,work) as (db,table,geom,fields,count,crs,member,size,srs):
            org,code,definition=crs
            tx=Transformer.from_crs(CRS.from_epsg(code) if org.upper()=='EPSG' else CRS.from_wkt(definition),'EPSG:4326',always_xy=True)
            names=[f.lower() for f in fields]; check_fields(names,kind,path)
            sql='SELECT '+','.join(map(quote_sql,[*fields,geom]))+' FROM '+quote_sql(table)
            records=((dict(zip(fields,row[:-1])),gpkg_geometry(row[-1],srs)) for row in db.execute(sql))
            yield count,names,records,tx.transform,[member],'geopackage'
        return
    import shapefile
    with zipfile.ZipFile(path) as z:
        parts=members(z)
        needed=sum(i.file_size for i in parts.values())
        if shutil.disk_usage(work).free<needed+128*1024**2: raise ValueError('Insufficient free disk space for shapefile extraction and pack')
        for ext,info in parts.items():
            with z.open(info) as src,(work/('source'+ext)).open('wb') as dst: shutil.copyfileobj(src,dst,1024*1024)
    try:
        crs=CRS.from_wkt((work/'source.prj').read_text(encoding='utf-8-sig'))
        tx=Transformer.from_crs(crs,'EPSG:4326',always_xy=True)
        encoding=(work/'source.cpg').read_text().strip() if (work/'source.cpg').exists() else 'utf-8'
        if encoding.isdigit(): encoding='cp'+encoding
        if encoding.lower()=='cp65001': encoding='utf-8'
        with shapefile.Reader(str(work/'source.shp'),encoding=encoding) as reader:
            total=len(reader)
            if not total or reader.numRecords!=reader.numShapes: raise ValueError('Empty or mismatched shapefile/attribute table')
            yield total,[f[0] for f in reader.fields[1:]],((r.record.as_dict(),r.shape.__geo_interface__) for r in reader.iterShapeRecords()),tx.transform,[i.filename for i in parts.values()],'shapefile'
    finally:
        for ext in parts: (work/('source'+ext)).unlink(missing_ok=True)


def build_group(key, files, output, progress=print):
    state, filing, vintage=key[:3]
    source_provider=key[3] if len(key)==4 else None
    for kind,path in sorted(files.items()):
        if source_identity(path)!=source_provider: raise ValueError('Source provider does not match selected pack')
        count,names,_=inspect_zip(path,kind)
        progress(f'Preflight {path.name}: {count:,} rows · fields: '+', '.join(names))
    output=Path(output); output.mkdir(parents=True,exist_ok=True)
    final=output/(f'fcc-{state}-{source_provider}.sqlite3' if source_provider else f'fcc-{state}.sqlite3')
    if final.exists():
        with open_pack(final) as old:
            previous=json.loads(old.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0])
        previous_kinds={base_kind(PATTERN.fullmatch(x['file']).group(3).lower()) if not source_provider else PATTERN.fullmatch(x['file']).group(3).lower() for x in previous['sources'] if PATTERN.fullmatch(x['file'])}
        new_kinds={kind if source_provider else base_kind(kind) for kind in files}
        if previous_kinds-new_kinds: raise ValueError('Refresh would remove previously installed source profiles; restore missing archives: '+', '.join(sorted(previous_kinds-new_kinds)))
    with tempfile.TemporaryDirectory(prefix='.fcc-build-',dir=output) as tmp:
        work=Path(tmp); dbpath=work/'pack.sqlite3'; source_info=[]
        with closing(sqlite3.connect(dbpath)) as db:
            db.execute('PRAGMA journal_mode=DELETE'); db.execute('PRAGMA synchronous=NORMAL'); db.executescript(DDL)
            profile_ids={}
            for kind,path in sorted(files.items()):
                progress(f'{path.name}: checking and extracting source…')
                count=0
                with source_rows(path,work,kind) as (total,names,records,transform,source_members,source_format):
                    progress(f'{kind}: {total:,} source rows; fields: '+', '.join(names))
                    for row,geometry in records:
                        count+=1
                        try:
                            cell,*profile=attributes(row,kind,source_provider); profile=tuple(profile)
                            pid=profile_ids.get(profile)
                            if pid is None:
                                pid=db.execute('INSERT INTO profiles(carrier,brand,provider,technology,environment) VALUES (?,?,?,?,?)',profile).lastrowid; profile_ids[profile]=pid
                            for w,s,e,n,v,raw in polygon_parts(geometry,transform):
                                cur=db.execute('INSERT OR IGNORE INTO shapes(h3,geom,vertices) VALUES (?,?,?)',(cell,raw,v))
                                if cur.rowcount:
                                    sid=cur.lastrowid; db.execute('INSERT INTO spatial VALUES (?,?,?,?,?)',(sid,w,e,s,n))
                                else: sid=db.execute('SELECT id FROM shapes WHERE h3=? AND geom=?',(cell,raw)).fetchone()[0]
                                db.execute('INSERT OR IGNORE INTO membership VALUES (?,?)',(pid,sid))
                        except Exception as exc: raise ValueError(f'{path.name}, source row {count}: {exc}') from exc
                        if count%25000==0:
                            db.commit(); progress(f'{kind}: {count:,}/{total:,} rows ({100*count/total:.1f}%)')
                    if count!=total: raise ValueError(f'{kind}: expected {total}, read {count}; no partial pack installed')
                db.commit(); progress(f'{kind}: {count:,}/{total:,} rows (100%) processed')
                # Original archives remain untouched. CRC is checked on every extracted component.
                source_info.append({'file':path.name,'rows':count,'bytes':path.stat().st_size,'format':source_format,'members':source_members})
            progress('Indexing and validating completed state pack…')
            layers=[]
            for c,t,e,n in db.execute('SELECT p.carrier,p.technology,p.environment,count(DISTINCT m.shape) FROM profiles p JOIN membership m ON p.id=m.profile GROUP BY 1,2,3 ORDER BY 1,2,3'):
                layers.append({'carrier':c,'technology':t,'environment':e,'count':n})
            # Both FCC environment codes include outdoor stationary coverage.
            # Keep original profiles and expose the union as an explicit derived view.
            for c,t,n in db.execute('SELECT p.carrier,p.technology,count(DISTINCT m.shape) FROM profiles p JOIN membership m ON p.id=m.profile GROUP BY 1,2 ORDER BY 1,2'):
                layers.append({'carrier':c,'technology':t,'environment':'Outdoor stationary (all)','count':n})
            if not layers: raise ValueError('Empty pack')
            meta={'format':'openrf-fcc-h3','version':SCHEMA,'state':state,'provider_id':source_provider,'filing':filing,'vintage':vintage,'source':SOURCE,'sources':source_info,'layers':layers,'saved_at':datetime.now(timezone.utc).isoformat(timespec='seconds')}
            db.execute('INSERT INTO metadata VALUES (?,?)',('manifest',json.dumps(meta))); db.commit()
            if db.execute('PRAGMA quick_check').fetchone()!=('ok',): raise ValueError('SQLite validation failed')
        # Publish only after all selected archives succeed. A stopped/failed build leaves old pack intact.
        os.replace(dbpath,final)
    digest=hashlib.sha256()
    with final.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): digest.update(block)
    progress(f'Installed {final} · {final.stat().st_size:,} bytes · SHA-256 {digest.hexdigest()}')
    return final


@contextmanager
def open_pack(path):
    with closing(sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True)) as db:
        db.execute('PRAGMA query_only=ON')
        yield db


def pack_metadata(folder):
    result={}
    from .coverage_compact import active_pack
    groups={}
    for path in sorted(Path(folder).glob('fcc-*.sqlite3')):
        if re.fullmatch(r'fcc-\d{2}(?:-\d{6})?\.sqlite3',path.name): groups.setdefault(path.name[4:6],[]).append(path)
    selected=[]
    for state,paths in groups.items():
        compact=active_pack(folder,state,paths)
        if compact: selected.append(compact); continue
        for path in paths:
            with open_pack(path) as db:
                manifest=json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0])
            expected=f"fcc-{manifest['state']}"+('-'+manifest['provider_id'] if manifest.get('provider_id') else '')+'.sqlite3'
            if manifest['format']!='openrf-fcc-h3' or manifest['version']!=SCHEMA or path.name!=expected: raise ValueError('Unsupported FCC pack: '+path.name)
            selected.append((path,manifest))
    for path,manifest in selected:
        for i,layer in enumerate(manifest['layers']):
            key=f"coverage:fcc:{path.stem}:{i}"
            result[key]={**layer,'pack':f"FCC state {manifest['state']}",'vintage':manifest['vintage'],'source':manifest['source'],'saved_at':manifest['saved_at'],'fcc_file':str(path.relative_to(folder)),'filing':manifest['filing']}
    return result


def view_pack(path, layer, bounds, budget):
    w,s,e,n=bounds
    lon='r.west<=? AND r.east>=?' if w<=e else '(r.east>=? OR r.west<=?)'
    args=(e,w) if w<=e else (w,e)
    with open_pack(path) as db:
        # Spatial candidates first; test indexed membership without scanning entire state.
        all_outdoor=layer['environment']=='Outdoor stationary (all)'
        env_filter='' if all_outdoor else ' AND p.environment=?'
        sql=f'''SELECT g.vertices,g.geom FROM spatial r CROSS JOIN shapes g ON g.id=r.id
            WHERE r.south<=? AND r.north>=? AND {lon}
            AND EXISTS (SELECT 1 FROM membership m JOIN profiles p ON p.id=m.profile WHERE m.shape=g.id AND p.carrier=? AND p.technology=?{env_filter})'''
        params=(n,s,*args,layer['carrier'],layer['technology'])+(() if all_outdoor else (layer['environment'],))
        compact=db.execute("PRAGMA user_version").fetchone()[0]==2
        if compact: from .coverage_compact import decode
        for vertices,raw in db.execute(sql,params):
            budget-=vertices
            if budget<0: yield None; return
            yield vertices,decode(raw) if compact else json.loads(zlib.decompress(raw))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=('scan','build')); p.add_argument('--format',choices=('auto','shapefile','geopackage'),default='auto'); p.add_argument('--input-dir',type=Path); p.add_argument('--state',help='Two-digit state FIPS, e.g. 06'); p.add_argument('--release',help='Release date YYYY-MM-DD'); p.add_argument('--db',type=Path,default=Path.home()/'.local/share/openrf/openrf.sqlite3')
    scope=p.add_mutually_exclusive_group(); scope.add_argument('--provider',help='Six-digit FCC provider ID'); scope.add_argument('--aggregate',action='store_true',help='Only statewide archives without a provider ID')
    a=p.parse_args()
    if a.provider and not re.fullmatch(r'\d{6}',a.provider): p.error('--provider must contain six digits')
    try:
        folder=a.input_dir or auto_folder(); groups=discover(folder,a.format)
        if not groups: raise ValueError('No matching files in '+str(folder))
        print('FCC source folder:',folder,flush=True)
        def progress(msg): print(msg,flush=True)
        if a.command=='scan':
            failed=False; matched=0
            for key,files in sorted(matching_groups(groups,a.state,a.release,a.provider,a.aggregate).items()):
                matched+=1
                print(key, PROVIDERS.get(key[3],('other','FCC provider '+key[3]))[1] if len(key)==4 else 'Statewide archive(s)', f'· {len(files)} selected source(s); partial sets supported',flush=True)
                for kind,path in files.items():
                    try:
                        count,names,size=inspect_zip(path,kind)
                        print(f'  {path.name}: {path.stat().st_size:,} bytes, {size:,} extracted bytes, {count:,} rows; fields: {", ".join(names)}',flush=True)
                    except (ValueError,zipfile.BadZipFile) as exc: failed=True; print(f'  INVALID {path.name}: {exc}',flush=True)
            if not matched: raise ValueError("No matching state/release")
            return 1 if failed else 0
        for key,files in select_groups(groups,a.state,a.release,a.provider,a.aggregate): build_group(key,files,a.db.parent/'fcc-coverage',progress)
        return 0
    except (OSError,ValueError,sqlite3.Error,zipfile.BadZipFile,RuntimeError,ImportError) as exc:
        print(f'FCC compiler stopped: {exc}. Any previously completed state pack is retained.',flush=True); return 1

if __name__=='__main__': raise SystemExit(main())
