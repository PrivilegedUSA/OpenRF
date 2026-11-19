"""Compact, opt-in text framing for emergency coordination; not authentication."""
from __future__ import annotations

import base64
import re
import secrets
import time

STATUS_CODES = {'SAFE':'S', 'NEED_HELP':'H', 'EVACUATING':'E', 'CHECK_IN':'C'}
REVERSE_STATUS = {v:k for k,v in STATUS_CODES.items()}
MESSAGE_ID = re.compile(r'[0-9a-f]{12}\Z')
TOKEN = re.compile(r'[A-Za-z0-9_-]*\Z')


def _encode(value):
    return base64.urlsafe_b64encode(value.encode('utf-8')).decode('ascii').rstrip('=')


def _decode(value):
    if not TOKEN.fullmatch(value):
        raise ValueError('Invalid check-in encoding')
    try:
        result=base64.b64decode(value+'='*((-len(value))%4),altchars=b'-_',validate=True).decode('utf-8')
    except (ValueError, UnicodeError) as exc:
        raise ValueError('Invalid check-in encoding') from exc
    if _encode(result)!=value:
        raise ValueError('Noncanonical check-in encoding')
    return result


def compose(payload, *, now=None, message_id=None):
    if not isinstance(payload,dict) or set(payload)!={'person','status','note'}:
        raise ValueError('Provide person, status and note')
    person,note,status=payload['person'],payload['note'],payload['status']
    if not isinstance(person,str) or not 0<len(person.strip())<=60 or any(ord(c)<32 for c in person):
        raise ValueError('Person label must be 1–60 printable characters')
    if not isinstance(note,str) or len(note)>160 or any(ord(c)<32 for c in note):
        raise ValueError('Note must be at most 160 printable characters')
    if not isinstance(status,str) or status not in STATUS_CODES:
        raise ValueError('Invalid check-in status')
    timestamp=int(time.time() if now is None else now)
    if type(timestamp) is not int or not 0<=timestamp<=4_102_444_800:
        raise ValueError('Invalid check-in time')
    ident=secrets.token_hex(6) if message_id is None else message_id
    if not isinstance(ident,str) or not MESSAGE_ID.fullmatch(ident):
        raise ValueError('Invalid check-in identifier')
    text=f'ORF1|C|{ident}|{timestamp}|{STATUS_CODES[status]}|{_encode(person.strip())}|{_encode(note.strip())}'
    if len(text.encode('utf-8'))>180:
        raise ValueError('Check-in exceeds 180-byte Meshtastic-safe text limit; shorten name or note')
    return {'text':text,'message_id':ident,'created_unix':timestamp,'status':status,'bytes':len(text.encode('utf-8')),
            'sent':False,'authenticated':False}


def compose_ack(message_id):
    if not isinstance(message_id,str) or not MESSAGE_ID.fullmatch(message_id):
        raise ValueError('Invalid check-in identifier')
    return f'ORF1|A|{message_id}'


def parse(text):
    if not isinstance(text,str) or len(text.encode('utf-8'))>180:
        return None
    parts=text.split('|')
    if len(parts)==3 and parts[:2]==['ORF1','A'] and MESSAGE_ID.fullmatch(parts[2]):
        return {'kind':'ACK_CLAIM','message_id':parts[2], 'delivery_verified':False,
                'note':'A text-level acknowledgment claim, not authenticated proof of human receipt.'}
    if len(parts)!=7 or parts[:2]!=['ORF1','C'] or not MESSAGE_ID.fullmatch(parts[2]):
        return None
    if not re.fullmatch(r'0|[1-9][0-9]{0,9}',parts[3]) or parts[4] not in REVERSE_STATUS:
        return None
    timestamp=int(parts[3])
    if timestamp>4_102_444_800:
        return None
    try:
        person,note=_decode(parts[5]),_decode(parts[6])
        if compose({'person':person,'status':REVERSE_STATUS[parts[4]],'note':note},
                   now=timestamp,message_id=parts[2])['text']!=text:
            return None
    except ValueError:
        return None
    return {'kind':'CHECKIN_CLAIM','message_id':parts[2], 'person_claim':person,
            'status_claim':REVERSE_STATUS[parts[4]],'note_claim':note,'sender_unix_claim':timestamp,
            'person_authenticated':False,'timestamp_verified':False,'location_verified':False}
