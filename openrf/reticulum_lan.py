"""Opt-in Reticulum/LXMF LAN transport, isolated from OpenRF's HTTP server.

Only pressing Enable starts this module's child process. No RNS import,
LAN socket, peer discovery or message storage is initialized at server start.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import importlib.util
import ipaddress
import multiprocessing
import math
import time
import os
from pathlib import Path
import re
import secrets
import sys
import threading

from .reticulum_history import ReticulumLocalStore, ContactExistsError, ContactMissingError
from .reticulum_attachments import (SessionAttachmentBuffer, validate_browser_attachment,
                                    lxmf_attachment, outbound_fields, MAX_ATTACHMENT_BYTES)
from .reticulum_resources import ResourceSession, validate_resource_offer
from .hardware import enumerate_serial_ports
from .serial_diagnostics import serial_port_diagnostics
from .wifi_halow import status_report as halow_status_report


DESTINATION = re.compile(r'[0-9a-fA-F]{32}\Z')
MESSAGE_BYTES = 1024
TCP_PORT = 4242
LAN_CONFIG = """[reticulum]
  enable_transport = No
  share_instance = No

[interfaces]
  [[OpenRF LAN]]
    type = AutoInterface
    enabled = yes
    group_id = reticulum
    discovery_scope = link
"""
TCP_SECTION = """

  [[OpenRF Optional TCP Listener]]
    type = TCPServerInterface
    enabled = yes
    listen_ip = 0.0.0.0
    listen_port = 4242
"""
TCP_PEER_SECTION = """

  [[OpenRF Optional TCP Peer]]
    type = TCPClientInterface
    enabled = yes
    target_host = {host}
    target_port = {port}
