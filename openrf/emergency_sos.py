"""Strictly local SOS draft formatting. Browser fixes are unverified claims."""
from __future__ import annotations

import math

TEMPLATES = {
    'NEED_HELP': 'I need assistance.',
    'SAFE': 'I am safe.',
    'EVACUATING': 'I am evacuating.',
    'CHECK_IN': 'Checking in. Please reply when you can.',
}


def compose_draft(payload):
    if not isinstance(payload, dict) or set(payload) != {'template','recipient','message','location'}:
        raise ValueError('Invalid emergency draft fields')
    template = payload['template']
    if not isinstance(template, str) or template not in TEMPLATES:
        raise ValueError('Unsupported emergency message template')
    recipient, message = payload['recipient'], payload['message']
    if not isinstance(recipient, str) or len(recipient.strip()) > 100:
        raise ValueError('Recipient label must be at most 100 characters')
    if not isinstance(message, str) or len(message.strip()) > 600:
        raise ValueError('Message must be at most 600 characters')
    label = recipient.strip() or 'Unspecified recipient'
    lines = [f'UNSENT EMERGENCY DRAFT — {template.replace("_", " ")}',
             f'For: {label}', TEMPLATES[template]]
    if message.strip():
        lines.append(message.strip())
    location = payload['location']
    if location is not None:
        if not isinstance(location, dict) or set(location) != {'latitude','longitude','accuracy_m','age_seconds'}:
            raise ValueError('Invalid browser location fields')
        values = {}
        for field, minimum, maximum in (('latitude',-90,90),('longitude',-180,180),
                                        ('accuracy_m',0,1_000_000),('age_seconds',0,60)):
            value = location[field]
            if isinstance(value, bool) or not isinstance(value, (float,int)) or not math.isfinite(value) or not minimum <= value <= maximum:
                raise ValueError(f'Invalid or stale browser {field}')
            values[field] = value
        lines.append(f'Browser-reported location (NOT independently verified): '
                     f'{values["latitude"]:.6f}, {values["longitude"]:.6f}')
        lines.append(f'Browser accuracy ±{values["accuracy_m"]:.0f} m; fix age at drafting {values["age_seconds"]:.0f} s.')
    else:
        lines.append('No location attached.')
    lines.append('LOCAL DRAFT ONLY. NOT TRANSMITTED. Delivery NOT attempted.')
    return {'kind':'sos_draft','title':f'{template.replace("_", " ")} · {label}',
            'details':'\n'.join(lines)}
