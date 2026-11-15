"""Opt-in Meshtastic USB text bridge for OpenRF Linux/Raspberry Pi.

The attached radio's own firmware does any mesh rebroadcasting. OpenRF never
rebroadcasts packets in Python, changes the device role, probes ports at
startup, stores message bodies on disk, or simulates a successful transmission.
The optional Meshtastic Python SDK is imported only after Connect is pressed.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import importlib.util
import os
import re
import sqlite3
import stat
import threading
from pathlib import Path

from .hardware import enumerate_serial_ports

SERIAL_PORT = re.compile(r'/dev/tty(?:USB|ACM)[0-9]{1,3}\Z')
NODE_ID = re.compile(r'![0-9a-fA-F]{8}\Z')
MAX_TEXT_BYTES = 180  # conservative bound under typical Meshtastic RF payloads


class MeshError(Exception):
    def __init__(self, message: str, code: str = 'mesh_unavailable', status: int = 409):
        super().__init__(message)
        self.code = code
        self.status = status


def validate_port(value):
    if not isinstance(value, str) or not SERIAL_PORT.fullmatch(value):
        raise MeshError('Choose a local USB serial node from /dev/ttyUSB# or /dev/ttyACM#.',
                        'invalid_mesh_port', 400)
    return value


def validate_send(payload):
    if not isinstance(payload, dict) or set(payload) != {'text', 'destination', 'channel'}:
        raise MeshError('Provide text, destination and channel only.', 'invalid_mesh_message', 400)
    text, destination, channel = payload['text'], payload['destination'], payload['channel']
    if not isinstance(text, str) or not text.strip():
        raise MeshError('Message must contain 1–180 UTF-8 bytes.', 'invalid_mesh_message', 400)
    try:
        encoded = text.encode('utf-8')
    except UnicodeEncodeError as exc:
        raise MeshError('Message contains invalid Unicode.', 'invalid_mesh_message', 400) from exc
    if len(encoded) > MAX_TEXT_BYTES:
        raise MeshError('Message must contain 1–180 UTF-8 bytes.', 'invalid_mesh_message', 400)
    if any(ord(c) < 32 and c not in '\n\t' for c in text):
        raise MeshError('Message contains unsupported control characters.', 'invalid_mesh_message', 400)
    if not isinstance(destination, str) or not (destination == '^all' or NODE_ID.fullmatch(destination)):
        raise MeshError('Destination must be ^all or a node ID such as !1234abcd.',
                        'invalid_mesh_message', 400)
    if type(channel) is not int or not 0 <= channel <= 7:
        raise MeshError('Channel index must be 0–7.', 'invalid_mesh_message', 400)
    return {'text': text, 'destination': destination.lower(), 'channel': channel}


def _utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class MeshtasticSerialBridge:
    """Real optional SDK connection; callbacks are limited to decoded text."""

    def __init__(self, port, on_text):
        try:
            import meshtastic.serial_interface
            from pubsub import pub
        except ImportError as exc:
            raise MeshError('Meshtastic Python support is not installed in Linux. '
                            'Install the optional meshtastic package before connecting.',
                            'mesh_sdk_missing', 503) from exc
        self.interface = None
        self._pub = pub
        self._on_text = on_text
        self._pub.subscribe(self._on_receive, 'meshtastic.receive.text')
        try:
            # Never auto-probe: the operator explicitly selected one USB path.
            self.interface = meshtastic.serial_interface.SerialInterface(devPath=port)
        except Exception as exc:
            self._pub.unsubscribe(self._on_receive, 'meshtastic.receive.text')
            raise MeshError('Could not open the selected Meshtastic node. Check USB '
                            'permissions, firmware and whether another app uses the port.',
                            'mesh_connect_failed', 503) from exc

    def _on_receive(self, packet, interface=None):
        if self.interface is not None and interface is self.interface:
            self._on_text(packet)

    def send(self, text, destination, channel):
        if self.interface is None:
            raise MeshError('Meshtastic node is not connected.', 'mesh_disconnected')
        packet = self.interface.sendText(text, destinationId=destination,
                                         wantAck=(destination != '^all'), channelIndex=channel)
        return getattr(packet, 'id', None)

    def send_with_receipt(self, text, destination, channel, callback):
        # SDK callback receives a routing response; it is not proof a human read
        # the message. Broadcasts do not have destination acknowledgments.
        def on_response(packet):
            if not isinstance(packet, dict):
                return
            decoded = packet.get('decoded')
            if not isinstance(decoded, dict):
                return
            routing = decoded.get('routing', {})
            if not isinstance(routing, dict):
                return
            reason = routing.get('errorReason')
            request_id = decoded.get('requestId')
            if type(request_id) is int and reason is not None:
                callback(request_id, reason)
        if destination == '^all':
            return self.send(text, destination, channel)
        packet = self.interface.sendText(text, destinationId=destination,
            wantAck=True, channelIndex=channel, onResponse=on_response,
            onResponseAckPermitted=True)
        return getattr(packet, 'id', None)

    def close(self):
        self._pub.unsubscribe(self._on_receive, 'meshtastic.receive.text')
        if self.interface is not None:
            self.interface.close()
            self.interface = None


class MeshManager:
    """Explicit mesh connection with private, opt-in local message history."""

    def __init__(self, bridge_factory=None, port_provider=None, sdk_available=None, history_path=None):
        self._factory = bridge_factory or MeshtasticSerialBridge
        self._ports = port_provider or enumerate_serial_ports
        self._sdk_available = sdk_available or (lambda: importlib.util.find_spec('meshtastic') is not None)
        self._lock = threading.RLock()
        self._bridge = None
        self._state = 'DISCONNECTED'
        self._mode = 'normal'
        self._port = None
        self._generation = 0
        self._messages = deque(maxlen=100)
        # Monotonic since server startup, even if the bounded inbox rolls over.
        # Used only for opt-in UI unread indicators; it reveals no message body.
        self._receive_sequence = 0
        self._early_receipts = {}
        self._last_error = None
        self._closed = False
        self._history_path = Path(history_path) if history_path else None
        self._history_enabled = False
        if self._history_path is not None:
            self._init_history()

    def _db(self):
        if self._history_path is None:
            raise MeshError('Persistent message history is not configured.', 'history_unavailable', 503)
        self._history_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        connection = sqlite3.connect(self._history_path, timeout=5)
        # Linux local-data is private to the current user even with a broad umask.
        self._history_path.chmod(0o600)
        return connection

    def _init_history(self):
        # Private data is created only in local-data, never in a release or Git.
        with self._db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS mesh_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS mesh_node_aliases (node TEXT PRIMARY KEY, alias TEXT NOT NULL)')
            db.execute("""CREATE TABLE IF NOT EXISTS mesh_message_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT, direction TEXT NOT NULL,
                node TEXT NOT NULL, channel INTEGER, body TEXT NOT NULL,
                utc TEXT NOT NULL, source TEXT NOT NULL, delivery TEXT NOT NULL,
                packet_id INTEGER)""")
            row = db.execute("SELECT value FROM mesh_preferences WHERE key = 'save_history'").fetchone()
            self._history_enabled = row is not None and row[0] == '1'

    def nodes(self):
        """Local correspondents only; not a discovery or live-neighbor scan."""
        with self._lock:
            observed = {m['node'] for m in self._messages if NODE_ID.fullmatch(m['node'])}
            aliases = {}
            if self._history_path is not None:
                with self._db() as db:
                    aliases = dict(db.execute('SELECT node,alias FROM mesh_node_aliases LIMIT 100'))
                    if self._history_enabled:
                        observed.update(r[0] for r in db.execute(
                            "SELECT DISTINCT node FROM mesh_message_history WHERE node LIKE '!%' LIMIT 100"))
            return {'nodes': [{'id': node, 'alias': aliases.get(node, ''),
                    'observed_in_messages': node in observed, 'online_verified': False}
                    for node in sorted(observed | set(aliases)) if NODE_ID.fullmatch(node)][:100],
                    'source': 'LOCAL_MESSAGES_AND_SAVED_ALIASES_NOT_LIVE_SCAN'}

    def set_alias(self, payload):
        if not isinstance(payload, dict) or set(payload) != {'node', 'alias'}:
            raise MeshError('Specify node and alias.', 'invalid_mesh_alias', 400)
        node, alias = payload['node'], payload['alias']
        if not isinstance(node, str) or not NODE_ID.fullmatch(node):
            raise MeshError('Use a valid node ID.', 'invalid_mesh_alias', 400)
        if not isinstance(alias, str) or len(alias) > 40 or any(ord(c)<32 for c in alias):
            raise MeshError('Nickname must be at most 40 printable characters.', 'invalid_mesh_alias', 400)
        node = node.lower(); alias = alias.strip()
        with self._lock:
            if self._history_path is None:
                raise MeshError('Private node directory storage unavailable.', 'history_unavailable', 503)
            with self._db() as db:
                if alias:
                    db.execute('INSERT OR REPLACE INTO mesh_node_aliases(node,alias) VALUES(?,?)', (node,alias))
                else:
                    db.execute('DELETE FROM mesh_node_aliases WHERE node=?', (node,))
        return {'node': node, 'alias': alias, 'saved_locally': True}

    def _receipt(self, packet_id, reason, generation):
        with self._lock:
            if generation != self._generation or type(packet_id) is not int:
                return
            if not isinstance(reason, str):
                return
            status = 'ROUTING_ACK_REPORTED_NOT_READ' if reason == 'NONE' else 'ROUTING_ERROR_REPORTED'
            found = False
            for message in reversed(self._messages):
                if message.get('packet_id') == packet_id and message['direction'] == 'OUT':
                    message['delivery'] = status
                    message['routing_reason'] = reason[:60]
                    found = True
                    break
            if not found:
                self._early_receipts[packet_id] = (status, reason[:60])
                if len(self._early_receipts)>100:
                    self._early_receipts.pop(next(iter(self._early_receipts)))
            if self._history_enabled and self._history_path is not None:
                with self._db() as db:
                    db.execute("UPDATE mesh_message_history SET delivery=? WHERE id=(SELECT id FROM mesh_message_history WHERE packet_id=? AND direction='OUT' ORDER BY id DESC LIMIT 1)", (status,packet_id))

    def set_history(self, payload):
        if not isinstance(payload, dict) or set(payload) != {'enabled'} or type(payload['enabled']) is not bool:
            raise MeshError('History setting requires one boolean enabled field.', 'invalid_history_setting', 400)
        with self._lock:
            if self._history_path is None:
                raise MeshError('Local history is unavailable.', 'history_unavailable', 503)
            # Disabling local history deletes the old stored bodies, not merely the preference.
            with self._db() as db:
                db.execute("INSERT OR REPLACE INTO mesh_preferences(key,value) VALUES('save_history',?)",
                           ('1' if payload['enabled'] else '0',))
                if not payload['enabled']:
                    db.execute('DELETE FROM mesh_message_history')
            self._history_enabled = payload['enabled']
        return {'history_enabled': self._history_enabled, 'storage': 'LOCAL_SQLITE_OPT_IN' if self._history_enabled else 'MEMORY_ONLY'}

    def clear_history(self):
        with self._lock:
            self._messages.clear()
            if self._history_path is not None:
                with self._db() as db:
                    db.execute('DELETE FROM mesh_message_history')
        return {'cleared': True, 'retained_messages': 0}

    def _append(self, message):
        self._messages.append(message)
        if self._history_enabled and self._history_path is not None:
            try:
                with self._db() as db:
                    db.execute("""INSERT INTO mesh_message_history
                        (direction,node,channel,body,utc,source,delivery,packet_id)
                        VALUES(?,?,?,?,?,?,?,?)""",
                        (message['direction'], message['node'], message['channel'], message['text'],
                         message['received_at_utc'], message['source'], message['delivery'],
                         message.get('packet_id')))
                    db.execute("""DELETE FROM mesh_message_history WHERE id NOT IN
                        (SELECT id FROM mesh_message_history ORDER BY id DESC LIMIT 1000)""")
            except (sqlite3.Error, OSError):
                # The radio may already have accepted the outgoing packet. Never
                # surface a history-write failure as a send failure/retry prompt.
                self._last_error = 'Local mesh history could not be saved. Message remains in session memory.'

    def _available_ports(self):
        # The read-only hardware inventory returns ttyUSB0/ttyACM0 basenames.
        ports = []
        for name in self._ports():
            if not isinstance(name, str):
                continue
            full = name if name.startswith('/dev/') else '/dev/' + name
            if SERIAL_PORT.fullmatch(full) and full not in ports:
                ports.append(full)
        return ports[:32]

    def status(self):
        with self._lock:
            state, mode, port, error, count = (self._state, self._mode, self._port,
                                               self._last_error, len(self._messages))
        try:
            ports = self._available_ports()
        except (OSError, ValueError):
            ports = []
        try:
            sdk = bool(self._sdk_available())
        except (ImportError, ValueError, ModuleNotFoundError):
            sdk = False
        port_checks = []
        for device in ports:
            # Read-only Unix device metadata; no port open or USB probe.
            try:
                info = os.stat(device)
                if not stat.S_ISCHR(info.st_mode):
                    access = 'NOT_CHARACTER_DEVICE'
                elif not os.access(device, os.R_OK | os.W_OK):
                    access = 'PERMISSION_BLOCKED'
                else:
                    access = 'READ_WRITE_AVAILABLE'
            except (FileNotFoundError, PermissionError, OSError):
                access = 'NOT_ACCESSIBLE_IN_LINUX'
            port_checks.append({'port': device, 'access': access})
        return {'state': state, 'connected': state == 'CONNECTED', 'mode': mode,
                'port': port, 'available_serial_ports': ports, 'sdk_available': sdk,
                'message_count': count, 'last_error': error,
                'device_role_modified': False, 'rebroadcast_owner': 'MESHTASTIC_FIRMWARE',
                'relay_verified': False, 'message_storage': 'LOCAL_SQLITE_OPT_IN' if self._history_enabled else 'MEMORY_ONLY',
                'history_enabled': self._history_enabled, 'history_available': self._history_path is not None,
                'transmit_requires_operator_action': True,
                'diagnostics': {'sdk': 'AVAILABLE' if sdk else 'MISSING',
                    'usb_ports': port_checks, 'selected_port': port,
                    'link': 'OPEN' if state == 'CONNECTED' else 'CLOSED',
                    'rf_reachability': 'NOT_TESTED', 'firmware_version': None,
                    'note': 'Read-only local OS checks; a USB link does not establish LoRa range or firmware health.'}}

    def messages(self):
        with self._lock:
            if self._history_enabled and self._history_path is not None:
                with self._db() as db:
                    rows = db.execute("""SELECT direction,node,channel,body,utc,source,delivery,packet_id
                        FROM mesh_message_history ORDER BY id DESC LIMIT 1000""").fetchall()
                messages = [dict(direction=r[0], node=r[1], channel=r[2], text=r[3],
                                 received_at_utc=r[4], source=r[5], delivery=r[6], packet_id=r[7])
                            for r in reversed(rows)]
                return {'messages': messages, 'storage': 'LOCAL_SQLITE_OPT_IN', 'retained_limit': 1000,
                        'receive_sequence': self._receive_sequence}
            return {'messages': list(self._messages), 'storage': 'MEMORY_ONLY', 'retained_limit': 100,
                    'receive_sequence': self._receive_sequence}

    def _receive(self, packet, generation):
        if not isinstance(packet, dict):
            return
        decoded = packet.get('decoded')
        if not isinstance(decoded, dict):
            return
        text = decoded.get('text')
        if not isinstance(text, str) or not text:
            return
        try:
            if len(text.encode('utf-8')) > 1024:
                return
        except UnicodeEncodeError:
            return
        sender = packet.get('fromId', '')
        if not isinstance(sender, str) or not NODE_ID.fullmatch(sender):
            sender = 'unknown node'
        channel = packet.get('channel', 0)
        if type(channel) is not int or not 0 <= channel <= 7:
            channel = None
        with self._lock:
            if generation != self._generation or self._state != 'CONNECTED':
                return
            self._receive_sequence += 1
            self._append({'direction': 'IN', 'text': text, 'node': sender,
                                   'channel': channel, 'received_at_utc': _utc_now(),
                                   'source': 'MESHTASTIC_RADIO',
                                   'delivery': 'RECEIVED_FROM_RADIO_UNVERIFIED'})

    def connect(self, settings):
        if not isinstance(settings, dict) or set(settings) != {'port'}:
            raise MeshError('Select one local serial port.', 'invalid_mesh_port', 400)
        port = validate_port(settings['port'])
        try:
            available = self._available_ports()
        except (OSError, ValueError):
            available = []
        if port not in available:
            raise MeshError('Selected serial port is not visible to this Linux system. '
                            'Check USB passthrough and reload the port list.',
                            'mesh_port_unavailable', 404)
        with self._lock:
            if self._closed:
                raise MeshError('Mesh service is shutting down.')
            if self._state != 'DISCONNECTED':
                raise MeshError('Disconnect the current node before opening another.', 'mesh_busy')
            self._state = 'CONNECTING'
            self._generation += 1
            generation = self._generation
            self._last_error = None
        try:
            bridge = self._factory(port, lambda packet: self._receive(packet, generation))
        except Exception as exc:
            message = str(exc) if isinstance(exc, MeshError) else 'Selected mesh USB connection failed.'
            with self._lock:
                if generation == self._generation:
                    self._state = 'DISCONNECTED'; self._last_error = message
            if isinstance(exc, MeshError):
                raise
            raise MeshError(message, 'mesh_connect_failed', 503) from exc
        with self._lock:
            if self._closed or generation != self._generation:
                bridge.close()
                raise MeshError('Mesh connection was cancelled.', 'mesh_disconnected')
            self._bridge = bridge
            self._port = port
            self._state = 'CONNECTED'
            return {'connected': True, 'port': port, 'mode': self._mode,
                    'delivery': 'HARDWARE_LINK_ESTABLISHED_NOT_RF_VERIFIED'}

    def set_mode(self, payload):
        if not isinstance(payload, dict) or set(payload) != {'mode'} or payload['mode'] not in ('normal', 'relay_only'):
            raise MeshError('Choose normal or relay_only only.', 'invalid_mesh_mode', 400)
        with self._lock:
            self._mode = payload['mode']
            return {'mode': self._mode, 'device_role_modified': False,
                    'note': 'Radio firmware role is unchanged. CLIENT nodes already use automatic rebroadcasting.'}

    def send(self, payload):
        message = validate_send(payload)
        with self._lock:
            if self._mode == 'relay_only':
                raise MeshError('Relay-only mode disables sending from OpenRF. Switch to Normal to compose.',
                                'mesh_relay_only', 409)
            if self._state != 'CONNECTED' or self._bridge is None:
                raise MeshError('Connect a real Meshtastic USB node before sending.',
                                'mesh_disconnected', 409)
            try:
                if hasattr(self._bridge, 'send_with_receipt'):
                    generation = self._generation
                    packet_id = self._bridge.send_with_receipt(message['text'], message['destination'],
                        message['channel'], lambda pid, reason: self._receipt(pid, reason, generation))
                else:
                    packet_id = self._bridge.send(message['text'], message['destination'], message['channel'])
            except Exception as exc:
                raise MeshError('The attached radio did not accept this message. '
                                'Check the USB connection; do not assume delivery.',
                                'mesh_send_failed', 503) from exc
            self._append({'direction': 'OUT', 'text': message['text'],
                                   'node': message['destination'], 'channel': message['channel'],
                                   'received_at_utc': _utc_now(), 'source': 'LOCAL_OPERATOR',
                                   'delivery': 'SUBMITTED_TO_RADIO_NOT_DELIVERED',
                                   'packet_id': packet_id if type(packet_id) is int else None})
            if type(packet_id) is int and packet_id in self._early_receipts:
                status, reason = self._early_receipts.pop(packet_id)
                self._receipt(packet_id, reason if status=='ROUTING_ACK_REPORTED_NOT_READ' else reason,
                              self._generation)
            return {'submitted_to_radio': True, 'delivered_to_destination': False,
                    'packet_id': packet_id if type(packet_id) is int else None}

    def disconnect(self):
        with self._lock:
            bridge = self._bridge
            self._bridge = None; self._port = None; self._state = 'DISCONNECTED'
            self._generation += 1
            self._early_receipts.clear()
            self._messages.clear()  # Volatile messages only; saved history is explicit and remains available.
            self._last_error = None
        if bridge is not None:
            try:
                bridge.close()
            except Exception:
                pass
        return {'disconnected': True, 'messages_cleared': True}

    def close(self):
        self.disconnect()
        with self._lock:
            self._closed = True
