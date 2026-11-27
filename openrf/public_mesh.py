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
from urllib.error import HTTPError, URLError
from http.client import IncompleteRead
import socket
from urllib.request import Request, build_opener, HTTPRedirectHandler

URL = 'https://map.meshcore.io/api/v1/nodes'
MAX_BYTES = 128 * 1024 * 1024
NETWORK_TIMEOUT = 90
DOWNLOAD_DEADLINE = 300
FAILURE_RETRY = 30
MAX_ROWS = 200_000
MIN_REFRESH = 300
MAX_CACHE_AGE = 30 * 86400
ROLES = {1: 'Client', 2: 'Repeater', 3: 'Room Server', 4: 'Sensor'}

class DirectoryError(Exception):
    pass

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def _fetch_directory(url, provider, progress):
    request = Request(url, headers={'Accept':'application/json', 'Accept-Encoding':'identity', 'User-Agent':'OpenRF/0.2.238 (manual public directory snapshot; https://openrf.app)'})
    started = time.monotonic()
    try:
        with build_opener(NoRedirect()).open(request, timeout=NETWORK_TIMEOUT) as response:
            if response.headers.get('Content-Encoding','identity').lower() != 'identity':
                raise DirectoryError(f'Unexpected response encoding from {provider}')
            length = response.headers.get('Content-Length')
            total = int(length) if length and length.isdecimal() else None
            if total is not None and total > MAX_BYTES:
                raise DirectoryError('Provider response exceeds 128 MiB download limit')
            progress(phase='downloading', received_bytes=0, total_bytes=total)
            raw = bytearray()
            while True:
                if time.monotonic()-started > DOWNLOAD_DEADLINE:
                    raise DirectoryError('Directory transfer exceeded five-minute deadline')
                chunk = response.read1(256*1024)
                if not chunk: break
                raw.extend(chunk)
                if len(raw)>MAX_BYTES:
                    raise DirectoryError('Provider response exceeds 128 MiB download limit')
                progress(phase='downloading', received_bytes=len(raw), total_bytes=total)
            if total is not None and len(raw)!=total:
                raise DirectoryError('Incomplete directory transfer; previous snapshot retained')
    except HTTPError as exc:
        error = DirectoryError(f'{provider} HTTP {exc.code}; previous snapshot retained')
        if exc.code in (429,503):
            retry=exc.headers.get('Retry-After','') if exc.headers else ''
            error.retry_seconds=max(MIN_REFRESH,int(retry)) if retry.isdecimal() and len(retry)<10 else MIN_REFRESH
        raise error from exc
    except (TimeoutError, socket.timeout) as exc:
        raise DirectoryError(f'{provider} network timed out; previous snapshot retained') from exc
    except URLError as exc:
        raise DirectoryError(f'{provider} connection failed ({type(exc.reason).__name__}); previous snapshot retained') from exc
    except (OSError, IncompleteRead) as exc:
        raise DirectoryError(f'{provider} transfer interrupted ({type(exc).__name__}); previous snapshot retained') from exc
    progress(phase='parsing', received_bytes=len(raw), total_bytes=total)
    try:
        return json.loads(raw)
    except (UnicodeError, ValueError) as exc:
        raise DirectoryError('Provider did not return supported JSON') from exc

def fetch_meshcore(progress=lambda **fields: None):
    return _fetch_directory(URL, 'MeshCore', progress)

MESHTASTIC_URL = 'https://meshmap.net/nodes.json'

def fetch_meshtastic(progress=lambda **fields: None):
    return _fetch_directory(MESHTASTIC_URL, 'MeshMap.net', progress)


RETICULUM_URL = 'https://repmap.arg0net.org/data'

def fetch_reticulum(progress=lambda **fields: None):
    return _fetch_directory(RETICULUM_URL, 'REPMAP', progress)


