"""Read-only, evidence-limited Linux hardware inventory and future sensor contracts.

The presence of a device node or binary never means live RF capture is supported.
No scans are initiated and no radios are reconfigured by this module.
"""
from __future__ import annotations

import platform
import os
import stat
import grp
import re
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol
from .drivers.wifi_nmcli import linux_wifi_interfaces


@dataclass(frozen=True)
class SensorCapability:
    key: str
    title: str
    status: str  # unavailable / not_connected / detected_unverified / not_implemented
    description: str
    requires: str


class SensorBackend(Protocol):
    """Future sensor modules implement this boundary, not a fake scanner."""
    @property
    def id(self) -> str: ...

    def capabilities(self) -> list[SensorCapability]: ...

    def start(self) -> None: ...

    def stop(self) -> None: ...


def is_wsl() -> bool:
    try:
        text = Path('/proc/sys/kernel/osrelease').read_text().lower()
    except OSError:
        text = platform.release().lower()
    return 'microsoft' in text or 'wsl' in text


def _read_text(path: Path, limit: int = 120) -> str:
    try:
        return path.read_text(encoding='utf-8', errors='replace').strip()[:limit]
    except (OSError, ValueError):
        return ''


def enumerate_usb_devices(root: Path = Path('/sys/bus/usb/devices')) -> list[dict]:
    """Enumerate readable Linux USB descriptors without opening any device.

    Never send USB serial numbers to the UI or consider a recognized vendor to be
    proof that a radio driver is installed or that it is collecting measurements.
    """
    devices = []
    if not root.is_dir():
        return devices
    try:
        paths = sorted(root.iterdir(), key=lambda p: p.name)
    except OSError:
        return devices
    for path in paths[:256]:
        vendor = _read_text(path / 'idVendor', 4).lower()
        product_id = _read_text(path / 'idProduct', 4).lower()
        if not (re.fullmatch(r'[0-9a-f]{4}', vendor) and re.fullmatch(r'[0-9a-f]{4}', product_id)):
            continue
        devices.append({
            'port': path.name[:64], 'vendor_id': vendor, 'product_id': product_id,
            'manufacturer': _read_text(path / 'manufacturer', 96),
            'product': _read_text(path / 'product', 96),
            'bus': _read_text(path / 'busnum', 8),
        })
    return devices


def enumerate_serial_ports(root: Path = Path('/dev')) -> list[str]:
    """Find possible USB serial endpoints. Not automatically GPS or RF devices."""
    ports = []
    for pattern in ('ttyUSB[0-9]*', 'ttyACM[0-9]*'):
        try:
            ports.extend(p.name for p in root.glob(pattern) if p.name.startswith(('ttyUSB', 'ttyACM')))
        except OSError:
            pass
    return sorted(set(ports))[:64]


def serial_port_diagnostics(root: Path = Path('/dev')) -> list[dict]:
    """Read-only advisory for Linux-visible ttyACM/ttyUSB nodes.

    Permission checks reflect this process only; they cannot identify firmware or
    establish a working USB connection. Do not follow arbitrary caller paths.
    """
    details = []
    for name in enumerate_serial_ports(root):
        path = root / name
        try:
            mode = path.stat()
            owner = grp.getgrgid(mode.st_gid).gr_name
            accessible = os.access(path, os.R_OK | os.W_OK)
            device_type = 'character_device' if stat.S_ISCHR(mode.st_mode) else 'other'
            status = 'permission_ok_unverified' if accessible else 'permission_denied'
            recommendation = ('Port is accessible; probe explicitly to check firmware compatibility.'
                              if accessible else
                              f'Linux process cannot read/write this node (group: {owner}). Check USB passthrough, group permissions and relogin; avoid chmod 666.')
            details.append({'port': name, 'device_type': device_type, 'group': owner,
                            'access': status, 'guidance': recommendation})
        except (OSError, KeyError) as exc:
            details.append({'port': name, 'device_type': 'unknown', 'group': None,
                            'access': 'stat_failed', 'guidance': 'Port disappeared or Linux metadata is unavailable. Refresh the inventory.'})
    return details


