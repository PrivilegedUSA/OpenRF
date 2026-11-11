"""Loopback-only OpenRF API and local web interface; no third-party Python packages."""
from __future__ import annotations

import argparse
import json
import logging
import os
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

from . import __version__
from .offline_maps import (available_maps, tile_bytes, import_map, remove_map,
                           MapNotFound, MapExists, MapBusy, TileMissing, MAX_IMPORT_BYTES)
from .map_areas import (list_areas, get_area, save_area, remove_area, area_geojson, area_tile_manifest, build_subset, AreaError)
from .tile_archive import import_xyz_zip, TileArchiveError, MAX_ZIP_BYTES
from .hardware import status_report, enumerate_serial_ports, serial_port_diagnostics
from .drivers.wifi_nmcli import scan_once, WifiScanUnavailable
from .drivers.serial_openrf import query_port, SerialSensorError
from .storage import Repository, to_csv, to_geojson
from .sensor_connections import connections, ScanReceiptStore, verified_wifi_observation, browser_location_details

STATIC_DIR = Path(__file__).resolve().parent / 'static'
DEFAULT_DB = Path.home() / '.local' / 'share' / 'openrf' / 'openrf.sqlite3'


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
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' https://unpkg.com 'unsafe-inline'; connect-src 'self' https://tiles.openfreemap.org https://unpkg.com https://*.openfreemap.org; img-src 'self' data: blob: https://*.openfreemap.org; font-src 'self' data: https://*.openfreemap.org; worker-src 'self' blob:")
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
        if length < 1 or length > 16384:
            raise ValueError('JSON request must be 1–16384 bytes')
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError('Malformed JSON') from exc

    def do_GET(self):
        if not self._allowed_host():
            return self._error(HTTPStatus.FORBIDDEN, 'Loopback-only service')
        path = urlparse(self.path).path
        if path in ('/static/vendor/maplibre-gl.js', '/static/vendor/maplibre-gl.css'):
            suffix = '.js' if path.endswith('.js') else '.css'
            asset = self.server.map_asset_directory / ('maplibre-gl-5.24.0' + suffix)
            if asset.is_file() and not asset.is_symlink():
                try:
                    raw = asset.read_bytes()
                except OSError:
                    return self._error(500, 'Local map library could not be read')
                return self._send(200, raw, 'text/javascript; charset=utf-8' if suffix == '.js' else 'text/css; charset=utf-8', cache_control='private, max-age=86400')
            # Preserve the existing online vector map for users who have not
            # installed the optional offline library; raster needs neither.
            url = f'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl{suffix}'
            return self._send(302, b'', 'text/plain', {'Location': url})
        if path == '/api/meta':
            return self._json(200, {'version': __version__, 'platform': 'Linux / Raspberry Pi', 'mode': 'local-only', 'scan_active': False})
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
        if path == '/api/observations':
            return self._json(200, {'observations': self.repo.list_observations()})
        if path == '/api/sessions':
            return self._json(200, {'sessions': self.repo.sessions()})
        if path == '/api/captures':
            return self._json(200, {'captures': self.repo.captures()})
        if path == '/api/stats':
            return self._json(200, self.repo.stats())
        if path == '/api/hardware':
            return self._json(200, status_report())
        if path == '/api/sensors':
            hardware = status_report()
            return self._json(200, {'schema_version': 2, 'sensors': connections(hardware),
                                   'wifi_last_scan': self.server.scan_receipts.summary(),
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
                'receiver_status': 'No standalone SDR, BLE, GPS, or cellular Linux driver is active. USB Serial v1 is a limited, opt-in protocol; no compatible module verified.',
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
        elif path in ('/static/app.css', '/static/app.js'):
            file = STATIC_DIR / Path(path).name
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
            if path == '/api/observations':
                # Do not let a manual browser entry falsely claim a measured hardware source.
                body['source'] = 'MANUAL'
                body['source_device'] = 'Manual browser entry'
                return self._json(201, self.repo.add_observation(body))
            if path == '/api/sessions':
                return self._json(201, self.repo.begin_session(body.get('name')))
            if path.startswith('/api/sessions/') and path.endswith('/stop'):
                session_id = int(path.split('/')[3])
                return self._json(200, {'stopped': self.repo.stop_session(session_id)})
            if path in ('/api/sensors/serial/probe', '/api/sensors/serial/snapshot'):
                # Browser can choose a currently inventoried port, not send sensor
                # values. One physical protocol exchange, initiated by the user.
                allowed = {'port'} if path.endswith('/probe') else {'port', 'survey_location', 'session_id'}
                if set(body) - allowed:
                    raise ValueError('Unexpected fields: measured data cannot be submitted by the browser.')
                if not self.server.serial_lock.acquire(blocking=False):
                    return self._error(409, 'Another USB serial request is in progress.')
                try:
                    port = body.get('port')
                    current_ports = enumerate_serial_ports()
                    if port not in current_ports or not isinstance(port, str):
                        return self._error(409, 'Selected USB serial port is unavailable; refresh hardware inventory.')
                    try:
                        result = query_port(port, current_ports, snapshot=path.endswith('/snapshot'))
                    except SerialSensorError as exc:
                        self.server.serial_last_probe = {'port': port, 'status': 'failed',
                            'detail': str(exc), 'error_code': exc.code, 'at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                        return self._error(409, str(exc), error_code=exc.code)
                    self.server.serial_last_probe = {'port': port, 'status': 'responding',
                        'hardware_id': result['hardware_id'], 'firmware_version': result.get('firmware_version'),
                        'at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                        'identity_verified': False}
                    if path.endswith('/probe'):
                        return self._json(200, result)
                    details = browser_location_details(body.get('survey_location'))
                    session_id = body.get('session_id')
                    return self._json(201, {'capture': self.repo.store_serial_capture(result, session_id, details),
                                             'snapshot': result})
                finally:
                    self.server.serial_lock.release()
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
        if not path.startswith('/api/observations/'):
            return self._error(404, 'Not found')
        try:
            record_id = int(path.rsplit('/', 1)[1])
            return self._json(200, {'deleted': self.repo.delete_observation(record_id)})
        except ValueError:
            return self._error(400, 'Invalid observation ID')


def create_server(repository: Repository, port: int = 8765) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.repository = repository
    server.map_directory = repository.path.parent / 'maps'
    server.map_lock = threading.Lock()
    server.map_asset_directory = repository.path.parent / 'assets'
    server.wifi_scan_lock = threading.Lock()
    server.scan_receipts = ScanReceiptStore()
    server.wifi_scan_last = float("-inf")
    server.serial_lock = threading.Lock()
    server.serial_last_probe = None
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
    print(f'OpenRF v{__version__} — http://localhost:{args.port}')
    print(f'Private database: {repo.path}')
    print('Loopback only; press Ctrl+C to stop. On-demand Linux Wi-Fi scans require a visible compatible adapter; continuous RF capture is inactive.', flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print('\nShutting down OpenRF...')
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
