"""Sensor adapter contracts and short-lived server-owned scan receipts.

Adapters report only measured/retrieved fields. A browser cannot claim SENSOR
provenance via a manual POST. Future BLE, SDR and GNSS drivers can provide the
same fields; a visible USB descriptor alone is not a connected sensor.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
import secrets
import threading
import time


@dataclass(frozen=True)
class SensorDescriptor:
    sensor_id: str
    label: str
    status: str
    description: str
    measurement_units: tuple[str, ...] = ()


def connections(hardware: dict) -> list[dict]:
    wifi = hardware.get('wifi_one_shot') or {}
    ble = hardware.get('bluetooth_readiness') or {}
    return [
        SensorDescriptor('networkmanager-wifi', 'Linux Wi-Fi / NetworkManager',
            'ready' if wifi.get('possible') else 'unavailable',
            'One-shot scan; quality percentage is not RSSI. Interface: ' + str(wifi.get('interface') or 'none'),
            ('MHz', 'quality_percent')).__dict__,
        SensorDescriptor('openrf-serial-v1', 'OpenRF USB-serial sensor v1',
            'port_visible_unverified' if hardware.get('serial_ports') else 'not_connected',
            'User-triggered USB handshake and snapshot capture supported for modules running OpenRF Serial v1 firmware. '
            'A serial port alone does not prove a compatible module or genuine measurements. '
            'Available ports: ' + (', '.join(hardware.get('serial_ports', [])[:8]) or 'none'),
            ('MHz', 'dBm')).__dict__,
        SensorDescriptor('openrf-weather-serial-v1', 'OpenRF Weather USB/ESP32 bridge v1',
            'port_visible_unverified' if hardware.get('serial_ports') else 'not_connected',
            'On-demand WEATHER protocol probe and single-snapshot capture. Supports a compatible, '
            'explicitly programmed USB serial weather bridge, not arbitrary USB weather products. '
            'Ports are candidates only; never auto-connected, scanned, paired or saved. '
            'Available: ' + (', '.join(hardware.get('serial_ports', [])[:8]) or 'none'),
            ('°C','%','hPa','m/s','mm','mm/h')).__dict__,
        SensorDescriptor('linux-ble', 'Linux Bluetooth LE',
            'ready_on_demand' if ble.get('controller_count', 0) and ble.get('daemon') == 'responding' else 'unavailable',
            'Read-only LE-only one-shot discovery on user request. Controller count: ' + str(ble.get('controller_count', 0)) +
            '; BlueZ daemon: ' + str(ble.get('daemon', 'unknown')) +
            '. No pairing, connections, background collection or automatic BLE observations.').__dict__,
        SensorDescriptor('usb-sdr', 'USB software-defined radio',
            'user_started_bounded_capture_unverified' if (hardware.get('command_availability') or {}).get('rtl_power') else 'offline_file_only',
            'Browser-local historical rtl_power CSV inspection and DEMO. ' +
            'A compatible Linux-visible RTL-SDR plus rtl_power supports explicit 5–30 second receiver-index-0 capture; no automatic scanning, continuous monitoring, verified device identity or calibration.').__dict__,
        SensorDescriptor('external-gnss', 'External GPS / GNSS', 'not_implemented',
            'No validated GNSS fix parser or fix-age quality negotiation yet.').__dict__,
        SensorDescriptor('police-radar-receiver', 'Police radar X/K/Ka + LIDAR', 'not_implemented',
            'Future long-range receive-only dedicated microwave and optical hardware required. No detector, alert, or range verified.').__dict__,
    ]


@dataclass
class ScanReceipt:
    scan_id: str
    created_monotonic: float
    result: dict
    saved_bssids: set[str] = field(default_factory=set)
    saved_all: bool = False


class BleScanReceiptStore:
    """One short-lived server-issued BLE retrieval; selected saves only."""
    def __init__(self, ttl_seconds: int = 600):
        self.ttl_seconds = ttl_seconds
        self._lock = threading.RLock()
        self._current = None
        self._saved = set()

    def remember(self, result: dict) -> dict:
        if result.get('source') != 'BLUEZ_BLE' or not isinstance(result.get('records'), list):
            raise ValueError('Not a verified BlueZ LE scan retrieval')
        with self._lock:
            self._current = (secrets.token_urlsafe(20), time.monotonic(), result)
            self._saved = set()
            return {**result, 'scan_id': self._current[0], 'expires_in_seconds': self.ttl_seconds}

    def summary(self) -> dict:
        with self._lock:
            if not self._current:
                return {'last_scan': 'never', 'result_count': None, 'receipt_valid': False}
            ident, started, result = self._current
            age = time.monotonic() - started
            return {'last_scan': result['retrieved_at_utc'], 'result_count': len(result['records']),
                    'receipt_valid': age < self.ttl_seconds, 'age_seconds': round(age),
                    'freshness': result['freshness']}

    def take(self, ident: str, address: str, save):
        with self._lock:
            if not self._current or not isinstance(ident, str) or not secrets.compare_digest(ident, self._current[0]):
                raise ValueError('BLE scan receipt not recognized. Run a new scan.')
            scan_id, started, result = self._current
            if time.monotonic() - started > self.ttl_seconds:
                self._current = None
                raise ValueError('BLE scan receipt expired. Run a fresh scan.')
            if not isinstance(address, str) or address in self._saved:
                raise ValueError('BLE device already saved or invalid.')
            record = next((r for r in result['records'] if r['address'] == address), None)
            if not record:
                raise ValueError('BLE address not observed in this scan.')
            response = save(result, record)
            self._saved.add(address)
            return response


def verified_ble_observation(scan: dict, device: dict, survey_location, session_id):
    lat, lon, accuracy = browser_survey_location(survey_location)
    if session_id is not None and (type(session_id) is not int or session_id < 1):
        raise ValueError('Invalid investigation ID')
    dt = datetime.fromisoformat(scan['retrieved_at_utc'].replace('Z', '+00:00'))
    if dt.tzinfo is None:
        raise ValueError('BlueZ scan lacks UTC retrieval time')
    rssi = device.get('rssi_dbm')
    if rssi is not None and (type(rssi) is not int or not -127 <= rssi <= 20):
        raise ValueError('Invalid reported BLE RSSI')
    label = str(device.get('name') or '(unnamed LE device)')[:100]
    notes = ('On-demand Linux BlueZ LE discovery. Retrieved ' + scan['retrieved_at_utc'] +
             '; per-device advertisement time unverified, BlueZ may return cached properties. '
             'BLE address can be randomized and is not a stable identity. '
             'Reported RSSI is uncalibrated signal dBm, not distance or direction. '
             'No advertising frequency/channel established. BlueZ scanner/controller mapping is not independently verified. '
             + ('Coordinates represent browser-reported OBSERVER position, NOT transmitter location.'
                if lat is not None else 'No observer coordinates saved.'))
    return {
        'kind': 'BLE', 'source': 'SENSOR', 'label': 'BLE: ' + label,
        'identifier': device['address'], 'source_device': 'Linux BlueZ / ' + str(scan['controller'])[:32],
        'notes': notes, 'frequency_mhz': None, 'rssi_dbm': rssi,
        'latitude': lat, 'longitude': lon, 'accuracy_m': accuracy,
        'session_id': session_id,
    }, dt.astimezone(timezone.utc).isoformat(timespec='seconds')


class ScanReceiptStore:
    """One recent verified scan, expiring after ten minutes, with one save per BSSID."""
    def __init__(self, ttl_seconds: int = 600):
        self.ttl_seconds = ttl_seconds
        self._current: ScanReceipt | None = None
        self._lock = threading.RLock()

    def remember(self, result: dict) -> dict:
        if result.get('source') != 'NETWORKMANAGER_WIFI' or not isinstance(result.get('records'), list):
            raise ValueError('Not an actual NetworkManager scan result')
        scan = ScanReceipt(secrets.token_urlsafe(20), time.monotonic(), result)
        with self._lock:
            self._current = scan
        return {**result, 'scan_id': scan.scan_id, 'expires_in_seconds': self.ttl_seconds}

    def _check(self, scan_id):
        scan = self._current
        if not isinstance(scan_id, str) or not scan or not secrets.compare_digest(scan.scan_id, scan_id):
            raise ValueError('Scan receipt unknown. Run a fresh Wi-Fi scan.')
        if time.monotonic() - scan.created_monotonic > self.ttl_seconds:
            self._current = None
            raise ValueError('Scan receipt expired. Run a fresh Wi-Fi scan.')
        return scan

    def summary(self) -> dict:
        with self._lock:
            scan = self._current
            if not scan:
                return {'last_scan': 'never', 'result_count': None, 'receipt_valid': False}
            age = max(0.0, time.monotonic() - scan.created_monotonic)
            return {'last_scan': scan.result.get('retrieved_at_utc'),
                    'result_count': len(scan.result.get('records') or []),
                    'receipt_valid': age <= self.ttl_seconds and not scan.saved_all,
                    'age_seconds': round(age), 'freshness': scan.result.get('freshness', 'UNVERIFIED')}

    def take_all(self, scan_id: str, save):
        """One atomic save callback for the complete verified retrieval, including zero results."""
        with self._lock:
            scan = self._check(scan_id)
            if scan.saved_all:
                raise ValueError('This Wi-Fi scan was already saved as a snapshot.')
            pending = [row for row in scan.result['records'] if row['bssid'] not in scan.saved_bssids]
            response = save(scan.result, pending)
            scan.saved_bssids.update(row['bssid'] for row in pending)
            scan.saved_all = True
            return response

    def take(self, scan_id: str, bssid: str, save):
        """Supply only a result from the actual scan to the trusted storage callback.

        The callback is executed under a lock so concurrent saves cannot duplicate
        the same BSSID; failures do not consume the receipt.
        """
        with self._lock:
            scan = self._check(scan_id)
            if scan.saved_all:
                raise ValueError('This Wi-Fi scan was already saved as a snapshot.')
            if not isinstance(bssid, str):
                raise ValueError('Invalid BSSID')
            if bssid in scan.saved_bssids:
                raise ValueError('This access point was already saved from the scan.')
            record = next((r for r in scan.result['records'] if r['bssid'] == bssid), None)
            if record is None:
                raise ValueError('BSSID was not observed in the verified scan.')
            response = save(scan.result, record)
            scan.saved_bssids.add(bssid)
            return response


def browser_survey_location(data) -> tuple[float | None, float | None, float | None]:
    """Client-reported survey coordinate, not independently verified GNSS data."""
    if data is None:
        return None, None, None
    if not isinstance(data, dict) or set(data) - {'latitude', 'longitude', 'accuracy_m', 'fix_age_seconds'}:
        raise ValueError('Unexpected browser survey location format')
    def f(name, min_value, max_value):
        value = data.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not min_value <= value <= max_value:
            raise ValueError('Invalid browser survey ' + name)
        return float(value)
    age = data.get('fix_age_seconds')
    if age is not None:
        f('fix_age_seconds', 0, 60)
    return f('latitude', -90, 90), f('longitude', -180, 180), f('accuracy_m', 0, 1000000)


def browser_location_details(data) -> dict:
    lat, lon, accuracy = browser_survey_location(data)
    if lat is None:
        return {'location_source': 'NONE', 'latitude': None, 'longitude': None,
                'accuracy_m': None, 'fix_age_seconds': None}
    if data.get('fix_age_seconds') is None:
        raise ValueError('Survey location requires a browser fix age')
    return {'location_source': 'BROWSER_REPORTED', 'latitude': lat, 'longitude': lon,
            'accuracy_m': accuracy, 'fix_age_seconds': float(data['fix_age_seconds'])}


def verified_wifi_observation(scan: dict, network: dict, survey_location, session_id):
    lat, lon, accuracy = browser_survey_location(survey_location)
    if session_id is not None and (type(session_id) is not int or session_id < 1):
        raise ValueError('Invalid investigation ID')
    time_text = scan.get('retrieved_at_utc')
    try:
        timestamp = datetime.fromisoformat(time_text.replace('Z', '+00:00'))
        if timestamp.tzinfo is None:
            raise ValueError()
        timestamp = timestamp.astimezone(timezone.utc).isoformat(timespec='seconds')
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError('Scan has no valid UTC retrieval time') from exc
    quality = network.get('signal_quality_percent')
    if type(quality) is not int or not 0 <= quality <= 100:
        raise ValueError('Scan quality must be a percent, not dBm')
    frequency = network.get('frequency_mhz')
    if frequency is not None and (type(frequency) is not int or not 1 <= frequency <= 100000):
        raise ValueError('Invalid reported Wi-Fi frequency')
    interface = str(scan.get('interface', 'unknown'))[:32]
    ssid = str(network.get('ssid') or '(unnamed)')[:100]
    notes = (f"NetworkManager Wi-Fi scan retrieval; SIGNAL {quality}% quality (NOT RSSI dBm). "
             f"Band {network.get('band') or 'unknown'}, mode {network.get('mode') or 'unknown'}, channel {network.get('channel') or 'unknown'}, security {network.get('security') or 'unknown'}. "
             "Beacon age not measured; cached scan results possible. "
             + ('Coordinates: browser-reported observer position, not independently verified GNSS or AP location.' if lat is not None else 'No survey coordinates recorded.'))
    return {
        'kind': 'WIFI', 'source': 'SENSOR', 'label': f'Wi-Fi: {ssid}',
        'identifier': network['bssid'], 'notes': notes,
        'source_device': f'Linux NetworkManager / {interface}',
        'frequency_mhz': frequency, 'rssi_dbm': None,
        'latitude': lat, 'longitude': lon, 'accuracy_m': accuracy,
        'session_id': session_id, 'signal_quality_percent': quality,
    }, timestamp
