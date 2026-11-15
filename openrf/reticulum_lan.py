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
import threading


DESTINATION = re.compile(r'[0-9a-fA-F]{32}\Z')
MESSAGE_BYTES = 1024
LAN_CONFIG = """[reticulum]
  enable_transport = No
  share_instance = No

[interfaces]
  [[OpenRF LAN]]
    type = AutoInterface
    enabled = yes
    group_id = openrf
    discovery_scope = link
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


def _utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def reticulum_worker(pipe, data_root):
    """Child-process LXMF endpoint. Never imported or started automatically."""
    try:
        import RNS
        import LXMF
        data_root = Path(data_root)
        config_dir = private_config(data_root)
        RNS.Reticulum(configdir=str(config_dir), loglevel=1)
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
        received_count = 0

        def receive(message):
            nonlocal received_count
            if getattr(message, 'signature_validated', False) is not True:
                return
            try:
                content = message.content_as_string()
                address = message.source.hash.hex()
                if not isinstance(content, str) or len(content.encode('utf-8'))>MESSAGE_BYTES:
                    return
                inbox.append({'direction':'IN', 'destination':address,
                              'text':content, 'utc':_utc(), 'status':'RECEIVED_VALID_SIGNATURE'})
                received_count += 1
            except (AttributeError, UnicodeError, ValueError):
                return

        router.register_delivery_callback(receive)
        router.announce(source.hash)  # Only after user-initiated Enable.
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
                pipe.send({'ok':True, 'announced':True, 'delivery_verified':False})
            elif action == 'messages':
                pipe.send({'ok':True, 'messages':list(inbox), 'receive_sequence':received_count,
                           'storage':'WORKER_MEMORY_AND_PRIVATE_LXMF_RUNTIME'})
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
                inbox.append({'direction':'OUT', 'destination':payload['destination'],
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

    def _running(self):
        return self._process is not None and self._process.is_alive()

    def status(self):
        with self._lock:
            available = bool(self._deps())
            running = self._running()
            return {'enabled':running, 'dependencies_available':available,
                    'address':self._address if running else None,
                    'last_error':self._error,
                    'transport':'RETICULUM_LAN_AUTOINTERFACE',
                    'delivery':'UNVERIFIED_UNTIL_LXMF_RECEIPT',
                    'network_activity_requires_operator_action':True,
                    'note':'Network sends and announces occur only after Enable; LAN multicast can be visible to nearby hosts.'}

    def start(self, payload):
        if payload != {}:
            raise ReticulumError('Enable requires an empty object.', 'invalid_reticulum_command', 400)
        with self._lock:
            if self._running():
                raise ReticulumError('Reticulum LAN is already enabled.', 'reticulum_busy')
            if not self._deps():
                raise ReticulumError('Install optional rns and lxmf packages in Linux before enabling.',
                                     'reticulum_dependencies_missing', 503)
            ctx = multiprocessing.get_context('spawn')
            parent, child = ctx.Pipe()
            process = (self._factory or ctx.Process)(
                target=reticulum_worker, args=(child,str(self.data_root)), daemon=True)
            process.start()
            child.close()
            self._process, self._pipe = process, parent
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

    def messages(self):
        if not self._running():
            return {'messages':[], 'receive_sequence':0, 'storage':'INACTIVE'}
        return self._command('messages')

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
