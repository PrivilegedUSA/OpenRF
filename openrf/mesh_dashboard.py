"""Read-only, provenance-preserving mesh inventory. No radio commands."""
from typing import TypedDict
from datetime import datetime, timezone
import math
import re

class Node(TypedDict):
    protocol: str
    id: str
    name: str
    role: str | None
    source: str
    quality: str
    last_heard: float | None
    position: dict | None
    telemetry: dict
    infrastructure: bool
    advert_timestamp: float | None
    # Optional protocol-specific fields are added only when supported.


def number(value):
    return value if type(value) in (int, float) and math.isfinite(value) else None


def validated_telemetry(raw):
    bounds = {'Battery (%)': (0,100), 'Voltage (V)': (0,1000), 'Hops away': (0,255),
              'RSSI (dBm)': (-200,0), 'SNR (dB)': (-100,100)}
    return {k:v for k,v in raw.items() if k in bounds and number(v) is not None
            and bounds[k][0] <= v <= bounds[k][1] and (k != 'Hops away' or v == int(v))}


def position(raw):
    if not isinstance(raw, dict):
        return None
    lat, lon = number(raw.get('latitude')), number(raw.get('longitude'))
    if lat is None and number(raw.get('latitudeI')) is not None:
        lat = raw['latitudeI'] / 1e7
    if lon is None and number(raw.get('longitudeI')) is not None:
        lon = raw['longitudeI'] / 1e7
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
        return None
    return {'latitude': lat, 'longitude': lon, 'source': 'MESHTASTIC_NODE_REPORTED',
            'accuracy_m': None, 'timestamp': number(raw.get('time'))}


def node(protocol, ident, name, source, quality, **extra):
    return Node(protocol=protocol, id=ident, name=name or ident, role=None, source=source,
                quality=quality, last_heard=None, position=None, telemetry={}, infrastructure=False, advert_timestamp=None) | extra


def meshtastic_rows(directory, radio):
    rows = {r['id']: node('Meshtastic', r['id'], r.get('alias'), 'LOCAL_MESSAGES_AND_ALIASES',
                         'Historical correspondent' if r.get('observed_in_messages') else 'Saved alias')
            for r in directory.get('nodes', [])}
    for ident, raw in radio.items():
        if not isinstance(raw, dict):
            continue
        user = raw.get('user') or {}
        if not isinstance(user, dict):
            continue
        ident = user.get('id') or ident
        if not isinstance(ident, str) or not re.fullmatch(r'![0-9a-fA-F]{8}', ident):
            continue
        role = user.get('role')
        role = str(role) if role is not None else None
        metrics = raw.get('deviceMetrics') or {}
        if not isinstance(metrics, dict):
            metrics = {}
        telemetry = {k: v for k, v in {'SNR (dB)': number(raw.get('snr')), 'RSSI (dBm)': number(raw.get('rssi')), 'Hops away': number(raw.get('hopsAway')), 'Battery (%)': number(metrics.get('batteryLevel')), 'Voltage (V)': number(metrics.get('voltage'))}.items() if v is not None}
        telemetry = validated_telemetry(telemetry)
        heard = number(raw.get('lastHeard'))
        now = datetime.now(timezone.utc).timestamp()
        quality = 'Radio database · age unknown'
        if heard is not None and 0 < heard <= now:
            quality = 'Recently reported' if now - heard <= 3600 else 'Stale radio record'
        else:
            heard = None
        rows[ident] = node('Meshtastic', ident, str(user.get('longName') or user.get('shortName') or rows.get(ident, {}).get('name') or ident)[:120], 'RADIO_NODE_DATABASE', quality,
                           role=role, last_heard=heard, position=position(raw.get('position')), telemetry=telemetry,
                           infrastructure=role in ('ROUTER', 'ROUTER_CLIENT', 'REPEATER', 'ROUTER_LATE'))
    return list(rows.values())


def meshcore_rows(contacts):
    rows = []
    now = datetime.now(timezone.utc).timestamp()
    roles = {'1': 'Client', '2': 'Repeater', '3': 'Room server'}
    for r in contacts:
        role = roles.get(str(r.get('type')), r.get('type'))
        lat, lon = number(r.get('adv_lat')), number(r.get('adv_lon'))
        advert = number(r.get('last_advert'))
        if advert is not None and not 0 < advert <= now:
            advert = None
        pos = None
        if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180 and (lat, lon) != (0, 0):
            pos = dict(latitude=lat, longitude=lon, source='MESHCORE_CONTACT_ADVERT_POSITION', accuracy_m=None, timestamp=None)
        rows.append(node('MeshCore', r['public_key'], r.get('name'), 'RADIO_CONTACT_LIST',
                         'Stored radio contact · reachability unknown', role=role, position=pos,
                         infrastructure=str(r.get('type')) == '2', advert_timestamp=advert))
    return rows


