"""One-shot, user-triggered NetworkManager Wi-Fi survey (not packet capture).

Uses only the local Linux wireless interface exposed by NetworkManager. Does not
connect to an AP, change network configuration, or run in a background loop.
NetworkManager may send ordinary Wi-Fi scan probe requests and may serve cached
results; record timestamp is the retrieval time,
NOT the time at which each beacon was actually received. SIGNAL is quality %, not
RSSI/dBm. Nothing in this module guesses transmitter location.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


class WifiScanUnavailable(RuntimeError):
    """No usable Linux Wi-Fi scan source (or tool/permission failure)."""
    def __init__(self, message: str, code: str = "wifi_unavailable"):
        super().__init__(message)
        self.code = code


def linux_wifi_interfaces(net_root: Path = Path('/sys/class/net')) -> list[str]:
    try:
        entries = sorted(net_root.iterdir()) if net_root.is_dir() else []
    except OSError:
        return []
    return [entry.name for entry in entries if
            re.fullmatch(r'[a-zA-Z0-9_.-]{1,32}', entry.name) and
            ((entry / 'wireless').exists() or (entry / 'phy80211').exists())]


def split_nmcli(line: str) -> list[str]:
    """Parse nmcli -t --escape yes fields while preserving colons in SSIDs/BSSIDs."""
    fields: list[str] = []
    current: list[str] = []
    escaped = False
    for char in line:
        if escaped:
            current.append(char)
            escaped = False
        elif char == '\\':
            escaped = True
        elif char == ':':
            fields.append(''.join(current))
            current = []
        else:
            current.append(char)
    if escaped:
        current.append('\\')
    fields.append(''.join(current))
    return fields


def frequency_band(mhz: int | None) -> str:
    """Classify a reported Wi-Fi center frequency; not inferred radio coverage."""
    if mhz is None:
        return 'Unknown'
    if 2300 <= mhz <= 2500:
        return '2.4 GHz'
    if 4900 <= mhz < 5925:
        return '5 GHz'
    if 5925 <= mhz <= 7125:
        return '6 GHz'
    if 57000 <= mhz <= 71000:
        return '60 GHz'
    return 'Other'


def parse_wifi_list(text: str) -> list[dict]:
    """Parse escaped nmcli AP rows. MODE/RATE are optional for old fixtures."""
    networks = []
    for line in text.splitlines()[:512]:
        fields = split_nmcli(line.rstrip('\r'))
        if len(fields) not in (6, 8):
            continue
        ssid, bssid, channel, frequency, signal, security = fields[:6]
        mode, rate = fields[6:] if len(fields) == 8 else ('', '')
        if not re.fullmatch(r'(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}', bssid):
            continue
        frequency_match = re.fullmatch(r'(\d+)(?:\s*MHz)?', frequency.strip(), re.I)
        try:
            quality = int(signal)
            freq = int(frequency_match.group(1)) if frequency_match else None
            chan = int(channel) if channel.strip().isdigit() else None
        except ValueError:
            continue
        if not 0 <= quality <= 100:
            continue
        networks.append({
            'ssid': ssid[:128] if ssid else '(hidden / unnamed)',
            'bssid': bssid.upper(),
            'channel': chan,
            'frequency_mhz': freq,
            'signal_quality_percent': quality,
            'security': security[:100] or 'Unspecified',
            'band': frequency_band(freq),
            'mode': mode[:32] or 'Unspecified',
            # NetworkManager's advertised AP rate is NOT measured throughput.
            'advertised_rate': rate[:48] or None,
        })
        if len(networks) >= 256:
            break
    return networks


def scan_once(*, net_root: Path = Path('/sys/class/net'), which=shutil.which,
              run=subprocess.run) -> dict:
    """Request a single NetworkManager scan; results are ephemeral and unverified-freshness.

    No user-controlled shell string, no sudo, no device-specific RF claim.
    """
    interfaces = linux_wifi_interfaces(net_root)
    if not interfaces:
        raise WifiScanUnavailable('No Linux Wi-Fi interface is visible. Windows built-in Wi-Fi is normally unavailable to WSL. Attach a compatible Linux adapter to a supported host.')
    executable = which('nmcli')
    if executable is None:
        raise WifiScanUnavailable('NetworkManager nmcli is not installed. The Linux Wi-Fi interface is visible, but the one-shot driver cannot run.')
    name = interfaces[0]
    args = [executable, '--terse', '--escape', 'yes', '--fields',
            'SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY,MODE,RATE', 'device', 'wifi', 'list',
            'ifname', name, '--rescan', 'yes']
    try:
        result = run(args, capture_output=True, text=True, timeout=12, check=False)
    except subprocess.TimeoutExpired as exc:
        raise WifiScanUnavailable('NetworkManager Wi-Fi scan timed out. The adapter may be busy or unsupported.') from exc
    except OSError as exc:
        raise WifiScanUnavailable('Could not start NetworkManager Wi-Fi scan with this Linux user.') from exc
    if result.returncode:
        detail = (result.stderr or 'NetworkManager returned an error').strip().splitlines()[0][:180]
        raise WifiScanUnavailable(f'NetworkManager could not scan {name}: {detail}')
    return {
        'source': 'NETWORKMANAGER_WIFI',
        'interface': name,
        'retrieved_at_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'freshness': 'UNVERIFIED — NetworkManager may return cached access points',
        'measurement': 'SIGNAL is quality percent (0–100), NOT RSSI in dBm. RATE is advertised, NOT measured throughput.',
        'coordinate_meaning': 'No GPS information or transmitter coordinates supplied',
        'records': parse_wifi_list(result.stdout),
    }
