"""Loopback-only OpenRF API and local web interface; no third-party Python packages."""
from __future__ import annotations

import argparse
import json
import logging
import os
import tempfile
import sqlite3
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote, parse_qs

from . import __version__
from .offline_maps import (available_maps, tile_bytes, import_map, remove_map,
                           MapNotFound, MapExists, MapBusy, TileMissing, MAX_IMPORT_BYTES)
from .map_areas import (list_areas, get_area, save_area, remove_area, area_geojson, area_tile_manifest, build_subset, AreaError)
from .tile_archive import import_xyz_zip, TileArchiveError, MAX_ZIP_BYTES
from . import vector_maps
from .hardware import status_report, enumerate_serial_ports, serial_port_diagnostics
from .readiness import readiness_report
from .hardware_manager import manager_report
from .sdr import capability_report as sdr_capability_report
from .sdr_capture import SdrCaptureManager, CaptureError
from .radio import RadioReceiver, RadioError
from .mesh import MeshManager, MeshError
from .mesh import validate_send as validate_mesh_send
from .reticulum_lan import ReticulumManager, ReticulumError, rnode_readiness
from .reticulum_lan import validate_message as validate_lxmf_message
from .mesh_connections import connection_report
from .wifi_halow import status_report as halow_status_report
from .halow_diagnostics import diagnostic_report as halow_diagnostic_report, HaLowDiagnosticError
from .field_network import readiness_report as field_network_readiness_report
from .field_hotspot import HotspotManager, HotspotError
from .offline_navigation_readiness import readiness_report as offline_navigation_readiness_report
from . import camera_catalog, chirp_channels, national_alpr, camera_routes
from .sdr_survey import capture_sites_geojson
from .routing import local_route, local_status, RouteUnavailable, RouteError
from .gnss import read_local_gpsd
from .geocoding import (search as address_search, provider as geocoder_provider,
                       configuration_status as geocoder_status, save_maptiler_key,
                       GeocoderUnavailable, GeocoderError)
from .drivers.wifi_nmcli import scan_once, WifiScanUnavailable
from .drivers.ble_bluez import scan_once as ble_scan_once, BleScanUnavailable
from .drivers.serial_openrf import query_port, SerialSensorError
from .storage import Repository, to_csv, to_geojson
from .emergency import EmergencyStore
from .emergency_packs import STARTER_PACK
from .emergency_sos import compose_draft
from .emergency_protocol import compose as compose_checkin_frame, compose_ack, parse as parse_checkin_frame
from .emergency_dashboard import build_dashboard
from .device_survival import report as device_survival_report
from .emergency_backup import create as make_emergency_backup, inspect as inspect_emergency_backup, available as backup_crypto_available
from .restore import exclusive_lock as restore_exclusive_lock
from .breadcrumbs import BreadcrumbStore
from .offline_trails import TrailStore
from .reports import investigation_report, report_html
from .survey_waypoints import waypoints_geojson
from .sensor_connections import (connections, ScanReceiptStore, BleScanReceiptStore,
    verified_wifi_observation, verified_ble_observation, browser_location_details)

STATIC_DIR = Path(__file__).resolve().parent / 'static'
DEFAULT_DB = Path.home() / '.local' / 'share' / 'openrf' / 'openrf.sqlite3'


class OpenRFHTTPServer(ThreadingHTTPServer):
    def server_close(self):
        if hasattr(self, 'hotspot_manager') and self.hotspot_manager.state_file.exists():
            try:
                self.hotspot_manager.stop({}, internal=True)
            except (HotspotError, OSError) as exc:
                logging.warning('OpenRF-owned hotspot cleanup needs manual retry: %s', type(exc).__name__)
        if hasattr(self, 'national_alpr_manager'):
            self.national_alpr_manager.close()
        if hasattr(self, 'radio_receiver'):
            self.radio_receiver.close()
        if hasattr(self, 'mesh_manager'):
            self.mesh_manager.close()
        if hasattr(self, 'reticulum_manager'):
            self.reticulum_manager.close()
        if hasattr(self, 'sdr_captures'):
            self.sdr_captures.close()
        if hasattr(self,'recovery_lock'):
            self.recovery_lock.__exit__(None,None,None)
            del self.recovery_lock
        super().server_close()


