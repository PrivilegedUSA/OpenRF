"""Passive Linux Wi-Fi HaLow (802.11ah) driver and interface hints.

Never associates, scans, reads SSIDs, opens USB endpoints or starts an IP link.
A recognized vendor driver or USB descriptor is only a *candidate*, not proof
of an operational HaLow radio, RF peer, network, or Reticulum transport.
"""
from __future__ import annotations

import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .hardware import enumerate_usb_devices, is_wsl


_DRIVER_NAMES = frozenset({'morse', 'morse_spi', 'nrc', 'nrc7394',
                           'nrc7292', 'morsemicro'})
_MODULE_NAMES = ('morse', 'nrc')
_USB_HINTS = ('wi-fi halow', 'wifi halow', '802.11ah', 'morse micro',
              'morsemicro', 'mm6108', 'mm8108', 'nrc7394', 'nrc7292',
              'newracom')
_IFACE_PATTERN = re.compile(r'^[a-zA-Z0-9_.:-]{1,32}$')


def _read(path: Path, maximum: int = 32) -> str:
    try:
        return path.read_text(encoding='utf-8', errors='replace').strip()[:maximum]
    except (OSError, ValueError):
        return ''


def _link_name(path: Path) -> str:
    """A sysfs symlink target name, not the target's content or a device probe."""
    try:
        return path.resolve(strict=True).name.lower() if path.is_symlink() else ''
    except (OSError, RuntimeError):
        return ''


def _driver_hint(driver: str) -> bool:
    return driver in _DRIVER_NAMES


def _linklocal_ipv6_ifaces(path: Path) -> set[str]:
    """Read kernel's IPv6 address table; return names only, never IP addresses.

    An IPv6 link-local address is required for RNS AutoInterface discovery,
    but does not establish multicast operation or successful peer discovery.
    """
    try:
        lines = path.read_text(encoding='ascii', errors='replace').splitlines()[:1024]
    except (OSError, ValueError):
        return set()
    result = set()
    for line in lines:
        fields = line.split()
        if (len(fields) == 6 and len(fields[0]) == 32 and
                re.fullmatch(r'[0-9a-fA-F]{32}', fields[0]) and
                fields[3].lower() == '20' and
                _IFACE_PATTERN.fullmatch(fields[5])):
            result.add(fields[5])
    return result


