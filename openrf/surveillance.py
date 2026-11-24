"""Opt-in local RTSP camera inventory and bounded FFmpeg MJPEG preview.

No scanning, background connections, recordings, or exposure of RTSP credentials in JSON.
"""
import ipaddress
import shutil
from contextlib import contextmanager
import sqlite3
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


class SurveillanceError(ValueError):
    pass


def validate_rtsp(value):
    if not isinstance(value, str) or len(value) > 1024 or any(ord(c) < 32 for c in value):
        raise SurveillanceError('Enter a valid RTSP URL (up to 1024 characters)')
    try:
        parts = urlsplit(value)
        ip = ipaddress.ip_address(parts.hostname or '')
        port = parts.port
    except (ValueError, TypeError) as exc:
        raise SurveillanceError('Use an explicit private-network IPv4 RTSP camera address') from exc
    if parts.scheme != 'rtsp' or ip.version != 4 or not ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or parts.fragment or port == 0:
        raise SurveillanceError('Only rtsp:// URLs to private LAN IPv4 cameras are supported')
    return value


def camera_public(row):
    host = urlsplit(row['rtsp_url']).hostname
    return {'id': row['id'], 'name': row['name'], 'type': 'RTSP', 'host': host,
            'state': 'NOT_CHECKED', 'connected': False, 'recording': False,
            'capabilities': {'live_preview': True, 'recording': False, 'onvif': False,
                             'battery_telemetry': False}, 'created_at_utc': row['created_at_utc']}


class SurveillanceStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        with self._connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS surveillance_cameras (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                rtsp_url TEXT NOT NULL, created_at_utc TEXT NOT NULL)''')

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(str(self.path), timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def list(self):
        with self.lock, self._connect() as db:
            return [camera_public(row) for row in db.execute('SELECT * FROM surveillance_cameras ORDER BY id')]

    def get_url(self, ident):
        ident = self._id(ident)
        with self.lock, self._connect() as db:
            row = db.execute('SELECT rtsp_url FROM surveillance_cameras WHERE id=?', (ident,)).fetchone()
        if row is None:
            raise SurveillanceError('Camera not found')
        return validate_rtsp(row['rtsp_url'])

    @staticmethod
    def _id(value):
        if type(value) is not int or not 1 <= value <= 2147483647:
            raise SurveillanceError('Invalid camera ID')
        return value

    def save(self, data, ident=None):
        if not isinstance(data, dict) or set(data) - {'name', 'rtsp_url'}:
            raise SurveillanceError('Only camera name and RTSP URL can be configured')
        name = data.get('name')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64 or any(ord(c)<32 for c in name):
            raise SurveillanceError('Camera name must be 1–64 printable characters')
        name = name.strip()
        with self.lock, self._connect() as db:
            if ident is None:
                url = validate_rtsp(data.get('rtsp_url'))
                if db.execute('SELECT COUNT(*) FROM surveillance_cameras').fetchone()[0] >= 32:
                    raise SurveillanceError('Maximum 32 saved cameras')
                cur = db.execute('INSERT INTO surveillance_cameras (name,rtsp_url,created_at_utc) VALUES (?,?,?)',
                                 (name, url, datetime.now(timezone.utc).isoformat()))
                ident = cur.lastrowid
            else:
                ident = self._id(ident)
                if 'rtsp_url' in data and data['rtsp_url']:
                    url = validate_rtsp(data['rtsp_url'])
                    cur = db.execute('UPDATE surveillance_cameras SET name=?,rtsp_url=? WHERE id=?', (name,url,ident))
                else:
                    cur = db.execute('UPDATE surveillance_cameras SET name=? WHERE id=?', (name,ident))
                if not cur.rowcount:
                    raise SurveillanceError('Camera not found')
            row = db.execute('SELECT * FROM surveillance_cameras WHERE id=?', (ident,)).fetchone()
            return camera_public(row)

    def delete(self, ident):
        ident = self._id(ident)
        with self.lock, self._connect() as db:
            return db.execute('DELETE FROM surveillance_cameras WHERE id=?', (ident,)).rowcount > 0


def capability_report():
    ffmpeg = shutil.which('ffmpeg')
    return {'ffmpeg': 'AVAILABLE' if ffmpeg else 'MISSING', 'rtsp_mjpeg_preview': bool(ffmpeg),
            'usb': 'NOT_IMPLEMENTED', 'onvif': 'NOT_IMPLEMENTED', 'recording': 'NOT_IMPLEMENTED',
            'automatic_connections': False,
            'note': 'Saved cameras are NOT connected or checked. Select View to request an on-demand RTSP preview.'}


class PreviewSlots:
    def __init__(self, capacity=2):
        self.semaphore = threading.BoundedSemaphore(capacity)
        self.active = set()
        self.lock = threading.Lock()

    def close(self):
        with self.lock:
            for process in list(self.active):
                process.terminate()

    def run(self, url, output, *, reserved=False):
        """Streams FFmpeg multipart MJPEG bytes to an already-open local HTTP response."""
        if not reserved and not self.semaphore.acquire(blocking=False):
            raise SurveillanceError('Maximum two simultaneous live previews')
        process = None
        try:
            executable = shutil.which('ffmpeg')
            if not executable:
                raise SurveillanceError('FFmpeg is not installed')
            # No shell. Explicit RTSP transport, no hidden recording, at most 2 fps.
            process = subprocess.Popen([
                executable, '-nostdin', '-hide_banner', '-loglevel', 'error',
                '-rtsp_transport', 'tcp', '-timeout', '5000000', '-i', validate_rtsp(url),
                '-an', '-sn', '-dn', '-vf', 'fps=2,scale=960:-2',
                '-q:v', '6', '-f', 'mpjpeg', '-boundary_tag', 'openrf', 'pipe:1',
            ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
            with self.lock:
                self.active.add(process)
            while True:
                chunk = process.stdout.read(16384)
                if not chunk:
                    break
                output.write(chunk)
                output.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            if process is not None:
                process.terminate() if process.poll() is None else None
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                if process.stdout:
                    process.stdout.close()
                with self.lock:
                    self.active.discard(process)
            self.semaphore.release()
