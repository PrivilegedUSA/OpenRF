"""Plan and run FCC H3 state compilation in a local workspace (no credentials persisted).

Resumption is at completed archive and state boundaries; an interrupted state
build restarts that state. No map renderer changes or automatic publishing.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import date, datetime, timezone
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler
import zipfile

from . import coverage_compact as compact, fcc_coverage as fcc

STATES = tuple('01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'.split())
API = 'https://broadbandmap.fcc.gov/api/public/map'
MAJOR = tuple(fcc.PROVIDERS)
KINDS = {'4glte','5gnr_7_1','5gnr_35_3','mobilevoice','5gnr'}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def say(msg):
    print(msg, flush=True)


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path, value):
    path = Path(path)
    tmp = path.with_name(path.name + '.tmp')
    with tmp.open('w', encoding='utf-8') as out:
        json.dump(value, out, indent=2, sort_keys=True)
        out.write('\n'); out.flush(); os.fsync(out.fileno())
    os.replace(tmp, path)


@contextmanager
def workspace_lock(work):
    # Linux/WSL: released by the OS even after interruption.
    import fcntl
    with (work/'job.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Another nationwide job is using this workspace') from None
        yield


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward FCC credential headers to another URL. Fail closed.
        raise ValueError('FCC returned a redirect; automatic redirects are disabled to protect credentials')


class FCCClient:
    def __init__(self, username=None, token=None):
        username = username or os.environ.get('FCC_USERNAME')
        token = token or os.environ.get('FCC_HASH_VALUE')
        if not username or not token or any('\r' in x or '\n' in x for x in (username, token)):
            raise ValueError('Set FCC_USERNAME and FCC_HASH_VALUE in this terminal (FCC account API token)')
        self.headers = {'username':username, 'hash_value':token, 'User-Agent':'OpenRF coverage compiler/0.2.240', 'Accept-Encoding':'identity'}
        self.opener = build_opener(NoRedirect())

    def request(self, path, extra=None):
        return self.opener.open(Request(API+path, headers={**self.headers, **(extra or {})}), timeout=90)

    def catalog(self, as_of):
        with self.request('/downloads/listAvailabilityData/'+date.fromisoformat(as_of).isoformat()) as response:
            raw = response.read(64*1024**2+1)
        if len(raw)>64*1024**2: raise ValueError('FCC catalog exceeds 64 MiB limit')
        return json.loads(raw)

    def download(self, file_id, extra=None):
        if not re.fullmatch(r'\d+', str(file_id)): raise ValueError('Invalid FCC file ID')
        # Format 1: shapefile. Only explicitly H3 catalog entries are accepted.
        return self.request(f'/downloads/downloadFile/availability/{file_id}/1', extra)


def identity(name):
    if not isinstance(name,str) or Path(name).name!=name or '\\' in name:
        raise ValueError('Unsafe FCC archive filename')
    if not name.lower().endswith('.zip'): name += '.zip'
    m = fcc.PATTERN.fullmatch(name)
    if not m: return None
    state, provider, kind, filing, revision = m.groups()
    return name, state, provider, kind.lower(), filing.upper(), datetime.strptime(revision,'%d%b%Y').date().isoformat()


def filing_of(as_of):
    d = date.fromisoformat(as_of)
    if (d.month,d.day) not in ((6,30),(12,31)):
        raise ValueError('Use a June 30 or December 31 FCC filing date')
    return ('J' if d.month==6 else 'D')+str(d.year)[-2:]


def catalog_entries(payload, as_of, states, providers):
    rows = payload.get('data') if isinstance(payload,dict) else payload
    if not isinstance(rows,list): raise ValueError('Unrecognized FCC catalog response; expected a data list')
    entries = {}
    for row in rows:
        if not isinstance(row,dict): continue
        name = row.get('file_name')
        if not isinstance(name,str): continue
        ident = identity(name)
        if not ident: continue
        name,state,provider,kind,filing,revision = ident
        if state not in states or not provider or (providers and provider not in providers) or filing!=filing_of(as_of): continue
        if kind not in KINDS: continue
        # Only request shapefile from entries, not format-specific GPKG names.
        if re.search(r'(?:geo(?:package)?|gpkg)\s*(?:\(\d+\))?\.zip$',name,re.I): continue
        for field, expected in [('state_fips',state),('provider_id',provider)]:
            if row.get(field) not in (None,'') and str(row[field]).zfill(len(expected))!=expected:
                raise ValueError('FCC catalog identity conflicts with filename: '+name)
        fid = str(row.get('file_id',row.get('id','')))
        if not re.fullmatch(r'\d+',fid): raise ValueError('Missing numeric FCC file ID: '+name)
        key = (state,provider,kind)
        entry = dict(name=name,state=state,provider=provider,kind=kind,filing=filing,revision=revision,file_id=fid)
        old = entries.get(key)
        if old and old['revision']==revision and old!=entry: raise ValueError('Ambiguous FCC catalog entries: '+name)
        if not old or revision>old['revision']: entries[key]=entry
    return sorted(entries.values(),key=lambda x:(x['state'],x['provider'],x['kind']))


def local_entries(folder, as_of, states, providers):
    entries=[]
    groups=fcc.discover(folder)
    for (state,provider,kind),entry in sorted(_local_candidates(groups,as_of,states,providers).items()): entries.append(entry)
    return entries


def _local_candidates(groups,as_of,states,providers):
    out={}
    for key,files in sorted(groups.items(),key=lambda item:item[0][2]):
        state,filing,revision,*rest=key
        if state not in states or filing!=filing_of(as_of) or not rest or (providers and rest[0] not in providers): continue
        provider=rest[0]
        for kind,path in files.items():
            out[state,provider,kind]=dict(name=path.name,state=state,provider=provider,kind=kind,filing=filing,revision=revision,local=str(path.resolve()))
    return out


def make_plan(entries, as_of, states, providers, mode):
    if not entries: raise ValueError('No matching provider-specific H3 archives; check FCC catalog names, filing date or local folder')
    for state in states:
        rows=[e for e in entries if e['state']==state]
        if len({e['revision'] for e in rows})>1:
            raise ValueError(f'State {state} has mixed source revisions; select a consistent FCC release before building')
        for provider in {e['provider'] for e in rows}:
            kinds={e['kind'] for e in rows if e['provider']==provider}
            if '5gnr' in kinds and kinds & {'5gnr_7_1','5gnr_35_3'}:
                raise ValueError(f'State {state} provider {provider}: ambiguous combined and individual 5G files')
    return dict(format='openrf-fcc-build-plan',version=1,created_at=now(),as_of=as_of,states=list(states),providers=list(providers),mode=mode,entries=entries)


def check_plan(plan):
    if plan.get('format')!='openrf-fcc-build-plan' or plan.get('version')!=1 or plan.get('mode') not in ('fcc','local'):
        raise ValueError('Unsupported build plan')
    states=plan['states']; providers=plan['providers']; as_of=plan['as_of']
    if not states or len(set(states))!=len(states) or not set(states)<=set(STATES): raise ValueError('Invalid planned states')
    if any(not re.fullmatch(r'\d{6}',p) for p in providers): raise ValueError('Invalid provider selection')
    keys=set()
    for e in plan['entries']:
        ident=identity(e['name'])
        if ident!=(e['name'],e['state'],e['provider'],e['kind'],e['filing'],e['revision']) or e['state'] not in states or not e['provider'] or (providers and e['provider'] not in providers) or e['filing']!=filing_of(as_of):
            raise ValueError('Inconsistent build plan entry')
        key=(e['state'],e['provider'],e['kind'])
        if key in keys: raise ValueError('Duplicate build plan entry')
        keys.add(key)
        if plan['mode']=='fcc' and not re.fullmatch(r'\d+',str(e.get('file_id',''))): raise ValueError('Invalid planned FCC file ID')
        if plan['mode']=='local' and not isinstance(e.get('local'),str): raise ValueError('Missing local source')
    make_plan(plan['entries'],as_of,states,providers,plan['mode'])


def archive_check(path, entry, expected_format=None):
    fmt=fcc.archive_format(path)
    if expected_format and fmt!=expected_format: raise ValueError('FCC returned unexpected GIS format')
    # Validate member identity independently of the outer filename; inner date may be older.
    with zipfile.ZipFile(path) as z:
        ext='.shp' if fmt=='shapefile' else '.gpkg'
        member=next(i for i in z.infolist() if i.filename.lower().endswith(ext))
        ident=identity(Path(member.filename).stem+'.zip')
        if not ident or ident[1:5]!=(entry['state'],entry['provider'],entry['kind'],entry['filing']):
            raise ValueError('FCC archive member identity differs from planned H3 dataset')
        bad=z.testzip()
        if bad: raise ValueError('Corrupt ZIP member: '+bad)
    # inspect_zip relies on the actual outer basename for provider identity.
    total,_,_=fcc.inspect_zip(path,entry['kind'])
    return total


def download_archive(client, entry, dest, progress=say):
    """Reuse verified finished archives. Retain partial bytes only with strong ETag.

    HTTP servers without range/ETag support restart the current file safely.
    """
    target=dest/entry['name']; receipt=target.with_suffix('.zip.receipt.json')
    if target.exists():
        if not receipt.exists(): raise ValueError('Untracked downloaded archive: '+target.name)
        r=json.loads(receipt.read_text())
        if r.get('file_id')!=entry['file_id'] or r.get('sha256')!=digest(target): raise ValueError('Cached archive mismatch: '+target.name)
        progress('Reusing verified '+target.name); return target
    partial=target.with_suffix('.zip.part'); resume=target.with_suffix('.zip.part.json')
    for attempt in range(3):
        try:
            offset=0; etag=None
            if partial.exists() and resume.exists():
                old=json.loads(resume.read_text())
                if old.get('file_id')==entry['file_id'] and isinstance(old.get('etag'),str) and old['etag'].startswith('"'):
                    offset=partial.stat().st_size; etag=old['etag']
            if not offset:
                partial.unlink(missing_ok=True); resume.unlink(missing_ok=True)
            extra={'Range':f'bytes={offset}-','If-Range':etag} if offset else {}
            try:
                response=client.download(entry['file_id'],extra)
            except HTTPError as exc:
                if exc.code==416 and offset:
                    partial.unlink(missing_ok=True); resume.unlink(missing_ok=True); continue
                raise
            with response:
                status=response.getcode(); h=response.headers
                if status==206:
                    m=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',h.get('Content-Range',''))
                    if not offset or not m or int(m[1])!=offset or int(m[2])+1!=int(m[3]) or h.get('ETag')!=etag:
                        partial.unlink(missing_ok=True); resume.unlink(missing_ok=True)
                        raise ValueError('FCC returned inconsistent partial content; retry command')
                    total=int(m[3])
                elif status==200:
                    # Discard old bytes before recording a potentially new entity tag.
                    partial.unlink(missing_ok=True)
                    offset=0
                    total=int(h['Content-Length']) if h.get('Content-Length','').isdigit() else None
                else: raise ValueError(f'Unexpected HTTP status {status}')
                write_json(resume,dict(file_id=entry['file_id'],etag=h.get('ETag')))
                if total is not None and shutil.disk_usage(dest).free < max(0,total-offset)+128*1024**2:
                    raise ValueError('Insufficient workspace storage for download')
                count=offset; last=0
                with partial.open('ab' if offset else 'wb') as out:
                    while True:
                        block=response.read(1024*1024)
                        if not block: break
                        out.write(block); count+=len(block)
                        if time.monotonic()-last>=2:
                            progress(f'Downloading {target.name}: {count:,} bytes'+(f' ({100*count/total:.1f}%)' if total else '')); last=time.monotonic()
                    out.flush(); os.fsync(out.fileno())
                if total is not None and count!=total: raise OSError('Incomplete FCC download')
            # Place a candidate with the original filename inside a private staging folder.
            checkdir=dest/'.verify'; checkdir.mkdir(exist_ok=True)
            candidate=checkdir/target.name
            os.replace(partial,candidate)
            try:
                progress('Validating '+target.name)
                rows=archive_check(candidate,entry,'shapefile'); checksum=digest(candidate)
                # Write receipt before publishing the file; orphan receipt is harmless.
                write_json(receipt,dict(file_id=entry['file_id'],sha256=checksum,rows=rows))
                os.replace(candidate,target)
            finally: candidate.unlink(missing_ok=True); resume.unlink(missing_ok=True)
            return target
        except HTTPError as exc:
            if exc.code not in (408,429,500,502,503,504) or attempt==2: raise ValueError(f'FCC HTTP {exc.code} for {target.name}') from None
            delay=exc.headers.get('Retry-After',''); time.sleep(min(60,int(delay)) if delay.isdigit() else 2**(attempt+1))
        except (URLError,OSError,http.client.HTTPException) as exc:
            if attempt==2: raise ValueError(f'FCC download interrupted: {target.name} ({type(exc).__name__})') from None
            time.sleep(2**(attempt+1))
    raise ValueError('FCC download could not resume: '+target.name)


def local_archive(entry, dest, progress=say):
    source=Path(entry['local']); target=dest/entry['name']
    if not source.is_file(): raise ValueError('Local source missing: '+entry['name'])
    if target.exists():
        if digest(source)!=digest(target): raise ValueError('Staged local archive differs: '+target.name)
        return target
    progress('Checking local '+source.name); archive_check(source,entry)
    candidate=target.with_suffix('.zip.copy')
    try:
        shutil.copyfile(source,candidate)
        if digest(source)!=digest(candidate): raise ValueError('Source changed during copy: '+source.name)
        os.replace(candidate,target)
    finally: candidate.unlink(missing_ok=True)
    return target


def export_record(path, state, plan, rows, progress=say):
    meta=compact.manifest(path); compact.validate_manifest(meta,state)
    if meta['filing']!=filing_of(plan['as_of']) or meta['originals']:
        raise ValueError('Existing pack is not a direct build for this filing')
    expected={e['name'] for e in rows}; actual={x['file'] for x in meta.get('sources',[])}
    if expected!=actual: raise ValueError('Existing pack sources differ from plan')
    progress('Hashing validated state pack '+path.name)
    return dict(state=state,file=path.name,bytes=path.stat().st_size,sha256=digest(path),filing=meta['filing'],vintage=meta['vintage'],profiles=meta['layers'],source=meta['source'],sources=meta['sources'])


def run_plan(work, folder, plan, client=None, activate=False, limit=None, progress=say):
    check_plan(plan)
    folder=Path(folder); folder.mkdir(parents=True,exist_ok=True)
    work=Path(work); journal_path=work/'progress.json'; manifest_path=work/'distribution-manifest.json'
    signature=hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest()
    journal=json.loads(journal_path.read_text()) if journal_path.exists() else dict(plan_sha256=signature,states={})
    if journal.get('plan_sha256')!=signature: raise ValueError('Workspace plan changed; use a new workspace')
    status=journal['states']; records={}; started=0; failed=False
    def save():
        write_json(journal_path,journal)
        write_json(manifest_path,dict(format='openrf-coverage-distribution-draft',version=1,as_of=plan['as_of'],created_at=now(),requested_states=plan['states'],requested_providers=plan['providers'],packs=list(records.values()),state_status=status,publication='local draft; redistribution and hosting not approved'))
    for index,state in enumerate(plan['states'],1):
        rows=[e for e in plan['entries'] if e['state']==state]
        target=compact.compact_target(folder,state)
        progress(f'[{index}/{len(plan["states"])}] State {state}')
        if not rows:
            status[state]={'status':'no_matching_sources'}; save(); continue
        try:
            if target.exists():
                prior=status.get(state,{})
                if prior.get('status') in ('built','verified','building'):
                    # Crash after publication but before journaling: compare provenance, integrity and digest.
                    with fcc.open_pack(target) as db:
                        if db.execute('PRAGMA quick_check').fetchall()!=[('ok',)]: raise ValueError('Existing compact pack failed integrity check')
                    rec=export_record(target,state,plan,rows,progress)
                    if prior.get('sha256') and prior['sha256']!=rec['sha256']: raise ValueError('Previously built state pack changed')
                    if activate and not compact.active_pack(folder,state,compact.originals(folder,state)):
                        compact.set_active(folder,state,True,standalone=True,progress=progress)
                    records[state]=rec; status[state]={'status':'verified','sha256':rec['sha256']}
                else:
                    status[state]={'status':'existing_pack_preserved'}
                save(); progress('Existing state pack retained'); continue
            if compact.originals(folder,state):
                status[state]={'status':'original_packs_preserved'}; save(); continue
            if limit is not None and started>=limit:
                status[state]={'status':'pending'}; save(); continue
            started+=1
            dest=work/'archives'/state; dest.mkdir(parents=True,exist_ok=True)
            status[state]={'status':'downloading_or_staging','files':len(rows)}; save()
            for n,entry in enumerate(rows,1):
                progress(f'State {state}, archive {n}/{len(rows)}: {entry["name"]}')
                if plan['mode']=='fcc':
                    if client is None: client=FCCClient()
                    download_archive(client,entry,dest,progress)
                else: local_archive(entry,dest,progress)
            if {p.name for p in dest.glob('*.zip')}!={e['name'] for e in rows}: raise ValueError('Unexpected ZIP in state staging folder')
            status[state]={'status':'building'}; save()
            path=compact.build_direct(folder,state,dest,release=rows[0]['revision'],progress=progress)
            rec=export_record(path,state,plan,rows,progress)
            records[state]=rec; status[state]={'status':'built','sha256':rec['sha256']}; save()
            if activate: compact.set_active(folder,state,True,standalone=True,progress=progress)
            progress('Completed state '+state)
        except (OSError,ValueError,TypeError,KeyError,RuntimeError,ImportError,sqlite3.Error,zipfile.BadZipFile) as exc:
            # Never replace existing packs; keep a published build recoverable after activation failure.
            phase=status.get(state,{}).get('status')
            status[state]={**status.get(state,{}),'status':phase if target.exists() and phase in ('building','built','verified') else 'failed','error':str(exc)}
            save(); failed=True; progress(f'State {state} stopped: {exc}')
            # Stop on the first failure rather than repeatedly hammering a provider.
            break
    save()
    progress('State status: '+json.dumps({s:v['status'] for s,v in status.items()},sort_keys=True))
    progress('Local distribution draft: '+str(manifest_path))
    return 1 if failed else 0


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['plan','run','status'])
    p.add_argument('--workspace',type=Path,required=True,help='Dedicated external drive workspace; one plan per folder')
    p.add_argument('--folder',type=Path,default=Path.home()/'.local/share/openrf/fcc-coverage')
    p.add_argument('--as-of',default='2026-06-30'); p.add_argument('--state',action='append',choices=STATES)
    p.add_argument('--provider',action='append'); p.add_argument('--all-providers',action='store_true')
    p.add_argument('--input-dir',type=Path,help='Plan from local FCC ZIPs instead of querying FCC')
    p.add_argument('--catalog',type=Path,help='Use saved FCC API catalog JSON instead of requesting it')
    p.add_argument('--activate',action='store_true'); p.add_argument('--limit-states',type=int)
    a=p.parse_args(argv)
    if a.limit_states is not None and a.limit_states<1: p.error('--limit-states must be positive')
    if a.input_dir and a.catalog: p.error('Choose local source or API catalog, not both')
    if a.all_providers and a.provider: p.error('Choose explicit providers or all providers')
    try:
        a.workspace.mkdir(parents=True,exist_ok=True)
        with workspace_lock(a.workspace):
            path=a.workspace/'plan.json'
            if a.command=='plan':
                if path.exists(): raise ValueError('Plan already exists; use run/status or a new workspace')
                states=tuple(dict.fromkeys(a.state or STATES)); providers=() if a.all_providers else tuple(dict.fromkeys(a.provider or MAJOR))
                if any(not re.fullmatch(r'\d{6}',v) for v in providers): raise ValueError('Six-digit provider IDs required')
                filing_of(a.as_of)
                say('Discovering FCC H3 archives…')
                entries=local_entries(a.input_dir,a.as_of,states,providers) if a.input_dir else catalog_entries(json.loads(a.catalog.read_text()) if a.catalog else FCCClient().catalog(a.as_of),a.as_of,states,providers)
                plan=make_plan(entries,a.as_of,states,providers,'local' if a.input_dir else 'fcc'); check_plan(plan); write_json(path,plan)
                for state in states:
                    rows=[e for e in entries if e['state']==state]
                    say(f'{state}: {len(rows)} archives; providers '+(', '.join(sorted({e['provider'] for e in rows})) or 'none matched'))
                say(f'Plan saved: {path} · {len(entries)} archives · no downloads started')
                return 0
            plan=json.loads(path.read_text()); check_plan(plan)
            if a.command=='status':
                say((a.workspace/'progress.json').read_text() if (a.workspace/'progress.json').exists() else 'Plan ready; no build started')
                return 0
            return run_plan(a.workspace,a.folder,plan,activate=a.activate,limit=a.limit_states)
    except KeyboardInterrupt:
        say('Interrupted. Completed archives and state packs retained; rerun the same command.'); return 130
    except (OSError,ValueError,TypeError,KeyError,RuntimeError,ImportError,sqlite3.Error,zipfile.BadZipFile) as exc:
        say('Nationwide compiler stopped: '+str(exc)); return 1


if __name__=='__main__': raise SystemExit(main())
