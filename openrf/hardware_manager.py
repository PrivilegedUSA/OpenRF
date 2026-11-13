"""Unified, read-only hardware status for the OpenRF touchscreen.

This is an *inventory and readiness* view. A detected interface, executable,
USB descriptor, or prior short handshake cannot prove present RF reception.
The builder never opens devices, scans radios, or stores private observations.
"""
from __future__ import annotations

from datetime import datetime, timezone


PROBE_FRESH_SECONDS = 300


def _timestamp(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return date.astimezone(timezone.utc) if date.tzinfo else None
    except (ValueError, OverflowError):
        return None


def manager_report(hardware: dict, *, last_probe: dict | None = None,
                   now: datetime | None = None) -> dict:
    """Summarize existing driver prerequisites, never assert a live detection.

    The caller supplies the inventory collected by hardware.status_report().
    The optional last_probe is an ephemeral user-requested serial handshake,
    not a trusted hardware identity and not an RF observation.
    """
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('now must be timezone-aware')
    now = now.astimezone(timezone.utc)
    wsl = str(hardware.get('environment', '')).startswith('WSL')
    wifi = hardware.get('wifi_one_shot') or {}
    ble = hardware.get('bluetooth_readiness') or {}
    ports = hardware.get('serial_ports') or []
    details = hardware.get('serial_port_details') or hardware.get('serial_port_diagnostics') or []
    by_port = {entry.get('port'): entry for entry in details if isinstance(entry, dict)}
    tools = hardware.get('command_availability') or {}
    probe = last_probe if isinstance(last_probe, dict) else {}

    def item(key: str, title: str, state: str, mode: str,
             evidence: str, next_step: str) -> dict:
        return {'key': key, 'title': title, 'state': state, 'mode': mode,
                'evidence': evidence, 'next_step': next_step}

    if wifi.get('possible') and wifi.get('interface'):
        wifi_state = 'prerequisites_visible'
        wifi_evidence = 'Linux interface and nmcli visible; an actual one-shot survey is not verified.'
        wifi_next = 'Use the explicit Wi-Fi survey action on Map or Signal analysis.'
    elif wsl and not any(d.get('wireless') for d in hardware.get('network_details', []) if isinstance(d, dict)):
        wifi_state = 'unsupported_current_host'
        wifi_evidence = 'WSL has no Linux wireless scan interface; Windows internal Wi-Fi cannot be assumed accessible.'
        wifi_next = 'Expose a compatible USB Wi-Fi adapter to Linux or test on Raspberry Pi OS.'
    else:
        wifi_state = 'missing_prerequisites'
        wifi_evidence = str(wifi.get('reason') or 'Linux Wi-Fi scan prerequisites are not established.')
        wifi_next = 'Check Linux wireless interface, NetworkManager, and permissions.'

    if ble.get('scan_supported') and ble.get('controller_count', 0):
        ble_state = 'prerequisites_visible'
        ble_evidence = 'BlueZ daemon and controller respond; no current BLE scan or advertisement is established.'
        ble_next = 'Use a user-started LE-only scan from Signal analysis.'
    elif ble.get('controller_count', 0):
        ble_state = 'driver_unavailable'
        ble_evidence = 'Linux Bluetooth controller visible; BlueZ is missing or unresponsive.'
        ble_next = 'Check bluetoothctl, BlueZ daemon and controller power before starting a scan.'
    else:
        ble_state = 'unsupported_current_host' if wsl else 'not_connected'
        ble_evidence = 'No Linux Bluetooth controller is visible; no nearby-device discovery was performed.'
        ble_next = 'Use a Linux-visible Bluetooth adapter and BlueZ.'

    probe_stamp = _timestamp(probe.get('at_utc'))
    probe_age = (now - probe_stamp).total_seconds() if probe_stamp else None
    recent_probe = probe_age is not None and 0 <= probe_age <= PROBE_FRESH_SECONDS
    probe_port = probe.get('port')
    serial_visible = [p for p in ports if isinstance(p, str)]
    access = [by_port.get(p, {}).get('access') for p in serial_visible]
    if probe_port and probe_port not in serial_visible:
        usb_state = 'disconnected'
        usb_evidence = 'A previously probed serial port is no longer visible; this does not imply a current connection.'
        usb_next = 'Reconnect the module, refresh inventory, and request a new handshake.'
    elif probe_port and probe_stamp and not recent_probe:
        usb_state = 'stale'
        usb_evidence = 'Previous USB protocol result is expired or future-dated; no current connection confirmed.'
        usb_next = 'Refresh and explicitly probe the visible port again.'
    elif probe_port and recent_probe and probe.get('status') == 'failed':
        usb_state = 'probe_failed'
        usb_evidence = 'A recent user-requested OpenRF Serial v1 handshake failed.'
        usb_next = 'Check firmware protocol, cable, Linux permissions and passthrough.'
    elif probe_port and recent_probe and probe.get('status') == 'responding':
        usb_state = 'responded_recently_unverified'
        usb_evidence = 'Recent device-reported protocol handshake; hardware identity and RF capture remain unverified.'
        usb_next = 'Use explicit snapshot capture only on a supported, authorized controller.'
    elif any(a == 'permission_ok_unverified' for a in access):
        usb_state = 'detected_unverified'
        usb_evidence = 'Linux USB serial endpoint accessible; compatible firmware not established.'
        usb_next = 'Select the correct port and explicitly probe OpenRF Serial v1.'
    elif serial_visible and any(a == 'permission_denied' for a in access):
        usb_state = 'permission_denied'
        usb_evidence = 'Linux USB serial endpoint visible but not accessible to this process.'
        usb_next = 'Check dialout/uucp membership and WSL USB passthrough; do not chmod 666.'
    elif serial_visible:
        usb_state = 'detected_unverified'
        usb_evidence = 'Serial node visible; access and protocol compatibility unverified.'
        usb_next = 'Check device type, access rights, then explicitly probe the intended port.'
    else:
        usb_state = 'not_connected'
        usb_evidence = 'No ttyUSB/ttyACM endpoint visible; ordinary USB devices are not RF receivers.'
        usb_next = 'Connect an OpenRF Serial v1 module and expose it to Linux.'

    sdr_evidence = ('rtl_power/rtl_test tooling found, but a USB receiver and sampling are unverified.'
                    if tools.get('rtl_power') or tools.get('rtl_test') else
                    'No SDR command-line tools found; receiver presence is unverified.')
    gps_evidence = ('gpsd executable present; no receiver or fresh GNSS position verified.'
                    if tools.get('gpsd') else
                    'No gpsd executable found; no receiver or position verified.')
    entries = [
        item('wifi', 'Linux Wi-Fi survey', wifi_state, 'user_started_one_shot', wifi_evidence, wifi_next),
        item('ble', 'Linux Bluetooth LE', ble_state, 'user_started_one_shot', ble_evidence, ble_next),
        item('usb_serial', 'OpenRF USB Serial v1', usb_state, 'user_started_probe_or_snapshot', usb_evidence, usb_next),
        item('sdr', 'SDR spectrum', 'tools_present_unverified' if tools.get('rtl_power') else 'offline_analysis_only',
             'user_started_bounded_capture' if tools.get('rtl_power') else 'offline_file_only',
             sdr_evidence,
             'Open Spectrum for an explicitly requested 5–30 second rtl_power sweep or offline CSV. Receiver identity and sample validity require actual output.'
             if tools.get('rtl_power') else 'Install rtl_power and pass a compatible RTL-SDR to Linux for user-started bounded sweeps; offline CSV still works.'),
        item('gnss', 'External GNSS', 'tools_only_unverified' if tools.get('gpsd') else 'not_connected',
             'user_started_fix_request', gps_evidence,
             'A supported gpsd service and fresh, accuracy-qualified fix are required for real positioning.'),
        item('subghz', 'Sub-GHz / CC1101', 'not_implemented', 'planned',
             'No compatible specialized sub-GHz driver handshake verified.',
             'Requires a supported external controller and an explicitly authorized use case.'),
        item('cellular', 'Cellular / 5G', 'not_implemented', 'planned',
             'No modem RF diagnostic driver or measured band/frequency verified.',
             'Use a supported cellular modem with documented measurement capabilities.'),
        item('radar', 'Radar / laser receiver', 'not_implemented', 'planned',
             'No specialized X/K/Ka or optical receiver integrated.',
             'Dedicated validated receive-only hardware is required; Wi-Fi/SDR presence proves nothing.'),
    ]
    return {
        'schema_version': 1,
        'kind': 'READ_ONLY_HARDWARE_MANAGER',
        'collected_at_utc': now.isoformat(timespec='seconds'),
        'inventory_collected_utc': hardware.get('inventory_collected_utc'),
        'active_continuous_rf_capture': False,
        'verified_live_receivers': 0,
        'summary': {
            'linux_usb_descriptors_visible': len(hardware.get('usb_devices') or []),
            'linux_serial_ports_visible': len(serial_visible),
            'linux_wifi_interfaces_visible': sum(bool(row.get('wireless')) for row in hardware.get('network_details') or [] if isinstance(row, dict)),
            'linux_bluetooth_controllers_visible': len(hardware.get('bluetooth_adapters') or []),
        },
        'entries': entries,
        'limitations': 'Inventory, prior probes and tool presence do not establish a live receiver, RF measurement, target location or direction.',
    }
