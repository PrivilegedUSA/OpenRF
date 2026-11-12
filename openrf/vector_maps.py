"""Loopback-only OpenRF vector basemaps (approved prototype styles + read-only MBTiles).

The bundled regional archive is OSM-derived, not personal investigation data.
The style JSON resources are kept verbatim; prototype-only empty overlay sources
are removed in a *copy* so the main application's live layers remain authoritative.
"""
from __future__ import annotations

import functools
import gzip
import json
import os
import re
import sqlite3
from pathlib import Path
from contextlib import closing

ROOT = Path(__file__).resolve().parent / 'resources'
BUNDLED = ROOT / 'amador-calaveras.mbtiles'
FONTS = ROOT / 'fonts' / 'Noto Sans Regular'
BBOX = [-121.25, 37.95, -119.70, 38.95]
STYLE_NAMES = ('dark', 'light')
MAX_TILE_SIZE = 8 * 1024 * 1024


def _archive() -> Path:
    """An operator may replace the region using their private local directory.

    No arbitrary path or browser supplied filesystem access is permitted.
    """
    external = Path.home() / '.local' / 'share' / 'openrf' / 'maps-vector' / 'amador-calaveras.mbtiles'
    return external if external.is_file() and not external.is_symlink() else BUNDLED


def _read_only(path: Path):
    return sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=3)


