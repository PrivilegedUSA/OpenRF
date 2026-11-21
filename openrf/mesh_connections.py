"""Read-only, evidence-limited OpenRF mesh and Reticulum connection overview.

USB inventory never opens a device and a Reticulum diagnostics request uses
only a worker already explicitly enabled by its operator. A claimed serial
port or increasing byte counter is NOT a verified over-the-air RF link.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .hardware import enumerate_serial_ports
from .serial_diagnostics import serial_port_diagnostics
from .reticulum_lan import ReticulumError


def connection_report(mesh_manager, reticulum_manager, meshcore_manager=None, *, port_inventory=None):
    """Compose bounded local status only; never connect/probe/transmit."""
    mesh = mesh_manager.status()
    reticulum = reticulum_manager.status()
    meshcore = meshcore_manager.status() if meshcore_manager is not None else {}
    active_core_port = meshcore.get('port') if meshcore.get('state') != 'DISCONNECTED' else None
    connected_mesh_port = mesh.get('port') if mesh.get('connected') else None
    active_rnode_ports = reticulum.get('rnode_ports', []) if reticulum.get('enabled') else []
    active_rnode_ports = [p for p in active_rnode_ports
                          if isinstance(p, str) and p.startswith('/dev/tty')][:2]
    try:
        physical = (port_inventory() if port_inventory is not None else
                    serial_port_diagnostics(enumerate_serial_ports()))
    except (OSError, ValueError):
        physical = []
    accessible = {}
    for entry in physical[:64] if isinstance(physical, list) else []:
        if not isinstance(entry, dict):
            continue
        path = entry.get('path')
        if isinstance(path, str) and path.startswith('/dev/tty') and len(path) <= 32:
            accessible[path] = entry.get('status') if isinstance(entry.get('status'), str) else 'unknown'
    ports = []
    # Include formerly claimed ports if Linux inventory cannot currently see
    # them. This is status evidence, NOT a fresh device detection.
    all_ports = sorted(set(accessible) | set(active_rnode_ports) |
                       ({connected_mesh_port} if isinstance(connected_mesh_port, str) else set()) |
                       ({active_core_port} if isinstance(active_core_port, str) else set()))
    for path in all_ports[:64]:
        if path == connected_mesh_port:
            owner = 'MESHTASTIC_USB_SESSION'
        elif path == active_core_port:
            owner = 'MESHCORE_USB_SESSION'
        elif path in active_rnode_ports:
            owner = 'RETICULUM_RNODE_REQUESTED'
        else:
            owner = 'NOT_CLAIMED_BY_OPENRF'
        ports.append({'path': path, 'linux_status': accessible.get(path, 'not_visible_in_linux_inventory'),
                      'owner': owner, 'rnode_firmware_verified': False,
                      'over_air_link_verified': False,
                      'note': 'A Linux USB endpoint is not proof of compatible radio firmware or RF connectivity.'})

    diagnostics = {'active': False, 'available': False, 'interfaces': [],
                   'note': 'Reticulum is stopped; no live interface counters.'}
    if reticulum.get('enabled'):
        try:
            diagnostics = reticulum_manager.diagnostics()
        except ReticulumError:
            diagnostics = {'active': False, 'available': False, 'interfaces': [],
                           'note': 'Reticulum worker diagnostics could not be retrieved.'}
    interfaces = []
    if diagnostics.get('available'):
        for entry in diagnostics.get('interfaces', [])[:20]:
            if not isinstance(entry, dict):
                continue
            interfaces.append({'name': str(entry.get('name', 'Unknown'))[:100],
                               'local_up': entry.get('up') if type(entry.get('up')) is bool else None,
                               'reachable_peers_reported': entry.get('reachable_peers'),
                               'rx_bytes': entry.get('rx_bytes'),
                               'tx_bytes': entry.get('tx_bytes'),
                               'over_air_link_verified': False})

    return {
        'observed_at_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'source': 'LOCAL_USB_AND_RUNTIME_STATUS_NO_RF_PROBE',
        'meshtastic': {'connected': bool(mesh.get('connected')),
                      'port': connected_mesh_port,
                      'sdk_available': bool(mesh.get('sdk_available')),
                      'mode': mesh.get('mode') if mesh.get('mode') in ('normal', 'relay_only') else 'unknown',
                      'usb_session': 'OPEN' if mesh.get('connected') else 'CLOSED',
                      'rf_link_verified': False},
        'meshcore': {'connected': bool(meshcore.get('connected')),
                     'state': meshcore.get('state', 'NOT_CONFIGURED'),
                     'port': active_core_port,
                     'contact_count': meshcore.get('contact_count', 0),
                     'sdk_available': bool(meshcore.get('sdk_available')),
                     'rf_link_verified': False},
        'reticulum': {'enabled': bool(reticulum.get('enabled')),
                      'dependencies_available': bool(reticulum.get('dependencies_available')),
                      'rnode_ports': active_rnode_ports,
                      'tcp_requested': bool(reticulum.get('tcp_enabled')),
                      'transport_forwarding_requested': bool(reticulum.get('transport_forwarding_requested')),
                      'diagnostics_available': bool(diagnostics.get('available')),
                      'diagnostics_note': str(diagnostics.get('note', ''))[:160],
                      'interfaces': interfaces,
                      'rf_link_verified': False},
        'ports': ports,
        'wifi_halow': 'NOT_VERIFIED',
        'note': ('All entries are read-only local status. An SDK-open USB port, '
                 'RNS interface UP state, peer count, or byte counter does not '
                 'prove a working LoRa link, specific nearby node, or delivered message.')
    }