"""
_LOCAL_TCP_NETWORKS = tuple(ipaddress.ip_network(net) for net in (
    '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))
RNODE_PORT = re.compile(r'/dev/tty(?:USB|ACM)\d{1,3}\Z')
HALOW_INTERFACE = re.compile(r'[a-zA-Z0-9_.:-]{1,32}\Z')
RNODE_BANDWIDTHS = (62500, 125000, 250000, 500000)


def rnode_readiness():
    """Read-only RNode preparation. A tty endpoint never proves RNode firmware."""
    ports = serial_port_diagnostics(enumerate_serial_ports())
    return {'ports': ports, 'rnode_verified': False,
            'rnode_status': 'CANDIDATE_PORTS_ONLY' if ports else 'NO_USB_SERIAL_PORTS',
            'wifi_halow_status': 'NOT_VERIFIED',
            'note': 'No USB port was opened or probed. RNode firmware, band, antenna, LoRa link, and Wi-Fi HaLow support cannot be inferred from Linux device names.',
            'meshtastic_note': 'Meshtastic radios and Reticulum RNodes use different firmware/protocols; one USB serial port cannot be used by both programs simultaneously.'}


def validate_rnode(value):
    """Validate an explicit, narrow USB RNode profile; no arbitrary path/config injection."""
    keys = {'port', 'frequency', 'bandwidth', 'txpower', 'spreadingfactor', 'codingrate'}
    if not isinstance(value, dict) or set(value) != keys:
        raise ReticulumError('RNode requires port, frequency, bandwidth, txpower, spreadingfactor and codingrate.',
                             'invalid_rnode_settings', 400)
    port = value['port']
    if not isinstance(port, str) or not RNODE_PORT.fullmatch(port):
        raise ReticulumError('RNode port must be an explicitly selected /dev/ttyUSB* or /dev/ttyACM* device.',
                             'invalid_rnode_port', 400)
    limits = {'frequency': (902000000, 928000000), 'txpower': (0, 17),
              'spreadingfactor': (7, 12), 'codingrate': (5, 8)}
    for field, (minimum, maximum) in limits.items():
        if type(value[field]) is not int or not minimum <= value[field] <= maximum:
            raise ReticulumError(f'RNode {field} must be an integer between {minimum} and {maximum}.',
                                 'invalid_rnode_settings', 400)
    if type(value['bandwidth']) is not int or value['bandwidth'] not in RNODE_BANDWIDTHS:
        raise ReticulumError('RNode bandwidth must be 62500, 125000, 250000 or 500000 Hz.',
                             'invalid_rnode_settings', 400)
    return {key: value[key] for key in ('port', 'frequency', 'bandwidth', 'txpower', 'spreadingfactor', 'codingrate')}


def validate_rnodes(values):
    """Validate up to two separate USB RNodes, never two claims on one port."""
    if type(values) is not list or not 1 <= len(values) <= 2:
        raise ReticulumError('Select one or two separate USB RNodes.',
                             'invalid_rnode_settings', 400)
    profiles = [validate_rnode(value) for value in values]
    ports = [profile['port'] for profile in profiles]
    if len(set(ports)) != len(ports):
        raise ReticulumError('Two RNode interfaces cannot share the same USB port.',
                             'rnode_duplicate_port', 400)
    return profiles


def rnode_config_section(settings, index=1):
    """RNS-documented RNodeInterface fields from validated, non-arbitrary values."""
    fields = validate_rnode(settings)
    if type(index) is not int or index not in (1, 2):
        raise ValueError('Only two managed RNode interfaces are supported.')
    name = 'OpenRF Optional USB RNode' if index == 1 else 'OpenRF Optional USB RNode 2'
    return f'\n  [[{name}]]\n    type = RNodeInterface\n    enabled = yes\n' + ''.join(
        f'    {key} = {value}\n' for key, value in fields.items())


class ReticulumError(Exception):
    def __init__(self, message, code='reticulum_unavailable', status=409):
        super().__init__(message)
        self.code, self.status = code, status


def validate_tcp_peer(value):
    """Only an explicitly approved, numeric loopback/RFC1918 target."""
    if not isinstance(value, dict) or set(value) != {'host', 'port', 'confirm'} or value['confirm'] is not True:
        raise ReticulumError('Choose and confirm one private IPv4 TCP peer.', 'invalid_tcp_peer', 400)
    try:
        address = ipaddress.IPv4Address(value['host']) if isinstance(value['host'], str) else None
    except ipaddress.AddressValueError:
        address = None
    if address is None or not any(address in subnet for subnet in _LOCAL_TCP_NETWORKS):
        raise ReticulumError('Peer must be a numeric loopback or private IPv4 address; public hosts are blocked.',
                             'invalid_tcp_peer', 400)
    port = value['port']
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ReticulumError('Peer port must be 1024–65535.', 'invalid_tcp_peer', 400)
    return {'host': str(address), 'port': port}


def validate_message(body):
    if not isinstance(body, dict) or set(body) not in ({'destination', 'text'},
                                                      {'destination', 'text', 'attachment'}):
        raise ReticulumError('Provide destination, text and at most one selected attachment.',
                             'invalid_lxmf_message', 400)
    destination, text = body['destination'], body['text']
    if not isinstance(destination, str) or not DESTINATION.fullmatch(destination):
        raise ReticulumError('LXMF address must be exactly 32 hexadecimal characters.',
                             'invalid_lxmf_destination', 400)
    if not isinstance(text, str) or (not text.strip() and 'attachment' not in body) or any(ord(c)<32 and c not in '\n\t' for c in text):
        raise ReticulumError('Enter readable message text.', 'invalid_lxmf_message', 400)
    try:
        size = len(text.encode('utf-8'))
    except UnicodeEncodeError as exc:
        raise ReticulumError('Invalid Unicode text.', 'invalid_lxmf_message', 400) from exc
    if size > MESSAGE_BYTES:
        raise ReticulumError('Limit LXMF text to 1024 UTF-8 bytes for this first release.',
                             'invalid_lxmf_message', 400)
    validated = {'destination': destination.lower(), 'text': text}
    if 'attachment' in body:
        try:
            validated['attachment'] = validate_browser_attachment(body['attachment'])
        except ValueError as exc:
            raise ReticulumError(str(exc), 'invalid_lxmf_attachment', 400) from exc
    return validated


def validate_start(body):
    """Keep LAN exposure explicit; no arbitrary listener addresses or ports."""
    if not isinstance(body, dict) or not set(body).issubset({'tcp_enabled', 'tcp_listen_port', 'tcp_peer', 'rnode', 'rnodes', 'transport_enabled', 'halow_device'}):
        raise ReticulumError('Enable accepts only explicit TCP, RNode, transport and HaLow settings.',
                             'invalid_reticulum_command', 400)
    if 'rnode' in body and 'rnodes' in body:
        raise ReticulumError('Choose either the legacy single rnode option or the rnodes list, not both.',
                             'invalid_rnode_settings', 400)
    enabled = body.get('tcp_enabled', False)
    if type(enabled) is not bool:
        raise ReticulumError('tcp_enabled must be true or false.',
                             'invalid_reticulum_command', 400)
    options = {'tcp_enabled': enabled}
    if 'tcp_listen_port' in body:
        port = body['tcp_listen_port']
        if not enabled or type(port) is not int or not 1024 <= port <= 65535:
            raise ReticulumError('TCP listener port requires enabled TCP and port 1024–65535.',
                                 'invalid_tcp_listen_port', 400)
        options['tcp_listen_port'] = port
    if 'tcp_peer' in body:
        options['tcp_peer'] = validate_tcp_peer(body['tcp_peer'])
        if (enabled and ipaddress.IPv4Address(options['tcp_peer']['host']).is_loopback and
                options['tcp_peer']['port'] == options.get('tcp_listen_port', TCP_PORT)):
            raise ReticulumError('Do not connect a Reticulum TCP listener back to itself on the same port.',
                                 'tcp_peer_self_connection', 400)
    if 'halow_device' in body:
        device = body['halow_device']
        if not isinstance(device, str) or device == 'lo' or not HALOW_INTERFACE.fullmatch(device):
            raise ReticulumError('Select a valid Linux HaLow interface name from read-only readiness.',
                                 'invalid_halow_interface', 400)
        options['halow_device'] = device
    if 'rnode' in body:
        options['rnode'] = validate_rnode(body['rnode'])
    if 'rnodes' in body:
        options['rnodes'] = validate_rnodes(body['rnodes'])
    if 'transport_enabled' in body:
        if type(body['transport_enabled']) is not bool:
            raise ReticulumError('transport_enabled must be true or false.',
                                 'invalid_reticulum_command', 400)
        if body['transport_enabled'] and not ('rnode' in options or 'rnodes' in options):
            raise ReticulumError('Reticulum transport forwarding in OpenRF requires a selected RNode.',
                                 'invalid_reticulum_command', 400)
        options['transport_enabled'] = body['transport_enabled']
    return options


def private_config(root):
    """Write a scoped, non-transporting AutoInterface configuration."""
    root = Path(root)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    directory = root / 'rns'
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    config = directory / 'config'
    if not config.exists():
        # Existing operator configuration is not overwritten. The service is
        # only started on explicit Enable, and its directory stays private.
        with config.open('x', encoding='utf-8') as output:
            output.write(LAN_CONFIG)
    config.chmod(0o600)
    return directory


def runtime_config(root, tcp_enabled=False, rnode=None, transport_enabled=False,
                   rnodes=None, halow_device=None, tcp_listen_port=TCP_PORT, tcp_peer=None):
    """Preserve operator RNS config; derive opt-in temporary transport config."""
    if rnode is not None and rnodes is not None:
        raise ValueError('Provide either rnode or rnodes, not both.')
    profiles = validate_rnodes(rnodes) if rnodes is not None else ([validate_rnode(rnode)] if rnode is not None else [])
    if halow_device is not None and (not isinstance(halow_device,str) or
                                     halow_device == 'lo' or not HALOW_INTERFACE.fullmatch(halow_device)):
        raise ValueError('Invalid HaLow network interface name.')
    if transport_enabled and not profiles:
        raise ValueError('Transport forwarding requires an RNode.')
    if type(tcp_listen_port) is not int or not 1024 <= tcp_listen_port <= 65535:
        raise ValueError('TCP listener port must be 1024–65535.')
    if tcp_peer is not None and (not isinstance(tcp_peer, dict) or set(tcp_peer) != {'host', 'port'}):
        raise ValueError('Invalid runtime TCP peer settings.')
    peer = validate_tcp_peer({**tcp_peer, 'confirm':True}) if tcp_peer is not None else None
    if (tcp_enabled and peer and ipaddress.IPv4Address(peer['host']).is_loopback and
            peer['port'] == tcp_listen_port):
        raise ValueError('A TCP listener cannot connect to itself on the same port.')
    root = Path(root)
    original = private_config(root)
    if not (tcp_enabled or peer or profiles or transport_enabled or halow_device):
        return original
    runtime = root / 'rns-tcp-runtime' if tcp_enabled and not (profiles or transport_enabled) else root / 'rns-optin-runtime'
    runtime.mkdir(mode=0o700, parents=True, exist_ok=True)
    runtime.chmod(0o700)
    source = (original / 'config').read_text(encoding='utf-8')
    if halow_device:
        # Only the managed OpenRF AutoInterface can be scoped to this device.
        # Never rewrite the operator config or replace a device restriction.
        marker = re.search(r'(?m)^  \[\[OpenRF LAN\]\][ \t]*$', source)
        if not marker:
            raise RuntimeError('The private config has no managed OpenRF LAN AutoInterface to scope.')
        next_section = re.search(r'(?m)^\s*(?:\[\[[^\]\n]+\]\]|\[[^\[\]\n]+\])[ \t]*$', source[marker.end():])
        end = marker.end() + next_section.start() if next_section else len(source)
        block = source[marker.end():end]
        if not re.search(r'(?im)^\s*type\s*=\s*AutoInterface\s*$', block) or re.search(r'(?im)^\s*devices\s*=', block):
            raise RuntimeError('The managed LAN interface was changed by the operator; cannot safely add HaLow device selection.')
        source = source[:end].rstrip() + '\n    devices = ' + halow_device + '\n\n' + source[end:]
    if '[[OpenRF Optional TCP Listener]]' in source:
        raise RuntimeError('Operator config already defines the managed TCP listener.')
    if '[[OpenRF Optional TCP Peer]]' in source:
        raise RuntimeError('Operator config already defines the managed TCP peer.')
    if profiles and any(f'[[{name}]]' in source for name in
                        ('OpenRF Optional USB RNode', 'OpenRF Optional USB RNode 2')):
        raise RuntimeError('Operator config already defines a managed USB RNode.')
    # Insert while still inside [interfaces], even if the operator has placed
    # other top-level sections after it. Never rewrite their original config.
    lines = source.splitlines(keepends=True)
    interfaces_at = next((i for i, line in enumerate(lines)
                          if line.strip() == '[interfaces]'), None)
    if interfaces_at is None:
        raise RuntimeError('Operator config has no [interfaces] section for optional interfaces.')
    after_interfaces = next((i for i in range(interfaces_at + 1, len(lines))
                             if re.fullmatch(r'\[[^\[\]]+\]\s*', lines[i].strip())), len(lines))
    listener = TCP_SECTION.replace('listen_port = 4242', f'listen_port = {tcp_listen_port}') if tcp_enabled else ''
    outbound = TCP_PEER_SECTION.format(**peer) if peer else ''
    optional_sections = listener + outbound + ''.join(
        rnode_config_section(profile, index) for index, profile in enumerate(profiles, 1))
    generated = ''.join(lines[:after_interfaces]).rstrip() + '\n' + optional_sections + '\n' + ''.join(lines[after_interfaces:])
    if profiles or transport_enabled:
        setting = re.compile(r'(?im)^(\s*enable_transport\s*=\s*)(?:yes|no|true|false)\s*$')
        if len(setting.findall(generated)) != 1:
            raise RuntimeError('Operator RNS config needs exactly one enable_transport directive for safe RNode startup.')
        # With OpenRF-managed RNode interfaces, only the explicit relay
        # checkbox permits transport forwarding, regardless of base config.
        generated = setting.sub(lambda m: m.group(1) + ('Yes' if transport_enabled else 'No'), generated)
    # This is only OpenRF's generated runtime config, never the operator file.
    temporary = runtime / 'config.new'
    fd = os.open(temporary, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        output.write(generated)
    os.replace(temporary, runtime / 'config')
    (runtime / 'config').chmod(0o600)
    return runtime


def path_inventory(instance, own_address=None):
    """Read existing RNS path cache only; never request a route or announce."""
    try:
        raw = instance.get_path_table()
    except Exception as exc:
        return {'available': False, 'paths': [], 'note': f'Path cache unavailable ({type(exc).__name__}).'}
    if not isinstance(raw, list):
        return {'available': False, 'paths': [], 'note': 'Unsupported path table format.'}
    def address(value):
        if isinstance(value, bytes):
            value = value.hex()
        return value.lower() if isinstance(value, str) and DESTINATION.fullmatch(value) else None
    def timestamp(value):
        return value if type(value) in (float, int) and math.isfinite(value) and value > 0 else None
    now = time.time()
    paths = {}
    for row in raw:
        if not isinstance(row, dict):
            continue
        ident = address(row.get('hash'))
        if not ident or ident == address(own_address):
            continue
        updated = timestamp(row.get('timestamp'))
        if updated is not None and updated > now:
            updated = None
        expires = timestamp(row.get('expires'))
        hops = row.get('hops')
        item = dict(address=ident, updated=updated, expires=expires,
                    expired=expires <= now if expires is not None else None,
                    hops=hops if type(hops) is int and 0 <= hops <= 128 else None,
                    via=address(row.get('via')),
                    interface=str(row['interface'])[:120] if isinstance(row.get('interface'), str) else None)
        if ident not in paths or (updated or 0) > (paths[ident]['updated'] or 0):
            paths[ident] = item
    ordered = sorted(paths.values(), key=lambda x: (x['expired'] is True, -(x['updated'] or 0), x['address']))
    return {'available': True, 'paths': ordered[:1000], 'total': len(ordered),
            'truncated': len(ordered) > 1000,
            'note': 'Cached paths may be historical; destination service and reachability are unverified.'}


def interface_diagnostics(instance):
    """Expose bounded, factual local RNS interface counters, never private keys."""
    try:
        stats = instance.get_interface_stats()
    except Exception as exc:
        return {'available': False, 'interfaces': [],
                'note': f'RNS interface counters unavailable ({type(exc).__name__}).'}
    if not isinstance(stats, dict) or not isinstance(stats.get('interfaces'), list):
        return {'available': False, 'interfaces': [],
                'note': 'RNS returned no usable interface counter list.'}
    interfaces = []
    for row in stats['interfaces'][:20]:
        if not isinstance(row, dict):
            continue
        def counter(key):
            value = row.get(key)
            return value if type(value) is int and 0 <= value <= 2**63 - 1 else None
        raw_up = row.get('status')
        interfaces.append({'name': str(row.get('name', 'Unknown interface'))[:100],
                           'up': raw_up if type(raw_up) is bool else None,
                           'reachable_peers': counter('peers'),
                           'connected_clients': counter('clients'),
                           'rx_bytes': counter('rxb'),
                           'tx_bytes': counter('txb')})
    return {'available': True, 'interfaces': interfaces,
            'note': 'Counters reported by this local Reticulum instance; not LXMF delivery receipts.'}


def _utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def _update_outbound_status(inbox, lock, event_id, status):
    """Apply an LXMF callback only to its own still-queued outbound event."""
    if status not in ('DELIVERED_LXMF', 'FAILED_LXMF'):
        return False
    with lock:
        for record in reversed(inbox):
            if (record.get('event_id') == event_id and record.get('direction') == 'OUT'
                    and record.get('status') == 'QUEUED_WITH_LXMF_NOT_DELIVERED'):
                record['status'] = status
                return True
    return False


def reticulum_worker(pipe, data_root, options=None):
    """Child-process LXMF endpoint. Never imported or started automatically."""
    try:
        import RNS
        import LXMF
        data_root = Path(data_root)
        tcp_enabled = bool((options or {}).get('tcp_enabled', False))
        tcp_port = (options or {}).get('tcp_listen_port', TCP_PORT)
        tcp_peer = (options or {}).get('tcp_peer')
        config_dir = runtime_config(data_root, tcp_enabled=tcp_enabled,
                                    tcp_listen_port=tcp_port, tcp_peer=tcp_peer,
                                    rnode=(options or {}).get('rnode'),
                                    transport_enabled=(options or {}).get('transport_enabled', False),
                                    rnodes=(options or {}).get('rnodes'),
                                    halow_device=(options or {}).get('halow_device'))
        rns_instance = RNS.Reticulum(configdir=str(config_dir), loglevel=1)
        identity_file = data_root / 'identity'
        if identity_file.exists():
            identity = RNS.Identity.from_file(str(identity_file))
            if identity is None:
                raise RuntimeError('Saved private identity could not be loaded; it was not replaced.')
        else:
            identity = RNS.Identity()
            if not identity.to_file(str(identity_file)):
                raise RuntimeError('Private LXMF identity could not be saved.')
        identity_file.chmod(0o600)
        router_data = data_root / 'lxmf'
        router_data.mkdir(mode=0o700, exist_ok=True)
        router_data.chmod(0o700)
        router = LXMF.LXMRouter(storagepath=str(router_data))
        source = router.register_delivery_identity(identity, display_name='OpenRF')
        if source is None:
            raise RuntimeError('LXMF delivery destination could not be initialized.')
        file_session = ResourceSession(RNS, identity)
        inbox = deque(maxlen=100)
        inbox_lock = threading.Lock()
        attachments = SessionAttachmentBuffer()
        received_count = 0
        event_sequence = 0

        def append_inbox(record, *, incoming=False):
            nonlocal received_count, event_sequence
            with inbox_lock:
                event_sequence += 1
                if incoming:
                    received_count += 1
                inbox.append({**record, 'event_id': event_sequence})
                return event_sequence

        def receive(message):
            if getattr(message, 'signature_validated', False) is not True:
                return
            try:
                content = message.content_as_string()
                address = message.source.hash.hex()
                if not isinstance(content, str) or len(content.encode('utf-8'))>MESSAGE_BYTES:
                    return
                record = {'direction':'IN', 'destination':address,
                          'text':content, 'utc':_utc(), 'status':'RECEIVED_VALID_SIGNATURE'}
                attachment = lxmf_attachment(getattr(message, 'fields', None), LXMF)
                if attachment:
                    with inbox_lock:
                        record['attachment'] = attachments.add(**attachment)
                append_inbox(record, incoming=True)
            except (AttributeError, UnicodeError, ValueError):
                return

        router.register_delivery_callback(receive)
        router.announce(source.hash)  # Only after user-initiated Enable.
        last_announce_requested_at = _utc()
        announce_requests = 1
        pipe.send({'ok':True, 'address': source.hash.hex()})
        request_id = None
        def reply(payload):
            pipe.send(dict(payload, request_id=request_id))
        while True:
            if not pipe.poll(0.5):
                continue
            command = pipe.recv()
            request_id = command.get('request_id') if isinstance(command, dict) else None
            action = command.get('action') if isinstance(command, dict) else None
            if action == 'stop':
                reply({'ok':True, 'stopped':True})
                break
            if action == 'announce':
                router.announce(source.hash)
                last_announce_requested_at = _utc()
                announce_requests += 1
                reply({'ok':True, 'announced':True, 'delivery_verified':False})
            elif action == 'mesh_inventory':
                reply({'ok': True, 'path_cache': path_inventory(rns_instance, source.hash),
                           'interface_report': interface_diagnostics(rns_instance)})
            elif action == 'diagnostics':
                report = interface_diagnostics(rns_instance)
                report.update({'ok':True,
                               'tcp_requested':tcp_enabled,
                               'tcp_port': tcp_port if tcp_enabled else None,
                               'tcp_peer_requested': bool(tcp_peer),
                               'announce_requests':announce_requests,
                               'last_announce_requested_at_utc':last_announce_requested_at,
                               'announcement_received_by_peer':None})
                reply(report)
            elif action == 'messages':
                with inbox_lock:
                    snapshot = []
                    for record in inbox:
                        item = dict(record)
                        if item.get('attachment'):
                            current = attachments.get(item['attachment']['id']) is not None
                            item['attachment'] = {**item['attachment'], 'available':current}
                        snapshot.append(item)
                    sequence = received_count
                reply({'ok':True, 'messages':snapshot, 'receive_sequence':sequence,
                           'storage':'WORKER_MEMORY_AND_PRIVATE_LXMF_RUNTIME'})
            elif action == 'clear_messages':
                with inbox_lock:
                    inbox.clear()
                    attachments.clear()
                reply({'ok':True, 'cleared':True})
            elif action == 'attachment':
                token = command.get('message', {}).get('id') if isinstance(command.get('message'), dict) else None
                with inbox_lock:
                    item = attachments.get(token)
                if item is None:
                    reply({'ok':False, 'error':'Attachment is no longer available in this session.'})
                else:
                    reply({'ok':True, **item})
            elif action == 'files_status':
                reply({'ok': True, **file_session.snapshot()})
            elif action == 'files_announce':
                reply({'ok': True, **file_session.announce()})
            elif action == 'files_arm':
                try:
                    payload = command.get('message')
                    if not isinstance(payload, dict) or set(payload) != {'enabled'}:
                        raise ValueError('Choose the explicit receive switch.')
                    reply({'ok': True, **file_session.arm(payload['enabled'])})
                except ValueError as exc:
                    reply({'ok':False, 'error':str(exc)})
            elif action == 'files_send':
                try:
                    reply({'ok': True, **file_session.send(command['message'])})
                except ValueError as exc:
                    reply({'ok':False, 'error':str(exc)})
            elif action == 'files_cancel':
                try:
                    reply({'ok': True, **file_session.cancel(command['message']['id'])})
                except (ValueError, KeyError, TypeError) as exc:
                    reply({'ok':False, 'error':str(exc)})
            elif action == 'files_download':
                item = file_session.download(command.get('message',{}).get('id'))
                reply({'ok': bool(item), **item} if item else
                          {'ok': False, 'error':'File is not available during this session.'})
            elif action == 'send':
                # Validated in parent before IPC; already normalized bytes.
                payload = command.get('message')
                if not isinstance(payload, dict) or set(payload) not in ({'destination','text'},
                                                                          {'destination','text','attachment'}):
                    reply({'ok':False, 'error':'Invalid outbound message.'})
                    continue
                target = bytes.fromhex(payload['destination'])
                if not RNS.Transport.has_path(target):
                    RNS.Transport.request_path(target)
                    reply({'ok':True, 'status':'PATH_REQUESTED_NOT_SENT',
                               'note':'Try sending again when a route to the destination exists.'})
                    continue
                recipient = RNS.Identity.recall(target)
                if recipient is None:
                    reply({'ok':True, 'status':'NO_RECALLED_IDENTITY_NOT_SENT'})
                    continue
                destination = RNS.Destination(recipient, RNS.Destination.OUT,
                    RNS.Destination.SINGLE, 'lxmf', 'delivery')
                attachment = payload.get('attachment')
                fields = None
                if attachment:
                    fields = outbound_fields(LXMF, attachment)
                message = LXMF.LXMessage(destination, source, payload['text'], None,
                    fields=fields, desired_method=LXMF.LXMessage.DIRECT, include_ticket=True)
                record = {'direction':'OUT', 'destination':payload['destination'],
                          'text':payload['text'], 'utc':_utc(),
                          'status':'QUEUED_WITH_LXMF_NOT_DELIVERED'}
                if attachment:
                    with inbox_lock:
                        record['attachment'] = attachments.add(**attachment)
                event_id = append_inbox(record)
                # Router acceptance alone is not delivery. LXMF invokes these
                # callbacks later when it has proof or has exhausted retries.
                message.register_delivery_callback(lambda _msg, eid=event_id:
                    _update_outbound_status(inbox, inbox_lock, eid, 'DELIVERED_LXMF'))
                message.register_failed_callback(lambda _msg, eid=event_id:
                    _update_outbound_status(inbox, inbox_lock, eid, 'FAILED_LXMF'))
                try:
                    router.handle_outbound(message)
                except Exception:
                    _update_outbound_status(inbox, inbox_lock, event_id, 'FAILED_LXMF')
                    reply({'ok':False, 'error':'LXMF rejected the outbound message; it was not queued.'})
                    continue
                with inbox_lock:
                    current = next((row['status'] for row in reversed(inbox)
                                    if row.get('event_id') == event_id),
                                   'QUEUED_WITH_LXMF_NOT_DELIVERED')
                reply({'ok':True, 'status':current, 'event_id':event_id})
            else:
                reply({'ok':False, 'error':'Unrecognized local Reticulum command.'})
    except (EOFError, BrokenPipeError):
        pass
    except Exception as exc:
        try:
            pipe.send({'ok':False, 'error':f'Reticulum worker could not initialize or perform request: {type(exc).__name__}.'})
        except (EOFError, BrokenPipeError, OSError):
            pass
    finally:
        pipe.close()


class ReticulumManager:
    """A separate, explicitly controlled process; stop tears down LAN sockets."""
    def __init__(self, data_root, dependencies_available=None, process_factory=None):
        self.data_root = Path(data_root)
        self._deps = dependencies_available or (lambda:
            importlib.util.find_spec('RNS') is not None and importlib.util.find_spec('LXMF') is not None)
        self._factory = process_factory
        self._lock = threading.RLock()
        self._process = None
        self._pipe = None
        self._address = None
        self._error = None
        self._tcp_enabled = False
        self._tcp_port = TCP_PORT
        self._tcp_peer = None
        self._rnodes = []
        self._transport_enabled = False
        self._halow_device = None
        self._worker_id = None
        self._pending_request = None
        self._store = ReticulumLocalStore(self.data_root)

    def _running(self):
        return self._process is not None and self._process.is_alive()

    def status(self):
        with self._lock:
            available = bool(self._deps())
            running = self._running()
            missing = []
            if not available:
                # Report the interpreter running the *server*, not the shell
                # or an unrelated Python where the operator installed rns.
                for module, package in (('RNS', 'rns'), ('LXMF', 'lxmf')):
                    try:
                        found = importlib.util.find_spec(module) is not None
                    except (ImportError, ValueError):
                        found = False
                    if not found:
                        missing.append(package)
            return {'enabled':running, 'dependencies_available':available,
                    'missing_packages':missing,
                    'python_executable':sys.executable if not available else None,
                    'address':self._address if running else None,
                    'last_error':self._error,
                    'transport':'RETICULUM_AUTOINTERFACE_WITH_OPTIONAL_TCP_RNODE',
                    'tcp_enabled':self._tcp_enabled if running else False,
                    'rnode_requested':bool(running and self._rnodes),
                    'rnode_port':self._rnodes[0]['port'] if running and self._rnodes else None,
                    'rnode_ports':[profile['port'] for profile in self._rnodes] if running else [],
                    'rnode_count':len(self._rnodes) if running else 0,
                    'transport_forwarding_requested':bool(running and self._transport_enabled),
                    'halow_device_requested':self._halow_device if running else None,
                    'halow_ip_or_rf_link_verified':False,
                    'tcp_port':self._tcp_port if running and self._tcp_enabled else None,
                    'tcp_peer_requested':bool(running and self._tcp_peer),
                    'delivery':'UNVERIFIED_UNTIL_LXMF_RECEIPT',
                    'network_activity_requires_operator_action':True,
                    'note':'Network activity only starts after Enable. TCP listens on all network adapters only when selected. A selected USB RNode may transmit RF; forwarding requires a separate opt-in. Peer reception and delivery remain unverified.'}

    def start(self, payload):
        options = validate_start(payload)
        if options.get('halow_device'):
            # Re-evaluate OS readiness immediately before any Reticulum child
            # starts. This is not an RF/IP peer test, and does not mutate any
            # interface. A generic wlan0 is intentionally insufficient.
            report = halow_status_report()
            selected = next((row for row in report.get('candidate_interfaces', [])
                             if row.get('name') == options['halow_device'] and
                             row.get('reticulum_opt_in_eligible') is True), None)
            if selected is None:
                raise ReticulumError('Selected HaLow interface is not ready in Linux: a recognized driver, OS UP state and IPv6 link-local address are required. Refresh Hardware readiness and configure the vendor network outside OpenRF.',
                                     'halow_not_ready', 409)
        with self._lock:
            if self._running():
                raise ReticulumError('Reticulum LAN is already enabled.', 'reticulum_busy')
            if not self._deps():
                raise ReticulumError('Install optional rns and lxmf packages in Linux before enabling.',
                                     'reticulum_dependencies_missing', 503)
            ctx = multiprocessing.get_context('spawn')
            parent, child = ctx.Pipe()
            # Reticulum path-request stamps may launch their own short-lived
            # multiprocessing workers. A daemonic OpenRF worker cannot start
            # child processes (Python raises AssertionError at send time).
            # The HTTP server owns this non-daemonic child and explicitly
            # stops/reaps it in stop(), close() and server_close().
            process = (self._factory or ctx.Process)(
                target=reticulum_worker, args=(child,str(self.data_root),options), daemon=False)
            process.start()
            child.close()
            self._process, self._pipe = process, parent
            self._worker_id = secrets.token_hex(16)
            if not parent.poll(20):
                self._terminate()
                self._error = 'Reticulum startup timed out.'
                raise ReticulumError(self._error, 'reticulum_start_timeout', 503)
            try:
                result = parent.recv()
            except (EOFError, OSError) as exc:
                self._terminate()
                raise ReticulumError('Reticulum worker exited during startup.',
                                     'reticulum_start_failed', 503) from exc
            if not result.get('ok'):
                self._terminate()
                self._error = result.get('error','Reticulum startup failed.')
                raise ReticulumError(self._error, 'reticulum_start_failed', 503)
            self._address = result['address']
            self._tcp_enabled = options['tcp_enabled']
            self._tcp_port = options.get('tcp_listen_port', TCP_PORT)
            self._tcp_peer = options.get('tcp_peer')
            self._rnodes = options.get('rnodes') or ([options['rnode']] if 'rnode' in options else [])
            self._transport_enabled = options.get('transport_enabled', False)
            self._halow_device = options.get('halow_device')
            self._error = None
            return self.status()

    def _command(self, action, message=None, *, timeout=8):
        with self._lock:
            if not self._running() or self._pipe is None:
                raise ReticulumError('Enable Reticulum LAN before this action.', 'reticulum_disconnected')
            try:
                if self._pending_request is not None:
                    # A timed-out command may still have side effects. Never retry it automatically.
                    while self._pipe.poll(0):
                        stale = self._pipe.recv()
                        if stale.get('request_id') == self._pending_request:
                            self._pending_request = None
                            break
                    if self._pending_request is not None:
                        raise ReticulumError('Previous Reticulum command still pending; retry later.', 'reticulum_response_timeout', 503)
                request_id = secrets.token_hex(16)
                self._pending_request = request_id
                self._pipe.send({'action':action, 'message':message, 'request_id':request_id})
                deadline = time.monotonic() + timeout
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not self._pipe.poll(remaining):
                        raise ReticulumError('Reticulum worker response timed out; command outcome unknown.',
                                             'reticulum_response_timeout', 503)
                    result = self._pipe.recv()
                    if result.get('request_id') == request_id:
                        self._pending_request = None
                        break
                    if result.get('request_id') is None and not result.get('ok'):
                        raise ReticulumError(result.get('error','Reticulum worker failed.'), 'reticulum_worker_failed',503)
            except (BrokenPipeError, EOFError, OSError) as exc:
                raise ReticulumError('Reticulum worker disconnected.',
                                     'reticulum_disconnected', 503) from exc
            if not result.get('ok'):
                raise ReticulumError(result.get('error','Reticulum request failed.'),
                                     'reticulum_worker_failed', 503)
            result.pop('request_id', None)
            return result

    def _sync_messages(self, result):
        if self._worker_id and self._store.history_enabled():
            self._store.save_events(self._worker_id, result.get('messages', []))

    def messages(self):
        with self._lock:
            if self._running():
                result = self._command('messages')
                for row in result.get('messages', []):
                    row['worker_id'] = self._worker_id
                self._sync_messages(result)
            else:
                result = {'messages':[], 'receive_sequence':0, 'storage':'INACTIVE'}
            if self._store.history_enabled():
                saved = self._store.messages()
                active_ids = {row['attachment']['id'] for row in result.get('messages', [])
                              if isinstance(row.get('attachment'),dict) and
                              row['attachment'].get('available') is True}
                for row in saved:
                    attachment = row.get('attachment')
                    if attachment:
                        attachment['available'] = bool(self._running() and
                            row.get('worker_id') == self._worker_id and
                            attachment['id'] in active_ids)
                return {'messages':saved,
                        'receive_sequence':result['receive_sequence'],
                        'storage':'PRIVATE_LOCAL_SQLITE_OPT_IN','history_enabled':True}
            return {**result, 'history_enabled':False}

    def contacts(self):
        with self._lock:
            return {'contacts':self._store.contacts(), 'storage':'PRIVATE_LOCAL_SQLITE'}

    def save_contact(self, payload):
        fields=set(payload) if isinstance(payload,dict) else set()
        if fields not in ({'destination','alias'},{'destination','alias','update'}) or (
                'update' in fields and payload['update'] is not True):
            raise ReticulumError('Provide a destination and nickname; set update=true only when editing.',
                                 'invalid_reticulum_contact',400)
        try:
            with self._lock:
                return {'contact':self._store.save_contact(payload['destination'],payload['alias'],
                                                          update=payload.get('update',False))}
        except ContactExistsError as exc:
            raise ReticulumError(str(exc),'reticulum_contact_exists',409) from exc
        except ContactMissingError as exc:
            raise ReticulumError(str(exc),'reticulum_contact_missing',404) from exc
        except ValueError as exc:
            raise ReticulumError(str(exc),'invalid_reticulum_contact',400) from exc

    def delete_contact(self, payload):
        if not isinstance(payload,dict) or set(payload)!={'destination'}:
            raise ReticulumError('Provide exactly one destination to remove.','invalid_reticulum_contact',400)
        try:
            with self._lock:
                return {'deleted':self._store.delete_contact(payload['destination'])}
        except ValueError as exc:
            raise ReticulumError(str(exc),'invalid_reticulum_contact',400) from exc

    def history_status(self):
        with self._lock:
            return self._store.history_status()

    def set_history(self, payload):
        if not isinstance(payload,dict) or set(payload)!={'enabled'} or type(payload['enabled']) is not bool:
            raise ReticulumError('History setting must contain enabled: true or false.',
                                 'invalid_reticulum_history',400)
        with self._lock:
            self._store.set_history(payload['enabled'])
            # Enabling is explicit consent to preserve the already visible
            # in-memory session as well as subsequent messages.
            if payload['enabled'] and self._running():
                self._sync_messages(self._command('messages'))
            return self._store.history_status()

    def clear_history(self, payload):
        if payload != {}:
            raise ReticulumError('Clear messages requires an empty object.',
                                 'invalid_reticulum_history',400)
        with self._lock:
            removed=self._store.clear_messages()
            if self._running():
                self._command('clear_messages')
            return {'removed':removed,'cleared':True}

    def mesh_inventory(self):
        with self._lock:
            if not self._running():
                return {}
            return self._command('mesh_inventory', timeout=2)

    def diagnostics(self):
        if not self._running():
            return {'active':False, 'available':False, 'interfaces':[],
                    'tcp_requested':False, 'tcp_port':None,
                    'announce_requests':0,
                    'last_announce_requested_at_utc':None,
                    'announcement_received_by_peer':None,
                    'note':'Reticulum is stopped; no live interface counters.'}
        result = self._command('diagnostics')
        result['active'] = True
        return result

    def send(self, payload):
        message = validate_message(payload)
        result = self._command('send',message)
        return {**result, 'worker_id':self._worker_id}

    def attachment(self, token):
        if not isinstance(token, str) or not re.fullmatch(r'[0-9a-f]{32}', token):
            raise ReticulumError('Invalid attachment identifier.', 'invalid_lxmf_attachment', 400)
        try:
            result = self._command('attachment', {'id':token})
        except ReticulumError as exc:
            if exc.code == 'reticulum_worker_failed':
                raise ReticulumError('Attachment is no longer available in this session.',
                                     'attachment_unavailable', 404) from exc
            raise
        if not isinstance(result.get('data'),bytes) or len(result['data'])>MAX_ATTACHMENT_BYTES:
            raise ReticulumError('Attachment bytes are invalid.', 'attachment_unavailable', 404)
        return result

    def files_status(self):
        if not self._running():
            return {'enabled':False, 'file_address':None, 'receiving_armed_seconds':0,
                    'transfers':[], 'bytes_in_memory':0, 'max_file_bytes':2*1024*1024}
        return {'enabled':True, **self._command('files_status')}

    def files_announce(self, payload):
        if payload != {}:
            raise ReticulumError('Announce requires an empty object.', 'invalid_file_command', 400)
        return self._command('files_announce')

    def files_arm(self, payload):
        if not isinstance(payload,dict) or set(payload)!={'enabled'} or type(payload['enabled']) is not bool:
            raise ReticulumError('Choose enabled true or false.', 'invalid_file_command', 400)
        return self._command('files_arm',payload)

    def files_send(self, payload):
        try:
            offer = validate_resource_offer(payload)
        except ValueError as exc:
            raise ReticulumError(str(exc), 'invalid_resource_offer', 400) from exc
        return self._command('files_send',offer)

    def files_cancel(self, payload):
        if not isinstance(payload, dict) or set(payload)!={'id'} or not isinstance(payload['id'],str) or not re.fullmatch('[0-9a-f]{32}',payload['id']):
            raise ReticulumError('Select a valid transfer ID.', 'invalid_file_command', 400)
        return self._command('files_cancel',payload)

    def files_download(self, ident):
        if not isinstance(ident,str) or not re.fullmatch('[0-9a-f]{32}',ident):
            raise ReticulumError('Invalid file ID.', 'invalid_file_id', 400)
        try:
            result = self._command('files_download',{'id':ident})
        except ReticulumError as exc:
            raise ReticulumError('Received file not available; it may have expired.',
                                 'resource_unavailable', 404) from exc
        data = result.get('data')
        if not isinstance(data,bytes) or not 1<=len(data)<=2*1024*1024:
            raise ReticulumError('Received file unavailable.', 'resource_unavailable', 404)
        return result

    def announce(self, payload):
        if payload != {}:
            raise ReticulumError('Announce requires an empty object.', 'invalid_reticulum_command', 400)
        return self._command('announce')

    def _terminate(self):
        process, pipe = self._process, self._pipe
        self._process, self._pipe, self._address = None, None, None
        self._worker_id = None
        self._pending_request = None
        self._tcp_enabled = False
        self._tcp_port = TCP_PORT
        self._tcp_peer = None
        self._rnodes = []
        self._transport_enabled = False
        self._halow_device = None
        if process is not None:
            if process.is_alive():
                process.terminate()
            process.join(timeout=3)
            if process.is_alive():
                process.kill()
                process.join(timeout=2)
        if pipe is not None:
            pipe.close()

    def stop(self, payload=None):
        if payload is not None and payload != {}:
            raise ReticulumError('Disable requires an empty object.', 'invalid_reticulum_command', 400)
        with self._lock:
            if self._running() and self._pipe is not None:
                if self._store.history_enabled():
                    try:
                        self._sync_messages(self._command('messages'))
                    except Exception:
                        # Optional history must never prevent an explicit Stop
                        # from closing the LAN listener and child process.
                        self._error = 'Final Reticulum history sync failed before shutdown.'
                try:
                    # Stop is special: explicitly request shutdown even after a
                    # timed-out history sync. Drain unrelated replies, then terminate
                    # our own process if it cannot acknowledge promptly.
                    request_id = secrets.token_hex(16)
                    self._pipe.send({'action':'stop','request_id':request_id})
                    deadline = time.monotonic()+2
                    while time.monotonic() < deadline and self._pipe.poll(max(0,deadline-time.monotonic())):
                        reply = self._pipe.recv()
                        if reply.get('request_id') == request_id:
                            break
                except (OSError, EOFError, BrokenPipeError, ReticulumError):
                    pass
            self._terminate()
            return {'enabled':False,'worker_stopped':True}

    def close(self):
        self.stop()
