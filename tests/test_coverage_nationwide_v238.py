import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from importlib.util import find_spec
from openrf import coverage_nationwide as n, coverage_compact as c
import test_fcc_provider_v228 as fixtures

ASOF='2026-06-30'

def entry_name(state='32',provider='130077',kind='4GLTE'):
    return f'bdc_{state}_{provider}_{kind}_mobile_{"voice" if kind=="MobileVoice" else "broadband"}_h3_J26_10nov2026.zip'

def row(state='32',provider='130077',kind='4GLTE',fid=123):
    return dict(file_name=entry_name(state,provider,kind),state_fips=state,provider_id=provider,file_id=fid)

class PlanTest(unittest.TestCase):
    def test_catalog_filters(self):
        self.assertEqual(len(n.STATES),51)
        raw=[row(),row('32','130403','MobileVoice',124),row('32','999999',fid=125),row('06',fid=126),dict(file_name='bdc_us_provider_list.zip'),dict(file_name='bdc_32_130077_4GLTE_mobile_broadband_raw_J26_10nov2026.zip')]
        entries=n.catalog_entries({'data':raw},ASOF,('32',),n.MAJOR)
        self.assertEqual({e['provider'] for e in entries},{'130077','130403'})
        self.assertEqual(len(n.catalog_entries(raw,ASOF,('32',),())),3)
        plan=n.make_plan(entries,ASOF,('32',),n.MAJOR,'fcc'); n.check_plan(plan)
        plan['entries'][0]['name']='../bad.zip'
        with self.assertRaises(ValueError): n.check_plan(plan)
    def test_reject_conflict_and_missing(self):
        with self.assertRaises(ValueError): n.catalog_entries([dict(row(),provider_id='131425')],ASOF,('32',),n.MAJOR)
        with self.assertRaises(ValueError): n.catalog_entries([row(),row(fid=999)],ASOF,('32',),n.MAJOR)
        with self.assertRaises(ValueError): n.make_plan([],ASOF,('32',),n.MAJOR,'fcc')
    def test_credentials_only_in_headers(self):
        client=n.FCCClient('test@example.invalid','secret')
        with patch.object(client.opener,'open') as op:
            client.download('123',{'Range':'bytes=10-'})
            req=op.call_args.args[0]
            self.assertTrue(req.full_url.startswith(n.API+'/downloads/downloadFile/availability/123/1'))
            self.assertNotIn('secret',req.full_url)
            self.assertEqual(req.get_header('Hash_value'),'secret')
            self.assertEqual(req.get_header('Range'),'bytes=10-')
        with self.assertRaises(ValueError): n.NoRedirect().redirect_request(None,None,302,'',{},'https://example.com')

class Response(io.BytesIO):
    def __init__(self, data, code=200, **headers):
        super().__init__(data); self.code=code; self.headers=headers
    def getcode(self): return self.code

@unittest.skipUnless(find_spec('shapefile') and find_spec('pyproj'),'Optional GIS dependencies unavailable')
class WorkflowTest(unittest.TestCase):
    def fixture(self, root, state='32',provider='130077'):
        tmp=fixtures.ProviderIntegration.fixture(self,root,provider,'4GLTE',400,5,1)
        path=root/entry_name(state,provider)
        out=path.with_suffix('.tmp')
        with zipfile.ZipFile(tmp) as z, zipfile.ZipFile(out,'w') as dest:
            for member in z.namelist(): dest.writestr(path.stem+Path(member).suffix,z.read(member))
        tmp.unlink(); out.rename(path); return path
    def test_download_resume_and_verified_reuse(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); src=root/'src';src.mkdir(); dst=root/'dst';dst.mkdir()
            path=self.fixture(src); raw=path.read_bytes(); e=n.catalog_entries([row()],ASOF,('32',),n.MAJOR)[0]
            part=dst/path.with_suffix('.zip.part').name; part.write_bytes(raw[:20]); n.write_json(part.with_suffix('.part.json'),dict(file_id='123',etag='"abc"'))
            class Client:
                def download(self, fid, extra):
                    assert fid=='123' and extra=={'Range':'bytes=20-','If-Range':'"abc"'}
                    return Response(raw[20:],206,**{'ETag':'"abc"','Content-Range':f'bytes 20-{len(raw)-1}/{len(raw)}'})
            out=n.download_archive(Client(),e,dst,lambda _:None)
            self.assertEqual(out.read_bytes(),raw)
            self.assertEqual(n.download_archive(None,e,dst,lambda _:None),out)
            out.write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError,'Cached archive mismatch'): n.download_archive(None,e,dst,lambda _:None)
    def test_wrong_member_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); path=self.fixture(root,'32','130077'); wrong=n.catalog_entries([row('32','131425')],ASOF,('32',),n.MAJOR)[0]
            with self.assertRaisesRegex(ValueError,'member identity'): n.archive_check(path,wrong)
    def test_batch_resume_and_existing_pack(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); src=root/'src';src.mkdir(); work=root/'work';work.mkdir(); dest=root/'coverage';dest.mkdir()
            self.fixture(src,'32'); self.fixture(src,'04'); self.fixture(src,'06')
            existing=c.compact_target(dest,'06');existing.parent.mkdir();existing.write_bytes(b'keep')
            states=('06','32','04','01'); entries=n.local_entries(src,ASOF,states,n.MAJOR); plan=n.make_plan(entries,ASOF,states,n.MAJOR,'local')
            self.assertEqual(n.run_plan(work,dest,plan,activate=True,limit=1,progress=lambda _:None),0)
            self.assertEqual(existing.read_bytes(),b'keep'); self.assertTrue(c.active_pack(dest,'32',[]));self.assertFalse(c.compact_target(dest,'04').exists())
            self.assertEqual(n.run_plan(work,dest,plan,activate=True,progress=lambda _:None),0)
            self.assertTrue(c.active_pack(dest,'04',[])); manifest=json.loads((work/'distribution-manifest.json').read_text())
            self.assertEqual({p['state'] for p in manifest['packs']},{'04','32'})
            self.assertEqual(manifest['state_status']['06']['status'],'existing_pack_preserved')
            self.assertEqual(manifest['state_status']['01']['status'],'no_matching_sources')
            for p in manifest['packs']: self.assertEqual(p['sha256'],n.digest(c.compact_target(dest,p['state'])))
    def test_failed_archive_never_builds(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);src=root/'src';src.mkdir();work=root/'work';work.mkdir();out=root/'coverage'
            p=self.fixture(src);p.write_bytes(b'bad'); plan=n.make_plan(n.local_entries(src,ASOF,('32',),n.MAJOR),ASOF,('32',),n.MAJOR,'local')
            self.assertEqual(n.run_plan(work,out,plan,progress=lambda _:None),1)
            self.assertFalse(c.compact_target(out,'32').exists())
            self.assertEqual(json.loads((work/'progress.json').read_text())['states']['32']['status'],'failed')
