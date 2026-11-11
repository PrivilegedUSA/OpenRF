"""Human-readable, read-only host readiness assessment for OpenRF.

This evaluates *inventory and prior user-initiated activity*, not live RF health.
It never opens device nodes, scans radios, or infers RF capabilities from USB IDs.
"""
from __future__ import annotations

from datetime import datetime, timezone

PROBE_MAX_AGE_SECONDS = 300


def _utc(text: str | None):
    try:
        if not isinstance(text, str):
            return None
        dt = datetime.fromisoformat(text.replace('Z', '+00:00'))
        return dt.astimezone(timezone.utc) if dt.tzinfo else None
    except ValueError:
        return None


def readiness_report(hardware: dict, *, last_probe: dict | None = None,
                     last_wifi_scan: dict | None = None,
                     now: datetime | None = None) -> dict:
    """Produce a conservative checklist without identifiers or raw measurements.

    The response intentionally excludes USB serial numbers, firmware hardware IDs,
    Wi-Fi identifiers, GPS coordinates and prior scan contents. It is safe to
    export intentionally as a *diagnostic*, not as proof of a functioning sensor.
    """
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('now must be timezone-aware')
    now = now.astimezone(timezone.utc)
    wsl = str(hardware.get('environment', '')).startswith('WSL')
    ports = hardware.get('serial_ports') or []
    details = hardware.get('serial_port_details') or hardware.get('serial_port_diagnostics') or []
    by_port = {d['port']: d for d in details if isinstance(d, dict) and d.get('port') in ports}
    checklist = []

    def add(key, label, status, explanation, next_step):
        checklist.append({'key': key, 'label': label, 'status': status,
                          'explanation': explanation, 'next_step': next_step})

    add('host', 'Linux host', 'available_unverified',
        'OpenRF is running on Linux/WSL; this is not a physical receiver health check.',
        'On WSL, use supported USB passthrough to expose external devices to Ubuntu.' if wsl
        else 'Check each external driver independently when hardware is attached.')

    wifi = hardware.get('wifi_one_shot') or {}
    wifi_tools = hardware.get('command_availability') or {}
    wifi_iface = bool((hardware.get('network_details') or [])) and any(
        entry.get('wireless') for entry in hardware.get('network_details', []) if isinstance(entry, dict))
    if wifi.get('possible') and wifi.get('interface'):
        wifi_state, wifi_note = 'prerequisites_visible', 'NetworkManager and a Linux wireless interface appear available; scan success and freshness are unverified.'
        wifi_next = 'Use the one-shot Wi-Fi scan button to test on compatible hardware.'
    elif wifi_iface and not wifi_tools.get('nmcli'):
        wifi_state, wifi_note = 'tool_missing', 'Linux wireless interface visible, but the NetworkManager command is missing.'
        wifi_next = 'Install/configure NetworkManager and nmcli if the adapter supports it.'
    else:
        wifi_state, wifi_note = 'no_linux_interface', 'No usable Linux Wi-Fi one-shot scan prerequisites verified.'
        wifi_next = ('Windows internal Wi-Fi normally cannot scan from WSL. Use a compatible Linux-visible adapter.'
                     if wsl else 'Connect or enable a supported Linux Wi-Fi adapter.')
    add('wifi', 'One-shot Wi-Fi survey', wifi_state, wifi_note, wifi_next)

    denied = [p for p in ports if by_port.get(p, {}).get('access') == 'permission_denied']
    accessible = [p for p in ports if by_port.get(p, {}).get('access') == 'permission_ok_unverified'
                  and by_port.get(p, {}).get('device_type') == 'character_device']
    if not ports:
        serial_state = 'not_connected'
        serial_note = 'No Linux ttyUSB or ttyACM serial endpoint is visible.'
        serial_next = 'Connect an authorized OpenRF Serial v1 board and expose it to Linux (WSL may require usbipd).' if wsl else 'Connect an authorized OpenRF Serial v1 board.'
    elif accessible:
        serial_state = 'ready_to_probe'
        serial_note = f'{len(accessible)} serial port(s) accessible to this process; firmware support is NOT established.'
        serial_next = 'Select a port and request a protocol probe; do not assume RF measurements are available.'
    elif denied:
        serial_state = 'permission_denied'
        serial_note = f'{len(denied)} port(s) cannot be opened by the current Linux process.'
        serial_next = 'Check device passthrough and dialout/uucp membership; re-login after changing groups. Do not chmod 666.'
    else:
        serial_state = 'unverified_endpoint'
        serial_note = 'Serial port names exist, but a usable character device could not be confirmed.'
        serial_next = 'Refresh inventory, reconnect USB, and check device-node permissions.'
    add('usb_serial', 'USB serial transport', serial_state, serial_note, serial_next)

    last_probe = last_probe if isinstance(last_probe, dict) else {}
    probe_port = last_probe.get('port')
    probe_stamp = _utc(last_probe.get('at_utc'))
    age = (now - probe_stamp).total_seconds() if probe_stamp else None
    if not probe_port or not probe_stamp:
        protocol_state, protocol_note = 'not_probed', 'No recent recorded OpenRF Serial v1 protocol exchange.'
    elif probe_port not in ports:
        protocol_state, protocol_note = 'disconnected', 'Previously probed port is no longer in the current Linux inventory.'
    elif age is None or age < 0 or age > PROBE_MAX_AGE_SECONDS:
        protocol_state, protocol_note = 'stale', 'Previous USB protocol outcome is more than five minutes old or has an invalid timestamp.'
    elif last_probe.get('status') == 'failed':
        protocol_state, protocol_note = 'probe_failed', 'A recent explicit protocol probe failed; see the USB sensor status for details.'
    elif last_probe.get('status') == 'responding':
        protocol_state, protocol_note = 'responding_unverified', 'An explicit protocol request recently received a device-reported response. Identity, calibration and current connection remain unverified.'
    else:
        protocol_state, protocol_note = 'unverified', 'No recognized protocol outcome can be confirmed.'
    add('serial_protocol', 'USB sensor protocol', protocol_state, protocol_note,
        'Select the currently visible port and run Probe sensor. This does not start a scan or verify the receiver.')

    add('ble_sdr_gnss', 'BLE, SDR and external GNSS', 'not_implemented',
        'BLE scan, SDR sampling, and external GNSS parsing are not integrated; device discovery is not measurement.',
        'Integrate and validate dedicated drivers after obtaining supported hardware.')
    add('radar', 'Police radar / laser receiver', 'not_implemented',
        'X/K/Ka microwave and laser receiving hardware and alerts are not connected.',
        'Dedicated passive receiver and real-world testing are required.')
    wifi_scan = last_wifi_scan or {}
    count = wifi_scan.get('result_count')
    return {
        'schema_version': 1, 'kind': 'READ_ONLY_HOST_DIAGNOSTICS',
        'collected_at_utc': now.isoformat(timespec='seconds'),
        'environment': hardware.get('environment', 'Linux'),
        'active_rf_capture': False,
        'checklist': checklist,
        'summary': {'usb_serial_ports_visible': len(ports),
                    'usb_ports_permission_denied': len(denied),
                    'usb_ports_accessible_unverified': len(accessible),
                    'wifi_last_scan_recorded': bool(wifi_scan.get('last_scan') not in (None, 'never')),
                    'wifi_last_result_count': count if type(count) is int and 0 <= count <= 256 else None},
        'limitations': ['Hardware inventory does not prove connectivity or measurement ability.',
                        'Previous protocol responses may be stale even if the port remains visible.',
                        'No continuous RF capture, police radar or navigation receiver is running.'],
    }
