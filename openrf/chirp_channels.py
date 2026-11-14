"""Offline, import-only CHIRP CSV memory profiles for Baofeng radios."""
from __future__ import annotations
import csv
import io
import json
import math

MODELS = {'UV-5R','BF-F8HP','OTHER'}

def init(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS radio_channel_profiles (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, model TEXT NOT NULL,
        channel_json TEXT NOT NULL, created_utc TEXT NOT NULL
    );''')


def import_csv(repo, name, model, csv_text):
    from .camera_catalog import utc_now
    if not isinstance(name,str) or not 1<=len(name.strip())<=100:
        raise ValueError('Name this imported radio profile (1–100 characters).')
    if model not in MODELS:raise ValueError('Select a supported radio profile model.')
    if not isinstance(csv_text,str) or len(csv_text.encode('utf-8'))>262144:
        raise ValueError('CHIRP CSV must be text under 256 KiB.')
    try:
        reader=csv.DictReader(io.StringIO(csv_text.lstrip('\ufeff'),newline=''))
        headings=set(reader.fieldnames or [])
        if not {'Location','Frequency'}.issubset(headings):
            raise ValueError('Select a CHIRP CSV export containing Location and Frequency columns.')
        channels=[]
        for row in reader:
            if len(channels)>=500:raise ValueError('CHIRP CSV exceeds 500 channels.')
            if not row or not str(row.get('Frequency','')).strip():continue
            freq=float(row['Frequency'])
            if not math.isfinite(freq) or not 0.1<=freq<=1000:
                raise ValueError('CHIRP CSV contains an invalid frequency.')
            number=int(row.get('Location',''))
            if number<0 or number>9999:raise ValueError('Invalid CHIRP channel number.')
            def text(key,n):return str(row.get(key) or '').strip()[:n]
            channels.append({'location':number,'name':text('Name',80),'frequency_mhz':freq,
                'duplex':text('Duplex',20),'offset_mhz':text('Offset',30),
                'tone':text('Tone',30),'rtone_hz':text('rToneFreq',30),
                'ctone_hz':text('cToneFreq',30),'mode':text('Mode',20),'comment':text('Comment',200)})
    except (TypeError,ValueError,OverflowError,csv.Error) as exc:
        raise ValueError(f'Invalid CHIRP CSV: {exc}') from exc
    if not channels:raise ValueError('No usable CHIRP channels were found.')
    with repo._lock,repo._connect() as db:
        cur=db.execute('INSERT INTO radio_channel_profiles(name,model,channel_json,created_utc) VALUES(?,?,?,?)',
          (name.strip(),model,json.dumps(channels,separators=(',',':')),utc_now()))
    return {'id':cur.lastrowid,'name':name.strip(),'model':model,'channel_count':len(channels)}


def profiles(repo):
    with repo._lock,repo._connect() as db:
        rows=db.execute('SELECT id,name,model,channel_json,created_utc FROM radio_channel_profiles ORDER BY id DESC LIMIT 30').fetchall()
    return [{'id':r['id'],'name':r['name'],'model':r['model'],
             'created_utc':r['created_utc'],'channels':json.loads(r['channel_json'])} for r in rows]


def delete(repo,ident):
    if type(ident) is not int or ident<1:raise ValueError('Invalid profile ID')
    with repo._lock,repo._connect() as db:
        cur=db.execute('DELETE FROM radio_channel_profiles WHERE id=?',(ident,))
        return bool(cur.rowcount)
