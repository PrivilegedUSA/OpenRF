"""Opt-in Reticulum/LXMF LAN transport, isolated from OpenRF's HTTP server.

Only pressing Enable starts this module's child process. No RNS import,
LAN socket, peer discovery or message storage is initialized at server start.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import importlib.util
import multiprocessing
import os
from pathlib import Path
import re
import secrets
import threading

from .reticulum_history import ReticulumLocalStore


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


class ReticulumError(Exception):
    def __init__(self, message, code='reticulum_unavailable', status=409):
        super().__init__(message)
        self.code, self.status = code, status


def validate_message(body):
    if not isinstance(body, dict) or set(body) != {'destination', 'text'}:
        raise ReticulumError('Provide destination and text only.', 'invalid_lxmf_message', 400)
    destination, text = body['destination'], body['text']
    if not isinstance(destination, str) or not DESTINATION.fullmatch(destination):
        raise ReticulumError('LXMF address must be exactly 32 hexadecimal characters.',
                             'invalid_lxmf_destination', 400)
    if not isinstance(text, str) or not text.strip() or any(ord(c)<32 and c not in '\n\t' for c in text):
        raise ReticulumError('Enter readable message text.', 'invalid_lxmf_message', 400)
    try:
        size = len(text.encode('utf-8'))
    except UnicodeEncodeError as exc:
        raise ReticulumError('Invalid Unicode text.', 'invalid_lxmf_message', 400) from exc
    if size > MESSAGE_BYTES:
        raise ReticulumError('Limit LXMF text to 1024 UTF-8 bytes for this first release.',
                             'invalid_lxmf_message', 400)
    return {'destination': destination.lower(), 'text': text}


def validate_start(body):
    """Keep LAN exposure explicit; no arbitrary listener addresses or ports."""
    if not isinstance(body, dict) or not set(body).issubset({'tcp_enabled'}):
        raise ReticulumError('Enable accepts only the optional tcp_enabled flag.',
                             'invalid_reticulum_command', 400)
    enabled = body.get('tcp_enabled', False)
    if type(enabled) is not bool:
        raise ReticulumError('tcp_enabled must be true or false.',
                             'invalid_reticulum_command', 400)
    return {'tcp_enabled': enabled}


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


def runtime_config(root, tcp_enabled=False):
    """Preserve operator-edited RNS config; derive a separate TCP-only runtime copy."""
    root = Path(root)
    original = private_config(root)
    if not tcp_enabled:
        return original
    runtime = root / 'rns-tcp-runtime'
    runtime.mkdir(mode=0o700, parents=True, exist_ok=True)
    runtime.chmod(0o700)
    source = (original / 'config').read_text(encoding='utf-8')
    if '[[OpenRF Optional TCP Listener]]' in source:
        raise RuntimeError('Operator config already defines the managed TCP listener.')
    # Insert while still inside [interfaces], even if the operator has placed
    # other top-level sections after it. Never rewrite their original config.
    lines = source.splitlines(keepends=True)
    interfaces_at = next((i for i, line in enumerate(lines)
                          if line.strip() == '[interfaces]'), None)
    if interfaces_at is None:
        raise RuntimeError('Operator config has no [interfaces] section for the TCP listener.')
    after_interfaces = next((i for i in range(interfaces_at + 1, len(lines))
                             if re.fullmatch(r'\[[^\[\]]+\]\s*', lines[i].strip())), len(lines))
    generated = ''.join(lines[:after_interfaces]).rstrip() + '\n' + TCP_SECTION + '\n' + ''.join(lines[after_interfaces:])
    # This is only OpenRF's generated runtime config, never the operator file.
    temporary = runtime / 'config.new'
    fd = os.open(temporary, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        output.write(generated)
    os.replace(temporary, runtime / 'config')
    (runtime / 'config').chmod(0o600)
    return runtime


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


def reticulum_worker(pipe, data_root, options=None):
    """Child-process LXMF endpoint. Never imported or started automatically."""
    try:
        import RNS
        import LXMF
        data_root = Path(data_root)
        tcp_enabled = bool((options or {}).get('tcp_enabled', False))
        config_dir = runtime_config(data_root, tcp_enabled=tcp_enabled)
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
        inbox = deque(maxlen=100)
        inbox_lock = threading.Lock()
        received_count = 0
        event_sequence = 0

        def append_inbox(record, *, incoming=False):
            nonlocal received_count, event_sequence
            with inbox_lock:
                event_sequence += 1
                if incoming:
                    received_count += 1
                inbox.append({**record, 'event_id': event_sequence})

        def receive(message):
            if getattr(message, 'signature_validated', False) is not True:
                return
            try:
                content = message.content_as_string()
                address = message.source.hash.hex()
                if not isinstance(content, str) or len(content.encode('utf-8'))>MESSAGE_BYTES:
                    return
                append_inbox({'direction':'IN', 'destination':address,
                              'text':content, 'utc':_utc(), 'status':'RECEIVED_VALID_SIGNATURE'},incoming=True)
            except (AttributeError, UnicodeError, ValueError):
                return

        router.register_delivery_callback(receive)
        router.announce(source.hash)  # Only after user-initiated Enable.
        last_announce_requested_at = _utc()
        announce_requests = 1
        pipe.send({'ok':True, 'address': source.hash.hex()})
        while True:
            if not pipe.poll(0.5):
                continue
            command = pipe.recv()
            action = command.get('action') if isinstance(command, dict) else None
            if action == 'stop':
                pipe.send({'ok':True, 'stopped':True})
                break
            if action == 'announce':
                router.announce(source.hash)
                last_announce_requested_at = _utc()
                announce_requests += 1
                pipe.send({'ok':True, 'announced':True, 'delivery_verified':False})
            elif action == 'diagnostics':
                report = interface_diagnostics(rns_instance)
                report.update({'ok':True,
                               'tcp_requested':tcp_enabled,
                               'tcp_port': TCP_PORT if tcp_enabled else None,
                               'announce_requests':announce_requests,
                               'last_announce_requested_at_utc':last_announce_requested_at,
                               'announcement_received_by_peer':None})
                pipe.send(report)
            elif action == 'messages':
                with inbox_lock:
                    snapshot, sequence = list(inbox), received_count
                pipe.send({'ok':True, 'messages':snapshot, 'receive_sequence':sequence,
                           'storage':'WORKER_MEMORY_AND_PRIVATE_LXMF_RUNTIME'})
            elif action == 'clear_messages':
                with inbox_lock:
                    inbox.clear()
                pipe.send({'ok':True, 'cleared':True})
            elif action == 'send':
                payload = validate_message(command.get('message'))
                target = bytes.fromhex(payload['destination'])
                if not RNS.Transport.has_path(target):
                    RNS.Transport.request_path(target)
                    pipe.send({'ok':True, 'status':'PATH_REQUESTED_NOT_SENT',
                               'note':'Try sending again when a route to the destination exists.'})
                    continue
                recipient = RNS.Identity.recall(target)
                if recipient is None:
                    pipe.send({'ok':True, 'status':'NO_RECALLED_IDENTITY_NOT_SENT'})
                    continue
                destination = RNS.Destination(recipient, RNS.Destination.OUT,
                    RNS.Destination.SINGLE, 'lxmf', 'delivery')
                message = LXMF.LXMessage(destination, source, payload['text'], None,
                    desired_method=LXMF.LXMessage.DIRECT, include_ticket=True)
                router.handle_outbound(message)
                append_inbox({'direction':'OUT', 'destination':payload['destination'],
                              'text':payload['text'], 'utc':_utc(),
                              'status':'QUEUED_WITH_LXMF_NOT_DELIVERED'})
                pipe.send({'ok':True, 'status':'QUEUED_WITH_LXMF_NOT_DELIVERED'})
            else:
                pipe.send({'ok':False, 'error':'Unrecognized local Reticulum command.'})
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
        self._worker_id = None
        self._store = ReticulumLocalStore(self.data_root)

    def _running(self):
        return self._process is not None and self._process.is_alive()

    def status(self):
        with self._lock:
            available = bool(self._deps())
            running = self._running()
            return {'enabled':running, 'dependencies_available':available,
                    'address':self._address if running else None,
                    'last_error':self._error,
                    'transport':'RETICULUM_AUTOINTERFACE_WITH_OPTIONAL_TCP',
                    'tcp_enabled':self._tcp_enabled if running else False,
                    'tcp_port':TCP_PORT if running and self._tcp_enabled else None,
                    'delivery':'UNVERIFIED_UNTIL_LXMF_RECEIPT',
                    'network_activity_requires_operator_action':True,
                    'note':'Network activity only starts after Enable. TCP listens on all network adapters only when explicitly selected; peer reception and delivery remain unverified.'}

    def start(self, payload):
        options = validate_start(payload)
        with self._lock:
            if self._running():
                raise ReticulumError('Reticulum LAN is already enabled.', 'reticulum_busy')
            if not self._deps():
                raise ReticulumError('Install optional rns and lxmf packages in Linux before enabling.',
                                     'reticulum_dependencies_missing', 503)
            ctx = multiprocessing.get_context('spawn')
            parent, child = ctx.Pipe()
            process = (self._factory or ctx.Process)(
                target=reticulum_worker, args=(child,str(self.data_root),options), daemon=True)
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
            self._error = None
            return self.status()

    def _command(self, action, message=None):
        with self._lock:
            if not self._running() or self._pipe is None:
                raise ReticulumError('Enable Reticulum LAN before this action.', 'reticulum_disconnected')
            try:
                self._pipe.send({'action':action, 'message':message})
                if not self._pipe.poll(8):
                    raise ReticulumError('Reticulum worker response timed out.',
                                         'reticulum_response_timeout', 503)
                result = self._pipe.recv()
            except (BrokenPipeError, EOFError, OSError) as exc:
                raise ReticulumError('Reticulum worker disconnected.',
                                     'reticulum_disconnected', 503) from exc
            if not result.get('ok'):
                raise ReticulumError(result.get('error','Reticulum request failed.'),
                                     'reticulum_worker_failed', 503)
            return result

    def _sync_messages(self, result):
        if self._worker_id and self._store.history_enabled():
            self._store.save_events(self._worker_id, result.get('messages', []))

    def messages(self):
        with self._lock:
            if self._running():
                result = self._command('messages')
                self._sync_messages(result)
            else:
                result = {'messages':[], 'receive_sequence':0, 'storage':'INACTIVE'}
            if self._store.history_enabled():
                return {'messages':self._store.messages(),
                        'receive_sequence':result['receive_sequence'],
                        'storage':'PRIVATE_LOCAL_SQLITE_OPT_IN','history_enabled':True}
            return {**result, 'history_enabled':False}

    def contacts(self):
        with self._lock:
            return {'contacts':self._store.contacts(), 'storage':'PRIVATE_LOCAL_SQLITE'}

    def save_contact(self, payload):
        if not isinstance(payload,dict) or set(payload)!={'destination','alias'}:
            raise ReticulumError('Provide exactly a destination and nickname.', 'invalid_reticulum_contact',400)
        try:
            with self._lock:
                return {'contact':self._store.save_contact(payload['destination'],payload['alias'])}
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
        return self._command('send',message)

    def announce(self, payload):
        if payload != {}:
            raise ReticulumError('Announce requires an empty object.', 'invalid_reticulum_command', 400)
        return self._command('announce')

    def _terminate(self):
        process, pipe = self._process, self._pipe
        self._process, self._pipe, self._address = None, None, None
        self._worker_id = None
        self._tcp_enabled = False
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
                    self._pipe.send({'action':'stop'})
                    if self._pipe.poll(2):
                        self._pipe.recv()
                except (OSError, EOFError, BrokenPipeError):
                    pass
            self._terminate()
            return {'enabled':False,'worker_stopped':True}

    def close(self):
        self.stop()
