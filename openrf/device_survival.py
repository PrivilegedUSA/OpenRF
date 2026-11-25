"""Read-only Linux host diagnostics for the portable OpenRF readiness screen."""
from __future__ import annotations

import shutil
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

PREFLIGHT = {
    'power': 'Verify battery charge, runtime and backup power',
    'maps': 'Verify installed offline map coverage and planned route',
    'radios': 'Test an actual message exchange with a remote team device',
    'gps': 'Verify current GNSS fix and accuracy outdoors',
    'supplies': 'Check antennas, charging cables and emergency supplies',
    'storage': 'Check local storage and export critical records privately',
}


def _read(path):
    try:
        return path.read_text(encoding='ascii').strip()[:80]
    except (OSError, UnicodeError):
        return None


def _battery(root):
    devices=[]
    try:
        directories=sorted(p for p in root.iterdir() if p.is_dir())[:20]
    except OSError:
        directories=[]
    for device in directories:
        kind=_read(device/'type')
        if kind not in ('Battery','Mains','USB','USB_C','USB_PD'):
            continue
        capacity_raw=_read(device/'capacity')
        capacity=int(capacity_raw) if capacity_raw is not None and capacity_raw.isascii() and capacity_raw.isdecimal() and 0<=int(capacity_raw)<=100 else None
        # Only trusted kernel-generated sysfs values; name alone doesn't identify hardware.
        status=_read(device/'status')
        online=_read(device/'online')
        devices.append({'kind':kind,'name':device.name[:64],
            'capacity_percent':capacity if kind=='Battery' else None,
            'status':status if status in ('Charging','Discharging','Full','Not charging','Unknown') else 'UNREPORTED',
            'online':online=='1' if online in ('0','1') else None})
    batteries=[item for item in devices if item['kind']=='Battery']
    return {'state':'REPORTED_BY_LINUX' if batteries else 'NOT_REPORTED',
            'batteries':batteries,'external_power':[item for item in devices if item['kind']!='Battery'],
            'runtime_estimate_minutes':None,
            'warning':'Linux battery readings are uncalibrated kernel reports, not a validated OpenRF battery gauge. Runtime is unknown.'}


def power_status(*, power_root=Path('/sys/class/power_supply')):
    """A lightweight read-only endpoint for the persistent header indicator.

    Compatible future UPS/battery HAT drivers can expose capacity via the
    Linux power_supply interface. No GPIO writes, control, or guessed runtime.
    """
    return {'collected_utc':datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'read_only':True,'source':'linux-sysfs-power-supply',
            'battery':_battery(Path(power_root)),
            'note':'Battery percentage is Linux-reported when available. No battery in WSL is not 0%; device runtime and safe-shutdown support are unknown.'}


def _storage(path, disk_usage):
    """Filesystem containing private OpenRF data, not necessarily the Pi SD card."""
    storage={'state':'UNAVAILABLE','free_bytes':None,'total_bytes':None,'percent_free':None}
    try:
        directory=path.parent
        usage=disk_usage(directory)
        if type(usage.total) is not int or type(usage.free) is not int or not 0<=usage.free<=usage.total or usage.total==0:
            return storage
        free_percent=100*usage.free/usage.total if usage.total else None
        level='LOW_SPACE' if usage.free<1024**3 or (free_percent is not None and free_percent<10) else 'OK'
        storage={'state':'OS_REPORTED','free_bytes':usage.free,'total_bytes':usage.total,
                 'used_bytes':usage.total-usage.free,'percent_free':round(free_percent,1) if free_percent is not None else None,
                 'warning_level':level}
    except (OSError, ValueError, ZeroDivisionError):
        pass
    return storage


def storage_status(database_path, *, disk_usage=shutil.disk_usage):
    """Lightweight read-only host filesystem stats; no recursive size walk."""
    return {'collected_utc':datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'read_only':True,'scope':'filesystem-containing-openrf-data',
            'storage':_storage(Path(database_path),disk_usage),
            'note':'Linux/WSL-reported filesystem capacity containing OpenRF local data. This may be a Windows drive, SD card or external disk; it is not a count of OpenRF files and does not measure all attached drives.'}


def report(database_path, *, power_root=Path('/sys/class/power_supply'), disk_usage=shutil.disk_usage):
    path=Path(database_path)
    power=_battery(Path(power_root))
    storage=_storage(path,disk_usage)
    db={'state':'NOT_FOUND','quick_check':'NOT_RUN'}
    if path.is_file():
        try:
            # SQLite URI read-only; quick_check(1) is diagnostic, not a backup.
            with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=2)) as connection:
                value=connection.execute('PRAGMA quick_check(1)').fetchone()
            db={'state':'READABLE' if value and value[0]=='ok' else 'CHECK_FAILED',
                'quick_check': 'OK' if value and value[0]=='ok' else 'FAILED'}
        except (sqlite3.Error, OSError, ValueError):
            db={'state':'UNAVAILABLE','quick_check':'ERROR'}
    return {'collected_utc':datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'read_only':True,'battery':power,'storage':storage,'database':db,
            'power_mode':'NORMAL_NOT_MANAGED','sleep_control_available':False,
            'safe_shutdown_control_available':False,
            'warning':'Diagnostic only. WSL often exposes no battery. No runtime, UPS cutoff, safe shutdown or Pi power management is verified.'}
