"""Constrained, data-only offline reference packs; never execute imported content."""
from __future__ import annotations

import hashlib
import json

PACK_FORMAT = 'openrf-emergency-pack-v1'

STARTER_PACK = {
    'format': PACK_FORMAT,
    'name': 'OpenRF Field Readiness Starter',
    'version': '1.0',
    'publisher': 'OpenRF project',
    'license': 'CC0-1.0',
    'entries': [
        {'title':'Before leaving: offline device check', 'category':'Device readiness',
         'content':'Charge the OpenRF battery and any companion radios. Verify a real GNSS fix outside, then test offline map coverage. Test a message to another reachable, compatible device; a queued message is not proof of delivery. Check antenna connections and pack a charging cable. Save important meeting points before leaving connectivity.'},
        {'title':'Family communications planning worksheet', 'category':'Communication planning',
         'content':'Agree on two meeting points and a contact outside the affected area. Record who carries each device and when to check in. Plan what to do if every radio and network is unavailable. Keep paper copies of key numbers and locations. Discuss the plan with everyone before an emergency.'},
        {'title':'Emergency supply inventory worksheet', 'category':'Preparedness',
         'content':'Review drinking water, food, essential medication, first-aid supplies, flashlight, spare batteries, warm clothing, cash, identification copies and charging equipment. Record quantities and expiration dates in your own local checklist. Follow current official instructions for hazards and evacuation; this worksheet is not a substitute for local emergency guidance.'},
    ],
}


def validate_pack(pack):
    if not isinstance(pack, dict) or set(pack) != {'format','name','version','publisher','license','entries'}:
        raise ValueError('Invalid offline pack fields')
    if pack['format'] != PACK_FORMAT:
        raise ValueError('Unsupported offline pack format')
    result = {'format':PACK_FORMAT}
    for field, limit in {'name':120,'version':40,'publisher':160,'license':80}.items():
        value = pack[field]
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError(f'Invalid pack {field}')
        result[field] = value.strip()
    entries = pack['entries']
    if not isinstance(entries, list) or not 1 <= len(entries) <= 20:
        raise ValueError('Pack must contain 1–20 entries')
    result['entries'] = []
    for item in entries:
        if not isinstance(item, dict) or set(item) != {'title','category','content'}:
            raise ValueError('Invalid pack entry')
        checked = {}
        for field, limit in {'title':120,'category':60,'content':12000}.items():
            value = item[field]
            if not isinstance(value, str) or not value.strip() or len(value) > limit:
                raise ValueError(f'Invalid entry {field}')
            checked[field] = value.strip()
        result['entries'].append(checked)
    if len(json.dumps(result).encode('utf-8')) > 180000:
        raise ValueError('Pack is too large')
    return result


def pack_hash(pack):
    return hashlib.sha256(json.dumps(pack,sort_keys=True,ensure_ascii=False,
                                    separators=(',',':')).encode('utf-8')).hexdigest()