def reticulum_rows(contacts, paths):
    rows = {r['address'].lower(): node('Reticulum', r['address'].lower(), r.get('alias'),
            'PRIVATE_SAVED_CONTACT', 'Saved destination', saved_contact=True) for r in contacts}
    for path in paths:
        ident = path['address']
        saved = rows.get(ident)
        quality = ('Expired cached path' if path['expired'] is True else
                   'Cached path · reachability unknown')
        rows[ident] = node('Reticulum', ident, saved['name'] if saved else ident,
                           'RNS_PATH_CACHE', quality, saved_contact=bool(saved),
                           route=dict(path), telemetry={'Hops away': path['hops']} if path['hops'] is not None else {})
    return list(rows.values())


def network_health(records, now, stale_after=3600):
    """Inventory statistics, not a measurement of network uptime or reachability."""
    heard = [r['last_heard'] for r in records if r.get('last_heard') is not None and 0 < r['last_heard'] <= now]
    recent = sum(now - t <= stale_after for t in heard)
    metrics = {}
    for key in ('RSSI (dBm)', 'SNR (dB)', 'Battery (%)', 'Voltage (V)'):
        values = [validated_telemetry(r.get('telemetry', {})).get(key) for r in records]
        values = [v for v in values if v is not None and (key != 'Battery (%)' or 0 <= v <= 100)]
        metrics[key] = dict(samples=len(values), minimum=min(values), maximum=max(values), mean=sum(v / len(values) for v in values)) if values else None
    return dict(recent=recent, stale=len(heard)-recent, age_unknown=len(records)-len(heard),
                located=sum(r.get('position') is not None for r in records),
                infrastructure=sum(bool(r.get('infrastructure')) for r in records),
                expired_paths=sum(r.get('route', {}).get('expired') is True for r in records),
                telemetry=metrics)


def dashboard(mesh, core, ret):
    nodes, networks = [], []
    for protocol, manager in [('Meshtastic', mesh), ('MeshCore', core), ('Reticulum', ret)]:
        # All three concrete managers use reentrant locks. Skip an occupied manager
        # rather than queue behind an operator's send/connect/refresh operation.
        lock = getattr(manager, '_lock', None)
        if lock is not None and not lock.acquire(blocking=False):
            networks.append(dict(protocol=protocol,state='Unavailable · inventory busy',count=None,device=None,last_heard=None))
            continue
        try:
            status = manager.status()
            connected = status.get('connected', status.get('enabled', False))
            available = status.get('sdk_available', status.get('dependencies_available', False))
            state = ('Connected' if connected else 'Unavailable' if not available else 'Disconnected')
            if status.get('last_error') and not connected:
                state = 'Failed'
            extra = {}
            if protocol == 'Meshtastic':
                radio = manager.radio_nodes() if connected else {}
                records = meshtastic_rows(manager.nodes(), radio)
            elif protocol == 'MeshCore':
                records = meshcore_rows(manager.contacts()['contacts']) if connected else []
            else:
                contacts = manager.contacts()['contacts']
                inventory = {}
                if connected:
                    try:
                        inventory = manager.mesh_inventory()
                    except Exception:
                        inventory = {}
                cache = inventory.get('path_cache', {})
                records = reticulum_rows(contacts, cache.get('paths', []))
                extra = dict(saved_count=len(contacts), path_count=cache.get('total') if cache.get('available') else None,
                             path_truncated=cache.get('truncated', False),
                             path_available=cache.get('available', False),
                             interface_report=inventory.get('interface_report', {}))
            nodes.extend(records)
            times = [r['last_heard'] for r in records if r['last_heard'] is not None]
            networks.append(dict(protocol=protocol, state=state, count=len(records), device=status.get('device') or status.get('port') or status.get('address'), last_heard=max(times, default=None), health=network_health(records, datetime.now(timezone.utc).timestamp()), **extra))
        except Exception:
            networks.append(dict(protocol=protocol, state='Unavailable · inventory read failed', count=None, device=None, last_heard=None))
        finally:
            if lock is not None: lock.release()
    return {'networks': networks, 'nodes': nodes, 'source': 'LOCAL_READ_ONLY', 'stale_after_seconds': 3600}
