"""Explicit, read-only Linux host diagnostics for candidate Wi-Fi HaLow links.

Never scans, associates, sends packets, reads SSIDs/IPs/MACs or tests a peer.
The optional ``iw dev IFACE link`` command reports only the host OS's view.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from .wifi_halow import status_report


_IFACE = re.compile(r'^[a-zA-Z0-9_.:-]{1,32}$')
_FIELDS = ('rx_bytes', 'tx_bytes', 'rx_packets', 'tx_packets',
           'rx_errors', 'tx_errors', 'rx_dropped', 'tx_dropped')
_U64_MAX = 18_446_744_073_709_551_615


class HaLowDiagnosticError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _counter(path: Path) -> int | None:
    try:
        raw = path.read_text(encoding='ascii').strip()
        if not 1 <= len(raw) <= 20 or not raw.isascii() or not raw.isdecimal():
            return None
        result = int(raw)
        return result if result <= _U64_MAX else None
    except (OSError, ValueError, UnicodeError):
        return None


def _iw_link(interface: str, lookup, runner) -> str:
    """Read an existing association status; discard private command output."""
    executable = lookup('iw')
    if not executable:
        return 'tool_unavailable'
    try:
        result = runner([executable, 'dev', interface, 'link'],
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        text=True, timeout=2, check=False)
    except subprocess.TimeoutExpired:
        return 'timed_out'
    except (OSError, ValueError, subprocess.SubprocessError):
        return 'failed'
    if result.returncode != 0:
        return 'unsupported_or_failed'
    output = str(result.stdout or '')[:4096]
    first_line = output.splitlines()[0].strip() if output.splitlines() else ''
    if first_line == 'Not connected.':
        return 'os_reports_not_associated'
    # Linux iw commonly prints "Connected to <BSSID> (on <iface>)". Never
    # expose the BSSID, SSID, frequency, signal or rates even if returned.
    if re.fullmatch(r'Connected to [0-9a-fA-F:]{17}(?: \(on [^\n]{1,32}\))?', first_line):
        return 'os_reports_associated'
    return 'unsupported_or_unknown'


def diagnostic_report(interface: str, *, net_root: Path = Path('/sys/class/net'),
                      readiness: dict | None = None, now: datetime | None = None,
                      command_lookup=None, runner=None) -> dict:
    """One user-requested, non-transmitting Linux diagnostic for a known candidate.

    ``readiness`` and ``net_root`` are injectable to allow hardware-free tests.
    A generic wlan/Ethernet device cannot be used by this diagnostic endpoint.
    """
    if not isinstance(interface, str) or not _IFACE.fullmatch(interface) or interface == 'lo':
        raise HaLowDiagnosticError('Choose a valid candidate HaLow interface')
    report = status_report() if readiness is None else readiness
    candidates = report.get('candidate_interfaces', [])
    match = next((item for item in candidates if item.get('name') == interface), None)
    if not match:
        raise HaLowDiagnosticError('Interface is not a currently recognized HaLow candidate', 409)
    # A candidate may disappear between readiness and the requested check.
    if not (net_root / interface).is_dir():
        raise HaLowDiagnosticError('Candidate network interface is no longer visible in Linux', 409)
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        raise ValueError('now must be timezone-aware')
    lookup = command_lookup or shutil.which
    command = runner or subprocess.run
    association = _iw_link(interface, lookup, command)
    base = net_root / interface / 'statistics'
    # Decimal strings retain exact unsigned 64-bit values in JavaScript.
    stats = {field: str(value) if (value := _counter(base / field)) is not None else None
             for field in _FIELDS}
    return {
        'schema_version': 1,
        'kind': 'PASSIVE_WIFI_HALOW_LINK_DIAGNOSTIC',
        'observed_at_utc': moment.astimezone(timezone.utc).isoformat(timespec='seconds'),
        'interface': interface,
        'driver_hint': match.get('driver_hint', 'unknown'),
        'os_operstate': match.get('os_operstate', 'unknown'),
        'os_carrier_reported': match.get('os_carrier_reported'),
        'ipv6_link_local_present': bool(match.get('ipv6_link_local_present')),
        'reticulum_opt_in_eligible': bool(match.get('reticulum_opt_in_eligible')),
        'os_association': association,
        'kernel_cumulative_counters': stats,
        'kernel_counters_scope': 'Cumulative local Linux network-interface counters, not verified peer RF activity or Reticulum/LXMF delivery.',
        'read_only': True,
        'performs_scan_or_connection': False,
        'rf_link_verified': False,
        'peer_reachability_verified': False,
        'ip_transport_verified': False,
        'reticulum_transport_verified': False,
        'limitations': 'Driver/OS association and counters are host reports only; they do not prove an IEEE 802.11ah RF peer, working IP/multicast path, mesh forwarding or message delivery.',
    }
