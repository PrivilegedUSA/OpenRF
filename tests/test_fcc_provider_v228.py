import json
import tempfile
import unittest
import zipfile
import importlib.util
from pathlib import Path
from openrf import fcc_coverage as f
from openrf.cellular_catalog import Catalog

class ProviderRules(unittest.TestCase):
    def test_discovery_and_isolation(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            for name in ['4GLTE','5GNR_7_1','5GNR_35_3','MobileVoice']:
                (p/f'bdc_06_131425_{name}_mobile_{"voice" if name=="MobileVoice" else "broadband"}_h3_J26_10nov2026.zip').touch()
            (p/'bdc_06_4GLTE_mobile_broadband_h3_J26_10nov2026.zip').touch()
            (p/'bdc_06_130077_4GLTE_mobile_broadband_h3_J26_10nov2026.zip').touch()
            g=f.discover(p)
            key,files=f.select_groups(g,'06',provider='131425')[0]
            self.assertEqual(key[-1],'131425'); self.assertEqual(set(files),{'4glte','5gnr_7_1','5gnr_35_3','mobilevoice'})
            self.assertEqual(len(f.select_groups(g,'06')),2)
            self.assertEqual(len(f.select_groups(g,'06',aggregate=True)[0][0]),3)
    def test_identity_and_tier(self):
        row={'h3_res9_id':'892aa8458c7ffff','technology':500,'mindown':7,'minup':1,'environmnt':1}
        self.assertEqual(f.attributes(row,'5gnr_7_1','131425')[1:5],('verizon','Verizon','131425','5G NR 7/1 Mbps'))
        self.assertEqual(f.attributes(row,'5gnr')[1],'aggregate')
        self.assertEqual(f.attributes(row,'5gnr_7_1','999999')[1:4],('other','FCC provider 999999','999999'))
        with self.assertRaises(ValueError): f.attributes(row,'5gnr_35_3','131425')
        with self.assertRaises(ValueError): f.attributes({**row,'providerid':130077},'5gnr_7_1','131425')

@unittest.skipUnless(importlib.util.find_spec('shapefile') and importlib.util.find_spec('pyproj'),'Optional GIS dependencies unavailable')
class ProviderIntegration(unittest.TestCase):
    def fixture(self,p,provider,kind,tech,down,up):
        import shapefile
        from pyproj import CRS
        base=p/'source'
        voice=kind=='MobileVoice'
        with shapefile.Writer(str(base),shapeType=shapefile.POLYGON) as w:
            w.field('h3_res9_id','C',15); w.field('environmnt','N',1)
            if not voice:
                w.field('technology','N',3); w.field('mindown','N',3); w.field('minup','N',3)
            w.poly([[[-121,38],[-121,38.001],[-120.999,38.001],[-120.999,38],[-121,38]]])
            w.record('892aa8458c7ffff',1,*(() if voice else (tech,down,up)))
        base.with_suffix('.prj').write_text(CRS.from_epsg(4326).to_wkt())
        path=p/f'bdc_06_{provider+"_" if provider else ""}{kind}_mobile_{"voice" if voice else "broadband"}_h3_J26_10nov2026.zip'
        with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
            for ext in ('.shp','.shx','.dbf','.prj'): z.write(base.with_suffix(ext),'nested/file'+ext)
        return path
    def test_separate_packs_and_views(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); p=root/'downloads'; p.mkdir(); out=root/'fcc-coverage'
            for k,t,d,u in [('4GLTE',400,5,1),('5GNR_7_1',500,7,1),('5GNR_35_3',500,35,3),('MobileVoice',0,0,0)]: self.fixture(p,'131425',k,t,d,u)
            self.fixture(p,'130077','4GLTE',400,5,1)
            self.fixture(p,'','5GNR',500,7,1)
            for key,files in f.select_groups(f.discover(p),'06'):
                f.build_group(key,files,out,lambda _:None)
            key,files=f.select_groups(f.discover(p),'06',aggregate=True)[0]; f.build_group(key,files,out,lambda _:None)
            self.assertEqual(len(list(out.glob('*.sqlite3'))),3)
            cat=Catalog(root/'cellular-reference.sqlite3'); meta=cat.metadata()
            self.assertEqual({v['carrier'] for v in meta.values()},{'att','verizon','aggregate'})
            profile=json.dumps(['verizon','2026-11-10','5G NR 35/3 Mbps','Outdoor stationary (all)'])
            self.assertEqual(len(cat.view((-121.1,37.9,-120.9,38.1),[],['verizon'],[profile])['coverage']),1)
            profile=json.dumps(['aggregate','2026-11-10','5G NR 7/1 Mbps','Outdoor stationary (all)'])
            self.assertEqual(len(cat.view((-121.1,37.9,-120.9,38.1),[],['aggregate'],[profile])['coverage']),1)
            key,files=f.select_groups(f.discover(p),'06',provider='131425')[0]
            original=(out/'fcc-06-131425.sqlite3').read_bytes()
            with self.assertRaises(ValueError): f.build_group(key,{'4glte':files['4glte']},out,lambda _:None)
            self.assertEqual((out/'fcc-06-131425.sqlite3').read_bytes(),original)
