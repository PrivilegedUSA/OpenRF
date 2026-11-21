"""Operator-controlled MeshCore USB Companion integration.

No serial ports are opened at import, inventory, or server startup. MeshCore's
optional Python SDK is imported only following an explicit Connect request.
Messages are memory-only, bounded, and never forwarded to another protocol.
"""
from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timezone
import importlib.util
import re
import threading
from concurrent.futures import TimeoutError as FutureTimeout

from .hardware import enumerate_serial_ports


SERIAL_PORT = re.compile(r'/dev/tty(?:USB|ACM)[0-9]{1,3}\Z')
PUBLIC_KEY = re.compile(r'[a-f0-9]{64}\Z')
ACK_CODE = re.compile(r'[a-f0-9]{8}\Z')
MAX_TEXT_BYTES = 120  # Deliberately conservative: actual LoRa frame budget varies.


def _utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class MeshCoreError(Exception):
    def __init__(self, message, code='meshcore_unavailable', status=409):
        super().__init__(message)
        self.code = code
        self.status = status


def _hex(value):
    if isinstance(value, (bytes, bytearray)):
        return value.hex().lower()
    return value.strip().lower() if isinstance(value, str) else ''


def _contact_rows(payload):
    """Accept only real, complete radio contact keys; do not guess identities."""
    if not isinstance(payload, dict):
        return {}
    contacts = {}
    for key, contact in list(payload.items())[:512]:
        if not isinstance(contact, dict):
            continue
        public_key = _hex(contact.get('public_key') or key)
        if not PUBLIC_KEY.fullmatch(public_key):
            continue
        name = contact.get('adv_name', '')
        if not isinstance(name, str):
            name = ''
        name = name.encode('utf-8', 'replace').decode('utf-8')
        contacts[public_key] = {'public_key': public_key, 'name': name[:80],
                                'type': str(contact.get('type', 'unknown'))[:30]}
    return contacts