class Handler(BaseHTTPRequestHandler):
    server_version = 'OpenRF/' + __version__

    @property
    def repo(self):
        return self.server.repository

    def _send(self, status, raw: bytes, mime: str, extra_headers: dict | None = None, cache_control='no-store'):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', cache_control)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' https://unpkg.com 'unsafe-inline'; connect-src 'self' https://tiles.openfreemap.org https://unpkg.com https://*.openfreemap.org https://basemap.nationalmap.gov; img-src 'self' data: blob: https://*.openfreemap.org https://basemap.nationalmap.gov; font-src 'self' data: https://*.openfreemap.org; worker-src 'self' blob:")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def _json(self, status: int, obj):
        raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self._send(status, raw, 'application/json; charset=utf-8')

    def _error(self, status, message, error_code=None):
        self._json(status, {'error': message, **({'error_code': error_code} if error_code else {})})

    def _allowed_host(self):
        # Prevent DNS-rebinding attacks; only loopback access is intended.
        host = self.headers.get('Host', '').lower()
        return host in {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}', f'[::1]:{self.server.server_port}'}

    def _allowed_origin(self):
        origin = self.headers.get('Origin')
        return not origin or origin.lower() in {f'http://localhost:{self.server.server_port}', f'http://127.0.0.1:{self.server.server_port}'}

    def _decode_body(self):
        if not self.headers.get('Content-Type', '').lower().startswith('application/json'):
            raise ValueError('Content-Type must be application/json')
        length = int(self.headers.get('Content-Length', '0'))
        request_path = urlparse(self.path).path
        max_size = 25*1024*1024 if request_path == '/api/emergency/backup/inspect' else (300000 if request_path == '/api/radio/profiles/import' else (200000 if request_path == '/api/emergency/packs/install' else (24576 if request_path == '/api/emergency/library' else 16384)))
        if request_path == '/api/navigation/trails/import':
            max_size = 750000  # One explicitly chosen GPX file, capped again during parsing.
        if length < 1 or length > max_size:
            raise ValueError(f'JSON request must be 1–{max_size} bytes')
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError('Malformed JSON') from exc

    def do_GET(self):
        if not self._allowed_host():
            return self._error(HTTPStatus.FORBIDDEN, 'Loopback-only service')
        path = urlparse(self.path).path
        if path.startswith('/api/emergency/attempts/'):
            ident=path.rsplit('/',1)[-1]
            if not ident.isascii() or not ident.isdecimal() or len(ident)>10:
                return self._error(400,'Invalid emergency draft ID')
            try:
                mesh_history=self.server.mesh_manager.messages()
                self.server.emergency_store.refresh_mesh_receipts(mesh_history.get('messages',[]))
            except (MeshError, OSError, sqlite3.Error):
                logging.warning('Could not reconcile emergency Meshtastic routing receipts')
            return self._json(200,{'attempts':self.server.emergency_store.send_attempts(int(ident)),
                                   'note':'Meshtastic routing ACK is NOT recipient reading confirmation. Reticulum remains queue/route status only.'})
        if path == '/api/emergency/outbox':
            return self._json(200,{'entries':self.server.emergency_store.outbox(),
                'note':'Local queue only; entries are NEVER sent automatically.'})
        if path == '/api/navigation/trails':
            return self._json(200,{'trails':self.server.trail_store.list(),
                'note':'User-imported offline GPX geometry only; never verified, live or safe to travel.'})
        if path.startswith('/api/navigation/trails/'):
            parts=path.split('/')
            if len(parts) not in (5,6) or not parts[4].isascii() or not parts[4].isdecimal() or len(parts[4])>10:
                return self._error(400,'Invalid offline trail ID')
            try:
                ident=int(parts[4])
                if len(parts)==5:
                    return self._json(200,self.server.trail_store.get(ident))
                if len(parts)==6 and parts[5]=='geojson':
                    return self._json(200,self.server.trail_store.geojson(ident))
            except ValueError as exc:
                return self._error(404,str(exc))
            return self._error(404,'Unknown offline trail resource')
        if path == '/api/navigation/breadcrumbs':
            return self._json(200,{'sessions':self.server.breadcrumb_store.sessions(),
                'note':'Opt-in browser position history; not live tracking or verified trail mapping.'})
        if path.startswith('/api/navigation/breadcrumbs/'):
            parts=path.split('/')
            if len(parts) not in (5,6) or not parts[4].isascii() or not parts[4].isdecimal() or len(parts[4])>10:
                return self._error(400,'Invalid track ID')
            try:
                ident=int(parts[4])
                if len(parts)==6 and parts[5]=='geojson':
                    return self._json(200,self.server.breadcrumb_store.geojson(ident))
                if len(parts)==6 and parts[5]=='gpx':
                    raw=self.server.breadcrumb_store.gpx(ident).encode('utf-8')
                    return self._send(200,raw,'application/gpx+xml; charset=utf-8',
                        {'Content-Disposition':f'attachment; filename="openrf-breadcrumb-{ident}.gpx"'})
                if len(parts)==5:
                    return self._json(200,self.server.breadcrumb_store.geometry(ident))
            except ValueError as exc:
                return self._error(404,str(exc))
            return self._error(404,'Unknown track resource')
        if path == '/api/emergency/teams':
            return self._json(200,{'members':self.server.emergency_store.team_members(),
                'note':'Saved locally; no location or message is automatically shared with a group.'})
        if path == '/api/emergency/checkins':
            return self._json(200,{'checkins':self.server.emergency_store.checkins(),
                'note':'Locally saved self or secondhand reports, not authenticated live device positions.'})
        if path == '/api/emergency/dashboard':
            store=self.server.emergency_store
            return self._json(200,build_dashboard(store.checkins(),store.inbox_candidates(),
                store.outbox(),store.team_members(),self.server.mesh_manager.status(),
                self.server.reticulum_manager.status()))
        if path == '/api/emergency/device-readiness':
            return self._json(200,device_survival_report(self.server.repository.path))
        if path == '/api/emergency/backup/status':
            return self._json(200,{'available':backup_crypto_available(),
                'max_database_bytes':16*1024*1024,'restore_available':False,
                'offline_restore_cli_available':True,
                'restore_preview_command':'python3 -m openrf.restore --preview --backup /path/to/backup.orfbak',
                'restore_command':'python3 -m openrf.restore --backup /path/to/backup.orfbak',
                'scope':'OpenRF primary SQLite database only; not map caches, external radio histories or local files',
                'note':'Encryption requires optional cryptography library. Stop OpenRF fully before CLI restore; a safety copy is retained. Passphrase is never saved.'})
        if path == '/api/emergency/preflight':
            return self._json(200,{'checks':self.server.emergency_store.preflight(),
                'note':'Manual confirmations are local and historical; not proof of live hardware readiness.'})
        if path == '/api/emergency/inbox':
            candidates=self.server.emergency_store.inbox_candidates()
            for candidate in candidates:
                candidate['protocol']=parse_checkin_frame(candidate['body'])
            return self._json(200,{'candidates':candidates,
                'note':'Radio messages require review; no verified person or position.'})
        if path == '/api/emergency/checkins.geojson':
            features=[]
            for row in self.server.emergency_store.checkins():
                if row['latitude'] is None or row['longitude'] is None:
                    continue
                features.append({'type':'Feature','geometry':{'type':'Point',
                    'coordinates':[row['longitude'],row['latitude']]},'properties':{
                    'person':row['person'],'status':row['status'],'source':row['source'],
                    'recorded_utc':row['recorded_utc'],'accuracy_m':row['accuracy_m'],
                    'warning':'Stored reported position; NOT live or independently verified'}})
            return self._json(200,{'type':'FeatureCollection','features':features})
        if path == '/api/emergency/transport-readiness':
            mesh=self.server.mesh_manager.status()
            reticulum=self.server.reticulum_manager.status()
            return self._json(200,{
                'meshtastic':{'ready_for_operator_send':mesh['connected'] and mesh['mode']=='normal',
                              'connected':mesh['connected'],'mode':mesh['mode'],
                              'note':'USB connection is not proof of RF reachability.'},
                'reticulum':{'ready_for_operator_send':reticulum['enabled'],
                             'enabled':reticulum['enabled'],
                             'note':'An enabled Reticulum process is not proof of path or recipient delivery.'},
                'outbox_mode':'MANUAL_SEND_ONLY','automatic_retry':False})
        if path == '/api/emergency/packs/starter':
            raw = json.dumps(STARTER_PACK,ensure_ascii=False,indent=2).encode('utf-8')
            return self._send(200,raw,'application/json; charset=utf-8',
                              {'Content-Disposition':'attachment; filename="openrf-field-readiness-starter.json"'})
        if path == '/api/emergency/library':
            query = parse_qs(urlparse(self.path).query).get('q',[''])[0]
            try:
                return self._json(200, {'references':self.server.emergency_store.search_references(query),
                                        'notice':'Locally saved user references; verify source, date and accuracy.'})
            except ValueError as exc:
                return self._error(400,str(exc))
        if path == '/api/emergency/records':
            return self._json(200, {'records': self.server.emergency_store.list(),
                                    'transmission_available': False,
                                    'message': 'SOS drafts are stored locally; no emergency transmission is configured.'})
        # Serve only the six approved OpenRF brand-kit images, never an
        # arbitrary client-supplied file path or private local-data directory.
        brand_images = {
            '/favicon.ico': 'openrf-icon-32.png',
            '/static/assets/openrf-icon-32.png': 'openrf-icon-32.png',
            '/static/assets/openrf-icon-180.png': 'openrf-icon-180.png',
            '/static/assets/openrf-icon-192.png': 'openrf-icon-192.png',
            '/static/assets/openrf-icon-512.png': 'openrf-icon-512.png',
            '/static/assets/openrf-wordmark-light.png': 'openrf-wordmark-light.png',
            '/static/assets/openrf-tower-light.png': 'openrf-tower-light.png',
        }
        if path in brand_images:
            image_file = STATIC_DIR / 'assets' / brand_images[path]
            if not image_file.is_file() or image_file.is_symlink():
                return self._error(500, 'OpenRF brand image missing')
            try:
                raw = image_file.read_bytes()
            except OSError:
                return self._error(500, 'OpenRF brand image unreadable')
            return self._send(200, raw, 'image/png', cache_control='private, max-age=86400')
        if path == '/static/assets/fa-location-arrow.svg':
            # Single audited CC BY 4.0 offline icon; never serve arbitrary paths.
            icon_file = STATIC_DIR / 'assets' / 'fa-location-arrow.svg'
            if not icon_file.is_file() or icon_file.is_symlink():
                return self._error(500, 'Navigation icon missing')
            try:
                raw = icon_file.read_bytes()
            except OSError:
                return self._error(500, 'Navigation icon unreadable')
            return self._send(200, raw, 'image/svg+xml; charset=utf-8', cache_control='private, max-age=86400')
        if path == '/manifest.webmanifest':
            manifest_file = STATIC_DIR / 'manifest.webmanifest'
            if not manifest_file.is_file() or manifest_file.is_symlink():
                return self._error(500, 'OpenRF app manifest missing')
            try:
                raw = manifest_file.read_bytes()
            except OSError:
                return self._error(500, 'OpenRF app manifest unreadable')
            return self._send(200, raw, 'application/manifest+json; charset=utf-8')
        if path in ('/static/vendor/maplibre-gl.js', '/static/vendor/maplibre-gl.css'):
            suffix = '.js' if path.endswith('.js') else '.css'
            installed = self.server.map_asset_directory / ('maplibre-gl-5.24.0' + suffix)
            bundled = STATIC_DIR / 'vendor' / ('maplibre-gl' + suffix)
            asset = installed if installed.is_file() and not installed.is_symlink() else bundled
            if not asset.is_file() or asset.is_symlink():
                return self._error(503,'Local MapLibre runtime missing')
            try: raw=asset.read_bytes()
            except OSError: return self._error(500,'MapLibre runtime inaccessible')
            return self._send(200,raw,'text/javascript; charset=utf-8' if suffix=='.js' else 'text/css; charset=utf-8',cache_control='private, max-age=86400')
        # Approved OpenRF custom vector styles and regional OSM-derived tiles.
        # Nothing is proxied to third parties; external online sources are
        # referenced only by the explicitly selected online style JSON.
        if path == '/api/vector/streets':
            params=parse_qs(urlparse(self.path).query)
            if set(params)-{'q'} or len(params.get('q',[])) != 1:
                return self._error(400,'Supply a single street-name prefix')
            query=params['q'][0]
            if len(query)>140:
                return self._error(400,'Street-name prefix too long')
            return self._json(200,{'results':vector_maps.street_name_suggestions(query),
                'source':'OSM-derived regional offline road names',
                'geocoded':False,'house_numbers_verified':False,
                'coverage':'Amador/Calaveras prototype region; no precise address coordinates'})
        if path == '/api/vector/status':
            return self._json(200, vector_maps.status())
        if path in ('/api/vector/styles/dark.json','/api/vector/styles/light.json',
                    '/api/vector/styles/satellite.json','/api/vector/styles/topographic.json'):
            mode = parse_qs(urlparse(self.path).query).get('offline',['0'])
            if len(mode)!=1 or mode[0] not in ('0','1'):
                return self._error(400,'Unsupported map source')
            try:
                return self._json(200,vector_maps.style(path.rsplit('/',1)[-1][:-5], offline=mode[0]=='1'))
            except ValueError as exc:
                return self._error(503,str(exc))
        if path.startswith('/api/vector/tiles/'):
            import re
            m=re.fullmatch(r'/api/vector/tiles/(\d{1,2})/(\d{1,8})/(\d{1,8})\.pbf',path)
            if not m:return self._error(404,'Unknown vector tile')
            try:
                raw, compressed=vector_maps.tile(*(int(i) for i in m.groups()))
                headers={'Content-Encoding':'gzip'} if compressed else {}
                return self._send(200,raw,'application/vnd.mapbox-vector-tile',headers,cache_control='private, max-age=120')
            except (ValueError,OSError,sqlite3.Error):
                return self._error(404,'Vector tile unavailable outside regional coverage')
        if path.startswith('/api/vector/fonts/'):
            import re
            m=re.fullmatch(r'/api/vector/fonts/([^/]+)/(\d{1,5})-(\d{1,5})\.pbf',path)
            if not m:return self._error(404,'Invalid font request')
            try:
                raw=vector_maps.font(unquote(m.group(1)),int(m.group(2)),int(m.group(3)))
                return self._send(200,raw,'application/x-protobuf',cache_control='private, max-age=86400')
            except (ValueError,OSError):
                return self._error(404,'Local glyph range unavailable')
        if path == '/api/meta':
            return self._json(200, {'version': __version__, 'platform': 'Linux / Raspberry Pi', 'mode': 'local-only', 'scan_active': self.server.sdr_captures.status()['running']})
        if path == '/api/cameras/snapshot':
            return self._json(200, self.server.national_alpr_manager.status())
        if path == '/api/cameras':
            params = parse_qs(urlparse(self.path).query)
            if set(params)-{'bounds'} or len(params.get('bounds',[]))!=1:
                return self._error(400,'Provide map bounds [west,south,east,north].')
            try:
                bounds=json.loads(params['bounds'][0])
                return self._json(200,camera_catalog.list_sites(self.repo,bounds))
            except (ValueError,TypeError,json.JSONDecodeError) as exc:
                return self._error(400,str(exc))
        if path == '/api/radio/profiles':
            return self._json(200,{'profiles':chirp_channels.profiles(self.repo),
                'mode':'IMPORT_ONLY','radio_write_enabled':False})
        if path == '/api/health':
            return self._json(200, {'status': 'ok', 'version': __version__})
        if path == '/api/maps/areas':
            try:
                return self._json(200, {'areas': list_areas(self.server.map_directory),
                    'source': 'user-planned-regions', 'downloads_enabled': False})
            except AreaError as exc:
                return self._error(409, str(exc))
        if path.startswith('/api/maps/areas/') and path.endswith('.geojson'):
            ident = path[len('/api/maps/areas/'):-len('.geojson')]
            try:
                plan = get_area(self.server.map_directory, ident)
                raw = json.dumps(area_geojson(plan), ensure_ascii=False, indent=2).encode('utf-8')
                return self._send(200, raw, 'application/geo+json; charset=utf-8',
                                  {'Content-Disposition': 'attachment; filename="openrf-area-' + ident + '.geojson"'})
            except AreaError as exc:
                return self._error(404, str(exc))
        if path.startswith('/api/maps/areas/') and path.endswith('.plan.json'):
            ident = path[len('/api/maps/areas/'):-len('.plan.json')]
            try:
                plan = get_area(self.server.map_directory, ident)
                raw = json.dumps(area_tile_manifest(plan), ensure_ascii=False, indent=2).encode('utf-8')
                return self._send(200, raw, 'application/json; charset=utf-8',
                                  {'Content-Disposition': 'attachment; filename="openrf-tile-plan-' + ident + '.json"'})
            except AreaError as exc:
                return self._error(404, str(exc))
        if path == '/api/maps':
            return self._json(200, {'maps': available_maps(self.server.map_directory),
                                    'storage': 'local-raster-mbtiles',
                                    'downloads_enabled': False, 'imports_enabled': True, 'max_import_bytes': MAX_IMPORT_BYTES})
        if path.startswith('/api/maps/') and '/tiles/' in path:
            pieces = path.split('/')
            if len(pieces) != 8 or pieces[:3] != ['', 'api', 'maps'] or pieces[4] != 'tiles':
                return self._error(404, 'Not found')
            try:
                zoom, x = int(pieces[5]), int(pieces[6])
                if not pieces[7].endswith('.png'):
                    return self._error(404, 'Not found')
                y = int(pieces[7][:-4])
                raw, mime = tile_bytes(self.server.map_directory, pieces[3], zoom, x, y)
                return self._send(200, raw, mime, cache_control='no-store')
            except (MapNotFound, TileMissing, ValueError, OSError):
                return self._error(404, 'Tile unavailable in local offline package')
            except Exception:
                logging.exception('Invalid local map file')
                return self._error(404, 'Tile unavailable in local offline package')
        if path.startswith('/api/reports/sessions/'):
            # Only read-only session reports; no arbitrary path lookup or stored
            # report file in the app/project tree. GET does not mutate a session.
            suffix = path[len('/api/reports/sessions/'):]
            ident, dot, kind = suffix.partition('.')
            if not dot or kind not in ('json', 'html') or not ident.isascii() or not ident.isdecimal() or len(ident) > 12:
                return self._error(404, 'Unknown report format')
            try:
                session_id = int(ident)
                if not 1 <= session_id <= 2_147_483_647:
                    raise ValueError()
                query = parse_qs(urlparse(self.path).query, keep_blank_values=True)
                if set(query) - {'include_demo', 'include_coordinates', 'download'} or any(
                    len(v) != 1 or v[0] not in ('0', '1') for v in query.values()):
                    return self._error(400, 'Unsupported report options')
                if kind == 'json' and query.get('download', ['0'])[0] == '0':
                    pass  # JSON always downloads, no behavior difference.
                snapshot = self.repo.session_report_snapshot(
                    session_id,
                    include_demo=query.get('include_demo', ['0'])[0] == '1',
                    include_coordinates=query.get('include_coordinates', ['0'])[0] == '1')
                if snapshot is None:
                    return self._error(404, 'Investigation not found')
                result = investigation_report(snapshot)
                name = f'openrf-investigation-{session_id}.{kind}'
                disposition = 'attachment' if kind == 'json' or query.get('download', ['0'])[0] == '1' else 'inline'
                raw = (json.dumps(result, ensure_ascii=False, indent=2).encode('utf-8')
                       if kind == 'json' else report_html(result))
                mime = 'application/json; charset=utf-8' if kind == 'json' else 'text/html; charset=utf-8'
                return self._send(200, raw, mime, {'Content-Disposition': f'{disposition}; filename="{name}"'})
            except ValueError:
                return self._error(400, 'Invalid report selection')
        if path == '/api/navigation/gnss':
            # Deliberate follow-mode poll only; never a background service.
            # Header prevents casual cross-origin/prefetch location reads.
            if self.headers.get('X-OpenRF-GNSS-Consent') != 'navigation-follow' or not self._allowed_origin():
                return self._error(403, 'Local GNSS requires active navigation consent.')
            if urlparse(self.path).query:
                return self._error(400, 'GNSS polling does not accept query parameters.')
            return self._json(200, read_local_gpsd())
        if path == '/api/navigation/routing/status':
            return self._json(200, local_status())
        if path == '/api/navigation/offline-readiness':
            if urlparse(self.path).query:
                return self._error(400, 'Offline navigation preflight accepts no query parameters')
            return self._json(200, offline_navigation_readiness_report(
                route_status=local_status(), vector_status=vector_maps.status(),
                raster_maps=available_maps(self.server.map_directory)))
        if path == '/api/navigation/geocoding/status':
            return self._json(200, geocoder_status())
        if path == '/api/navigation/geocode':
            params = parse_qs(urlparse(self.path).query)
            if set(params) - {'q', 'online', 'mode'} or len(params.get('q', [])) != 1 or \
               (('online' in params) and params.get('online') != ['1']) or \
               (('mode' in params) and (len(params['mode']) != 1 or params['mode'][0] not in ('final', 'auto'))) :
                return self._error(400, 'Provide one address search query.')
            if params.get('online') == ['1'] and self.headers.get('X-OpenRF-Address-Consent') != 'yes':
                return self._error(403, 'Online address search requires an explicit in-app opt-in request.')
            try:
                return self._json(200, address_search(params['q'][0], online_allowed=params.get('online') == ['1'],
                                                     final=params.get('mode') == ['final'],
                                                     autocomplete=params.get('mode') == ['auto']))
            except GeocoderUnavailable as exc:
                return self._error(503, str(exc), 'geocoder_unavailable')
            except GeocoderError as exc:
                return self._error(400, str(exc), 'geocoder_error')
        if path == '/api/navigation/destinations':
            return self._json(200, {'destinations': self.repo.list_destinations(),
                                     'routing_status': 'local_valhalla_opt_in',
                                     'location_tracking': False})
        if path == '/api/survey/waypoints':
            return self._json(200, self.repo.list_waypoints())
        if path == '/api/survey/waypoints.geojson':
            query = parse_qs(urlparse(self.path).query, keep_blank_values=True)
            if set(query) != {'session_id'} or len(query['session_id']) != 1:
                return self._error(400, 'Specify one investigation ID to export waypoints')
            ident = query['session_id'][0]
            if not ident.isascii() or not ident.isdecimal() or not 1 <= len(ident) <= 10:
                return self._error(400, 'Invalid investigation ID')
            session_id = int(ident)
            if not any(row['id'] == session_id for row in self.repo.sessions()):
                return self._error(404, 'Investigation not found')
            result = self.repo.list_waypoints(session_id=session_id, limit=100000)
            if len(result['waypoints']) > 100000 or result['truncated']:
                return self._error(409, 'Too many waypoints for this export')
            raw = json.dumps(waypoints_geojson(result['waypoints'], session_id), ensure_ascii=False, indent=2).encode('utf-8')
            return self._send(200, raw, 'application/geo+json; charset=utf-8',
                {'Content-Disposition': f'attachment; filename="openrf-survey-waypoints-{session_id}.geojson"'})
        if path == '/api/observations':
            return self._json(200, {'observations': self.repo.list_observations()})
        if path == '/api/sessions':
            return self._json(200, {'sessions': self.repo.sessions()})
        if path == '/api/captures':
            return self._json(200, {'captures': self.repo.captures()})
        if path == '/api/stats':
            return self._json(200, self.repo.stats())
        if path == '/api/radio/status':
            return self._json(200, self.server.radio_receiver.status())
        if path == '/api/mesh/status':
            return self._json(200, self.server.mesh_manager.status())
        if path == '/api/mesh/connections':
            return self._json(200, connection_report(self.server.mesh_manager,
                                                      self.server.reticulum_manager))
        if path == '/api/mesh/messages':
            return self._json(200, self.server.mesh_manager.messages())
        if path == '/api/reticulum/status':
            return self._json(200, self.server.reticulum_manager.status())
        if path == '/api/reticulum/rnode/readiness':
            return self._json(200, rnode_readiness())
        if path == '/api/reticulum/diagnostics':
            try:
                return self._json(200, self.server.reticulum_manager.diagnostics())
            except ReticulumError as exc:
                return self._error(exc.status, str(exc), exc.code)
        if path == '/api/reticulum/messages':
            try:
                return self._json(200, self.server.reticulum_manager.messages())
            except ReticulumError as exc:
                return self._error(exc.status, str(exc), exc.code)
        if path == '/api/reticulum/contacts':
            return self._json(200, self.server.reticulum_manager.contacts())
        if path == '/api/reticulum/history':
            return self._json(200, self.server.reticulum_manager.history_status())
        if path == '/api/mesh/nodes':
            return self._json(200, self.server.mesh_manager.nodes())
        if path.startswith('/api/radio/audio/') and path.endswith('.wav'):
            ident = path[len('/api/radio/audio/'):-len('.wav')]
            try:
                audio = self.server.radio_receiver.audio(ident)
                return self._send(200, audio, 'audio/wav', cache_control='no-store')
            except RadioError as exc:
                return self._error(exc.status, str(exc), exc.code)
        if path == '/api/sdr/status':
            report = sdr_capability_report()
            report['capture'] = self.server.sdr_captures.status()
            return self._json(200, report)
        if path == '/api/sdr/capture':
            return self._json(200, self.server.sdr_captures.status())
        if path in ('/api/sdr/survey/sites', '/api/sdr/survey/sites.geojson'):
            params = parse_qs(urlparse(self.path).query)
            if set(params) - {'session_id'} or ('session_id' in params and len(params['session_id']) != 1):
                return self._error(400, 'Optional single investigation ID only')
            session_id = None
            if 'session_id' in params:
                text = params['session_id'][0]
                if not text.isascii() or not text.isdecimal() or not 1 <= int(text) <= 2_147_483_647:
                    return self._error(400, 'Invalid investigation ID')
                session_id = int(text)
            try:
                sites = self.server.sdr_captures.list_sites(session_id)
            except CaptureError as exc:
                return self._error(exc.status, str(exc), exc.code)
            if path.endswith('.geojson'):
                raw = json.dumps(capture_sites_geojson(sites, session_id), ensure_ascii=False, indent=2).encode('utf-8')
                return self._send(200, raw, 'application/geo+json; charset=utf-8',
                    {'Content-Disposition': 'attachment; filename="openrf-sdr-observer-sites.geojson"'})
            return self._json(200, {'sites': sites, 'count': len(sites),
                'meaning': 'EXPLICIT_BROWSER_OPERATOR_POSITIONS_OF_COMPLETED_SDR_SWEEPS_NOT_TRANSMITTER_LOCATIONS'})
        if path == '/api/sdr/captures':
            return self._json(200, {'captures': self.server.sdr_captures.list_saved(),
                                    'storage': 'private_local_server_only'})
        if path.startswith('/api/sdr/captures/') and path.endswith('.csv'):
            capture_id = path[len('/api/sdr/captures/'):-4]
            try:
                raw = self.server.sdr_captures.csv(capture_id)
            except CaptureError as exc:
                return self._error(exc.status, str(exc), exc.code)
            return self._send(200, raw, 'text/csv; charset=utf-8',
                              {'Content-Disposition': f'attachment; filename="openrf-rtl-power-{capture_id}.csv"'})
        if path == '/api/hardware':
            return self._json(200, status_report())
        if path == '/api/hardware/manager':
            return self._json(200, manager_report(status_report(),
                                                   last_probe=self.server.serial_last_probe))
        if path == '/api/wifi-halow/status':
            return self._json(200, halow_status_report())
        if path == '/api/network/field-readiness':
            if urlparse(self.path).query:
                return self._error(400, 'Field network inspection accepts no query parameters')
            return self._json(200, field_network_readiness_report())
        if path == '/api/network/hotspot/status':
            if urlparse(self.path).query:
                return self._error(400, 'Hotspot status accepts no query parameters')
            try:
                return self._json(200, self.server.hotspot_manager.status())
            except HotspotError as exc:
                return self._error(exc.status, str(exc), exc.code)
        if path == '/api/wifi-halow/diagnostics':
            query = parse_qs(urlparse(self.path).query, keep_blank_values=True)
            if (set(query) != {'interface'} or len(query['interface']) != 1 or
                    not query['interface'][0]):
                return self._error(400, 'Choose exactly one candidate HaLow interface')
            try:
                return self._json(200, halow_diagnostic_report(query['interface'][0]))
            except HaLowDiagnosticError as exc:
                return self._error(exc.status, str(exc))
        if path == '/api/hardware/readiness':
            return self._json(200, readiness_report(status_report(),
                last_probe=self.server.serial_last_probe,
                last_wifi_scan=self.server.scan_receipts.summary()))
        if path == '/api/sensors':
            hardware = status_report()
            return self._json(200, {'schema_version': 2, 'sensors': connections(hardware),
                                   'wifi_last_scan': self.server.scan_receipts.summary(),
                                   'ble_last_scan': self.server.ble_receipts.summary(),
                                   'serial_transport': {'protocol': 'openrf.serial.v1',
                                     'ports': hardware['serial_ports'], 'port_details': hardware['serial_port_details'],
                                     'last_probe': self.server.serial_last_probe,
                                     'mode': 'user-triggered probe and snapshot only; no background acquisition'}})
        if path == '/api/sensors/diagnostics':
            hardware = status_report()
            return self._json(200, {
                'collected_at_utc': hardware['inventory_collected_utc'],
                'wifi': {'prerequisites': hardware['wifi_one_shot'],
                         'last_retrieval': self.server.scan_receipts.summary(),
                         'explanation': 'One-shot NetworkManager retrieval, possibly cached; never equivalent to passive packet capture'},
                'ble': {'prerequisites': hardware.get('bluetooth_readiness'), 'last_retrieval': self.server.ble_receipts.summary(),
                        'explanation': 'Opt-in BlueZ LE-only scan; no pairing, device connection, background monitoring or implied stable IDs.'},
                'receiver_status': 'Bounded user-started rtl_power SDR sweep is available when installed with compatible Linux-visible receiver; continuous SDR/cellular capture is unavailable. BLE and USB Serial v1 remain opt-in.',
                'serial_transport': {'protocol': 'openrf.serial.v1', 'ports': hardware['serial_ports'],
                   'port_details': hardware['serial_port_details'], 'last_probe': self.server.serial_last_probe, 'port_diagnostics': serial_port_diagnostics()},
                'hardware_is_measurement': False,
            })
        if path == '/api/export.geojson':
            raw = json.dumps(to_geojson(self.repo.list_observations()), ensure_ascii=False, indent=2).encode('utf-8')
            return self._send(200, raw, 'application/geo+json; charset=utf-8', {'Content-Disposition': 'attachment; filename="openrf-observations.geojson"'})
        if path == '/api/export.csv':
            raw = ('\ufeff' + to_csv(self.repo.list_observations())).encode('utf-8')
            return self._send(200, raw, 'text/csv; charset=utf-8', {'Content-Disposition': 'attachment; filename="openrf-observations.csv"'})
        if path in ('/', '/index.html'):
            file = STATIC_DIR / 'index.html'
        elif path in ('/static/app.css', '/static/app.js', '/static/map-elevation.js', '/static/field-breadcrumbs.js', '/static/breadcrumb_follow.js', '/static/emergency-tabs.js', '/static/emergency.js', '/static/emergency-library.js', '/static/emergency-sos.js', '/static/emergency-handoff.js', '/static/emergency-teams.js', '/static/emergency-checkins.js', '/static/emergency-inbox.js', '/static/emergency-protocol.js', '/static/emergency-dashboard.js', '/static/emergency-survival.js', '/static/emergency-backup.js', '/static/field-calendar.js', '/static/history-analysis.js', '/static/navigation.js', '/static/route_guidance.js', '/static/navigation_health.js', '/static/offline_readiness.js', '/static/survey_map.js', '/static/spectrum.js', '/static/spectrum-analysis.js', '/static/sdr-history.js', '/static/radio.js', '/static/mesh.js', '/static/mesh_connections.js', '/static/field_network.js', '/static/field_hotspot.js', '/static/wifi_halow.js', '/static/reticulum.js', '/static/camera-layers.js', '/static/chirp-import.js'):
            file = STATIC_DIR / Path(path).name
        elif path == '/static/offline-trails.js':
            file = STATIC_DIR / 'offline-trails.js'
        else:
            return self._error(404, 'Not found')
        try:
            raw = file.read_bytes()
        except OSError:
            return self._error(500, 'Static resource missing')
        mime = 'text/html; charset=utf-8' if file.suffix == '.html' else ('text/css; charset=utf-8' if file.suffix == '.css' else 'text/javascript; charset=utf-8')
        self._send(200, raw, mime)

    def do_POST(self):
        if not self._allowed_host() or not self._allowed_origin():
            return self._error(HTTPStatus.FORBIDDEN, 'Cross-origin requests are not allowed')
        path = urlparse(self.path).path
        if path.startswith('/api/maps/areas/') and path.endswith('/import-xyz'):
            # Locally selected raster tile ZIP only. Never fetch provider URLs,
            # download tiles, or accept arbitrary target paths from the client.
            area_id = path[len('/api/maps/areas/'):-len('/import-xyz')]
            if self.headers.get('Content-Type', '').lower().split(';')[0] not in ('application/zip', 'application/octet-stream'):
                return self._error(415, 'Select a local .zip raster tile archive')
            try:
                declared = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                return self._error(400, 'Invalid ZIP size')
            if not 100 <= declared <= MAX_ZIP_BYTES:
                self.close_connection = True
                return self._error(413, 'ZIP size must be 100 bytes–512 MiB')
            try:
                result = import_xyz_zip(self.server.map_directory, area_id,
                    self.headers.get('X-OpenRF-Map-Id', ''), self.rfile, declared,
                    unquote(self.headers.get('X-OpenRF-Attribution', '')),
                    unquote(self.headers.get('X-OpenRF-Source-Name', '')),
                    self.headers.get('X-OpenRF-Tile-Scheme', 'xyz').lower(),
                    self.headers.get('X-OpenRF-Rights-Confirmed', '') == 'true',
                    self.server.map_lock)
                return self._json(201, result)
            except (MapBusy, MapExists) as exc:
                self.close_connection = True
                return self._error(409, str(exc))
            except (AreaError, TileArchiveError, ValueError, OSError) as exc:
                self.close_connection = True
                return self._error(400, str(exc))
        if path == '/api/cameras/snapshot/upload':
            # Explicit operator-selected local GeoJSON(.gz) backup; never accept
            # filesystem paths or arbitrary URLs supplied by the browser.
            if self.headers.get('Content-Type','').split(';')[0].lower()!='application/octet-stream':
                return self._error(415,'Select a local GeoJSON or GeoJSON.gz file')
            try:declared=int(self.headers.get('Content-Length','0'))
            except ValueError:return self._error(400,'Invalid uploaded file length')
            if not 100<=declared<=national_alpr.MAX_DOWNLOAD_BYTES:
                self.close_connection=True
                return self._error(413,'Snapshot file must be 100 bytes to 128 MiB')
            if self.server.national_alpr_manager.status()['running']:
                self.close_connection=True
                return self._error(409,'An ALPR import is already running')
            temp_path=None
            try:
                with tempfile.NamedTemporaryFile(prefix='.alpr-upload-',suffix='.geojson',
                        dir=self.repo.path.parent,delete=False) as dest:
                    temp_path=Path(dest.name)
                    remaining=declared
                    while remaining:
                        chunk=self.rfile.read(min(65536,remaining))
                        if not chunk:raise ValueError('Incomplete file upload')
                        dest.write(chunk);remaining-=len(chunk)
                result=self.server.national_alpr_manager.start_uploaded(temp_path)
                temp_path=None
                return self._json(202,result)
            except (ValueError,OSError,national_alpr.SnapshotError) as exc:
                self.close_connection=True
                return self._error(400,str(exc))
            finally:
                if temp_path is not None:
                    temp_path.unlink(missing_ok=True)
        if path == '/api/maps/import':
            # A browser-selected file only. Never fetch a remote URL, traverse
            # arbitrary local filesystem paths, or decode the whole file in RAM.
            if self.headers.get('Content-Type', '').lower().split(';')[0] != 'application/octet-stream':
                return self._error(415, 'Select a local .mbtiles file for upload')
            try:
                declared = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                return self._error(400, 'Invalid upload size')
            if not 100 <= declared <= MAX_IMPORT_BYTES:
                self.close_connection = True
                return self._error(413, 'Upload must be between 100 bytes and 1 GiB')
            map_id = self.headers.get('X-OpenRF-Map-Id', '')
            try:
                installed = import_map(self.server.map_directory, map_id,
                                       self.rfile, declared, self.server.map_lock)
                return self._json(201, {'map': installed})
            except MapExists as exc:
                self.close_connection = True
                return self._error(409, str(exc))
            except MapBusy as exc:
                self.close_connection = True
                return self._error(409, str(exc))
            except (MapNotFound, ValueError, OSError) as exc:
                self.close_connection = True
                return self._error(400, str(exc))
        try:
            body = self._decode_body()
            if not isinstance(body, dict):
                raise ValueError('Expected a JSON object')
            if path == '/api/emergency/packs/install':
                return self._json(200, self.server.emergency_store.install_pack(body))
            if path == '/api/emergency/sos/draft':
                return self._json(201, {'record':self.server.emergency_store.add(compose_draft(body)),
                                        'transmitted':False})
            if path == '/api/emergency/protocol/prepare':
                frame=compose_checkin_frame(body)
                record=self.server.emergency_store.add({'kind':'sos_draft',
                    'title':f'ORF1 check-in · {body["person"].strip()}',
                    'details':frame['text']})
                return self._json(201,{'frame':frame,'draft_id':record['id'],'sent':False,
                    'note':'Prepared only; queue by explicit action, then send manually.'})
            if path == '/api/emergency/protocol/ack':
                if set(body)!={'message_id'}:
                    raise ValueError('Provide message_id only')
                return self._json(200,{'text':compose_ack(body['message_id']),'sent':False,
                    'note':'Text acknowledgment draft only; no reply transmitted.'})
            if path == '/api/emergency/preflight':
                if set(body)!={'key','checked'}:
                    raise ValueError('Preflight requires key and checked only')
                return self._json(200,self.server.emergency_store.set_preflight(body['key'],body['checked']))
            if path == '/api/navigation/trails/import':
                return self._json(201,{'trail':self.server.trail_store.import_gpx(body),
                    'note':'Sanitized user-supplied GPX coordinates stored separately and locally. Not a safe route.'})
            if path == '/api/navigation/breadcrumbs':
                if set(body) not in ({'label'},{'label','travel_mode'}):
                    raise ValueError('Track start requires label and optional travel_mode only')
                return self._json(201,{'session':self.server.breadcrumb_store.start(body['label'],body.get('travel_mode','pedestrian')),
                    'recording':'BROWSER_GEOLOCATION_ONLY','automatic_start':False})
            if path.startswith('/api/navigation/breadcrumbs/'):
                parts=path.split('/')
                if len(parts)!=6 or not parts[4].isascii() or not parts[4].isdecimal() or len(parts[4])>10:
                    raise ValueError('Invalid track action')
                ident=int(parts[4])
                if parts[5]=='points':
                    return self._json(201,self.server.breadcrumb_store.append(ident,body))
                if parts[5]=='stop':
                    if body:
                        raise ValueError('Stop requires an empty object')
                    return self._json(200,{'stopped':self.server.breadcrumb_store.stop(ident)})
                return self._error(404,'Unknown track action')
            if path == '/api/emergency/backup/create':
                if set(body)!={'passphrase'}:
                    raise ValueError('Backup requires passphrase only')
                encrypted=make_emergency_backup(self.server.repository.path,body['passphrase'])
                return self._send(200,encrypted,'application/octet-stream',
                    {'Content-Disposition':'attachment; filename="openrf-private-backup.orfbak"'})
            if path == '/api/emergency/backup/inspect':
                if set(body)!={'passphrase','bundle'} or not isinstance(body['bundle'],str):
                    raise ValueError('Preview requires passphrase and encrypted bundle')
                return self._json(200,inspect_emergency_backup(body['bundle'].encode('utf-8'),body['passphrase']))
            if path == '/api/emergency/outbox':
                if set(body)!={'draft_id','transport','destination','channel','text'}:
                    raise ValueError('Invalid offline queue fields')
                draft_id=body['draft_id']
                if type(draft_id) is not int or not 1<=draft_id<=2_147_483_647:
                    raise ValueError('Invalid SOS draft ID')
                if body['transport']=='meshtastic':
                    if body['destination']=='^all':
                        raise ValueError('Emergency queue requires a direct recipient')
                    try:
                        selected=validate_mesh_send({'text':body['text'],'destination':body['destination'],'channel':body['channel']})
                    except MeshError as exc:
                        return self._error(exc.status,str(exc),exc.code)
                elif body['transport']=='reticulum':
                    if body['channel'] is not None:
                        raise ValueError('Reticulum queue does not use a channel')
                    try:
                        selected=validate_lxmf_message({'text':body['text'],'destination':body['destination']})
                    except ReticulumError as exc:
                        return self._error(exc.status,str(exc),exc.code)
                    selected['channel']=None
                else:
                    raise ValueError('Unknown emergency transport')
                return self._json(201,{'entry':self.server.emergency_store.queue_message(draft_id,body['transport'],
                    selected['destination'],selected['channel'],selected['text']),
                    'sent':False,'note':'Stored locally only. Requires an explicit later send.'})
            if path == '/api/emergency/teams':
                if set(body)!={'group_name','alias','transport','destination','channel'}:
                    raise ValueError('Invalid team member fields')
                if body['transport']=='meshtastic':
                    if body['destination']=='^all':
                        raise ValueError('Team members must have direct radio addresses')
                    try:
                        selected=validate_mesh_send({'text':'Team address check',
                            'destination':body['destination'],'channel':body['channel']})
                    except MeshError as exc:
                        return self._error(exc.status,str(exc),exc.code)
                elif body['transport']=='reticulum':
                    if body['channel'] is not None:
                        raise ValueError('Reticulum does not use channel indices')
                    try:
                        selected=validate_lxmf_message({'text':'Team address check','destination':body['destination']})
                    except ReticulumError as exc:
                        return self._error(exc.status,str(exc),exc.code)
                    selected['channel']=None
                else:
                    raise ValueError('Unsupported group transport')
                return self._json(201,{'member':self.server.emergency_store.add_team_member(
                    body['group_name'],body['alias'],body['transport'],selected['destination'],selected['channel'])})
            if path == '/api/emergency/teams/queue':
                if set(body)!={'group_name','draft_id','text'} or type(body['draft_id']) is not int or not isinstance(body['text'],str):
                    raise ValueError('Invalid team queue fields')
                members=sorted((m for m in self.server.emergency_store.team_members() if m['group_name']==body['group_name']),key=lambda item:item['id'])
                deliveries=[{'member_id':member['id'],'text':body['text']} for member in members]
                return self._json(201,self.server.emergency_store.queue_team(body['draft_id'],body['group_name'],deliveries))
            if path == '/api/emergency/checkins':
                return self._json(201,{'checkin':self.server.emergency_store.add_checkin(body),
                                       'shared':False,'sent':False})
            if path == '/api/emergency/inbox/scan':
                if body:
                    raise ValueError('Inbox scan requires an empty object')
                mesh=self.server.mesh_manager.messages()
                reticulum=self.server.reticulum_manager.messages()
                count=self.server.emergency_store.import_radio_candidates('meshtastic',mesh.get('messages',[]))
                count+=self.server.emergency_store.import_radio_candidates('reticulum',reticulum.get('messages',[]))
                return self._json(200,{'new_candidates':count,'sent':False,'automatic_monitoring':False})
            if path.startswith('/api/emergency/inbox/'):
                parts=path.split('/')
                if len(parts)!=6 or not parts[4].isascii() or not parts[4].isdecimal() or len(parts[4])>10:
                    raise ValueError('Invalid inbox entry')
                return self._json(200,self.server.emergency_store.review_radio_candidate(int(parts[4]),parts[5],body))
            if path.startswith('/api/emergency/outbox/'):
                segments=path.split('/')
                if len(segments)!=6 or not segments[4].isascii() or not segments[4].isdecimal() or len(segments[4])>10:
                    raise ValueError('Invalid outbox request')
                entry_id=int(segments[4]);action=segments[5]
                if body:
                    raise ValueError('Outbox action requires an empty object')
                if action=='prepare-retry':
                    changed=self.server.emergency_store.prepare_queued_retry(entry_id)
                    return self._json(200 if changed else 409,{'ready':changed,'sent':False})
                if action!='send':
                    return self._error(404,'Unknown outbox action')
                entry=self.server.emergency_store.claim_queued(entry_id)
                if entry is None:
                    return self._error(409,'Outbox item is not ready. No transmission attempted.')
                status='SEND_FAILED_NOT_DELIVERED'
                result={}
                try:
                    if entry['transport']=='meshtastic':
                        result=self.server.mesh_manager.send({'text':entry['outbound_text'],
                            'destination':entry['destination'],'channel':entry['channel']})
                        status='SUBMITTED_TO_RADIO_NOT_DELIVERED' if result.get('submitted_to_radio') else status
                    else:
                        result=self.server.reticulum_manager.send({'text':entry['outbound_text'],
                            'destination':entry['destination']})
                        value=result.get('status')
                        if value in ('QUEUED_WITH_LXMF_NOT_DELIVERED','PATH_REQUESTED_NOT_SENT','NO_RECALLED_IDENTITY_NOT_SENT'):
                            status=value
                except (MeshError,ReticulumError) as exc:
                    logging.info('Explicit emergency queued send failed: %s',exc.code)
                except Exception:
                    logging.exception('Unexpected emergency queued send failure')
                self.server.emergency_store.finish_queued(entry_id,status)
                attempt=self.server.emergency_store.record_send_attempt(entry['draft_id'],entry['transport'],
                    entry['destination'],status,text=entry['outbound_text'],channel=entry['channel'],
                    packet_id=result.get('packet_id') if entry['transport']=='meshtastic' else None)
                return self._json(202,{'outbox_id':entry_id,'attempt':attempt,'delivered_to_person':False,
                    'note':'Submission/queueing does not prove recipient delivery.'})
            if path == '/api/emergency/sos/handoff':
                if set(body) != {'draft_id','transport','destination','channel','text'}:
                    raise ValueError('Invalid emergency handoff fields')
                draft_id=body['draft_id']
                if type(draft_id) is not int or draft_id<1 or draft_id>2_147_483_647:
                    raise ValueError('Invalid SOS draft ID')
                if not self.server.emergency_store.get_sos_draft(draft_id):
                    return self._error(404,'Unsent SOS draft not found')
                transport=body['transport']
                destination=body['destination']
                if not isinstance(destination,str):
                    raise ValueError('Invalid recipient')
                if transport == 'meshtastic':
                    if destination == '^all':
                        raise ValueError('Emergency handoff requires a specific Meshtastic node, not broadcast')
                    try:
                        validated=validate_mesh_send({'text':body['text'],'destination':destination,'channel':body['channel']})
                    except MeshError as exc:
                        return self._error(exc.status,str(exc),exc.code)
                    try:
                        result=self.server.mesh_manager.send(validated)
                    except MeshError as exc:
                        self.server.emergency_store.record_send_attempt(draft_id,transport,destination,'SEND_FAILED_NOT_DELIVERED',
                                                                        text=validated['text'],channel=validated['channel'])
                        return self._error(exc.status,str(exc),exc.code)
                    status='SUBMITTED_TO_RADIO_NOT_DELIVERED' if result.get('submitted_to_radio') else 'SEND_FAILED_NOT_DELIVERED'
                elif transport == 'reticulum':
                    if body['channel'] is not None:
                        raise ValueError('Reticulum handoff does not use a Meshtastic channel')
                    try:
                        validated=validate_lxmf_message({'text':body['text'],'destination':destination})
                    except ReticulumError as exc:
                        return self._error(exc.status,str(exc),exc.code)
                    try:
                        result=self.server.reticulum_manager.send(validated)
                    except ReticulumError as exc:
                        self.server.emergency_store.record_send_attempt(draft_id,transport,destination,'SEND_FAILED_NOT_DELIVERED',
                                                                        text=validated['text'])
                        return self._error(exc.status,str(exc),exc.code)
                    status=result.get('status')
                    if status not in ('QUEUED_WITH_LXMF_NOT_DELIVERED','PATH_REQUESTED_NOT_SENT','NO_RECALLED_IDENTITY_NOT_SENT'):
                        status='SEND_FAILED_NOT_DELIVERED'
                else:
                    raise ValueError('Choose Meshtastic or Reticulum')
                attempt=self.server.emergency_store.record_send_attempt(draft_id,transport,destination,status,
                    text=validated['text'],channel=validated['channel'] if transport=='meshtastic' else None,
                    packet_id=result.get('packet_id') if transport=='meshtastic' else None)
                return self._json(202,{'attempt':attempt,'delivered_to_person':False,
                                       'note':'Radio submission or LXMF queueing is NOT a confirmed human receipt.'})
            if path == '/api/emergency/library':
                return self._json(201, {'reference':self.server.emergency_store.add_reference(body)})
            if path == '/api/emergency/records':
                return self._json(201, {'record': self.server.emergency_store.add(body)})
            if path.startswith('/api/emergency/checklists/'):
                ident = path.rsplit('/', 1)[-1]
                if not ident.isascii() or not ident.isdecimal() or len(ident) > 10 or set(body) != {'completed'}:
                    raise ValueError('Invalid checklist update')
                updated = self.server.emergency_store.complete(int(ident), body['completed'])
                return self._json(200 if updated else 404, {'updated': updated})
            if path in ('/api/network/hotspot/start', '/api/network/hotspot/stop'):
                if urlparse(self.path).query:
                    raise ValueError('Hotspot actions accept no query parameters')
                try:
                    action = self.server.hotspot_manager.start if path.endswith('/start') else self.server.hotspot_manager.stop
                    return self._json(200, action(body))
                except HotspotError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/radio/profiles/import':
                if set(body) != {'name','model','csv'}:
                    raise ValueError('Import only a named CHIRP CSV radio profile.')
                return self._json(201,{'profile':chirp_channels.import_csv(self.repo,body['name'],body['model'],body['csv'])})
            if path == '/api/mesh/connect':
                try:
                    reticulum = self.server.reticulum_manager.status()
                    if (isinstance(body.get('port'), str) and reticulum['enabled'] and
                            body['port'] in reticulum.get('rnode_ports',
                                                        [reticulum.get('rnode_port')])):
                        raise MeshError('That USB port is already assigned to the running Reticulum RNode. Stop Reticulum first.',
                                        'mesh_port_in_use_by_reticulum', 409)
                    return self._json(200, self.server.mesh_manager.connect(body))
                except MeshError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path.startswith('/api/reticulum/'):
                try:
                    manager = self.server.reticulum_manager
                    if path == '/api/reticulum/start':
                        selected = body.get('rnode')
                        selected_ports = [selected.get('port')] if isinstance(selected, dict) else []
                        if isinstance(body.get('rnodes'), list):
                            selected_ports.extend(item.get('port') for item in body['rnodes'] if isinstance(item, dict))
                        mesh = self.server.mesh_manager.status()
                        if mesh['connected'] and mesh.get('port') in selected_ports:
                            raise ReticulumError('That USB port is already in use by Meshtastic. Disconnect Mesh messages first.',
                                                 'rnode_port_in_use_by_mesh', 409)
                        return self._json(200, manager.start(body))
                    if path == '/api/reticulum/stop':
                        return self._json(200, manager.stop(body))
                    if path == '/api/reticulum/announce':
                        return self._json(200, manager.announce(body))
                    if path == '/api/reticulum/send':
                        return self._json(202, manager.send(body))
                    if path == '/api/reticulum/contacts':
                        return self._json(200, manager.save_contact(body))
                    if path == '/api/reticulum/contacts/delete':
                        return self._json(200, manager.delete_contact(body))
                    if path == '/api/reticulum/history':
                        return self._json(200, manager.set_history(body))
                    if path == '/api/reticulum/history/clear':
                        return self._json(200, manager.clear_history(body))
                except ReticulumError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/mesh/disconnect':
                if body:
                    raise ValueError('Disconnect accepts an empty JSON object only')
                return self._json(200, self.server.mesh_manager.disconnect())
            if path == '/api/mesh/mode':
                try:
                    return self._json(200, self.server.mesh_manager.set_mode(body))
                except MeshError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/mesh/history':
                try:
                    return self._json(200, self.server.mesh_manager.set_history(body))
                except MeshError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/mesh/nodes/alias':
                try:
                    return self._json(200, self.server.mesh_manager.set_alias(body))
                except MeshError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/mesh/history/clear':
                if body:
                    raise ValueError('Clear history accepts an empty object only.')
                return self._json(200, self.server.mesh_manager.clear_history())
            if path == '/api/mesh/send':
                try:
                    return self._json(202, self.server.mesh_manager.send(body))
                except MeshError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/cameras/snapshot/update':
                if body:
                    raise ValueError('Nationwide download accepts an empty JSON object only.')
                try:
                    return self._json(202,self.server.national_alpr_manager.start())
                except national_alpr.SnapshotError as exc:
                    return self._error(409,str(exc))
            if path == '/api/cameras':
                return self._json(201,{'camera':camera_catalog.add_manual(self.repo,body)})
            if path == '/api/cameras/import-osm':
                if set(body) != {'bounds'}:
                    raise ValueError('Import requires only the selected map bounds.')
                if not self.server.alpr_import_lock.acquire(blocking=False):
                    return self._error(409,'ALPR import is already running.')
                try:
                    return self._json(200,{'import':camera_catalog.import_feed(self.repo,body['bounds'])})
                except (ValueError,OSError,TimeoutError) as exc:
                    return self._error(503,f'ALPR download/import unavailable: {exc}')
                finally:
                    self.server.alpr_import_lock.release()
            if path == '/api/radio/start':
                if set(body) != {'frequency_mhz', 'mode', 'duration_seconds'}:
                    raise ValueError('Receive requests accept frequency_mhz, mode and duration_seconds only')
                try:
                    with self.server.receiver_start_lock:
                        if self.server.sdr_captures.status()['running']:
                            raise RadioError('Stop the SDR spectrum sweep before starting radio reception.', 'receiver_busy')
                        record = self.server.radio_receiver.start(body)
                    return self._json(202, {'radio': record})
                except RadioError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/radio/stop':
                if body:
                    raise ValueError('Stop accepts an empty JSON object only')
                try:
                    return self._json(200, {'radio': self.server.radio_receiver.stop()})
                except RadioError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/sdr/capture/start':
                if set(body) - {'start_mhz', 'stop_mhz', 'step_khz', 'duration_seconds', 'survey_location', 'session_id'}:
                    raise ValueError('Unexpected SDR capture fields; no browser-supplied RF readings accepted')
                settings = {key: value for key, value in body.items() if key not in ('survey_location', 'session_id')}
                session_id = body.get('session_id')
                if session_id is not None:
                    if type(session_id) is not int or session_id < 1:
                        raise ValueError('Invalid investigation ID')
                    if not any(row['id'] == session_id and row['status'] == 'ACTIVE' for row in self.repo.sessions()):
                        raise ValueError('Investigation must exist and be active at sweep start')
                try:
                    with self.server.receiver_start_lock:
                        if self.server.radio_receiver.status()['running']:
                            raise CaptureError('Stop radio reception before starting an SDR spectrum sweep.', 'receiver_busy')
                        record = self.server.sdr_captures.start(settings, survey_location=body.get('survey_location'), session_id=session_id)
                    return self._json(202, {'capture': record})
                except CaptureError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/sdr/capture/stop':
                if body:
                    raise ValueError('Stop request takes no measurement data')
                try:
                    return self._json(200, {'capture': self.server.sdr_captures.stop()})
                except CaptureError as exc:
                    return self._error(exc.status, str(exc), exc.code)
            if path == '/api/maps/areas':
                if set(body) - {'name', 'bounds', 'minzoom', 'maxzoom'}:
                    raise ValueError('Unexpected map area fields')
                created = save_area(self.server.map_directory, body.get('name'), body.get('bounds'),
                                    body.get('minzoom'), body.get('maxzoom'), self.server.map_lock)
                return self._json(201, {'area': created})
            if path.startswith('/api/maps/areas/') and path.endswith('/build'):
                if set(body) - {'source_map_id', 'output_map_id', 'rights_confirmed'}:
                    raise ValueError('Unexpected map build fields; remote URLs are not supported')
                area_id = path[len('/api/maps/areas/'):-len('/build')]
                built = build_subset(self.server.map_directory, area_id,
                    body.get('source_map_id'), body.get('output_map_id'),
                    body.get('rights_confirmed'), self.server.map_lock)
                return self._json(201, built)
            if path == '/api/navigation/geocoding/config':
                if set(body) != {'maptiler_key'}:
                    raise ValueError('Only maptiler_key may be configured.')
                return self._json(200, save_maptiler_key(body['maptiler_key']))
            if path == '/api/navigation/route':
                if set(body) not in ({'locations'}, {'locations', 'options'}):
                    raise ValueError('Only route locations and optional routing preferences are allowed.')
                try:
                    result = local_route(body['locations'], **({'options':body['options']} if 'options' in body else {}))
                    return self._json(200, {'route': result, 'camera_report': camera_routes.route_cameras(self.repo, result)
                                            if result.get('travel_mode')!='pedestrian' else None})
                except RouteUnavailable as exc:
                    return self._error(503, str(exc), 'routing_unavailable')
                except RouteError as exc:
                    return self._error(422, str(exc), 'routing_error')
            if path == '/api/navigation/camera-comparison':
                if not {'locations','types'} <= set(body) or set(body)-{'locations','types','options','mode'}:
                    raise ValueError('Only route locations, camera categories, priority mode and optional preferences are accepted.')
                try:
                    extra={key:body[key] for key in ('options','mode') if key in body}
                    data = camera_routes.compare(self.repo, body['locations'], body['types'], **extra)
                    return self._json(200, data)
                except RouteUnavailable as exc:
                    return self._error(503, str(exc), 'routing_unavailable')
                except RouteError as exc:
                    return self._error(422, str(exc), 'routing_error')
            if path == '/api/navigation/destinations':
                return self._json(201, {'destination': self.repo.add_destination(body)})
            if path == '/api/survey/waypoints':
                return self._json(201, {'waypoint': self.repo.record_waypoint(body)})
            if path == '/api/observations':
                # Do not let a manual browser entry falsely claim a measured hardware source.
                body['source'] = 'MANUAL'
                body['source_device'] = 'Manual browser entry'
                return self._json(201, self.repo.add_observation(body))
            if path == '/api/sessions':
                if set(body) - {'name', 'receiver_plan', 'site_label', 'objective', 'field_notes'}:
                    raise ValueError('Unknown investigation creation field')
                plan = {k: v for k, v in body.items() if k != 'name'}
                return self._json(201, self.repo.begin_session(body.get('name'), **plan))
            if path.startswith('/api/sessions/') and path.endswith('/plan'):
                ident = path[len('/api/sessions/'):-len('/plan')]
                if not ident.isascii() or not ident.isdecimal() or not 1 <= len(ident) <= 10:
                    raise ValueError('Invalid investigation ID')
                return self._json(200, {'session': self.repo.update_session_plan(int(ident), body)})
            if path.startswith('/api/sessions/') and path.endswith('/stop'):
                session_id = int(path.split('/')[3])
                return self._json(200, {'stopped': self.repo.stop_session(session_id)})
            if path in ('/api/sensors/serial/probe', '/api/sensors/serial/snapshot'):
                # Serialize the physical exchange, but RELEASE the mutex before
                # writing HTTP response bytes. Clients can issue the next request
                # immediately upon receiving a response (probe -> snapshot).
                allowed = {'port'} if path.endswith('/probe') else {'port', 'survey_location', 'session_id'}
                if set(body) - allowed:
                    raise ValueError('Unexpected fields: measured data cannot be submitted by the browser.')
                if not self.server.serial_lock.acquire(blocking=False):
                    return self._error(409, 'Another USB serial request is in progress.')
                try:
                    port = body.get('port')
                    current_ports = enumerate_serial_ports()
                    if port not in current_ports or not isinstance(port, str):
                        reply_status, reply = 409, {'error': 'Selected USB serial port is unavailable; refresh hardware inventory.'}
                    else:
                        try:
                            result = query_port(port, current_ports, snapshot=path.endswith('/snapshot'))
                        except SerialSensorError as exc:
                            self.server.serial_last_probe = {'port': port, 'status': 'failed',
                                'detail': str(exc), 'error_code': exc.code,
                                'at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                            reply_status, reply = 409, {'error': str(exc), 'error_code': exc.code}
                        else:
                            self.server.serial_last_probe = {'port': port, 'status': 'responding',
                                'hardware_id': result['hardware_id'], 'firmware_version': result.get('firmware_version'),
                                'at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                                'identity_verified': False}
                            if path.endswith('/probe'):
                                reply_status, reply = 200, result
                            else:
                                details = browser_location_details(body.get('survey_location'))
                                session_id = body.get('session_id')
                                reply_status, reply = 201, {'capture': self.repo.store_serial_capture(result, session_id, details),
                                                            'snapshot': result}
                finally:
                    self.server.serial_lock.release()
                return self._json(reply_status, reply)
            if path == '/api/ble/scan':
                if body:
                    raise ValueError('BLE scan request takes no client-provided RF data')
                if not self.server.ble_scan_lock.acquire(blocking=False):
                    return self._error(409, 'Another BLE scan is already in progress.', 'scan_busy')
                try:
                    now = time.monotonic()
                    if now - self.server.ble_scan_last < 15:
                        return self._error(429, 'Wait 15 seconds before another BLE scan.', 'scan_rate_limited')
                    self.server.ble_scan_last = now
                    try:
                        reply = self.server.ble_receipts.remember(ble_scan_once())
                        status_code = 200
                    except BleScanUnavailable as exc:
                        reply = {'error': str(exc), 'error_code': exc.code}
                        status_code = 409
                finally:
                    self.server.ble_scan_lock.release()
                return self._json(status_code, reply)
            if path == '/api/sensors/linux-ble/save':
                if set(body) - {'scan_id', 'address', 'survey_location', 'session_id'}:
                    raise ValueError('Unexpected BLE fields. The browser cannot submit measured RF data.')
                def save_ble(scan, device):
                    data, timestamp = verified_ble_observation(scan, device,
                        body.get('survey_location'), body.get('session_id'))
                    return self.repo.add_observation(data, observed_at_utc=timestamp)
                return self._json(201, self.server.ble_receipts.take(body.get('scan_id'), body.get('address'), save_ble))
            if path == '/api/wifi/scan':
                # Explicit foreground scan only. No background process or sensor data storage.
                if not self.server.wifi_scan_lock.acquire(blocking=False):
                    return self._error(409, 'A Wi-Fi scan is already in progress.')
                try:
                    now = time.monotonic()
                    if now - self.server.wifi_scan_last < 15:
                        return self._error(429, 'Wait at least 15 seconds before requesting another scan.')
                    self.server.wifi_scan_last = now
                    try:
                        return self._json(200, self.server.scan_receipts.remember(scan_once()))
                    except WifiScanUnavailable as exc:
                        return self._error(409, str(exc), error_code=exc.code)
                finally:
                    self.server.wifi_scan_lock.release()
            if path == '/api/sensors/networkmanager-wifi/save-scan':
                # Only server-retrieved network records are accepted; browser does
                # not supply signal values, device identifiers, or capture timestamps.
                def save_capture(scan, rows):
                    details = browser_location_details(body.get('survey_location'))
                    checked = [verified_wifi_observation(scan, row,
                               body.get('survey_location'), body.get('session_id')) for row in rows]
                    return self.repo.store_wifi_capture(scan, checked, body.get('session_id'), details)
                return self._json(201, self.server.scan_receipts.take_all(body.get('scan_id'), save_capture))
            if path == '/api/sensors/networkmanager-wifi/save':
                # The client supplies only a reference to a server-observed AP;
                # it cannot submit arbitrary measurements or SENSOR provenance.
                def save(scan, network):
                    data, observed_at = verified_wifi_observation(
                        scan, network, body.get('survey_location'), body.get('session_id'))
                    return self.repo.add_observation(data, observed_at_utc=observed_at)
                return self._json(201, self.server.scan_receipts.take(body.get('scan_id'), body.get('bssid'), save))
            if path == '/api/demo/load':
                return self._json(200, {'created': self.repo.load_demo()})
            if path == '/api/demo/clear':
                return self._json(200, {'removed': self.repo.clear_demo()})
            self._error(404, 'Not found')
        except (AreaError, ValueError, TypeError) as exc:
            self._error(400, str(exc))
        except (MapBusy, MapExists) as exc:
            self._error(409, str(exc))
        except Exception:
            logging.exception('Request failed')
            self._error(500, 'Internal server error')

    def do_DELETE(self):
        if not self._allowed_host() or not self._allowed_origin():
            return self._error(HTTPStatus.FORBIDDEN, 'Cross-origin requests are not allowed')
        path = urlparse(self.path).path
        if path.startswith('/api/emergency/outbox/'):
            ident=path.rsplit('/',1)[-1]
            if not ident.isascii() or not ident.isdecimal() or len(ident)>10:
                return self._error(400,'Invalid outbox ID')
            removed=self.server.emergency_store.delete_queued(int(ident))
            return self._json(200 if removed else 409,{'deleted':removed})
        if path.startswith('/api/emergency/teams/'):
            ident=path.rsplit('/',1)[-1]
            if not ident.isascii() or not ident.isdecimal() or len(ident)>10:
                return self._error(400,'Invalid team member ID')
            return self._json(200,{'deleted':self.server.emergency_store.delete_team_member(int(ident))})
        if path.startswith('/api/emergency/checkins/'):
            ident=path.rsplit('/',1)[-1]
            if not ident.isascii() or not ident.isdecimal() or len(ident)>10:
                return self._error(400,'Invalid check-in ID')
            return self._json(200,{'deleted':self.server.emergency_store.delete_checkin(int(ident))})
        if path.startswith('/api/emergency/library/'):
            ident = path.rsplit('/',1)[-1]
            if not ident.isascii() or not ident.isdecimal() or len(ident) > 10:
                return self._error(400,'Invalid reference ID')
            return self._json(200,{'deleted':self.server.emergency_store.delete_reference(int(ident))})
        if path.startswith('/api/emergency/records/'):
            ident = path.rsplit('/', 1)[-1]
            if not ident.isascii() or not ident.isdecimal() or len(ident) > 10:
                return self._error(400, 'Invalid emergency record ID')
            return self._json(200, {'deleted': self.server.emergency_store.delete(int(ident))})
        if path.startswith('/api/cameras/') and path.count('/')==3:
            ident=path.rsplit('/',1)[1]
            if not ident.isascii() or not ident.isdecimal() or len(ident)>10:
                return self._error(400,'Invalid camera ID')
            return self._json(200,{'deleted':camera_catalog.remove(self.repo,int(ident))})
        if path.startswith('/api/radio/profiles/') and path.count('/')==4:
            ident=path.rsplit('/',1)[1]
            if not ident.isascii() or not ident.isdecimal() or len(ident)>10:
                return self._error(400,'Invalid radio profile ID')
            return self._json(200,{'deleted':chirp_channels.delete(self.repo,int(ident))})
        if path.startswith('/api/sdr/captures/') and path.count('/') == 4:
            try:
                self.server.sdr_captures.delete(path.rsplit('/', 1)[1])
                return self._json(200, {'deleted': True})
            except CaptureError as exc:
                return self._error(exc.status, str(exc), exc.code)
        if path.startswith('/api/maps/areas/') and path.count('/') == 4:
            try:
                area_id = path.rsplit('/', 1)[1]
                remove_area(self.server.map_directory, area_id, self.server.map_lock)
                return self._json(200, {'removed': True})
            except MapBusy as exc:
                return self._error(409, str(exc))
            except AreaError as exc:
                return self._error(404, str(exc))
        if path.startswith('/api/maps/') and path.count('/') == 3:
            try:
                remove_map(self.server.map_directory, path.split('/')[3], self.server.map_lock)
                return self._json(200, {'removed': True})
            except MapBusy as exc:
                return self._error(409, str(exc))
            except MapNotFound:
                return self._error(404, 'Offline map not available')
            except OSError:
                return self._error(500, 'Could not remove local map file')
        if path.startswith('/api/navigation/destinations/') and path.count('/') == 4:
            segment = path.rsplit('/', 1)[1]
            if not segment.isascii() or not segment.isdecimal() or len(segment) > 10:
                return self._error(400, 'Invalid destination ID')
            return self._json(200, {'deleted': self.repo.delete_destination(int(segment))})
        if path.startswith('/api/navigation/trails/') and path.count('/')==4:
            ident=path.rsplit('/',1)[-1]
            if not ident.isascii() or not ident.isdecimal() or len(ident)>10:
                return self._error(400,'Invalid offline trail ID')
            return self._json(200,{'deleted':self.server.trail_store.delete(int(ident))})
        if path.startswith('/api/navigation/breadcrumbs/') and path.count('/')==4:
            ident=path.rsplit('/',1)[-1]
            if not ident.isascii() or not ident.isdecimal() or len(ident)>10:
                return self._error(400,'Invalid track ID')
            return self._json(200,{'deleted':self.server.breadcrumb_store.delete(int(ident))})
        if path.startswith('/api/survey/waypoints/') and path.count('/') == 4:
            segment = path.rsplit('/', 1)[1]
            if not segment.isascii() or not segment.isdecimal() or len(segment) > 10:
                return self._error(400, 'Invalid waypoint ID')
            return self._json(200, {'deleted': self.repo.delete_waypoint(int(segment))})
        if not path.startswith('/api/observations/'):
            return self._error(404, 'Not found')
        try:
            record_id = int(path.rsplit('/', 1)[1])
            return self._json(200, {'deleted': self.repo.delete_observation(record_id)})
        except ValueError:
            return self._error(400, 'Invalid observation ID')


def create_server(repository: Repository, port: int = 8765) -> ThreadingHTTPServer:
    server = OpenRFHTTPServer(('127.0.0.1', port), Handler)
    server.recovery_lock=restore_exclusive_lock(repository.path)
    try:
        server.recovery_lock.__enter__()
    except Exception:
        server.server_close()
        raise
    server.repository = repository
    server.emergency_store = EmergencyStore(repository.path)
    server.breadcrumb_store = BreadcrumbStore(repository.path)
    server.trail_store = TrailStore(repository.path.parent / 'imported-trails.sqlite3')
    server.map_directory = repository.path.parent / 'maps'
    server.map_lock = threading.Lock()
    server.map_asset_directory = repository.path.parent / 'assets'
    server.wifi_scan_lock = threading.Lock()
    server.scan_receipts = ScanReceiptStore()
    server.ble_scan_lock = threading.Lock()
    server.ble_receipts = BleScanReceiptStore()
    server.ble_scan_last = float('-inf')
    server.wifi_scan_last = float("-inf")
    server.serial_lock = threading.Lock()
    server.serial_last_probe = None
    server.receiver_start_lock = threading.Lock()
    server.sdr_captures = SdrCaptureManager(repository.path.parent / 'sdr-captures')
    server.radio_receiver = RadioReceiver()
    server.mesh_manager = MeshManager(history_path=repository.path.parent / 'mesh-history.sqlite3')
    server.reticulum_manager = ReticulumManager(repository.path.parent / 'reticulum')
    server.hotspot_manager = HotspotManager(repository.path.parent / 'field-network')
    server.alpr_import_lock = threading.Lock()
    server.national_alpr_manager = national_alpr.UpdateManager(repository)
    return server


def main():
    parser = argparse.ArgumentParser(description='OpenRF Linux Edition — local investigation dashboard')
    parser.add_argument('--port', type=int, default=8765, help='Local HTTP port (default 8765)')
    parser.add_argument('--db', type=Path, default=DEFAULT_DB, help='Local SQLite database path')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('--port must be between 1 and 65535')
    repo = Repository(args.db)
    server = create_server(repo, port=args.port)
    from .valhalla_startup import ensure_existing_valhalla
    print('Valhalla: '+ensure_existing_valhalla(), flush=True)
    print(f'OpenRF v{__version__} — http://localhost:{args.port}')
    print(f'Private database: {repo.path}')
    print('Loopback only; press Ctrl+C to stop. On-demand Linux Wi-Fi scans require a visible compatible adapter; RTL-SDR scans are user-triggered, bounded and require compatible Linux-visible hardware.', flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print('\nShutting down OpenRF...')
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
