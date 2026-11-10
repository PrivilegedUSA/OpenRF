"""Read-only, evidence-limited Linux hardware inventory and future sensor contracts.

The presence of a device node or binary never means live RF capture is supported.
No scans are initiated and no radios are reconfigured by this module.
"""
from __future__ import annotations

import platform
import re
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class SensorCapability:
    key: str
    title: str
    status: str  # unavailable / not_connected / detected_unverified
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

    capabilities = [
        SensorCapability('wifi', 'Wi-Fi investigation',
            'detected_unverified' if wifi_device else ('unavailable' if wsl else 'not_connected'),
            'A Linux wireless interface is visible, but OpenRF does not yet have a capture driver.' if wifi_device else
            ('WSL does not expose the Windows built-in Wi-Fi adapter as a Linux scan/monitor interface.' if wsl else
             'No Linux wireless interface is visible to this process.'),
            'Compatible Linux Wi-Fi adapter, driver, and future OpenRF sensor plugin'),
        SensorCapability('ble', 'Bluetooth LE',
            'detected_unverified' if bluetooth_adapters else ('unavailable' if wsl else 'not_connected'),
            'A Bluetooth controller is visible; BLE scanning is not implemented yet.' if bluetooth_adapters else
            ('No Linux Bluetooth controller is visible in WSL.' if wsl else 'No Linux Bluetooth controller is visible.'),
            'Bluetooth controller, BlueZ, and future OpenRF sensor plugin'),
        SensorCapability('sdr', 'Software-defined radio', 'not_connected',
            'USB devices are listed below, but no SDR driver or live RF capture is integrated yet.',
            'RTL-SDR/HackRF or other supported receiver and Linux driver'),
        SensorCapability('subghz', 'Sub-GHz module', 'not_connected',
            'Potential USB serial endpoints are shown below, without assuming any is a CC1101.',
            'Compatible CC1101 controller/USB bridge and OpenRF protocol'),
        SensorCapability('gps', 'External GPS', 'not_connected',
            'Serial endpoints do not establish that a GNSS receiver or valid fix is present.',
            'Supported GPS/GNSS receiver and fix parser'),
        SensorCapability('cellular', 'Cellular / 5G', 'not_connected',
            'A modem must expose supported measurements; ordinary network connectivity is not cellular RF telemetry.',
            'Compatible 4G/5G modem and diagnostic interface'),
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
        'command_availability': {
            'nmcli': nmcli, 'bluetoothctl': bluez,
            'iw': shutil.which('iw') is not None,
            'lsusb': shutil.which('lsusb') is not None,
            'rtl_test': shutil.which('rtl_test') is not None,
            'hackrf_info': shutil.which('hackrf_info') is not None,
            'gpsd': shutil.which('gpsd') is not None,
        },
        'capabilities': [asdict(c) for c in capabilities],
        'scan_status': 'No Linux RF scanner backend active. Inventory is read-only; no measurements are generated.',
    }
