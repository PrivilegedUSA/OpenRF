"""Explicit, one-shot Ecowitt local HTTP read; no discovery or background polling.

Implements the manufacturer's GET /get_livedata_info JSON protocol (HTTP API
v1.0.5). The JSON shape is checked, but a network response is NOT proof of
sensor identity, calibration, location, or fresh sensor acquisition.
"""
from __future__ import annotations

import http.client
import ipaddress
import json
import math
import re


class EcowittError(ValueError):
    pass


_LAN = tuple(ipaddress.ip_network(prefix) for prefix in
             ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))
_SAMPLE_LIMIT = 65_536
_VALUE = re.compile(r'^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(.*?)\s*$')


def private_gateway_ip(raw):
    """Accept an IPv4 *literal* in RFC1918 LAN ranges; no DNS/URLs/ports."""
    if not isinstance(raw, str) or len(raw) > 15 or raw.strip() != raw:
        raise EcowittError('Enter only the gateway IPv4 address on your private LAN (no URL or port).')
    try:
        address = ipaddress.IPv4Address(raw)
    except ipaddress.AddressValueError as exc:
        raise EcowittError('Enter a valid private-LAN IPv4 address (no hostname or URL).') from exc
    if not any(address in network for network in _LAN) or str(address) != raw:
        raise EcowittError('Gateway must be a canonical IPv4 address in 10/8, 172.16/12 or 192.168/16.')
    return raw


def _quantity(raw, allowed_units):
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        raise EcowittError('Ecowitt returned a nonnumeric measurement.')
    matched = _VALUE.fullmatch(str(raw))
    if not matched:
        raise EcowittError('Ecowitt returned an unsupported measurement format.')
    number = float(matched.group(1))
    if not math.isfinite(number):
        raise EcowittError('Ecowitt returned a nonfinite measurement.')
    unit = matched.group(2).strip().lower().replace('°', '')
    if unit not in allowed_units:
        raise EcowittError('Ecowitt returned an unsupported unit: ' + unit[:30])
    return number, unit


def parse_livedata(payload):
    """Map a conservative subset into SI; rainfall totals are NOT intervals."""
    if not isinstance(payload, dict) or not isinstance(payload.get('common_list'), list):
        raise EcowittError('Response is not Ecowitt live-data JSON (missing common_list).')
    common = payload['common_list']
    if len(common) > 256:
        raise EcowittError('Ecowitt live-data list exceeds the supported limit.')
    items = {}
    for item in common:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str):
            continue
        try:
            ident = int(item['id'], 0)
        except ValueError:
            continue
        if ident in (2, 7, 8, 9, 10, 11, 12, 21, 23) and ident not in items:
            items[ident] = item

    values = {}

    def from_item(ident, name, units, convert):
        item = items.get(ident)
        if item is None or item.get('val') in (None, '', 'None', '--'):
            return
        number, unit = _quantity(item['val'], units)
        values[name] = convert(number, unit)

    def temp(number, unit):
        return (number - 32) * 5 / 9 if unit == 'f' else number

    def wind(number, unit):
        return number / {'mph': 2.2369362921, 'km/h': 3.6, 'm/s': 1,
                         'kmh': 3.6, '': 1}[unit]

    def pressure(number, unit):
        return number * (33.8638866667 if unit == 'inhg' else 1)

    if 2 in items and items[2].get('val') not in (None, '', 'None', '--'):
        temperature = items[2]
        number, suffix = _quantity(temperature['val'], ('', 'c', 'f'))
        unit = suffix or str(temperature.get('unit', '')).strip().lower().replace('°', '')
        if unit not in ('c', 'f'):
            raise EcowittError('Gateway outdoor temperature unit must be C or F.')
        values['temperature_c'] = temp(number, unit)
    from_item(7, 'humidity_pct', ('%', ''), lambda n, _: n)
    from_item(10, 'wind_direction_deg', ('', 'deg'), lambda n, _: n)
    from_item(11, 'wind_speed_mps', ('mph', 'km/h', 'kmh', 'm/s'), wind)
    from_item(12, 'wind_gust_mps', ('mph', 'km/h', 'kmh', 'm/s'), wind)
    from_item(21, 'solar_wm2', ('w/m2', 'w/m²'), lambda n, _: n)
    from_item(23, 'uv_index', ('',), lambda n, _: n)
    if 9 in items:
        from_item(9, 'pressure_hpa', ('hpa', 'inhg', 'mb'), pressure)
    elif 8 in items:
        from_item(8, 'pressure_hpa', ('hpa', 'inhg', 'mb'), pressure)
    if 'pressure_hpa' not in values and isinstance(payload.get('wh25'), list):
        for sensor in payload['wh25'][:1]:
            if isinstance(sensor, dict) and sensor.get('rel'):
                number, unit = _quantity(sensor['rel'], ('hpa', 'mb', 'inhg'))
                values['pressure_hpa'] = pressure(number, unit)
    if not values:
        raise EcowittError('Ecowitt response contains no supported outdoor weather measurements.')
    return values


def fetch_livedata(ip):
    """GET only a fixed, read-only endpoint; reject redirects/large bodies."""
    host = private_gateway_ip(ip)
    connection = http.client.HTTPConnection(host, 80, timeout=3)
    try:
        connection.request('GET', '/get_livedata_info', headers={'Accept': 'application/json',
                            'Connection': 'close', 'User-Agent': 'OpenRF-weather/0.2'})
        response = connection.getresponse()
        if response.status != 200:
            raise EcowittError(f'Gateway returned HTTP {response.status}; expected 200.')
        content = response.read(_SAMPLE_LIMIT + 1)
        if len(content) > _SAMPLE_LIMIT:
            raise EcowittError('Gateway response exceeds the 64 KiB safety limit.')
    except (OSError, TimeoutError, http.client.HTTPException) as exc:
        raise EcowittError('Could not read this local gateway; check IP, firmware, Wi-Fi and WSL LAN access.') from exc
    finally:
        connection.close()
    try:
        return parse_livedata(json.loads(content.decode('utf-8')))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise EcowittError('Gateway did not return valid UTF-8 Ecowitt JSON.') from exc
