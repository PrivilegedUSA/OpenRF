"""Explicit, bounded, receive-only Linux BlueZ LE discovery via bluetoothctl.

No pairing, connecting, advertisement transmission, background scanning or
tracking. BlueZ's device properties can be cached; retrieval time does not
establish when an individual advertisement was transmitted. Randomized device
addresses are NOT stable identity or location evidence.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import subprocess

from .ble_readiness import readiness

ADDRESS = r'(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}'
DEVICE = re.compile(r'\[(?:NEW|CHG)\]\s+Device\s+(' + ADDRESS + r')(?:\s+(.*))?$', re.I)
ANSI = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')


class BleScanUnavailable(RuntimeError):
    def __init__(self, message: str, code: str = 'ble_unavailable'):
        super().__init__(message)
        self.code = code


def parse_le_scan(text: str) -> list[dict]:
    """Only parse device events emitted while a requested discovery is running.

    CHG RSSI values are optional and sometimes originate from a cached BlueZ
    property. Never invent missing dBm values, advertising channel or location.
    """
    seen = {}
    for line in ANSI.sub('', text[:250000]).splitlines()[:2000]:
        match = DEVICE.search(line.strip())
        if not match:
            continue
        address = match.group(1).upper()
        tail = (match.group(2) or '').strip()
        if address not in seen:
            if len(seen) >= 128:
                continue
            seen[address] = {'address': address, 'name': None, 'rssi_dbm': None,
                             'address_type': 'unknown; may be randomized', 'transport': 'LE'}
        row = seen[address]
        rssi = re.fullmatch(r'RSSI:\s*(-?\d+)(?:\s*\(.*\))?', tail, re.I)
        if rssi:
            value = int(rssi.group(1))
            if -127 <= value <= 20:
                row['rssi_dbm'] = value
        elif tail.lower().startswith('name:') or tail.lower().startswith('alias:'):
            value = tail.split(':', 1)[1].strip()
            if value:
                row['name'] = value[:120]
        elif tail and not re.match(r'(?:TxPower|ManufacturerData|ServiceData|UUIDs?|ServicesResolved|Paired|Connected|Trusted|Blocked|RSSI|Class|Modalias|Icon)(?:\s|:)', tail, re.I):
            # bluetoothctl [NEW] Device XX:XX:XX:XX:XX:XX <name>
            row['name'] = tail[:120]
    return list(seen.values())


def scan_once(*, root: Path = Path('/sys/class/bluetooth'), which=shutil.which,
              run=subprocess.run, duration_seconds: int = 8) -> dict:
    """Run a single LE-only scan with a fixed command and strict duration.

    Discovery stops when the bounded bluetoothctl process exits. The caller
    must guard concurrent requests; there is never an automatic scan loop.
    """
    if type(duration_seconds) is not int or not 4 <= duration_seconds <= 12:
        raise ValueError('Invalid BLE scan duration')
    availability = readiness(root=root, which=which, run=run)
    if not availability['controllers']:
        raise BleScanUnavailable('No Linux Bluetooth controller is visible. WSL usually cannot scan through Windows built-in Bluetooth.', 'no_controller')
    executable = which('bluetoothctl')
    if not executable:
        raise BleScanUnavailable('BlueZ bluetoothctl is unavailable.', 'bluez_missing')
    if availability['daemon'] != 'responding':
        raise BleScanUnavailable('BlueZ is not responding or this user cannot access its controller.', 'bluez_unavailable')
    args = [executable, '--timeout', str(duration_seconds), 'scan', 'le']
    try:
        response = run(args, capture_output=True, text=True, timeout=duration_seconds + 6, check=False)
    except subprocess.TimeoutExpired as exc:
        raise BleScanUnavailable('BLE discovery did not terminate on time. Check BlueZ and controller state.', 'scan_timeout') from exc
    except OSError as exc:
        raise BleScanUnavailable('Could not launch the Linux Bluetooth scan.', 'scan_failure') from exc
    output = (response.stdout or '') + '\n' + (response.stderr or '')
    # BlueZ can exit on a timeout with 124; accept only when scan really began.
    if re.search(r'(?:org\.bluez\.Error|Failed to start discovery|No default controller|not available|Permission denied)', output, re.I):
        raise BleScanUnavailable('BlueZ LE discovery failed: ' + (output.strip().splitlines()[-1] if output.strip() else 'unknown reason')[:160], 'scan_failure')
    if response.returncode not in (0, 124):
        raise BleScanUnavailable('BlueZ LE discovery could not complete (exit ' + str(response.returncode) + ').', 'scan_failure')
    if not re.search(r'(?:Discovery started|Discovering:\s*yes|Started discovery)', output, re.I):
        raise BleScanUnavailable('BlueZ did not confirm discovery started; no BLE devices can be reported.', 'scan_not_started')
    return {
        'source': 'BLUEZ_BLE', 'controller': availability['controllers'][0],
        'retrieved_at_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'duration_seconds': duration_seconds,
        'controller_identification': 'First Linux-visible hci controller; bluetoothctl default is not independently selected or verified',
        'freshness': 'UNVERIFIED PER-DEVICE — BlueZ may reuse cached device properties',
        'measurement': 'RSSI dBm reported by BlueZ when present; not calibrated distance. No inferred frequency or advertising channel.',
        'coordinate_meaning': 'No transmitter coordinates; optional saved location is observer position only',
        'privacy': 'LE-only read-only scan. Addresses may rotate; nothing saved automatically. No pairing or connections.',
        'records': parse_le_scan(output),
    }
