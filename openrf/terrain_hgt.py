"""Optional local, operator-supplied SRTM-compatible HGT terrain rasters.

HGT is a square 1° signed 16-bit big-endian height grid, north-to-south,
with 1201×1201 or 3601×3601 samples. Files live outside Git in private
maps/terrain-hgt. No URLs, synthetic readings or dependency on GDAL/Pillow.
Source provenance is operator reported and deliberately unverified.
"""
from __future__ import annotations

import json
import math
import os
import re
import secrets
import struct
import threading
from datetime import datetime, timezone
from pathlib import Path

NAME = re.compile(r'([NS])(\d{2})([EW])(\d{3})\Z')
SIZES = {1201 * 1201 * 2:1201, 3601 * 3601 * 2:3601}
MAX_TILES = 32
CHUNK = 1024 * 1024


class TerrainError(ValueError):
    pass


def _name(value):
    if not isinstance(value,str):raise TerrainError('HGT tile filename required')
    name=value.upper().removesuffix('.HGT')
    match=NAME.fullmatch(name)
    if not match or int(match[2])>89 or int(match[4])>179:
        raise TerrainError('Expected 1-degree HGT tile name such as N38W121.hgt')
    return name


def _path(folder,name):
    name=_name(name)
    parent=folder.resolve()
    path=parent / (name+'.hgt')
    if path.is_symlink() or not path.is_file() or path.resolve().parent!=parent:
        raise TerrainError('HGT tile not installed')
    if path.stat().st_size not in SIZES:
        raise TerrainError('HGT file size is invalid')
    return path


def _meta(folder,name):
    path=folder/(name+'.json')
    if path.is_symlink() or not path.is_file():return {}
    try:
        if path.stat().st_size>1024:return {}
        data=json.loads(path.read_text(encoding='utf-8'))
        return data if isinstance(data,dict) else {}
    except (ValueError,UnicodeError,OSError):return {}


def list_tiles(folder):
    if not folder.is_dir():return []
    results=[]
    for candidate in sorted(folder.glob('*.hgt')):
        try:
            name=_name(candidate.name)
            path=_path(folder,name)
            meta=_meta(folder,name)
            results.append({'name':name,'resolution_arcseconds':1 if SIZES[path.stat().st_size]==3601 else 3,
                            'size_bytes':path.stat().st_size,'source':str(meta.get('source') or 'Provenance not supplied')[:120],
                            'source_verified':False})
        except (TerrainError,OSError):continue
        if len(results)>=MAX_TILES:break
    return results


def install(folder,filename,source,stream,length,lock:threading.Lock):
    name=_name(filename)
    if type(length) is not int or length not in SIZES:
        raise TerrainError('Only raw HGT 1201×1201 (3 arc-second) or 3601×3601 (1 arc-second) tiles are accepted')
    if not isinstance(source,str) or not 3<=len(source.strip())<=120 or any(ord(c)<32 for c in source):
        raise TerrainError('Provide a source/provenance label (3–120 printable characters)')
    if not lock.acquire(blocking=False):raise TerrainError('Another terrain operation is in progress')
    try:
        folder.mkdir(parents=True,exist_ok=True)
        target=folder/(name+'.hgt')
        marker=folder/(name+'.json')
        if target.exists() or target.is_symlink() or marker.exists() or marker.is_symlink():
            raise TerrainError('Terrain tile name already installed; original file was preserved')
        if len(list_tiles(folder))>=MAX_TILES:raise TerrainError(f'Maximum {MAX_TILES} local terrain tiles installed')
        staged=folder/('.openrf-terrain-'+secrets.token_hex(12)+'.part')
        staged_meta=folder/('.openrf-terrain-meta-'+secrets.token_hex(12)+'.part')
        try:
            fd=os.open(staged,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,'wb') as out:
                remaining=length
                while remaining:
                    block=stream.read(min(remaining,CHUNK))
                    if not block:raise TerrainError('Truncated HGT upload; no tile installed')
                    out.write(block);remaining-=len(block)
                out.flush();os.fsync(out.fileno())
            data={'source':source.strip(),'source_verified':False,
                  'imported_at_utc':datetime.now(timezone.utc).isoformat(timespec='seconds')}
            fd=os.open(staged_meta,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,'w',encoding='utf-8') as out:
                json.dump(data,out);out.flush();os.fsync(out.fileno())
            # Atomically link both names without replacing existing data.
            os.link(staged_meta,marker)
            try:os.link(staged,target)
            except BaseException:
                marker.unlink(missing_ok=True)
                raise
            return {'tile':{'name':name,'size_bytes':length,
                            'resolution_arcseconds':1 if SIZES[length]==3601 else 3,
                            'source':source.strip(),'source_verified':False}}
        finally:
            staged.unlink(missing_ok=True);staged_meta.unlink(missing_ok=True)
    finally:lock.release()


def remove(folder,name,lock:threading.Lock):
    name=_name(name)
    if not lock.acquire(blocking=False):raise TerrainError('Another terrain operation is in progress')
    try:
        path=_path(folder,name)
        marker=folder/(name+'.json')
        if marker.is_symlink():raise TerrainError('Unsafe terrain metadata symlink')
        path.unlink()
        marker.unlink(missing_ok=True)
        return {'removed':True,'name':name}
    finally:lock.release()


def tile_name(lon,lat):
    if not all(type(v) in (float,int) and math.isfinite(v) for v in (lon,lat)):
        return None
    if not -180<lon<180 or not -90<lat<90:return None
    west=math.floor(lon);south=math.floor(lat)
    return f'{"N" if south>=0 else "S"}{abs(south):02d}{"E" if west>=0 else "W"}{abs(west):03d}'


def _height_at(path,n,lon,lat):
    match=NAME.fullmatch(path.stem)
    south=int(match[2])*(1 if match[1]=='N' else -1)
    west=int(match[4])*(1 if match[3]=='E' else -1)
    x=(lon-west)*(n-1)
    y=(south+1-lat)*(n-1)
    x=min(n-1,max(0,x));y=min(n-1,max(0,y))
    col=min(n-2,int(math.floor(x)));row=min(n-2,int(math.floor(y)))
    fx=x-col;fy=y-row
    with path.open('rb') as stream:
        stream.seek(2*(row*n+col));north=stream.read(4)
        stream.seek(2*((row+1)*n+col));south_bytes=stream.read(4)
    if len(north)!=4 or len(south_bytes)!=4:return None
    nw,ne=struct.unpack('>hh',north)
    sw,se=struct.unpack('>hh',south_bytes)
    heights=(nw,ne,sw,se)
    if any(h==-32768 or not -500<=h<=9000 for h in heights):return None
    return round(nw*(1-fx)*(1-fy)+ne*fx*(1-fy)+sw*(1-fx)*fy+se*fx*fy,2)


def sample_point(folder,lon,lat):
    name=tile_name(lon,lat)
    if not name:return None
    try:
        path=_path(folder,name)
        return _height_at(path,SIZES[path.stat().st_size],lon,lat)
    except (TerrainError,OSError,ValueError,struct.error):return None


def sample_route(folder,points):
    """Return modeled local terrain heights or None for missing/void coverage."""
    return [sample_point(folder,lon,lat) for lon,lat in points]
