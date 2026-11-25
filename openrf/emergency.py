"""Local-only emergency planning records. No network transmission occurs here."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
import threading
import hashlib
from datetime import datetime, timezone
from .emergency_packs import validate_pack, pack_hash
from .device_survival import PREFLIGHT


KINDS = {'contact', 'meeting_point', 'checklist', 'sos_draft'}
LIMITS = {'title': 120, 'details': 1200}


def validate_record(data):
    if not isinstance(data, dict) or set(data) != {'kind', 'title', 'details'}:
        raise ValueError('Provide kind, title, and details only')
    kind = data['kind']
    if not isinstance(kind, str) or kind not in KINDS:
        raise ValueError('Unsupported emergency record kind')
    result = {'kind': kind}
    for field, maximum in LIMITS.items():
        value = data[field]
        if not isinstance(value, str) or len(value.strip()) > maximum:
            raise ValueError(f'{field} must be text of at most {maximum} characters')
        result[field] = value.strip()
    if not result['title']:
        raise ValueError('Title is required')
    return result


class EmergencyStore:
    def __init__(self, database_path):
        self.path = str(database_path)
        self.lock = threading.RLock()
        with self._connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS emergency_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                created_utc TEXT NOT NULL)''')
            db.execute('''CREATE TABLE IF NOT EXISTS emergency_library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                source TEXT NOT NULL,
                content TEXT NOT NULL,
                created_utc TEXT NOT NULL)''')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(emergency_library)')}
            if 'pack_hash' not in columns:
                db.execute('ALTER TABLE emergency_library ADD COLUMN pack_hash TEXT')
            db.execute('CREATE UNIQUE INDEX IF NOT EXISTS emergency_library_pack_unique ON emergency_library(pack_hash,title,category) WHERE pack_hash IS NOT NULL')
            db.execute('''CREATE TABLE IF NOT EXISTS emergency_send_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                draft_id INTEGER NOT NULL,
                transport TEXT NOT NULL,
                destination TEXT NOT NULL,
                status TEXT NOT NULL,
                attempted_utc TEXT NOT NULL,
                outbound_text TEXT,
                channel INTEGER,
                packet_id INTEGER)''')
            attempt_columns={row['name'] for row in db.execute('PRAGMA table_info(emergency_send_attempts)')}
            for field, dtype in (('outbound_text','TEXT'),('channel','INTEGER'),('packet_id','INTEGER')):
                if field not in attempt_columns:
                    db.execute(f'ALTER TABLE emergency_send_attempts ADD COLUMN {field} {dtype}')
            db.execute('''CREATE TABLE IF NOT EXISTS emergency_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                draft_id INTEGER NOT NULL,
                transport TEXT NOT NULL,
                destination TEXT NOT NULL,
                channel INTEGER,
                outbound_text TEXT NOT NULL,
                state TEXT NOT NULL,
                created_utc TEXT NOT NULL,
                last_attempt_utc TEXT)''')
            # Never silently repeat an interrupted transmit after restart.
            db.execute("UPDATE emergency_outbox SET state='UNCERTAIN_AFTER_RESTART' WHERE state='SENDING'")
            db.execute('''CREATE TABLE IF NOT EXISTS emergency_team_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_name TEXT NOT NULL,
                alias TEXT NOT NULL,
                transport TEXT NOT NULL,
                destination TEXT NOT NULL,
                channel INTEGER,
                UNIQUE(group_name,transport,destination,channel))''')
            outbox_columns={row['name'] for row in db.execute('PRAGMA table_info(emergency_outbox)')}
            if 'group_name' not in outbox_columns:
                db.execute('ALTER TABLE emergency_outbox ADD COLUMN group_name TEXT')
            db.execute('''CREATE TABLE IF NOT EXISTS emergency_checkins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person TEXT NOT NULL,
                status TEXT NOT NULL,
                note TEXT NOT NULL,
                source TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                accuracy_m REAL,
                recorded_utc TEXT NOT NULL)''')
            checkin_columns={row['name'] for row in db.execute('PRAGMA table_info(emergency_checkins)')}
            for name in ('origin_transport','origin_sender','origin_received_utc'):
                if name not in checkin_columns:
                    db.execute(f'ALTER TABLE emergency_checkins ADD COLUMN {name} TEXT')
            db.execute('''CREATE TABLE IF NOT EXISTS emergency_inbox_review (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fingerprint TEXT NOT NULL UNIQUE,
                transport TEXT NOT NULL,
                sender TEXT NOT NULL,
                received_utc TEXT NOT NULL,
                body TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'PENDING',
                imported_utc TEXT NOT NULL,
                checkin_id INTEGER)''')
            db.execute('''CREATE TABLE IF NOT EXISTS emergency_preflight (
                item_key TEXT PRIMARY KEY,
                confirmed_utc TEXT NOT NULL)''')

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db: yield db
        finally:
            db.close()

    def list(self):
        with self.lock, self._connect() as db:
            rows = db.execute('SELECT * FROM emergency_records ORDER BY id DESC').fetchall()
            return [dict(row) for row in rows]

    def add(self, payload):
        data = validate_record(payload)
        stamp = datetime.now(timezone.utc).isoformat(timespec='seconds')
        with self.lock, self._connect() as db:
            cursor = db.execute('INSERT INTO emergency_records (kind,title,details,created_utc) VALUES (?,?,?,?)',
                                (data['kind'], data['title'], data['details'], stamp))
            db.commit()
            return {'id': cursor.lastrowid, **data, 'completed': 0, 'created_utc': stamp}

    def complete(self, record_id, completed):
        if not isinstance(completed, bool):
            raise ValueError('completed must be true or false')
        with self.lock, self._connect() as db:
            row = db.execute('SELECT kind FROM emergency_records WHERE id=?', (record_id,)).fetchone()
            if not row or row['kind'] != 'checklist':
                return False
            db.execute('UPDATE emergency_records SET completed=? WHERE id=?', (int(completed), record_id))
            db.commit()
            return True

    def delete(self, record_id):
        with self.lock, self._connect() as db:
            cursor = db.execute('DELETE FROM emergency_records WHERE id=?', (record_id,))
            if cursor.rowcount:
                db.execute('DELETE FROM emergency_send_attempts WHERE draft_id=?',(record_id,))
                db.execute('DELETE FROM emergency_outbox WHERE draft_id=?',(record_id,))
            db.commit()
            return bool(cursor.rowcount)

    def get_sos_draft(self, record_id):
        with self.lock, self._connect() as db:
            row=db.execute('SELECT * FROM emergency_records WHERE id=? AND kind=?',
                           (record_id,'sos_draft')).fetchone()
            return dict(row) if row else None

    def record_send_attempt(self, draft_id, transport, destination, status, *, text=None, channel=None, packet_id=None):
        if transport not in ('meshtastic','reticulum') or status not in (
            'SUBMITTED_TO_RADIO_NOT_DELIVERED', 'QUEUED_WITH_LXMF_NOT_DELIVERED',
            'PATH_REQUESTED_NOT_SENT','NO_RECALLED_IDENTITY_NOT_SENT','SEND_FAILED_NOT_DELIVERED'):
            raise ValueError('Unknown emergency handoff state')
        if text is not None and (not isinstance(text,str) or len(text.encode('utf-8'))>1024):
            raise ValueError('Invalid stored handoff text')
        if channel is not None and (type(channel) is not int or not 0<=channel<=7):
            raise ValueError('Invalid stored channel')
        if packet_id is not None and (type(packet_id) is not int or not 0<=packet_id<=2**32-1):
            packet_id=None
        stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
        with self.lock, self._connect() as db:
            cursor=db.execute('''INSERT INTO emergency_send_attempts
                (draft_id,transport,destination,status,attempted_utc,outbound_text,channel,packet_id)
                VALUES (?,?,?,?,?,?,?,?)''',
                (draft_id,transport,destination,status,stamp,text,channel,packet_id))
            db.commit()
            return {'id':cursor.lastrowid,'draft_id':draft_id,'transport':transport,'destination':destination,
                    'status':status,'attempted_utc':stamp,'outbound_text':text,'channel':channel,
                    'packet_id':packet_id,'delivered_to_person':False}

    def refresh_mesh_receipts(self, messages):
        """Only correlate real Meshtastic SDK routing result to an exact submitted packet."""
        if not isinstance(messages,list):
            return 0
        with self.lock, self._connect() as db:
            updated=0
            for message in messages:
                if not isinstance(message,dict) or message.get('direction')!='OUT':
                    continue
                status=message.get('delivery')
                packet_id=message.get('packet_id')
                if status not in ('ROUTING_ACK_REPORTED_NOT_READ','ROUTING_ERROR_REPORTED') or type(packet_id) is not int:
                    continue
                cursor=db.execute('''UPDATE emergency_send_attempts SET status=?
                    WHERE transport='meshtastic' AND packet_id=? AND destination=?
                    AND channel=? AND outbound_text=? AND status='SUBMITTED_TO_RADIO_NOT_DELIVERED' ''',
                    (status,packet_id,message.get('node'),message.get('channel'),message.get('text')))
                updated+=cursor.rowcount
            db.commit()
            return updated

    def send_attempts(self, draft_id):
        with self.lock, self._connect() as db:
            rows=db.execute('SELECT * FROM emergency_send_attempts WHERE draft_id=? ORDER BY id DESC LIMIT 30',(draft_id,)).fetchall()
            return [dict(row) for row in rows]

    def queue_message(self, draft_id, transport, destination, channel, text):
        if not isinstance(text,str) or not text.strip() or len(text.encode('utf-8'))>1024:
            raise ValueError('Invalid queued emergency text')
        if transport not in ('meshtastic','reticulum') or not isinstance(destination,str):
            raise ValueError('Invalid queued transport')
        with self.lock, self._connect() as db:
            if not db.execute('SELECT 1 FROM emergency_records WHERE id=? AND kind=?',(draft_id,'sos_draft')).fetchone():
                raise ValueError('Unknown SOS draft')
            stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
            cursor=db.execute('''INSERT INTO emergency_outbox
                (draft_id,transport,destination,channel,outbound_text,state,created_utc)
                VALUES (?,?,?,?,?,?,?)''',(draft_id,transport,destination,channel,text,'READY_LOCAL_ONLY',stamp))
            db.commit()
            return {'id':cursor.lastrowid,'state':'READY_LOCAL_ONLY','created_utc':stamp}

    def outbox(self):
        with self.lock, self._connect() as db:
            return [dict(row) for row in db.execute('SELECT * FROM emergency_outbox ORDER BY id DESC LIMIT 100')]

    def claim_queued(self, entry_id):
        """Atomically claim one manual send; never auto-resend on server recovery."""
        with self.lock, self._connect() as db:
            cursor=db.execute("UPDATE emergency_outbox SET state='SENDING' WHERE id=? AND state='READY_LOCAL_ONLY'",(entry_id,))
            row=db.execute('SELECT * FROM emergency_outbox WHERE id=?',(entry_id,)).fetchone()
            db.commit()
            return dict(row) if cursor.rowcount and row else None

    def finish_queued(self, entry_id, status):
        if status not in ('SUBMITTED_TO_RADIO_NOT_DELIVERED','QUEUED_WITH_LXMF_NOT_DELIVERED',
                          'PATH_REQUESTED_NOT_SENT','NO_RECALLED_IDENTITY_NOT_SENT','SEND_FAILED_NOT_DELIVERED'):
            raise ValueError('Invalid outbox result')
        stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
        with self.lock, self._connect() as db:
            db.execute("UPDATE emergency_outbox SET state=?,last_attempt_utc=? WHERE id=? AND state='SENDING'",
                       (status,stamp,entry_id))
            db.commit()

    def prepare_queued_retry(self, entry_id):
        with self.lock, self._connect() as db:
            cursor=db.execute('''UPDATE emergency_outbox SET state='READY_LOCAL_ONLY' WHERE id=? AND state IN
                ('SEND_FAILED_NOT_DELIVERED','PATH_REQUESTED_NOT_SENT','NO_RECALLED_IDENTITY_NOT_SENT','UNCERTAIN_AFTER_RESTART')''',(entry_id,))
            db.commit()
            return bool(cursor.rowcount)

    def delete_queued(self, entry_id):
        with self.lock, self._connect() as db:
            cursor=db.execute("DELETE FROM emergency_outbox WHERE id=? AND state!='SENDING'",(entry_id,))
            db.commit()
            return bool(cursor.rowcount)

    def team_members(self):
        with self.lock, self._connect() as db:
            return [dict(row) for row in db.execute('SELECT * FROM emergency_team_members ORDER BY group_name,alias,id LIMIT 200')]

    def add_team_member(self, group_name, alias, transport, destination, channel):
        for label,value,maximum in (('group_name',group_name,60),('alias',alias,80),('destination',destination,40)):
            if not isinstance(value,str) or not value.strip() or len(value)>maximum:
                raise ValueError(f'Invalid {label}')
        if transport not in ('meshtastic','reticulum'):
            raise ValueError('Unsupported team member transport')
        group_name,alias,destination=group_name.strip(),alias.strip(),destination.strip().lower()
        with self.lock, self._connect() as db:
            count=db.execute('SELECT COUNT(*) FROM emergency_team_members WHERE group_name=?',(group_name,)).fetchone()[0]
            if count>=10:
                raise ValueError('Each team is limited to 10 configured recipients')
            if db.execute('''SELECT 1 FROM emergency_team_members WHERE group_name=? AND
                transport=? AND destination=? AND (channel=? OR (channel IS NULL AND ? IS NULL))''',
                (group_name,transport,destination,channel,channel)).fetchone():
                raise ValueError('This recipient is already in the group')
            try:
                cursor=db.execute('INSERT INTO emergency_team_members (group_name,alias,transport,destination,channel) VALUES (?,?,?,?,?)',
                    (group_name,alias,transport,destination,channel))
                db.commit()
            except sqlite3.IntegrityError as exc:
                raise ValueError('This recipient is already in the group') from exc
            return {'id':cursor.lastrowid,'group_name':group_name,'alias':alias,
                    'transport':transport,'destination':destination,'channel':channel}

    def delete_team_member(self, member_id):
        with self.lock, self._connect() as db:
            cursor=db.execute('DELETE FROM emergency_team_members WHERE id=?',(member_id,))
            db.commit()
            return bool(cursor.rowcount)

    def queue_team(self, draft_id, group_name, deliveries):
        """All-or-nothing local copy to each explicitly configured team recipient."""
        if not isinstance(group_name,str) or not group_name.strip() or len(group_name)>60:
            raise ValueError('Invalid team name')
        if not isinstance(deliveries,list) or not 1<=len(deliveries)<=10:
            raise ValueError('Team queue must include 1–10 recipients')
        with self.lock, self._connect() as db:
            if not db.execute('SELECT 1 FROM emergency_records WHERE id=? AND kind=?',(draft_id,'sos_draft')).fetchone():
                raise ValueError('Unknown SOS draft')
            rows=db.execute('SELECT * FROM emergency_team_members WHERE group_name=? ORDER BY id',(group_name,)).fetchall()
            if len(rows)!=len(deliveries):
                raise ValueError('Team changed while preparing messages; refresh before queueing')
            for row,item in zip(rows,deliveries):
                if not isinstance(item,dict) or set(item)!={'member_id','text'} or item['member_id']!=row['id'] or not isinstance(item['text'],str):
                    raise ValueError('Prepared recipients do not match the saved team')
                size=len(item['text'].encode('utf-8'))
                if not item['text'].strip() or size>(180 if row['transport']=='meshtastic' else 1024):
                    raise ValueError('Team message exceeds recipient transport limits')
            stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
            ids=[]
            for row,item in zip(rows,deliveries):
                cursor=db.execute('''INSERT INTO emergency_outbox
                    (draft_id,transport,destination,channel,outbound_text,state,created_utc,group_name)
                    VALUES (?,?,?,?,?,?,?,?)''',(draft_id,row['transport'],row['destination'],row['channel'],
                                                  item['text'],'READY_LOCAL_ONLY',stamp,group_name))
                ids.append(cursor.lastrowid)
            db.commit()
            return {'queued':len(ids),'outbox_ids':ids,'sent':False,'team':group_name}

    def add_checkin(self, payload):
        import math
        if not isinstance(payload,dict) or set(payload)!={'person','status','note','source','location'}:
            raise ValueError('Invalid check-in fields')
        person,note=payload['person'],payload['note']
        if not isinstance(person,str) or not person.strip() or len(person.strip())>80:
            raise ValueError('Person label must be 1–80 characters')
        if not isinstance(note,str) or len(note.strip())>500:
            raise ValueError('Check-in note is too long')
        if payload['status'] not in ('SAFE','NEED_HELP','EVACUATING','CHECK_IN') or payload['source'] not in ('SELF_REPORTED','MANUAL_SECONDHAND'):
            raise ValueError('Invalid check-in status or source')
        location=payload['location']
        lat=lon=accuracy=None
        if location is not None:
            if not isinstance(location,dict) or set(location)!={'latitude','longitude','accuracy_m','age_seconds'}:
                raise ValueError('Invalid check-in location')
            numbers={}
            for name,minimum,maximum in (('latitude',-90,90),('longitude',-180,180),('accuracy_m',0,1_000_000),('age_seconds',0,60)):
                value=location[name]
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not minimum<=value<=maximum:
                    raise ValueError('Location must be a fresh browser-reported fix')
                numbers[name]=float(value)
            if payload['source']!='SELF_REPORTED':
                raise ValueError('Secondhand reports cannot claim browser GPS evidence')
            lat,lon,accuracy=numbers['latitude'],numbers['longitude'],numbers['accuracy_m']
        stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
        with self.lock, self._connect() as db:
            cursor=db.execute('''INSERT INTO emergency_checkins
                (person,status,note,source,latitude,longitude,accuracy_m,recorded_utc)
                VALUES (?,?,?,?,?,?,?,?)''',(person.strip(),payload['status'],note.strip(),payload['source'],lat,lon,accuracy,stamp))
            db.commit()
            return {'id':cursor.lastrowid,'person':person.strip(),'status':payload['status'],'note':note.strip(),
                    'source':payload['source'],'latitude':lat,'longitude':lon,'accuracy_m':accuracy,'recorded_utc':stamp}

    def checkins(self):
        with self.lock, self._connect() as db:
            return [dict(row) for row in db.execute('SELECT * FROM emergency_checkins ORDER BY id DESC LIMIT 100')]

    def delete_checkin(self, ident):
        with self.lock, self._connect() as db:
            cursor=db.execute('DELETE FROM emergency_checkins WHERE id=?',(ident,))
            db.commit()
            return bool(cursor.rowcount)

    def preflight(self):
        with self.lock, self._connect() as db:
            checks={r['item_key']:r['confirmed_utc'] for r in db.execute('SELECT item_key,confirmed_utc FROM emergency_preflight')}
        return [{'key':key,'label':label,'confirmed':key in checks,'confirmed_utc':checks.get(key)}
                for key,label in PREFLIGHT.items()]

    def set_preflight(self, key, checked):
        if not isinstance(key,str) or key not in PREFLIGHT or type(checked) is not bool:
            raise ValueError('Unknown pre-departure check or checkbox state')
        stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
        with self.lock, self._connect() as db:
            if checked:
                db.execute('INSERT OR REPLACE INTO emergency_preflight(item_key,confirmed_utc) VALUES (?,?)',(key,stamp))
            else:
                db.execute('DELETE FROM emergency_preflight WHERE item_key=?',(key,))
            db.commit()
        return {'key':key,'confirmed':checked,'confirmed_utc':stamp if checked else None,
                'human_attested':True,'hardware_verified':False}

    def import_radio_candidates(self, transport, messages):
        """Explicit user-initiated inbox snapshot; does not authenticate or publish reports."""
        if transport not in ('meshtastic','reticulum') or not isinstance(messages,list):
            raise ValueError('Invalid radio inbox')
        imported=0
        stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
        with self.lock, self._connect() as db:
            for message in messages[-1000:]:
                if not isinstance(message,dict) or message.get('direction')!='IN':
                    continue
                sender=message.get('node' if transport=='meshtastic' else 'destination')
                body=message.get('text')
                received=message.get('received_at_utc' if transport=='meshtastic' else 'utc')
                if not all(isinstance(v,str) for v in (sender,body,received)):
                    continue
                if not (0<len(sender)<=120 and 0<len(body)<=1024 and 10<=len(received)<=45):
                    continue
                if transport=='meshtastic' and message.get('source')!='MESHTASTIC_RADIO':
                    continue
                if transport=='reticulum' and message.get('status')!='RECEIVED_VALID_SIGNATURE':
                    continue
                fingerprint=hashlib.sha256(repr((transport,sender,received,body)).encode('utf-8')).hexdigest()
                cursor=db.execute('''INSERT OR IGNORE INTO emergency_inbox_review
                    (fingerprint,transport,sender,received_utc,body,imported_utc) VALUES (?,?,?,?,?,?)''',
                    (fingerprint,transport,sender,received,body,stamp))
                imported+=cursor.rowcount
            db.commit()
        return imported

    def inbox_candidates(self):
        with self.lock, self._connect() as db:
            return [dict(r) for r in db.execute('''SELECT id,transport,sender,received_utc,body,state,imported_utc,checkin_id
                FROM emergency_inbox_review ORDER BY id DESC LIMIT 200''')]

    def review_radio_candidate(self, ident, decision, payload):
        if decision not in ('accept','discard') or type(ident) is not int or ident<=0:
            raise ValueError('Invalid inbox action')
        if decision=='discard' and payload:
            raise ValueError('Discard requires no fields')
        if decision=='accept':
            if not isinstance(payload,dict) or set(payload)!={'person','status','note'}:
                raise ValueError('Review requires person, status and note')
            # Reuse check-in validation, without permitting remote location assertions.
            person,note=payload['person'],payload['note']
            if not isinstance(person,str) or not 0<len(person.strip())<=80 or not isinstance(note,str) or len(note.strip())>500:
                raise ValueError('Invalid reviewed check-in fields')
            if payload['status'] not in ('SAFE','NEED_HELP','EVACUATING','CHECK_IN'):
                raise ValueError('Invalid reviewed status')
        with self.lock, self._connect() as db:
            candidate=db.execute('SELECT * FROM emergency_inbox_review WHERE id=?',(ident,)).fetchone()
            if candidate is None or candidate['state']!='PENDING':
                raise ValueError('Inbox entry missing or already reviewed')
            checkin_id=None
            if decision=='accept':
                stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
                cursor=db.execute('''INSERT INTO emergency_checkins
                    (person,status,note,source,recorded_utc,origin_transport,origin_sender,origin_received_utc)
                    VALUES (?,?,?,?,?,?,?,?)''',(person.strip(),payload['status'],note.strip(),
                    'RADIO_MESSAGE_REVIEWED',stamp,candidate['transport'],candidate['sender'],candidate['received_utc']))
                checkin_id=cursor.lastrowid
            db.execute('UPDATE emergency_inbox_review SET state=?,checkin_id=? WHERE id=?',
                       ('ACCEPTED' if decision=='accept' else 'DISCARDED',checkin_id,ident))
            db.commit()
            return {'state':'ACCEPTED' if decision=='accept' else 'DISCARDED',
                    'checkin_id':checkin_id,'authenticated_person':False,'location_verified':False}

    def add_reference(self, payload):
        if not isinstance(payload, dict) or set(payload) != {'title','category','source','content'}:
            raise ValueError('Provide title, category, source and content')
        data = {}
        for key, maximum in {'title':120,'category':60,'source':240,'content':12000}.items():
            value = payload[key]
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
                raise ValueError(f'{key} must be 1–{maximum} characters')
            data[key] = value.strip()
        stamp = datetime.now(timezone.utc).isoformat(timespec='seconds')
        with self.lock, self._connect() as db:
            cursor = db.execute('INSERT INTO emergency_library (title,category,source,content,created_utc) VALUES (?,?,?,?,?)',
                                (data['title'],data['category'],data['source'],data['content'],stamp))
            db.commit()
            return {'id':cursor.lastrowid, **data, 'created_utc':stamp}

    def search_references(self, query=''):
        if not isinstance(query, str) or len(query) > 120:
            raise ValueError('Search must be 120 characters or fewer')
        with self.lock, self._connect() as db:
            if not query.strip():
                rows = db.execute('SELECT * FROM emergency_library ORDER BY id DESC LIMIT 100').fetchall()
            else:
                # Avoid LIKE wildcards turning a literal search into a catch-all.
                needle = '%' + query.strip().replace('\\','\\\\').replace('%','\\%').replace('_','\\_') + '%'
                rows = db.execute('''SELECT * FROM emergency_library WHERE
                    title LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR
                    source LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\'
                    ORDER BY id DESC LIMIT 100''',(needle,)*4).fetchall()
            return [dict(row) for row in rows]

    def delete_reference(self, record_id):
        with self.lock, self._connect() as db:
            cursor = db.execute('DELETE FROM emergency_library WHERE id=?',(record_id,))
            db.commit()
            return bool(cursor.rowcount)

    def install_pack(self, payload):
        pack = validate_pack(payload)
        fingerprint = pack_hash(pack)
        stamp = datetime.now(timezone.utc).isoformat(timespec='seconds')
        source = f"{pack['publisher']} · {pack['name']} v{pack['version']} · {pack['license']}"
        with self.lock, self._connect() as db:
            imported = 0
            for entry in pack['entries']:
                cursor = db.execute('''INSERT OR IGNORE INTO emergency_library
                    (title,category,source,content,created_utc,pack_hash) VALUES (?,?,?,?,?,?)''',
                    (entry['title'],entry['category'],source,entry['content'],stamp,fingerprint))
                imported += cursor.rowcount
            db.commit()
        return {'pack':pack['name'],'version':pack['version'], 'imported':imported,
                'already_present':len(pack['entries'])-imported,
                'note':'Pack text is user-provided or project-authored; no independent accuracy verification was performed.'}