def _number(value, limit):
    return type(value) in (float,int) and abs(value) <= limit and math.isfinite(value)

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
        # Official map uses advertised decimal-degree positions. Preserve the
        # older lat/lon adapter shape only if neither advertised field exists.
        # Never fall back from a null or invalid advertised position.
        if 'adv_lat' in row or 'adv_lon' in row:
            lat,lon = row.get('adv_lat'),row.get('adv_lon')
        else:
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
        raise DirectoryError(f'No valid geographic records ({invalid:,} of {len(payload):,} rejected); previous snapshot retained')
    return {'nodes':list(nodes.values()),'received':len(payload),'rejected':invalid,'duplicates':duplicates}

def normalize_meshtastic(payload):
    # MeshMap.net NodeDB: decimal uint32 keys, integer 1e-7 degree positions.
    # Only retain geographic map metadata, never MQTT topics, messages, telemetry
    # or neighbors. Do not reconstruct precision or infer radio reachability.
    from datetime import datetime, timezone
    if not isinstance(payload, dict) or not payload or len(payload) > MAX_ROWS:
        raise DirectoryError('Empty, unsupported or oversized MeshMap.net response; previous snapshot retained')
    nodes = {}
    invalid = duplicates = 0
    for key, row in payload.items():
        if not isinstance(key, str) or not re.fullmatch(r'[0-9]{1,10}', key) or not 0 < int(key) < 4294967295 or not isinstance(row, dict):
            invalid += 1; continue
        lat, lon = row.get('latitude'), row.get('longitude')
        if type(lat) is not int or type(lon) is not int or abs(lat) > 850511287 or abs(lon) > 1800000000 or (lat == 0 and lon == 0):
            invalid += 1; continue
        # Never increase precision; public map positions are approximate.
        lat, lon = round(lat / 1e7, 3), round(lon / 1e7, 3)
        ident = f'!{int(key):08x}'
        if ident in nodes:
            duplicates += 1; continue
        raw_role = row.get('role')
        role = 'Repeater' if raw_role in ('ROUTER', 'ROUTER_CLIENT', 'REPEATER', 'ROUTER_LATE') else _text(raw_role, 40) or 'Unknown'
        seen = row.get('seenBy')
        stamps = [v for v in seen.values() if type(v) is int and 0 < v <= time.time()+300] if isinstance(seen,dict) else []
        updated = datetime.fromtimestamp(max(stamps), timezone.utc).isoformat() if stamps else None
        nodes[ident] = dict(id=ident, name=_text(row.get('longName')) or 'Unnamed node', role=role, lat=lat, lon=lon,
                            updated=updated, source='MeshMap.net', reported_role=_text(raw_role,40), hardware=_text(row.get('hwModel'),64))
    if not nodes:
        raise DirectoryError('No valid geographic Meshtastic records; previous snapshot retained')
    return dict(nodes=list(nodes.values()),received=len(payload),rejected=invalid,duplicates=duplicates)


def normalize_reticulum(payload):
    # REPMAP /data: only operator-published geographic infrastructure. Never
    # infer a position from IP, WHOIS, names, or private message destinations.
    from datetime import datetime, timezone
    if not isinstance(payload, list) or not payload or len(payload) > MAX_ROWS:
        raise DirectoryError('Empty, unsupported or oversized REPMAP response; previous snapshot retained')
    nodes = {}
    rejected = duplicates = unmapped = 0
    for row in payload:
        if not isinstance(row, dict):
            rejected += 1; continue
        kind = row.get('type')
        if kind not in ('BackboneInterface','TCPServerInterface','RNodeInterface','I2PInterface','KISSInterface','AX25KISSInterface','UDPInterface','WeaveInterface','TCPClientInterface'):
            rejected += 1; continue
        if row.get('location_source') not in ('coordinates_only', 'manual') or row.get('geolocated') is not True:
            unmapped += 1; continue
        lat, lon = row.get('latitude'), row.get('longitude')
        ident = row.get('discovery_hash')
        if not isinstance(ident,str) or not re.fullmatch(r'[0-9a-fA-F]{32}|[0-9a-fA-F]{64}',ident) or not _number(lat,85.05112878) or not _number(lon,180) or (lat==0 and lon==0):
            rejected += 1; continue
        ident = ident.lower()
        if ident in nodes:
            duplicates += 1; continue
        stamp = row.get('last_heard')
        updated = datetime.fromtimestamp(stamp,timezone.utc).isoformat() if type(stamp) in (float,int) and 0<stamp<=time.time()+300 else None
        nodes[ident] = dict(id=ident, name=_text(row.get('name')) or 'Public interface', role='Repeater' if row.get('transport') is True or kind in ('BackboneInterface','TCPServerInterface') else 'Interface', lat=round(lat,3), lon=round(lon,3), updated=updated, source='REPMAP', reported_role=kind, location_quality='Operator-published approximate position')
    if not nodes:
        raise DirectoryError('No valid operator-published Reticulum positions; previous snapshot retained')
    return dict(nodes=list(nodes.values()),received=len(payload),rejected=rejected,duplicates=duplicates,unmapped=unmapped)


