import json
import shutil
import tempfile
import unittest
from pathlib import Path
from importlib.util import find_spec
from openrf import coverage_compact as c, fcc_coverage as f
from openrf.cellular_catalog import Catalog
import test_coverage_compact_v232 as compact_tests
import test_fcc_provider_v228 as provider_tests


class StandaloneTest(unittest.TestCase):
    def test_standalone_retains_geometry_without_originals(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); folder=root/'fcc-coverage'; folder.mkdir()
            p=compact_tests.CompactTest.fixture(self,folder,'130077','att',[('892aa8458c7ffff',-121,38)])
            p2=compact_tests.CompactTest.fixture(self,folder,'131425','verizon',[('892aa8458c7ffff',-121,38)])
            cat=Catalog(root/'catalog.sqlite3'); box=(-125,32,-113,43)
            def snapshot(): return sorted((x['carrier'],x['polygon']) for x in cat.view(box,[],['att','verizon'])['coverage'])
            expected=snapshot(); target=c.optimize(folder,'06',lambda _:None); original=target.read_bytes()
            c.set_active(folder,'06',True,standalone=True)
            self.assertEqual(expected,snapshot())
            self.assertEqual(json.loads(target.with_suffix('.active').read_text())['mode'],'standalone')
            backup=root/'backup'; backup.mkdir()
            for path in (p,p2): shutil.move(path,backup/path.name)
            self.assertEqual(expected,snapshot()); self.assertEqual(target.read_bytes(),original)
            c.set_active(folder,'06',False); self.assertEqual(cat.metadata(),{})
            c.set_active(folder,'06',True,standalone=True); self.assertEqual(expected,snapshot())
            # A copied pack can be activated on a clean installation, without copying its device-specific marker.
            other=root/'fresh'/'fcc-coverage'/'compact-v2'; other.mkdir(parents=True)
            shutil.copy2(target,other/target.name)
            c.set_active(other.parent,'06',True,standalone=True)
            fresh=Catalog(other.parent.parent/'catalog.sqlite3')
            self.assertEqual(expected,sorted((x['carrier'],x['polygon']) for x in fresh.view(box,[],['att','verizon'])['coverage']))
            target.touch(); self.assertEqual(cat.metadata(),{})
            c.set_active(folder,'06',True,standalone=True)
            c.set_active(folder,'06',False)
            for path in backup.iterdir(): shutil.move(path,folder/path.name)
            self.assertEqual(expected,snapshot())

    def test_stale_originals_refused_when_pinning(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d); p=compact_tests.CompactTest.fixture(self,folder,'131425','verizon',[('892aa8458c7ffff',-121,38)])
            c.optimize(folder,'06',lambda _:None); p.touch()
            with self.assertRaisesRegex(ValueError,'Original packs changed'):
                c.set_active(folder,'06',True,standalone=True)


@unittest.skipUnless(find_spec('shapefile') and find_spec('pyproj'),'Optional GIS dependencies missing')
class DirectTest(unittest.TestCase):
    def test_direct_matches_legacy_and_preserves_pack(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); src=root/'src'; src.mkdir(); old=root/'legacy'/'fcc-coverage'; new=root/'direct'/'fcc-coverage'
            for provider in ('130077','131425'):
                for kind,tech,down,up in [('4GLTE',400,5,1),('MobileVoice',0,0,0)]:
                    provider_tests.ProviderIntegration.fixture(self,src,provider,kind,tech,down,up)
            for key,files in f.select_groups(f.discover(src),'06'): f.build_group(key,files,old,lambda _:None)
            legacy=c.optimize(old,'06',lambda _:None)
            direct=c.build_direct(new,'06',src,progress=lambda _:None)
            self.assertEqual(c.manifest(legacy)['layers'],c.manifest(direct)['layers'])
            self.assertEqual(c.manifest(direct)['originals'],[])
            self.assertFalse(list(new.glob('*.sqlite3')))
            self.assertFalse(f.pack_metadata(new))
            c.set_active(new,'06',True,standalone=True)
            box=(-125,32,-113,43)
            for layer in c.manifest(legacy)['layers']:
                self.assertEqual(list(f.view_pack(legacy,layer,box,1000)),list(f.view_pack(direct,layer,box,1000)))
            before=direct.read_bytes()
            with self.assertRaisesRegex(ValueError,'already has coverage'):
                c.build_direct(new,'06',src,progress=lambda _:None)
            self.assertEqual(direct.read_bytes(),before)

    def test_failed_direct_build_never_publishes(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); src=root/'src';src.mkdir(); dest=root/'fcc-coverage'
            provider_tests.ProviderIntegration.fixture(self,src,'130077','4GLTE',400,5,1)
            (src/'bdc_06_131425_MobileVoice_mobile_voice_h3_J26_10nov2026.zip').write_text('corrupt')
            import zipfile
            with self.assertRaises(zipfile.BadZipFile): c.build_direct(dest,'06',src,progress=lambda _:None)
            self.assertFalse(c.compact_target(dest,'06').exists())
