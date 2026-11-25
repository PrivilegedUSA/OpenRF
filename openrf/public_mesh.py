"""Read-only public directory snapshot, separate from local mesh observations.
Provider: official MeshCore Map (https://map.meshcore.io/). No radio activity.
"""
from __future__ import annotations
import json
import math
import os
from pathlib import Path
import re
import tempfile
import threading
import time
from urllib.request import Request, build_opener, HTTPRedirectHandler

URL = 'https://map.meshcore.io/api/v1/nodes'
MAX_BYTES = 64 * 1024 * 1024
MAX_ROWS = 200_000
MIN_REFRESH = 300
MAX_CACHE_AGE = 30 * 86400
ROLES = {1: 'Client', 2: 'Repeater', 3: 'Room Server', 4: 'Sensor'}

class DirectoryError(Exception):
    pass

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def fetch_meshcore():
    request = Request(URL, headers={'Accept':'application/json', 'User-Agent':'OpenRF/0.2.206 (manual public directory snapshot; https://openrf.app)'})
    with build_opener(NoRedirect()).open(request, timeout=20) as response:
        if response.headers.get('Content-Encoding','identity').lower() != 'identity':
            raise DirectoryError('Unexpected response encoding')
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise DirectoryError('Provider response exceeds download limit')
    try:
        return json.loads(raw)
    except (UnicodeError, ValueError) as exc:
        raise DirectoryError('Provider did not return supported JSON') from exc

def _number(value, limit):
    return type(value) in (float,int) and math.isfinite(value) and abs(value) <= limit

def _text(value, limit=128):
    return value[:limit] if isinstance(value,str) else None

def normalize(payload):
    # The official map also offers a separate binary/short-key endpoint. This
    # adapter requests the standard JSON endpoint, not the binary variant.
    if isinstance(payload,dict):
        payload = payload.get('nodes')
    if not isinstance(payload,list) or len(payload)>MAX_ROWS:
        raise DirectoryError('Unsupported or oversized directory response')
    nodes = {}
    invalid = duplicates = 0
    for row in payload:
        if not isinstance(row,dict):
            invalid += 1; continue
        ident = row.get('public_key')
        lat,lon = row.get('lat'),row.get('lon')
        if not isinstance(ident,str) or not re.fullmatch(r'[0-9a-fA-F]{64}',ident) or not _number(lat,85.05112878) or not _number(lon,180) or (lat==0 and lon==0):
            invalid += 1; continue
        ident = ident.lower()
        role = row.get('type',row.get('device_role'))
        if type(role) is int:
            role = ROLES.get(role,'Unknown')
        elif isinstance(role,str):
            role = next((r for r in ROLES.values() if r.lower()==role.lower()),'Unknown')
        else:
            role = 'Unknown'
        if ident in nodes:
            duplicates += 1; continue
        nodes[ident] = {'id':ident,'name':_text(row.get('adv_name',row.get('name'))) or 'Unnamed node',
                        'role':role,'lat':lat,'lon':lon,'updated':_text(row.get('updated_date',row.get('last_seen'))),
                        'inserted':_text(row.get('inserted_date')),'source':_text(row.get('source'),64)}
    if payload and not nodes:
        raise DirectoryError('No valid geographic records; previous snapshot retained')
    return {'nodes':list(nodes.values()),'received':len(payload),'rejected':invalid,'duplicates':duplicates}

class PublicMeshDirectory:
    def __init__(self, path: Path, fetcher=fetch_meshcore):
        self.path = path
        self.fetcher = fetcher
        self.lock = threading.Lock()
        self.last_attempt = float('-inf')

    def snapshot(self):
        try:
            with self.path.open('rb') as stream:
                raw = stream.read(MAX_BYTES+1)
            if len(raw)>MAX_BYTES: raise ValueError('Cache too large')
            data = json.loads(raw)
            age = max(0,time.time()-data['downloaded_at'])
            if data.get('schema')!=1 or not isinstance(data['nodes'],list) or len(data['nodes'])>MAX_ROWS:
                raise ValueError('Invalid cache')
            if age > MAX_CACHE_AGE:
                return {**data,'nodes':[],'state':'expired','cached_count':len(data['nodes'])}
            return {**data,'state':'cached','cached_count':len(data['nodes'])}
        except FileNotFoundError:
            return {'state':'empty','nodes':[],'cached_count':0}
        except (OSError,ValueError,KeyError,TypeError):
            return {'state':'unavailable','nodes':[],'cached_count':0}

    def refresh(self):
        if not self.lock.acquire(blocking=False):
            raise DirectoryError('Directory action already running')
        try:
            now = time.monotonic()
            if now-self.last_attempt < MIN_REFRESH:
                raise DirectoryError('Please allow five minutes between download attempts')
            self.last_attempt = now
            try:
                result = normalize(self.fetcher())
            except DirectoryError:
                raise
            except Exception as exc:
                raise DirectoryError('MeshCore provider download failed; previous snapshot retained') from exc
            result.update(schema=1,downloaded_at=time.time())
            raw = json.dumps(result,ensure_ascii=True,separators=(',',':'),allow_nan=False).encode('utf-8')
            if len(raw)>MAX_BYTES: raise DirectoryError('Normalized directory exceeds storage limit')
            self.path.parent.mkdir(parents=True,exist_ok=True)
            tmp = None
            try:
                with tempfile.NamedTemporaryFile(dir=self.path.parent,delete=False) as f:
                    tmp=Path(f.name); f.write(raw); f.flush(); os.fsync(f.fileno())
                os.replace(tmp,self.path)
            finally:
                if tmp is not None: tmp.unlink(missing_ok=True)
            return {**result,'state':'cached','cached_count':len(result['nodes'])}
        finally:
            self.lock.release()

    def clear(self):
        if not self.lock.acquire(blocking=False):
            raise DirectoryError('Directory action already running')
        try:
            self.path.unlink(missing_ok=True)
            return {'state':'empty','nodes':[],'cached_count':0}
        finally:
            self.lock.release()