class PublicMeshDirectory:
    def __init__(self, path: Path, fetcher=fetch_meshcore, *, normalizer=normalize, provider="MeshCore", max_cache_age=MAX_CACHE_AGE):
        self.path = path
        self.fetcher = fetcher
        self.normalizer = normalizer
        self.provider = provider
        self.max_cache_age = max_cache_age
        self.lock = threading.Lock()
        self.last_attempt = float('-inf')
        self.retry_delay = MIN_REFRESH
        self.progress_lock = threading.Lock()
        self.progress = {'phase':'idle','received_bytes':0,'total_bytes':None}

    def _progress(self, **fields):
        with self.progress_lock:
            self.progress.update(fields)

    def download_status(self):
        with self.progress_lock:
            return {**self.progress, 'retry_seconds':max(0,math.ceil(self.retry_delay-(time.monotonic()-self.last_attempt)))}

    def snapshot(self):
        try:
            with self.path.open('rb') as stream:
                raw = stream.read(MAX_BYTES+1)
            if len(raw)>MAX_BYTES: raise ValueError('Cache too large')
            data = json.loads(raw)
            age = max(0,time.time()-data['downloaded_at'])
            if data.get('schema')!=1 or not isinstance(data['nodes'],list) or len(data['nodes'])>MAX_ROWS:
                raise ValueError('Invalid cache')
            if age > self.max_cache_age:
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
            if now-self.last_attempt < self.retry_delay:
                raise DirectoryError(f'Please wait {math.ceil(self.retry_delay-(now-self.last_attempt))} seconds before retrying')
            self.last_attempt = now
            self.retry_delay = MIN_REFRESH
            self._progress(phase='connecting', received_bytes=0, total_bytes=None, error=None)
            try:
                payload = self.fetcher(self._progress) if self.fetcher in (fetch_meshcore, fetch_meshtastic, fetch_reticulum) else self.fetcher()
                self._progress(phase='processing')
                result = self.normalizer(payload)
                del payload
            except DirectoryError as exc:
                self.retry_delay = getattr(exc,'retry_seconds',FAILURE_RETRY)
                self.last_attempt = time.monotonic()
                self._progress(phase='failed',error=str(exc))
                raise
            except Exception as exc:
                self.retry_delay = FAILURE_RETRY
                self.last_attempt = time.monotonic()
                self._progress(phase='failed',error='Directory processing failed')
                raise DirectoryError(f'{self.provider} directory failed ({type(exc).__name__}); previous snapshot retained') from exc
            self._progress(phase='saving')
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
            self._progress(phase='complete',cached_count=len(result['nodes']))
            self.last_attempt = time.monotonic()
            return {**result,'state':'cached','cached_count':len(result['nodes'])}
        except (OSError,DirectoryError) as exc:
            if self.download_status()['phase'] == 'saving':
                self.retry_delay = FAILURE_RETRY
                self.last_attempt = time.monotonic()
                self._progress(phase='failed',error='Cache save failed')
            raise
        finally:
            self.lock.release()

    def clear(self):
        if not self.lock.acquire(blocking=False):
            raise DirectoryError('Directory action already running')
        try:
            self.path.unlink(missing_ok=True)
            self._progress(phase='idle',received_bytes=0,total_bytes=None,error=None)
            return {'state':'empty','nodes':[],'cached_count':0}
        finally:
            self.lock.release()