@functools.lru_cache(maxsize=4)
def _metadata_cached(path: str, mtime_ns: int, size: int):
    file=Path(path)
    if not file.is_file() or not file.stat().st_size: raise ValueError('Offline vector archive is missing')
    with closing(_read_only(file)) as con:
        fields={str(k): str(v) for k,v in con.execute('SELECT name,value FROM metadata')}
        required={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {'metadata','tiles'}.issubset(required) or fields.get('format') not in ('pbf','mvt'):
            raise ValueError('Regional MBTiles file is not a supported vector archive')
        count=int(con.execute('SELECT COUNT(*) FROM tiles').fetchone()[0])
        if count < 1: raise ValueError('Regional MBTiles archive has no tiles')
    bounds=[float(s) for s in fields.get('bounds','').split(',')]
    if len(bounds)!=4 or not all(-180<=x<=180 for x in bounds):
        bounds=BBOX
    return {'ready':True,'tile_count':count,'name':fields.get('name','OpenRF regional map'),
            'minzoom':int(fields.get('minzoom',0)),'maxzoom':int(fields.get('maxzoom',14)),
            'bounds':bounds,'size_bytes':size,'offline_attribution':'© OpenStreetMap contributors · Geofabrik · OpenMapTiles-style schema',
            'note':'Amador/Calaveras region only; outside coverage may be blank. Routing is a separate local Valhalla service.'}


def status():
    file=_archive()
    try:
        info=_metadata_cached(str(file),file.stat().st_mtime_ns,file.stat().st_size)
        return {**info,'fonts_ready':all((FONTS/x).is_file() for x in ('0-255.pbf','256-511.pbf')),
                'bundled':file == BUNDLED}
    except (OSError, ValueError, sqlite3.Error) as exc:
        return {'ready':False,'error':str(exc)[:120],'bounds':BBOX, 'tile_count':0,'fonts_ready':False}


def style(name: str, *, offline=False) -> dict:
    if name not in STYLE_NAMES: raise ValueError('Unknown style')
    with (ROOT / f'openrf-{name}.json').open(encoding='utf-8') as f:
        definition=json.load(f)
    # These placeholders were only for the stand-alone preview. Never duplicate
    # or obscure the main app's real observation and routing overlays.
    definition['layers']=[layer for layer in definition['layers'] if not layer['id'].startswith('openrf-') or layer['type']=='background']
    for source in list(definition['sources']):
        if source.startswith('openrf-'): del definition['sources'][source]
    # The approved prototype omitted country labels at continental zoom.
    # Add an OpenMapTiles place-layer label to the runtime copy, preserving the
    # original approved JSON resources (offline regional tiles may lack countries).
    countries = {
        'id':'openrf-country-labels', 'type':'symbol', 'source':'openmaptiles',
        'source-layer':'place', 'minzoom':0, 'maxzoom':5,
        'filter':['==',['get','class'],'country'],
        'layout':{'text-field':['coalesce',['get','name:en'],['get','name'],''],
                  'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],0,12,4,18],
                  'text-letter-spacing':0.12,'text-max-width':10},
        'paint':{'text-color':'#bdd8da' if name=='dark' else '#365663',
                 'text-halo-color':'#101d27' if name=='dark' else '#eaf1f0',
                 'text-halo-width':1.4}
    }
    definition['layers'].append(countries)
    if offline:
        info=status()
        if not info['ready'] or not info['fonts_ready']:
            raise ValueError('Regional offline vector map or fonts are unavailable')
        definition['sources']['openmaptiles']={'type':'vector','tiles':['/api/vector/tiles/{z}/{x}/{y}.pbf'],
            'minzoom':info['minzoom'],'maxzoom':info['maxzoom'],'bounds':info['bounds'],
            'attribution':'© OpenStreetMap contributors · Geofabrik · OpenMapTiles-style data'}
        definition['glyphs']='/api/vector/fonts/{fontstack}/{range}.pbf'
    definition.setdefault('metadata',{})['openrf:integrated']=True
    definition['metadata']['openrf:offline']=bool(offline)
    return definition


def tile(z: int, x: int, y: int):
    info=status()
    if not info['ready'] or not all(type(v) is int for v in (z,x,y)) or z<0 or z>info['maxzoom'] or x<0 or y<0 or x>=1<<z or y>=1<<z:
        raise ValueError('Vector tile unavailable')
    with closing(_read_only(_archive())) as con:
        row=con.execute('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1',
                        (z,x,(1<<z)-1-y)).fetchone()
    if not row or not isinstance(row[0],bytes) or not 0<len(row[0])<=MAX_TILE_SIZE:
        raise ValueError('Vector tile outside regional coverage')
    return row[0], row[0][:2] == b'\x1f\x8b'


def font(stack: str, lo: int, hi: int):
    if stack != 'Noto Sans Regular' or lo<0 or lo%256 or hi!=lo+255 or lo>65535:
        raise ValueError('Font range unavailable')
    path=FONTS / f'{lo}-{hi}.pbf'
    if not path.is_file() or path.is_symlink(): raise ValueError('Font range unavailable')
    payload=path.read_bytes()
    if not 0<len(payload)<1024*1024: raise ValueError('Invalid font')
    return payload

@functools.lru_cache(maxsize=1)
def _local_street_names():
    """OSM-derived street-name text only; does NOT validate house numbers."""
    items=json.loads((ROOT/'street_names.json').read_text(encoding='utf-8'))['names']
    return tuple(s for s in items if isinstance(s,str) and 2<=len(s)<=100)


def street_name_suggestions(text: str, limit=6):
    """Private, network-free early *street name* completion, never geocoding.

    The main route planner MUST still resolve the full address before using it.
    """
    if not isinstance(text,str) or len(text)>140: return []
    m=re.fullmatch(r'\s*(\d{3,8}[A-Za-z]?)\s+([A-Za-z][A-Za-z .\-]{1,42})\s*',text)
    if not m or ',' in text:return []
    number,prefix=m.groups();part=prefix.casefold().strip()
    if len(part)<2:return []
    if part in ('rd','street','ave','road','ca','california'):
        # Frequent ambiguous fragments can produce hundreds of unrelated roads.
        # Show a small selectable set only when matching real names.
        pass
    candidates=(s for s in _local_street_names() if s.casefold().startswith(part))
    candidates=sorted(candidates,key=lambda s:(len(s),s.casefold()))[:max(0,min(8,int(limit)))]
    return [{'name':s,'label':f'{s} · street name only (number not verified)',
             'completion':f'{number} {s}', 'source':'local-street-name-only'} for s in candidates]
