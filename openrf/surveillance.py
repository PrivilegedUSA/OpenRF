"""Opt-in local RTSP camera inventory and bounded FFmpeg MJPEG preview.

No scanning, background connections, recordings, or exposure of RTSP credentials in JSON.
"""
import ipaddress
import re
import json
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


def validate_usb_device(value):
    if not isinstance(value, str) or not re.fullmatch(r'/dev/video(?:0|[1-9][0-9]{0,2})', value):
        raise SurveillanceError('USB camera must use an explicit /dev/videoN device')
    return value


def usb_devices():
    """Local V4L2 paths only; no capture devices are opened while enumerating."""
    return [str(p) for p in sorted(Path('/dev').glob('video[0-9]*'),
            key=lambda p: int(p.name[5:]))
            if re.fullmatch(r'video(?:0|[1-9][0-9]{0,2})', p.name)]


def usb_candidates():
    """Readable local camera labels from sysfs, including secondary video nodes.

    Listing does NOT imply the camera can record; permissions and capture
    capability need real stream tests. Metadata nodes may be unusable for video.
    """
    result = []
    for path in usb_devices():
        node = Path(path).name
        sysfs = Path('/sys/class/video4linux') / node
        try:
            name = (sysfs / 'name').read_text(encoding='utf-8').strip()
        except (OSError, UnicodeError):
            name = ''
        name = ''.join(c for c in name if c.isprintable())[:80] or 'Linux video device'
        try:
            index = int((sysfs / 'index').read_text(encoding='ascii').strip())
        except (OSError, ValueError):
            index = None
        result.append({'path': path, 'name': name, 'index': index,
                       'hint': 'secondary interface; may be metadata' if index is not None and index > 0 else
                               'candidate capture device; not stream-tested'})
    return result


# Explicit, bounded controls for saved Linux USB cameras only. No ONVIF guessing,
# no network discovery, and no automatic movement while listing cameras.
V4L2_PTZ_AXES = {'pan': 'pan_absolute', 'tilt': 'tilt_absolute', 'zoom': 'zoom_absolute'}
_PTZ_LINE = re.compile(
    r'^\s*(pan_absolute|tilt_absolute|zoom_absolute)\s+0x[0-9a-fA-F]+\s+\(int\)\s*:\s*'
    r'min=(-?\d+)\s+max=(-?\d+)\s+step=(\d+)\s+default=(-?\d+)\s+value=(-?\d+)', re.M)


