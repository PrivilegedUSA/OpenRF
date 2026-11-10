"""Future-facing sensor interface and real, read-only local hardware inventory."""
from __future__ import annotations

import os
import platform
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class SensorCapability:
    key: str
    title: str
    status: str  # 'unavailable', 'not_connected', 'ready', 'unsupported'
    description: str
    requires: str


class SensorBackend(Protocol):
    """Hardware drivers will implement this contract in subsequent releases."""
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


def status_report() -> dict:
    wsl = is_wsl()
    names = []
    net = Path('/sys/class/net')
    if net.is_dir():
        try:
            names = sorted(x.name for x in net.iterdir() if x.name != 'lo')
        except OSError:
            names = []
    # Enumerate interface names only; never mistake eth0 for Wi-Fi capability.
    linux_wifi = any(Path('/sys/class/net', name, 'wireless').exists() for name in names)
    bluez = shutil.which('bluetoothctl') is not None
    nmcli = shutil.which('nmcli') is not None
    rf_hardware = [
        SensorCapability('wifi', 'Wi-Fi investigation', 'unavailable' if wsl else 'not_connected',
            'WSL networking does not expose a monitor-mode Wi-Fi interface.' if wsl else 'Linux Wi-Fi device presence detected; scanning driver not integrated in this release.',
            'Linux-compatible Wi-Fi adapter and validated driver'),
        SensorCapability('ble', 'Bluetooth LE', 'unavailable' if wsl else ('not_connected' if bluez else 'unsupported'),
            'Direct Linux BLE scanning is not exposed to this WSL instance.' if wsl else 'BlueZ adapter integration is planned; device presence does not confirm scanning is working.',
            'Supported Bluetooth adapter and BlueZ'),
        SensorCapability('sdr', 'Software-defined radio', 'not_connected',
            'No SDR capture backend has been installed yet.', 'RTL-SDR or supported SDR USB receiver'),
        SensorCapability('subghz', 'Sub-GHz module', 'not_connected',
            'CC1101/ESP32 integration will use an explicit driver.', 'Supported USB bridge and radio module'),
        SensorCapability('gps', 'External GPS', 'not_connected',
            'USB GPS receiver integration is not available yet. Map coordinate entry works now.', 'GPS/GNSS receiver'),
        SensorCapability('cellular', 'Cellular / 5G', 'not_connected',
            'Requires supported modem and accessible diagnostic measurements; not inferred from Wi-Fi.', 'Compatible 4G/5G modem and measurement interface'),
    ]
    return {
        'environment': 'WSL 2 / Linux' if wsl else 'Linux',
        'python': platform.python_version(),
        'network_interfaces': names,
        'command_availability': {'nmcli': nmcli, 'bluetoothctl': bluez},
        'capabilities': [asdict(c) for c in rf_hardware],
        'scan_status': 'No RF scanner is active; no live RF values are generated in v0.2.0',
    }
