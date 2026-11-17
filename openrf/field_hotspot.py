"""Opt-in local Wi-Fi hotspot owned by OpenRF, using Linux NetworkManager.

Requires an idle, OS-AP-capable *ordinary Wi-Fi* adapter and a strong WPA-PSK.
No automatic start; no LAN exposure of the loopback-only OpenRF HTTP API.
Only the exact UUID of an OpenRF-created profile is ever stopped/deleted.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path

from .field_network import readiness_report as field_readiness


_IFACE = re.compile(r'^[A-Za-z0-9_.-]{1,32}$')
_SSID = re.compile(r'^[A-Za-z0-9 _.-]{1,32}$')
_PROFILE = re.compile(r'^OpenRF-Field-[0-9a-f]{8}$')


class HotspotError(ValueError):
    def __init__(self, message: str, code: str = 'hotspot_unavailable', status: int = 409):
        super().__init__(message)
        self.code = code
        self.status = status


class HotspotManager:
    """Own a single opt-in NetworkManager profile and an unprivileged state file.

    The passphrase is NEVER saved by OpenRF or included in status responses.
    NetworkManager itself retains the connection's WPA credentials until
    the explicitly owned profile is removed; a crash may leave it active.
    """

    def __init__(self, state_dir: Path, *, inventory=None, command_lookup=None, runner=None):
        self.state_dir = Path(state_dir)
        self.state_file = self.state_dir / 'field-hotspot.json'
        self.inventory = inventory or field_readiness
        self.lookup = command_lookup or shutil.which
        self.runner = runner or subprocess.run
        self.lock = threading.RLock()

    def _nm(self, *arguments, timeout=10):
        program = self.lookup('nmcli')
        if not program:
            raise HotspotError('Linux NetworkManager (nmcli) is unavailable.', 'network_manager_unavailable')
        try:
            # No shell, no sudo, no raw stdout/stderr to HTTP or application logs.
            return self.runner([program, *arguments], stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, text=True, timeout=timeout,
                               check=False)
        except (OSError, ValueError, subprocess.TimeoutExpired, subprocess.SubprocessError):
            raise HotspotError('Linux NetworkManager did not complete the requested operation.',
                               'network_manager_failed') from None

    def _query(self, field, interface):
        response = self._nm('-g', field, 'device', 'show', interface, timeout=4)
        return response.stdout.strip() if response.returncode == 0 else None

    def _read_state(self):
        if self.state_file.is_symlink():
            raise HotspotError('Hotspot state path is not a safe local file.', 'unsafe_state')
        try:
            data = json.loads(self.state_file.read_text(encoding='utf-8'))
        except FileNotFoundError:
            return None
        except (OSError, UnicodeError, ValueError):
            raise HotspotError('The private hotspot ownership record is invalid.', 'invalid_state') from None
        try:
            ident = str(uuid.UUID(data['uuid']))
            if (ident != data['uuid'] or not _PROFILE.fullmatch(data['name']) or
                    not _IFACE.fullmatch(data['interface']) or
                    not _SSID.fullmatch(data['ssid']) or
                    data['phase'] not in ('starting', 'active')):
                raise ValueError()
            return data
        except (KeyError, TypeError, ValueError):
            raise HotspotError('The private hotspot ownership record is invalid.', 'invalid_state') from None

    def _write_state(self, data):
        self.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.state_file.is_symlink():
            raise HotspotError('Refusing to replace a hotspot-state symlink.', 'unsafe_state')
        fd, temp = tempfile.mkstemp(prefix='.openrf-hotspot-', dir=self.state_dir)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as handle:
                os.fchmod(handle.fileno(), 0o600)
                json.dump(data, handle, separators=(',', ':'))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp, self.state_file)
        finally:
            Path(temp).unlink(missing_ok=True)

    def _profile_owned(self, data):
        """Confirm UUID maps to OpenRF's exact profile name + interface."""
        try:
            found = self._nm('-g', 'connection.id', 'connection', 'show', 'uuid', data['uuid'], timeout=4)
            if found.returncode != 0:
                return False
            if found.stdout.strip() != data['name']:
                raise HotspotError('The remembered profile UUID belongs to a different connection; refusing to modify it.', 'ownership_mismatch')
            dev = self._nm('-g', 'connection.interface-name', 'connection', 'show', 'uuid', data['uuid'], timeout=4)
            if dev.returncode != 0 or dev.stdout.strip() != data['interface']:
                raise HotspotError('The remembered profile no longer matches its Wi-Fi interface.', 'ownership_mismatch')
            return True
        except HotspotError:
            raise

    def _cleanup(self, data):
        if self._profile_owned(data):
            current = self._query('GENERAL.CON-UUID', data['interface'])
            if current == data['uuid']:
                stopped = self._nm('connection', 'down', 'uuid', data['uuid'], timeout=15)
                if stopped.returncode != 0:
                    raise HotspotError('NetworkManager could not stop the owned hotspot profile.', 'stop_failed')
            deleted = self._nm('connection', 'delete', 'uuid', data['uuid'], timeout=10)
            if deleted.returncode != 0:
                raise HotspotError('NetworkManager could not delete the owned hotspot profile.', 'delete_failed')
        self.state_file.unlink(missing_ok=True)

    def status(self):
        with self.lock:
            state = self._read_state()
            try:
                report = self.inventory()
                ordinary = [item['name'] for item in report.get('interfaces', [])
                            if item.get('classification') == 'ordinary_wifi_candidate' and
                            item.get('os_reports_ap_mode') is True and
                            _IFACE.fullmatch(item.get('name', ''))]
            except (OSError, ValueError):
                ordinary = []
            active = False
            if state and self.lookup('nmcli'):
                try:
                    active = self._query('GENERAL.CON-UUID', state['interface']) == state['uuid']
                except HotspotError:
                    pass
            return {
                'schema_version': 1, 'kind': 'OPT_IN_LOCAL_WIFI_HOTSPOT',
                'network_manager_available': bool(self.lookup('nmcli')),
                'eligible_idle_status_not_verified': ordinary[:16],
                'managed_profile_present': state is not None,
                'active_on_adapter': active,
                'phase': state['phase'] if state else 'off',
                'interface': state['interface'] if state else None,
                'ssid': state['ssid'] if state else None,
                'passphrase_returned': False,
                'auto_start': False,
                'security_required': 'WPA-PSK, 12–63 printable ASCII characters',
                'network_manager_ipv4_sharing_may_forward_internet': True,
                'openrf_http_api_exposed_to_lan': False,
                'note': 'Starting requires explicit confirmation and an idle ordinary Linux Wi-Fi adapter. A running hotspot is not a HaLow link. NetworkManager may NAT a separate existing internet uplink; it also stores the WPA key in the owned profile until Stop removes it.',
            }

    def start(self, body):
        if not isinstance(body, dict) or set(body) != {'interface', 'ssid', 'passphrase', 'confirm'} or body.get('confirm') is not True:
            raise HotspotError('Explicit hotspot confirmation and all required fields are necessary.', 'confirmation_required', 400)
        iface, ssid, secret = body['interface'], body['ssid'], body['passphrase']
        if not isinstance(iface, str) or not _IFACE.fullmatch(iface):
            raise HotspotError('Select a valid Linux Wi-Fi interface.', 'invalid_interface', 400)
        if not isinstance(ssid, str) or not _SSID.fullmatch(ssid) or ssid.strip() != ssid:
            raise HotspotError('Network name must use 1–32 plain letters, numbers, spaces, dots or dashes.', 'invalid_ssid', 400)
        if not isinstance(secret, str) or not 12 <= len(secret) <= 63 or any(not 32 <= ord(ch) <= 126 for ch in secret):
            raise HotspotError('Choose a 12–63 character printable ASCII WPA passphrase.', 'invalid_password', 400)
        with self.lock:
            if self._read_state() is not None:
                raise HotspotError('An OpenRF hotspot profile is already tracked. Stop it first.', 'already_managed')
            if not self.lookup('nmcli'):
                raise HotspotError('NetworkManager (nmcli) is not installed in this Linux environment.', 'network_manager_unavailable')
            evidence = self.inventory()
            if not any(item.get('name') == iface and
                       item.get('classification') == 'ordinary_wifi_candidate' and
                       item.get('os_reports_ap_mode') is True
                       for item in evidence.get('interfaces', [])):
                raise HotspotError('Linux did not report an ordinary Wi-Fi adapter with AP support. HaLow candidates are not interchangeable.', 'ap_mode_unverified')
            if self._query('GENERAL.TYPE', iface) not in ('wifi', '802-11-wireless') or \
                    not str(self._query('GENERAL.STATE', iface) or '').startswith('30 '):
                raise HotspotError('This Wi-Fi adapter is not idle/disconnected. OpenRF will not interrupt an existing connection.', 'adapter_in_use')
            ident = str(uuid.uuid4())
            name = 'OpenRF-Field-' + ident[:8]
            data = {'uuid': ident, 'name': name, 'interface': iface, 'ssid': ssid, 'phase': 'starting'}
            self._write_state(data)
            try:
                # Explicit WPA-PSK prevents nmcli's one-shot hotspot command
                # from silently falling back to legacy WEP on weak hardware.
                created = self._nm('connection', 'add', 'type', 'wifi', 'ifname', iface,
                    'con-name', name, 'connection.uuid', ident,
                    'connection.autoconnect', 'no', '802-11-wireless.mode', 'ap',
                    '802-11-wireless.ssid', ssid,
                    'wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.proto', 'rsn',
                    'wifi-sec.psk', secret,
                    'ipv4.method', 'shared', 'ipv6.method', 'disabled', timeout=15)
                if created.returncode != 0:
                    raise HotspotError('NetworkManager could not create the WPA-protected Wi-Fi profile.', 'profile_create_failed')
                enabled = self._nm('connection', 'up', 'uuid', ident, timeout=20)
                if enabled.returncode != 0 or self._query('GENERAL.CON-UUID', iface) != ident:
                    raise HotspotError('NetworkManager could not activate the WPA-protected hotspot.', 'activation_failed')
                data['phase'] = 'active'
                self._write_state(data)
            except HotspotError:
                # Remove only the newly owned profile, if safe. If cleanup
                # cannot finish, retain the UUID record for manual Stop/retry.
                try:
                    self._cleanup(data)
                except (HotspotError, OSError):
                    pass
                raise
            return self.status()

    def stop(self, body, *, internal=False):
        if not internal and (not isinstance(body, dict) or body != {'confirm': True}):
            raise HotspotError('Explicit hotspot stop confirmation is required.', 'confirmation_required', 400)
        with self.lock:
            state = self._read_state()
            if state:
                self._cleanup(state)
            return self.status()