def status_report() -> dict:
    wsl = is_wsl()
    net = Path('/sys/class/net')
    try:
        names = sorted(p.name for p in net.iterdir() if p.name != 'lo') if net.is_dir() else []
    except OSError:
        names = []
    network = [{'name': name, 'wireless': (net / name / 'wireless').exists() or
                (net / name / 'phy80211').exists()} for name in names]
    bluetooth_root = Path('/sys/class/bluetooth')
    try:
        bluetooth_adapters = sorted(p.name for p in bluetooth_root.iterdir() if p.name.startswith('hci')) if bluetooth_root.is_dir() else []
    except OSError:
        bluetooth_adapters = []
    usb_devices = enumerate_usb_devices()
    serial_ports = enumerate_serial_ports()
    wifi_device = any(n['wireless'] for n in network)
    bluez = shutil.which('bluetoothctl') is not None
    nmcli = shutil.which('nmcli') is not None
    wifi_scan_available = wifi_device and nmcli

    capabilities = [
        SensorCapability('wifi', 'Wi-Fi investigation',
            'detected_unverified' if wifi_device else ('unavailable' if wsl else 'not_connected'),
            'A Linux Wi-Fi interface is visible. One-shot NetworkManager surveys can be requested if nmcli is installed; passive frame capture is not implemented.' if wifi_device else
            ('WSL does not expose the Windows built-in Wi-Fi adapter as a Linux scan/monitor interface.' if wsl else
             'No Linux wireless interface is visible to this process.'),
            'For one-shot surveys: a managed Linux Wi-Fi interface and NetworkManager nmcli; raw frame analysis needs a future driver'),
        SensorCapability('ble', 'Bluetooth LE',
            'detected_unverified' if bluetooth_adapters else ('unavailable' if wsl else 'not_connected'),
            'A Bluetooth controller is visible; BLE scanning is not implemented yet.' if bluetooth_adapters else
            ('No Linux Bluetooth controller is visible in WSL.' if wsl else 'No Linux Bluetooth controller is visible.'),
            'Bluetooth controller, BlueZ, and future OpenRF sensor plugin'),
        SensorCapability('sdr', 'Software-defined radio', 'not_connected',
            'USB devices are listed below, but no SDR driver or live RF capture is integrated yet.',
            'RTL-SDR/HackRF or other supported receiver and Linux driver'),
        SensorCapability('usbserial', 'OpenRF USB serial v1',
            'detected_unverified' if serial_ports else 'not_connected',
            ('USB-serial endpoint(s) visible. Use the explicit protocol probe to determine if a compatible OpenRF controller responds.'
             if serial_ports else 'No Linux USB-serial endpoints visible. WSL may need USB pass-through; nothing is connected.'),
            'A controller with OpenRF Serial v1 firmware, correct permissions and a Linux ttyUSB/ttyACM device'),
        SensorCapability('subghz', 'Sub-GHz module', 'not_connected',
            'Potential USB serial endpoints are shown below, without assuming any is a CC1101.',
            'Compatible CC1101 controller/USB bridge and OpenRF protocol'),
        SensorCapability('gps', 'External GPS', 'not_connected',
            'Serial endpoints do not establish that a GNSS receiver or valid fix is present.',
            'Supported GPS/GNSS receiver and fix parser'),
        SensorCapability('cellular', 'Cellular / 5G', 'not_connected',
            'A modem must expose supported measurements; ordinary network connectivity is not cellular RF telemetry.',
            'Compatible 4G/5G modem and diagnostic interface'),
        SensorCapability('police_radar', 'Long-range radar / laser receiver', 'not_implemented',
            'PLANNED ONLY: No X/K/Ka microwave or LIDAR optical receiver is integrated. No radar warnings or detection range are available.',
            'Specialized receive-only X/K/Ka microwave front end and optional separate LIDAR optical sensor; validated driver and alerts'),
    ]
    return {
        'environment': 'WSL 2 / Linux' if wsl else 'Linux',
        'python': platform.python_version(),
        'inventory_collected_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'network_interfaces': names,
        'network_details': network,
        'bluetooth_adapters': bluetooth_adapters,
        'usb_devices': usb_devices,
        'serial_ports': serial_ports,
        'serial_port_diagnostics': serial_port_diagnostics(),
        'serial_port_details': serial_port_diagnostics(),
        'command_availability': {
            'nmcli': nmcli, 'bluetoothctl': bluez,
            'iw': shutil.which('iw') is not None,
            'lsusb': shutil.which('lsusb') is not None,
            'rtl_test': shutil.which('rtl_test') is not None,
            'hackrf_info': shutil.which('hackrf_info') is not None,
            'gpsd': shutil.which('gpsd') is not None,
        },
        'wifi_one_shot': {'possible': bool(wifi_scan_available), 'interface': linux_wifi_interfaces()[0] if wifi_scan_available else None,
                          'reason': ('Linux Wi-Fi interface and nmcli detected; scan permissions and results unverified' if wifi_scan_available
                                     else ('No Linux Wi-Fi interface visible' if not wifi_device else 'NetworkManager nmcli missing'))},
        'capabilities': [asdict(c) for c in capabilities],
        'scan_status': 'No continuous RF capture is active. Explicit one-shot Wi-Fi survey available only on supported Linux hosts.',
    }
