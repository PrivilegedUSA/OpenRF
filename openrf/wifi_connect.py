"""Explicit Linux NetworkManager Wi-Fi joining for the header quick panel.

Unlike the Wi-Fi survey collector, this feature changes the device's network
connection only after a deliberate user action. Nothing runs automatically or
records Wi-Fi passwords in OpenRF data/logs. Not supported by native Windows
Wi-Fi through WSL's virtual network adapter.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

from .drivers.wifi_nmcli import (frequency_band, linux_wifi_interfaces,
                                  split_nmcli)


class WifiConnectionError(RuntimeError):
    def __init__(self, message: str, code: str = 'wifi_connect_unavailable', status: int = 409):
        super().__init__(message)
        self.code = code
        self.status = status


def _nmcli(which, net_root):
    names = linux_wifi_interfaces(net_root)
    if not names:
        raise WifiConnectionError('No Linux-managed Wi-Fi adapter is visible. WSL usually exposes Windows networking, not the Windows Wi-Fi radio. Use Windows network settings or attach a compatible Linux adapter.', 'no_linux_wifi')
    executable = which('nmcli')
    if not executable:
        raise WifiConnectionError('NetworkManager (nmcli) is not installed; connection controls are unavailable.', 'no_networkmanager')
    return executable, names


def wifi_status(*, net_root: Path = Path('/sys/class/net'), which=shutil.which,
                run=subprocess.run) -> dict:
    try:
        command, names = _nmcli(which, net_root)
    except WifiConnectionError as exc:
        return {'available': False, 'connected': False, 'interface': None,
                'connection': None, 'reason': str(exc), 'code': exc.code}
    try:
        result = run([command, '--terse', '--escape', 'yes', '--fields',
            'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status'],
            capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        result = None
    if not result or result.returncode:
        return {'available': False, 'connected': False, 'interface': names[0],
                'connection': None, 'reason': 'NetworkManager is not responding to device status.',
                'code': 'networkmanager_unavailable'}
    for line in result.stdout.splitlines():
        fields = split_nmcli(line)
        if len(fields) != 4 or fields[0] not in names or fields[1] != 'wifi':
            continue
        active = fields[2].startswith('connected')
        connection = fields[3] if active and fields[3] not in ('', '--') else None
        return {'available': True, 'connected': active, 'interface': fields[0],
                'connection': connection, 'reason': None,
                'note': 'NetworkManager connection profile name; actual Wi-Fi SSID and Internet access are not independently verified.'}
    return {'available': False, 'connected': False, 'interface': names[0],
            'connection': None, 'reason': 'NetworkManager is not managing a visible Linux Wi-Fi adapter.',
            'code': 'not_managed'}


def _security_kind(security: str) -> str:
    value = security.strip().upper()
    if value in ('', '--'):
        return 'open'
    if ('802.1X' in value or 'ENTERPRISE' in value or 'EAP' in value or
            'WEP' in value or 'OWE' in value):
        return 'unsupported'
    if 'WPA' in value and ('PSK' in value or 'SAE' in value or 'WPA2' in value or 'WPA3' in value):
        return 'password'
    return 'unsupported'


def list_wifi(*, net_root: Path = Path('/sys/class/net'), which=shutil.which,
              run=subprocess.run) -> dict:
    command, names = _nmcli(which, net_root)
    status = wifi_status(net_root=net_root, which=which, run=run)
    if not status['available']:
        raise WifiConnectionError(status['reason'], status.get('code', 'not_managed'))
    name = status['interface']
    try:
        result = run([command, '--terse', '--escape', 'yes', '--fields',
            'IN-USE,SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY', 'device', 'wifi',
            'list', 'ifname', name, '--rescan', 'yes'],
            capture_output=True, text=True, timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise WifiConnectionError('Wi-Fi scan failed or timed out. Try again when the adapter is ready.', 'scan_unavailable') from exc
    if result.returncode:
        raise WifiConnectionError('NetworkManager could not list nearby Wi-Fi networks.', 'scan_unavailable')
    found = {}
    for line in result.stdout.splitlines()[:512]:
        fields = split_nmcli(line)
        if len(fields) != 7:
            continue
        selected, ssid, _bssid, channel, frequency, quality, security = fields
        if not ssid or len(ssid) > 128 or not quality.isdigit():
            continue  # Hidden networks need a separate manual-entry feature.
        signal = int(quality)
        if not 0 <= signal <= 100:
            continue
        channel_num = int(channel) if channel.isdigit() else None
        frequency_match = re.fullmatch(r'(\d+)(?:\s*MHz)?', frequency.strip(), re.I)
        frequency_num = int(frequency_match.group(1)) if frequency_match else None
        item = {'ssid': ssid, 'security': security or '--',
                'security_kind': _security_kind(security), 'signal_quality_percent': signal,
                'band': frequency_band(frequency_num), 'channel': channel_num,
                'connected': selected.strip() == '*'}
        previous = found.get(ssid)
        if previous is None or item['connected'] or (not previous['connected'] and signal > previous['signal_quality_percent']):
            found[ssid] = item
        if len(found) >= 80:
            break
    networks = sorted(found.values(), key=lambda item: (not item['connected'], -item['signal_quality_percent'], item['ssid'].casefold()))
    return {'interface': name, 'networks': networks,
            'note': 'User-requested NetworkManager list; signal is approximate quality, not RSSI. Some results may be cached.'}


def connect_wifi(ssid: str, password: str, confirm: bool, *,
                 net_root: Path = Path('/sys/class/net'), which=shutil.which,
                 run=subprocess.run) -> dict:
    if confirm is not True:
        raise WifiConnectionError('Confirm before changing the device Wi-Fi connection.', 'confirmation_required', 400)
    if not isinstance(ssid, str) or not ssid or len(ssid.encode('utf-8')) > 32 or '\x00' in ssid or ssid.startswith('-'):
        raise WifiConnectionError('Choose a valid visible network name.', 'invalid_ssid', 400)
    if not isinstance(password, str) or len(password) > 128 or '\x00' in password or '\n' in password or '\r' in password:
        raise WifiConnectionError('Invalid Wi-Fi passphrase.', 'invalid_passphrase', 400)
    if password and not (8 <= len(password) <= 63 or re.fullmatch(r'[a-fA-F0-9]{64}', password)):
        raise WifiConnectionError('WPA passwords must be 8–63 characters (or 64 hexadecimal digits).', 'invalid_passphrase', 400)
    status = wifi_status(net_root=net_root, which=which, run=run)
    if not status['available']:
        raise WifiConnectionError(status['reason'], status.get('code', 'not_managed'))
    command = which('nmcli')
    # --ask reads the credential from stdin instead of exposing it in argv/ps.
    # The OS NetworkManager owns any subsequently saved connection profile.
    args = [command, '--ask', '--wait', '30', 'device', 'wifi', 'connect',
            ssid, 'ifname', status['interface'], 'private', 'yes']
    try:
        result = run(args, input=(password + '\n') if password else '\n',
                     capture_output=True, text=True, timeout=38, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise WifiConnectionError('Connection attempt failed or timed out. Check NetworkManager and retry.', 'connection_timeout') from exc
    if result.returncode:
        # Never return nmcli's stdout/stderr: it may include a secret or SSID.
        raise WifiConnectionError('Could not connect. Check the password, supported security type, and network signal.', 'connection_failed')
    return {'connected': True, 'ssid': ssid,
            'note': 'NetworkManager accepted the Wi-Fi connection. Internet access is not verified.'}
