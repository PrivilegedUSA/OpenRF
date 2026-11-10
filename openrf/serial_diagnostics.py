"""Read-only Linux USB serial diagnostics. No ports are opened or scanned.

Descriptive sysfs USB metadata is untrusted and does not establish the identity
or ability of any RF receiver. Never collect USB serial numbers or paths to
users' data. One explicit OpenRF Serial v1 probe is still required.
"""
from __future__ import annotations

import grp
import os
from pathlib import Path
import re
import stat

PORT_RE = re.compile(r'tty(?:ACM|USB)\d{1,3}\Z')
HEX4 = re.compile(r'[0-9a-fA-F]{4}\Z')


def _read(path: Path, limit: int = 96) -> str:
    try:
        return path.read_text(encoding='utf-8', errors='replace').strip()[:limit]
    except (OSError, ValueError):
        return ''


def _descriptor(port: str, sys_root: Path) -> dict:
    """Walk Linux sysfs parents for USB VID/PID; intentionally omit serial."""
    try:
        parent = (sys_root / port / 'device').resolve(strict=True)
    except (OSError, RuntimeError):
        return {}
    for candidate in (parent, *list(parent.parents)[:8]):
        vendor, product_id = _read(candidate / 'idVendor', 4), _read(candidate / 'idProduct', 4)
        if HEX4.fullmatch(vendor) and HEX4.fullmatch(product_id):
            return {'vendor_id': vendor.lower(), 'product_id': product_id.lower(),
                    'manufacturer': _read(candidate / 'manufacturer'),
                    'product': _read(candidate / 'product')}
    return {}


def serial_port_diagnostics(ports: list[str], *, dev_root: Path = Path('/dev'),
                            sys_root: Path = Path('/sys/class/tty')) -> list[dict]:
    """Report node type and process read/write permission, not protocol support.

    Supports injection of fixture roots in unit tests. This is only a quick
    preflight; another process can claim or disconnect the port immediately.
    """
    details = []
    for port in sorted(set(ports))[:64]:
        if not isinstance(port, str) or not PORT_RE.fullmatch(port):
            continue
        node = dev_root / port
        info = {'port': port, 'path': f'/dev/{port}', 'identity_verified': False,
                'protocol_responding': False, 'usb': _descriptor(port, sys_root)}
        try:
            metadata = node.stat()
        except FileNotFoundError:
            info.update(status='disconnected', guidance='Port disappeared. Reconnect the USB device, then refresh inventory.')
        except PermissionError:
            info.update(status='permission_denied', guidance='Cannot inspect the device node. Check Linux device permissions.')
        except OSError:
            info.update(status='unavailable', guidance='Could not inspect the port; refresh after reconnecting.')
        else:
            if not stat.S_ISCHR(metadata.st_mode):
                info.update(status='not_character_device', guidance='This endpoint is not a Linux character device; do not probe it.')
            else:
                try:
                    group = grp.getgrgid(metadata.st_gid).gr_name
                except KeyError:
                    group = str(metadata.st_gid)
                info['group'] = group[:48]
                info['mode'] = oct(stat.S_IMODE(metadata.st_mode))
                if not os.access(node, os.R_OK | os.W_OK, effective_ids=True):
                    info.update(status='permission_denied',
                                guidance=f'Current process needs read/write access to this port (group {info["group"]}). Check dialout/uucp group or udev rules; log out and back in after group changes.')
                else:
                    info.update(status='ready_to_probe',
                                guidance='Port node is accessible. This does NOT prove a compatible OpenRF device; select Probe sensor to test.')
        details.append(info)
    return details
