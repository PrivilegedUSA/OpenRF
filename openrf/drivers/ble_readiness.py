"""Read-only Bluetooth controller and BlueZ readiness, never device discovery.

No pair, scan, power, advertisements, target addresses or nearby-device history.
A detected hciN sysfs node does not establish LE scanning capability.
"""
from __future__ import annotations

from pathlib import Path
import re
import shutil
import subprocess


def controllers(root: Path = Path('/sys/class/bluetooth')) -> list[str]:
    try:
        entries = root.iterdir() if root.is_dir() else []
        return sorted(p.name for p in entries if re.fullmatch(r'hci\d{1,3}', p.name))[:32]
    except OSError:
        return []


def readiness(*, root: Path = Path('/sys/class/bluetooth'), which=shutil.which,
              run=subprocess.run) -> dict:
    found = controllers(root)
    executable = which('bluetoothctl')
    # Avoid contacting the daemon when no controller is visible, especially in WSL.
    daemon = 'not_checked'
    if found and executable:
        try:
            result = run([executable, '--timeout', '3', 'list'],
                         capture_output=True, text=True, timeout=4, check=False)
            daemon = 'responding' if result.returncode == 0 else 'unavailable'
        except (OSError, subprocess.TimeoutExpired):
            daemon = 'unavailable'
    reason = ('No Linux Bluetooth controller visible' if not found else
              'BlueZ bluetoothctl unavailable' if not executable else
              'BlueZ daemon did not respond' if daemon != 'responding' else
              'Controller and BlueZ visible; LE scan driver NOT implemented')
    return {'controllers': found, 'controller_count': len(found),
            'bluez_tool_present': bool(executable), 'daemon': daemon,
            'scan_supported': False, 'scan_active': False,
            'status': 'controller_detected_unverified' if found else 'not_connected',
            'reason': reason,
            'privacy': 'Inventory only. No BLE advertisements, addresses or device scans collected.'}