def status_report(*, net_root: Path = Path('/sys/class/net'),
                  module_root: Path = Path('/sys/module'),
                  ipv6_table: Path = Path('/proc/net/if_inet6'),
                  usb_devices: list[dict] | None = None,
                  wsl: bool | None = None,
                  now: datetime | None = None,
                  command_lookup=None) -> dict:
    """Summarize Linux-local HaLow prerequisites; read only, no radio I/O.

    Hardware evidence is intentionally conservative: only known driver names
    and *descriptive* USB vendor strings count as candidates. A plain wlan0,
    Ethernet link, arbitrary 900 MHz frequency or loaded module is not an RF
    association or a proven 802.11ah link.
    """
    wsl = is_wsl() if wsl is None else bool(wsl)
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        raise ValueError('now must be timezone-aware')
    moment = moment.astimezone(timezone.utc)
    lookup = command_lookup or shutil.which
    tools = {name: bool(lookup(name)) for name in
             ('iw', 'ip', 'morse_cli', 'hostapd_s1g', 'wpa_supplicant_s1g')}
    modules = [name for name in _MODULE_NAMES if (module_root / name).is_dir()]
    linklocal_ifaces = _linklocal_ipv6_ifaces(ipv6_table)

    interfaces = []
    try:
        entries = sorted(net_root.iterdir(), key=lambda p: p.name)[:128]
    except OSError:
        entries = []
    for path in entries:
        if not _IFACE_PATTERN.fullmatch(path.name) or path.name == 'lo':
            continue
        driver = ''
        for candidate in (path / 'device' / 'driver',
                          path / 'phy80211' / 'device' / 'driver',
                          path / 'device' / 'driver' / 'module'):
            driver = _link_name(candidate)
            if driver:
                break
        if not _driver_hint(driver):
            continue
        state = _read(path / 'operstate', 16).lower()
        if state not in ('up', 'down', 'dormant', 'unknown', 'lowerlayerdown', 'notpresent', 'testing'):
            state = 'unknown'
        carrier = _read(path / 'carrier', 2)
        carrier_reported = True if carrier == '1' else False if carrier == '0' else None
        linklocal = path.name in linklocal_ifaces
        # A conservative *preflight* for a voluntary RNS interface selection.
        # There is no ICMP probe, multicast join or actual RF connectivity test.
        eligible = state == 'up' and carrier_reported is not False and linklocal
        interfaces.append({
            'name': path.name, 'driver_hint': driver,
            'os_operstate': state,
            'os_carrier_reported': carrier_reported,
            'ipv6_link_local_present': linklocal,
            'reticulum_opt_in_eligible': eligible,
            'halow_rf_link_verified': False,
            'ip_transport_verified': False,
        })

    devices = enumerate_usb_devices() if usb_devices is None else usb_devices
    usb_candidates = []
    for device in devices[:128]:
        if not isinstance(device, dict):
            continue
        description = f"{device.get('manufacturer') or ''} {device.get('product') or ''}".lower()
        if any(hint in description for hint in _USB_HINTS):
            # Vendor/product IDs only: don't expose serial numbers or arbitrary
            # USB product labels that might contain personal identifying data.
            vendor = str(device.get('vendor_id') or '').lower()
            product = str(device.get('product_id') or '').lower()
            usb_candidates.append({
                'vendor_id': vendor if re.fullmatch(r'[0-9a-f]{4}', vendor) else 'unknown',
                'product_id': product if re.fullmatch(r'[0-9a-f]{4}', product) else 'unknown',
                'basis': 'USB descriptor contains an 802.11ah/vendor hint; firmware and driver unverified',
            })
        if len(usb_candidates) >= 16:
            break

    if interfaces:
        state = 'candidate_interface_visible'
        summary = 'A Linux network interface uses a known HaLow-associated driver name. Radio operation, IP and RF peer remain unverified.'
    elif usb_candidates:
        state = 'candidate_usb_visible'
        summary = 'A USB product description suggests HaLow hardware, but no supported Linux network interface is identified.'
    elif modules:
        state = 'driver_module_only'
        summary = 'A HaLow-associated kernel module is loaded, but no matching network interface is visible.'
    elif wsl:
        state = 'not_visible_in_wsl'
        summary = 'No HaLow hardware evidence in WSL Linux. Windows network connectivity is not a Linux HaLow radio.'
    else:
        state = 'no_halow_evidence'
        summary = 'No known HaLow driver, interface or USB descriptor hint is visible in Linux.'

    steps = [
        'Choose compatible 802.11ah modules and confirm Raspberry Pi OS/kernel, USB or SPI connection, antenna and region support with the vendor.',
        'Install firmware, board calibration files and matching vendor Linux drivers using the vendor instructions outside OpenRF.',
        'Configure the HaLow station/AP and permitted regulatory region using vendor-compatible tools; verify an IP link yourself.',
        'Only then consider using an authorized HaLow IP link with Reticulum AutoInterface. OpenRF does not configure or verify this transport.',
    ]
    if wsl:
        steps.insert(0, 'WSL does not inherit Windows Wi-Fi radios. Check USB passthrough or perform hardware bring-up directly on Raspberry Pi OS.')
    return {
        'schema_version': 1,
        'kind': 'PASSIVE_WIFI_HALOW_READINESS',
        'observed_at_utc': moment.isoformat(timespec='seconds'),
        'environment': 'WSL 2 / Linux' if wsl else 'Linux',
        'state': state, 'summary': summary,
        'candidate_interfaces': interfaces[:16],
        'candidate_usb_descriptors': usb_candidates,
        'loaded_module_hints': modules,
        'optional_tool_presence': tools,
        'setup_steps': steps,
        'read_only': True,
        'driver_compatibility_verified': False,
        'rf_link_verified': False,
        'ip_transport_verified': False,
        'reticulum_transport_verified': False,
        'reticulum_opt_in_requires_confirmation': True,
        'performs_scan_or_connection': False,
        'limitations': 'Vendor hints, module presence, Linux carrier and OS interface UP do not prove IEEE 802.11ah association, RF reachability, payload throughput, mesh forwarding or LXMF delivery.',
    }