def usb_ptz_controls(device):
    """User-requested read of V4L2 control ranges, not a stream or motion command."""
    validate_usb_device(device)
    binary = shutil.which('v4l2-ctl')
    if binary is None:
        return {'supported': False, 'controls': {}, 'detail': 'Install v4l-utils to inspect USB pan, tilt and zoom controls.'}
    try:
        proc = subprocess.run([binary, '--device', device, '--list-ctrls'],
                              capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return {'supported': False, 'controls': {}, 'detail': 'USB control enumeration failed or timed out.'}
    if proc.returncode:
        return {'supported': False, 'controls': {}, 'detail': 'Cannot read V4L2 device controls; check USB access and permissions.'}
    controls = {}
    for match in _PTZ_LINE.finditer(proc.stdout):
        name, minimum, maximum, step, default, value = match.groups()
        minimum, maximum, step, default, value = map(int, (minimum, maximum, step, default, value))
        if 0 < step <= 100000 and minimum <= value <= maximum and minimum < maximum:
            axis = next(k for k, v in V4L2_PTZ_AXES.items() if v == name)
            controls[axis] = {'min':minimum, 'max':maximum, 'step':step, 'default':default, 'value':value}
    return {'supported': bool(controls), 'controls': controls,
            'detail': 'Values reported by V4L2. A control may crop the image electronically rather than physically moving the camera.'
                      if controls else 'The selected USB device exposes no supported V4L2 pan, tilt or zoom controls.'}


def set_usb_ptz(device, command):
    """One user-requested control step, clamped to an advertised V4L2 range."""
    validate_usb_device(device)
    if not isinstance(command, dict) or set(command) != {'axis','step'}:
        raise SurveillanceError('Provide one pan, tilt or zoom step')
    axis, direction = command['axis'], command['step']
    if axis not in V4L2_PTZ_AXES or type(direction) is not int or direction not in (-1, 1):
        raise SurveillanceError('Only single positive or negative pan, tilt and zoom steps are permitted')
    available = usb_ptz_controls(device)
    ctrl = available['controls'].get(axis)
    if ctrl is None:
        raise SurveillanceError('This device does not report the requested PTZ control')
    target = max(ctrl['min'], min(ctrl['max'], ctrl['value'] + direction * ctrl['step']))
    if target == ctrl['value']:
        return {'axis': axis, 'value': target, 'state': 'AT_LIMIT'}
    binary = shutil.which('v4l2-ctl')
    if not binary:
        raise SurveillanceError('v4l2-ctl is unavailable')
    try:
        proc = subprocess.run([binary, '--device', device, '--set-ctrl', f'{V4L2_PTZ_AXES[axis]}={target}'],
                              capture_output=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SurveillanceError('Camera control timed out or could not execute') from exc
    if proc.returncode:
        raise SurveillanceError('Camera rejected the requested PTZ change; no movement confirmed')
    return {'axis': axis, 'value': target, 'state': 'CONTROL_APPLIED',
            'detail': 'V4L2 control command accepted; physical movement and image change not verified.'}

def camera_public(row):
    source = row['source_type'] or 'RTSP'
    host = urlsplit(row['rtsp_url']).hostname if source == 'RTSP' else row['usb_device']
    return {'id': row['id'], 'name': row['name'], 'type': source, 'host': host,
            'state': 'NOT_CHECKED', 'connected': False, 'recording': False,
            'capabilities': {'live_preview': True, 'recording': True, 'onvif': False,
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
            cols = {row[1] for row in db.execute('PRAGMA table_info(surveillance_cameras)')}
            if 'source_type' not in cols:
                db.execute("ALTER TABLE surveillance_cameras ADD COLUMN source_type TEXT NOT NULL DEFAULT 'RTSP'")
            if 'usb_device' not in cols:
                db.execute('ALTER TABLE surveillance_cameras ADD COLUMN usb_device TEXT')

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

    def get_source(self, ident):
        ident = self._id(ident)
        with self.lock, self._connect() as db:
            row = db.execute('SELECT * FROM surveillance_cameras WHERE id=?', (ident,)).fetchone()
        if row is None:
            raise SurveillanceError('Camera not found')
        source = row['source_type'] or 'RTSP'
        location = validate_usb_device(row['usb_device']) if source == 'USB' else validate_rtsp(row['rtsp_url'])
        return {'id': row['id'], 'name': row['name'], 'source': source, 'location': location}

    @staticmethod
    def _id(value):
        if type(value) is not int or not 1 <= value <= 2147483647:
            raise SurveillanceError('Invalid camera ID')
        return value

    def save(self, data, ident=None):
        if not isinstance(data, dict) or set(data) - {'name', 'rtsp_url', 'source_type', 'usb_device'}:
            raise SurveillanceError('Only camera name, source and device address can be configured')
        name = data.get('name')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64 or any(ord(c)<32 for c in name):
            raise SurveillanceError('Camera name must be 1–64 printable characters')
        name = name.strip()
        with self.lock, self._connect() as db:
            if ident is None:
                source = data.get('source_type', 'RTSP')
                if source not in ('RTSP', 'USB'):
                    raise SurveillanceError('Unsupported camera type')
                url = validate_rtsp(data.get('rtsp_url')) if source == 'RTSP' else ''
                device = validate_usb_device(data.get('usb_device')) if source == 'USB' else None
                if db.execute('SELECT COUNT(*) FROM surveillance_cameras').fetchone()[0] >= 32:
                    raise SurveillanceError('Maximum 32 saved cameras')
                cur = db.execute('INSERT INTO surveillance_cameras (name,rtsp_url,created_at_utc,source_type,usb_device) VALUES (?,?,?,?,?)',
                                 (name, url, datetime.now(timezone.utc).isoformat(), source, device))
                ident = cur.lastrowid
            else:
                ident = self._id(ident)
                previous = db.execute('SELECT * FROM surveillance_cameras WHERE id=?', (ident,)).fetchone()
                if previous is None:
                    raise SurveillanceError('Camera not found')
                source = data.get('source_type', previous['source_type'] or 'RTSP')
                if source not in ('RTSP', 'USB'):
                    raise SurveillanceError('Unsupported camera type')
                if source == 'RTSP':
                    url = validate_rtsp(data.get('rtsp_url') or previous['rtsp_url'])
                    device = None
                else:
                    url = ''
                    device = validate_usb_device(data.get('usb_device') or previous['usb_device'])
                db.execute('UPDATE surveillance_cameras SET name=?,rtsp_url=?,source_type=?,usb_device=? WHERE id=?',
                           (name, url, source, device, ident))
            row = db.execute('SELECT * FROM surveillance_cameras WHERE id=?', (ident,)).fetchone()
            return camera_public(row)

    def delete(self, ident):
        ident = self._id(ident)
        with self.lock, self._connect() as db:
            return db.execute('DELETE FROM surveillance_cameras WHERE id=?', (ident,)).rowcount > 0


def probe_camera(url):
    """User-requested, bounded RTSP video probe; return only credential-free metadata.

    A completed ffprobe result verifies a video stream existed at check time,
    but is NOT evidence of an ongoing connection or an available battery.
    """
    validate_rtsp(url)
    ffprobe = shutil.which('ffprobe')
    if not ffprobe:
        return {'state': 'UNSUPPORTED', 'detail': 'Install ffprobe (FFmpeg tools) to test RTSP cameras.'}
    args = [ffprobe, '-v', 'error', '-rtsp_transport', 'tcp', '-timeout', '5000000',
            '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height',
            '-of', 'json', url]
    try:
        completed = subprocess.run(args, capture_output=True, timeout=9, check=False)
    except subprocess.TimeoutExpired:
        return {'state': 'TIMEOUT', 'detail': 'RTSP check timed out; verify camera address, network and credentials.'}
    except OSError:
        return {'state': 'UNAVAILABLE', 'detail': 'Cannot launch ffprobe on this device.'}
    if completed.returncode != 0:
        # ffprobe stderr may contain credentials and camera path: never expose it.
        return {'state': 'UNAVAILABLE', 'detail': 'Camera did not return a readable video stream. Check network, credentials and RTSP path.'}
    try:
        result = json.loads(completed.stdout)
        streams = result.get('streams') or []
        stream = streams[0] if streams else None
        if not isinstance(stream, dict):
            raise ValueError('missing video stream')
        metadata = {'state': 'STREAM_FOUND', 'detail': 'Video stream verified at check time; this is not a persistent connection.'}
        codec = stream.get('codec_name')
        if isinstance(codec, str) and codec.isascii() and codec.replace('_', '').isalnum() and len(codec) <= 32:
            metadata['codec'] = codec
        for dimension in ('width', 'height'):
            value = stream.get(dimension)
            if type(value) is int and 1 <= value <= 16384:
                metadata[dimension] = value
        return metadata
    except (ValueError, TypeError, IndexError, AttributeError):
        return {'state': 'UNAVAILABLE', 'detail': 'RTSP responded without readable video metadata.'}


def capability_report():
    ffmpeg = shutil.which('ffmpeg')
    return {'ffmpeg': 'AVAILABLE' if ffmpeg else 'MISSING', 'usb_devices': usb_devices(), 'usb_candidates': usb_candidates(), 'rtsp_mjpeg_preview': bool(ffmpeg),
            'rtsp_diagnostics': bool(shutil.which('ffprobe')),
            'usb': 'V4L2_OPTIONAL', 'onvif': 'NOT_IMPLEMENTED', 'recording': 'MANUAL_FFMPEG' if ffmpeg else 'MISSING_FFMPEG',
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

    def run(self, url, output, *, reserved=False, source='RTSP'):
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
                *(['-f', 'video4linux2', '-i', validate_usb_device(url)] if source == 'USB' else ['-rtsp_transport', 'tcp', '-timeout', '5000000', '-i', validate_rtsp(url)]),
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