class MeshCoreSerialBridge:
    """Keep the SDK's asyncio client on its own event-loop thread."""

    def __init__(self, port, on_message, on_ack, on_link):
        try:
            from meshcore import MeshCore, EventType
        except ImportError as exc:
            raise MeshCoreError('MeshCore Python support is missing in this Linux interpreter. '
                                'Install the optional meshcore package.', 'meshcore_sdk_missing', 503) from exc
        self._sdk = MeshCore
        self._events = EventType
        self._on_message = on_message
        self._on_ack = on_ack
        self._on_link = on_link
        self._client = None
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, name='openrf-meshcore', daemon=True)
        self._thread.start()
        try:
            self.initial = self._call(self._open(port), timeout=18)
        except Exception:
            self.close()
            raise

    def _run(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()
        pending = asyncio.all_tasks(self._loop)
        for task in pending:
            task.cancel()
        if pending:
            self._loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        self._loop.close()

    def _call(self, coroutine, timeout=12):
        try:
            return asyncio.run_coroutine_threadsafe(coroutine, self._loop).result(timeout)
        except FutureTimeout as exc:
            raise MeshCoreError('MeshCore radio did not answer in time. Check firmware, USB '
                                'passthrough and cable; delivery is unknown.',
                                'meshcore_timeout', 503) from exc

    @staticmethod
    def _successful(result, expected, operation):
        if result is None or result.type != expected:
            raise MeshCoreError(f'MeshCore radio did not confirm {operation}.',
                                'meshcore_radio_error', 503)
        return result.payload

    async def _open(self, port):
        # No RF advertisement, repeater activation, channel or power changes.
        self._client = await self._sdk.create_serial(port)

        async def on_msg(event):
            self._on_message(event.payload)

        async def on_ack(event):
            self._on_ack(event.payload)

        async def on_disconnected(event):
            self._on_link('DISCONNECTED')

        self._client.subscribe(self._events.CONTACT_MSG_RECV, on_msg)
        self._client.subscribe(self._events.ACK, on_ack)
        if hasattr(self._events, 'DISCONNECTED'):
            self._client.subscribe(self._events.DISCONNECTED, on_disconnected)
        # Fetches radio-local pending messages; never advertises the node.
        await self._client.start_auto_message_fetching()
        return await self._contacts()

    async def _contacts(self):
        response = await self._client.commands.get_contacts()
        contacts = _contact_rows(self._successful(response, self._events.CONTACTS,
                                                 'contact-list retrieval'))
        info = {}
        try:
            response = await self._client.commands.send_device_query()
            if response.type == self._events.DEVICE_INFO and isinstance(response.payload, dict):
                for key in ('model', 'version', 'firmware_version'):
                    if isinstance(response.payload.get(key), (str, int, float)):
                        info[key] = str(response.payload[key])[:80]
        except Exception:
            # Older firmware may not support device-query; contacts still work.
            pass
        return {'contacts': contacts, 'device': info}

    def refresh(self):
        return self._call(self._contacts(), timeout=18)

    async def _send(self, destination, text):
        result = await self._client.commands.send_msg(destination, text)
        payload = self._successful(result, self._events.MSG_SENT, 'message submission')
        return _hex(payload.get('expected_ack')) if isinstance(payload, dict) else ''

    def send(self, destination, text):
        return self._call(self._send(destination, text), timeout=18)

    async def _shutdown(self):
        if self._client is None:
            return
        try:
            await self._client.stop_auto_message_fetching()
        finally:
            await self._client.disconnect()
            self._client = None

    def close(self):
        if not self._loop.is_closed():
            try:
                if self._thread.is_alive():
                    self._call(self._shutdown(), timeout=6)
            except Exception:
                pass
            if self._loop.is_running():
                self._loop.call_soon_threadsafe(self._loop.stop)
        if threading.current_thread() is not self._thread:
            self._thread.join(timeout=7)


class MeshCoreManager:
    def __init__(self, bridge_factory=None, port_provider=None, sdk_available=None):
        self._factory = bridge_factory or MeshCoreSerialBridge
        self._ports = port_provider or enumerate_serial_ports
        self._sdk_available = sdk_available or (lambda: importlib.util.find_spec('meshcore') is not None)
        self._lock = threading.RLock()
        self._operation_lock = threading.Lock()
        self._bridge = None
        self._state = 'DISCONNECTED'
        self._port = None
        self._error = None
        self._contacts = {}
        self._device = {}
        self._messages = deque(maxlen=200)
        self._next_id = 0
        self._receive_sequence = 0
        self._generation = 0
        self._expected_ack = {}
        self._early_acks = deque(maxlen=20)
        self._startup_messages = deque(maxlen=100)
        self._closed = False

    def _available_ports(self):
        ports = []
        for name in self._ports():
            full = name if isinstance(name, str) and name.startswith('/dev/') else '/dev/' + str(name)
            if SERIAL_PORT.fullmatch(full) and full not in ports:
                ports.append(full)
        return ports[:32]

    def status(self):
        try:
            ports = self._available_ports()
        except (OSError, ValueError):
            ports = []
        try:
            sdk = bool(self._sdk_available())
        except (ImportError, ValueError, ModuleNotFoundError):
            sdk = False
        with self._lock:
            return {'state': self._state, 'connected': self._state == 'CONNECTED',
                    'port': self._port, 'available_serial_ports': ports,
                    'ports_are_candidates_only': True, 'sdk_available': sdk,
                    'last_error': self._error, 'device': dict(self._device),
                    'contact_count': len(self._contacts),
                    'storage': 'MEMORY_ONLY', 'transmit_requires_operator_action': True,
                    'network_reachability': 'NOT_VERIFIED',
                    'note': 'A visible USB port does not identify MeshCore firmware or verify a LoRa link.'}

    def contacts(self):
        with self._lock:
            return {'contacts': sorted((dict(v) for v in self._contacts.values()),
                                       key=lambda c: (c['name'].lower(), c['public_key'])),
                    'source': 'RADIO_CONTACT_LIST' if self._state == 'CONNECTED' else 'NO_RADIO'}

    def messages(self):
        with self._lock:
            return {'messages': sorted((dict(m) for m in self._messages),
                                       key=lambda m: (m['received_at_utc'], m['id'])),
                    'receive_sequence': self._receive_sequence,
                    'storage': 'MEMORY_ONLY', 'retained_limit': 200}

    def _append(self, direction, text, key, delivery, **extra):
        if len(self._messages) == self._messages.maxlen:
            oldest = self._messages[0]['id']
            for code, row_id in list(self._expected_ack.items()):
                if row_id == oldest:
                    self._expected_ack.pop(code, None)
        self._next_id += 1
        row = {'id': self._next_id, 'direction': direction, 'text': text,
               'public_key': key, 'received_at_utc': _utc_now(),
               'delivery': delivery, 'source': 'MESHCORE_COMPANION' if direction == 'IN' else 'LOCAL_OPERATOR'}
        row.update(extra)
        self._messages.append(row)
        return row

    def _on_message(self, payload, generation):
        if not isinstance(payload, dict):
            return
        text, prefix = payload.get('text'), _hex(payload.get('pubkey_prefix'))
        if not isinstance(text, str) or not text:
            return
        try:
            length = len(text.encode('utf-8'))
        except UnicodeEncodeError:
            return
        if length > 2048:
            return
        if not prefix or not re.fullmatch(r'[a-f0-9]{2,64}', prefix):
            prefix = ''
        with self._lock:
            if generation != self._generation or self._state not in ('CONNECTED', 'CONNECTING'):
                return
            if self._state == 'CONNECTING':
                self._startup_messages.append(dict(payload))
                return
            matches = [key for key in self._contacts if prefix and key.startswith(prefix)]
            key = matches[0] if len(matches) == 1 else ''
            self._append('IN', text, key, 'RECEIVED_FROM_RADIO',
                         sender_prefix=prefix, matched_radio_contact=bool(key),
                         sender_identity_verified=False)
            self._receive_sequence += 1

    def _on_ack(self, payload, generation):
        code = _hex(payload.get('code')) if isinstance(payload, dict) else ''
        if not ACK_CODE.fullmatch(code):
            return
        with self._lock:
            if generation != self._generation or self._state != 'CONNECTED':
                return
            row_id = self._expected_ack.pop(code, None)
            if row_id is None:
                self._early_acks.append(code)
                return
            for message in self._messages:
                if message['id'] == row_id and message['direction'] == 'OUT':
                    message['delivery'] = 'NETWORK_ACK_REPORTED_NOT_READ'
                    message['acknowledged_at_utc'] = _utc_now()
                    break

    def _on_link(self, state, generation):
        if state != 'DISCONNECTED':
            return
        with self._lock:
            if generation == self._generation and self._state == 'CONNECTED':
                self._state = 'LINK_LOST'
                self._error = 'MeshCore USB link disconnected; messages still awaiting ACK remain unconfirmed.'
                self._expected_ack.clear()

    def connect(self, body):
        if not isinstance(body, dict) or set(body) != {'port'} or not isinstance(body['port'], str) or not SERIAL_PORT.fullmatch(body['port']):
            raise MeshCoreError('Select one /dev/ttyUSB# or /dev/ttyACM# serial port.', 'meshcore_bad_port', 400)
        port = body['port']
        if port not in self._available_ports():
            raise MeshCoreError('Selected port is not visible in Linux; refresh USB inventory.', 'meshcore_port_missing', 404)
        with self._lock:
            if self._closed or self._state != 'DISCONNECTED':
                raise MeshCoreError('Disconnect the existing MeshCore session first.', 'meshcore_busy')
            self._generation += 1
            generation = self._generation
            self._state = 'CONNECTING'
            self._port = port
            self._error = None
            self._startup_messages.clear()
        try:
            bridge = self._factory(port,
                lambda msg: self._on_message(msg, generation),
                lambda ack: self._on_ack(ack, generation),
                lambda state: self._on_link(state, generation))
        except Exception as exc:
            message = str(exc) if isinstance(exc, MeshCoreError) else (
                'Could not open a MeshCore Companion on this USB port. Check firmware, serial permissions and USB passthrough.')
            with self._lock:
                if generation == self._generation:
                    self._port = None
                    self._state = 'DISCONNECTED'
                    self._error = message
            if isinstance(exc, MeshCoreError):
                raise
            raise MeshCoreError(message, 'meshcore_connect_failed', 503) from exc
        with self._lock:
            if generation != self._generation or self._closed:
                bridge.close()
                raise MeshCoreError('MeshCore connect was cancelled.', 'meshcore_cancelled')
            self._bridge = bridge
            self._contacts = bridge.initial['contacts']
            self._device = bridge.initial['device']
            self._state = 'CONNECTED'
            while self._startup_messages:
                self._on_message(self._startup_messages.popleft(), generation)
            return {'connected': True, 'port': port, 'contact_count': len(self._contacts),
                    'radio_link_only': True, 'network_reachability': 'NOT_VERIFIED'}

    def refresh(self, body):
        if body != {}:
            raise MeshCoreError('Refresh accepts an empty object.', 'meshcore_bad_request', 400)
        with self._operation_lock:
            with self._lock:
                if self._state != 'CONNECTED' or self._bridge is None:
                    raise MeshCoreError('Connect a MeshCore Companion to refresh its contacts.', 'meshcore_disconnected')
                bridge, generation = self._bridge, self._generation
            try:
                result = bridge.refresh()
            except Exception as exc:
                raise MeshCoreError('Could not refresh contacts from MeshCore radio.', 'meshcore_refresh_failed', 503) from exc
            with self._lock:
                if generation != self._generation or self._state != 'CONNECTED':
                    raise MeshCoreError('The MeshCore connection changed during refresh.', 'meshcore_disconnected')
                self._contacts = result['contacts']
                self._device = result['device']
                return {'refreshed': True, 'contact_count': len(self._contacts)}

    def send(self, body):
        if not isinstance(body, dict) or set(body) != {'destination', 'text'}:
            raise MeshCoreError('Select a contact and provide text only.', 'meshcore_bad_message', 400)
        destination, text = _hex(body['destination']), body['text']
        if not PUBLIC_KEY.fullmatch(destination):
            raise MeshCoreError('Choose a full public key from radio contacts.', 'meshcore_bad_message', 400)
        if not isinstance(text, str) or not text.strip():
            raise MeshCoreError('Message must contain 1–120 UTF-8 bytes.', 'meshcore_bad_message', 400)
        try:
            size = len(text.encode('utf-8'))
        except UnicodeEncodeError as exc:
            raise MeshCoreError('Message contains invalid Unicode.', 'meshcore_bad_message', 400) from exc
        if size > MAX_TEXT_BYTES or any(ord(c) < 32 and c not in '\n\t' for c in text):
            raise MeshCoreError('Message must contain 1–120 UTF-8 bytes without control characters.', 'meshcore_bad_message', 400)
        with self._operation_lock:
            with self._lock:
                if self._state != 'CONNECTED' or self._bridge is None:
                    raise MeshCoreError('Connect a MeshCore Companion before sending.', 'meshcore_disconnected')
                if destination not in self._contacts:
                    raise MeshCoreError('Recipient is not in the selected radio contact list. Refresh contacts.', 'meshcore_contact_missing', 400)
                bridge, generation = self._bridge, self._generation
            # Never hold the manager lock across SDK calls: event callbacks run
            # on the SDK loop and need that lock to record ACKs/received texts.
            try:
                expected = bridge.send(destination, text)
            except Exception as exc:
                raise MeshCoreError('Radio did not confirm message submission; delivery is unknown. '
                                    'Check device before retrying.', 'meshcore_send_failed', 503) from exc
            with self._lock:
                if generation != self._generation or self._state != 'CONNECTED':
                    raise MeshCoreError('USB connection changed during send; delivery is unknown.',
                                        'meshcore_send_unconfirmed', 503)
                if not ACK_CODE.fullmatch(expected):
                    # The SDK command may have transmitted; don't encourage retries.
                    raise MeshCoreError('Radio response lacked a valid expected ACK. Check the radio before retrying.',
                                        'meshcore_send_unconfirmed', 503)
                row = self._append('OUT', text, destination, 'SUBMITTED_TO_RADIO_NOT_ACKNOWLEDGED',
                                   expected_ack=expected)
                self._expected_ack[expected] = row['id']
                if expected in self._early_acks:
                    self._early_acks.remove(expected)
                    self._on_ack({'code': expected}, generation)
                return {'submitted_to_radio': True,
                        'network_acknowledged': row['delivery'] == 'NETWORK_ACK_REPORTED_NOT_READ',
                        'message_id': row['id'], 'delivery': row['delivery']}

    def disconnect(self):
        with self._operation_lock:
            with self._lock:
                bridge = self._bridge
                self._bridge = None
                self._generation += 1
                self._state = 'DISCONNECTED'
                self._port = None
                self._contacts = {}
                self._device = {}
                self._expected_ack.clear()
                self._early_acks.clear()
                self._startup_messages.clear()
                self._error = None
            if bridge is not None:
                bridge.close()
        return {'disconnected': True, 'messages_retained_in_memory': True}

    def close(self):
        self.disconnect()
        with self._lock:
            self._closed = True
