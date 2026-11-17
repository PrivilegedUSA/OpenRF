"""Linux-only field-network capability inventory; never changes the network.

The ordinary Wi-Fi hotspot and long-range HaLow gateway are planned modes,
not enabled by detecting radios, interface modes or user-space utilities.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from .wifi_halow import status_report as halow_status_report


_SAFE = re.compile(r'^[A-Za-z0-9_.:-]{1,32}$')
_PHY = re.compile(r'^phy[0-9]{1,5}$')


def _read(path: Path, max_len=32):
    try:
        return path.read_text(encoding='ascii', errors='replace').strip()[:max_len]
    except (OSError, ValueError):
        return ''


def _phy(path: Path) -> str | None:
    link = path / 'phy80211'
    try:
        name = link.resolve(strict=True).name if link.is_symlink() else ''
        return name if _PHY.fullmatch(name) else None
    except (OSError, RuntimeError):
        return None


def _modes(phy: str | None, lookup, runner) -> dict:
    unknown = {'ap': None, 'station': None, 'mesh_point': None}
    if not phy or not _PHY.fullmatch(phy):
        return unknown
    executable = lookup('iw')
    if not executable:
        return unknown
    try:
        proc = runner([executable, 'phy', phy, 'info'], stdout=subprocess.PIPE,
                      stderr=subprocess.DEVNULL, text=True, timeout=2, check=False)
    except (OSError, ValueError, subprocess.TimeoutExpired, subprocess.SubprocessError):
        return unknown
    if proc.returncode != 0:
        return unknown
    lines = str(proc.stdout or '')[:65536].splitlines()
    started = False
    found = set()
    for line in lines:
        if 'Supported interface modes:' in line:
            started = True
            continue
        if started:
            match = re.fullmatch(r'\s*\*\s+([A-Za-z0-9 _-]+)\s*', line)
            if not match:
                break
            found.add(match.group(1).strip().lower())
    if not started:
        return unknown
    return {'ap': 'ap' in found, 'station': 'managed' in found,
            'mesh_point': 'mesh point' in found}


def readiness_report(*, net_root: Path = Path('/sys/class/net'),
                     halow: dict | None = None, now: datetime | None = None,
                     command_lookup=None, runner=None) -> dict:
    """Inventory *possibilities* only. No SSID, BSSID, IP, packet or scan."""
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        raise ValueError('now must be timezone-aware')
    halow = halow_status_report() if halow is None else halow
    known = {item['name']: item for item in halow.get('candidate_interfaces', [])
             if isinstance(item, dict) and isinstance(item.get('name'), str)}
    lookup = command_lookup or shutil.which
    run = runner or subprocess.run
    cache = {}
    interfaces = []
    try:
        entries = sorted(net_root.iterdir(), key=lambda path: path.name)[:128]
    except OSError:
        entries = []
    for path in entries:
        name = path.name
        if not _SAFE.fullmatch(name) or name == 'lo':
            continue
        phy = _phy(path)
        if not phy and name not in known:
            continue
        if phy and phy not in cache:
            cache[phy] = _modes(phy, lookup, run)
        modes = cache.get(phy, {'ap': None, 'station': None, 'mesh_point': None})
        state = _read(path / 'operstate', 16).lower()
        if state not in ('up', 'down', 'dormant', 'unknown', 'lowerlayerdown', 'notpresent', 'testing'):
            state = 'unknown'
        interfaces.append({
            'name': name, 'classification': 'halow_driver_candidate' if name in known else 'ordinary_wifi_candidate',
            'driver_hint': known[name].get('driver_hint') if name in known else None,
            'phy': phy, 'os_operstate': state,
            'os_reports_ap_mode': modes['ap'],
            'os_reports_station_mode': modes['station'],
            'os_reports_mesh_point_mode': modes['mesh_point'],
            'ap_station_concurrency_verified': False,
            'associated_peer_verified': False,
        })
        if len(interfaces) >= 32:
            break
    ordinary = [item for item in interfaces if item['classification'] == 'ordinary_wifi_candidate']
    halow_ifaces = [item for item in interfaces if item['classification'] == 'halow_driver_candidate']
    possible_ap = any(item['os_reports_ap_mode'] is True for item in ordinary)
    possible_halow_ap = any(item['os_reports_ap_mode'] is True for item in halow_ifaces)
    possible_halow_sta = any(item['os_reports_station_mode'] is True for item in halow_ifaces)
    return {
        'schema_version': 1, 'kind': 'PASSIVE_FIELD_NETWORK_FOUNDATION',
        'observed_at_utc': moment.astimezone(timezone.utc).isoformat(timespec='seconds'),
        'interfaces': interfaces,
        'tool_presence': {name: bool(lookup(name)) for name in ('iw', 'nmcli', 'hostapd', 'dnsmasq')},
        'mode_candidates': {
            'local_wifi_hotspot': possible_ap,
            'halow_access_point': possible_halow_ap,
            'halow_station': possible_halow_sta,
            'two_radio_gateway': possible_ap and bool(halow_ifaces) and possible_halow_sta,
            'reticulum_transport': False,
        },
        'proposed_roles': [
            {'id': 'local_wifi_hotspot', 'label': 'Local phone/laptop hotspot',
             'description': 'Regular Wi-Fi AP for nearby devices; not internet by itself.'},
            {'id': 'halow_access_point', 'label': 'Long-range HaLow access point',
             'description': 'Compatible HaLow stations join this separate radio network.'},
            {'id': 'halow_station', 'label': 'Join a HaLow access point',
             'description': 'OpenRF joins an existing authorized HaLow network.'},
            {'id': 'two_radio_gateway', 'label': 'Two-radio field gateway',
             'description': 'Local Wi-Fi clients may eventually use a configured HaLow backhaul.'},
            {'id': 'reticulum_transport', 'label': 'Reticulum transport node',
             'description': 'Separate, explicit forwarding configuration is required.'},
        ],
        'read_only': True, 'activation_available': False,
        'credentials_required_before_activation': True,
        'management_api_remains_loopback_only': True,
        'configurations_written': False, 'radio_actions_performed': False,
        'actual_network_or_peer_verified': False,
        'limitations': 'Linux PHY mode reports are hints only: driver/hardware AP operation, simultaneous roles, WPA authentication, bridge routing, regulatory compliance, peer connectivity and Reticulum transport are not verified. Ordinary phones require regular Wi-Fi; they do not become HaLow radios.',
    }
