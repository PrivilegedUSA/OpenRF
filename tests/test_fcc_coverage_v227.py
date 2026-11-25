import tempfile
import unittest
from pathlib import Path
import zipfile
import sqlite3
from unittest.mock import patch
import importlib.util
from openrf import fcc_coverage as f
from openrf.cellular_catalog import Catalog


class CompilerRules(unittest.TestCase):
    def test_profiles(self):
        row={'h3_res9_id':'892aa8458c7ffff','brandname':'AT&T','providerid':123456,'technology':500,'mindown':35,'minup':3,'environmnt':1}
        self.assertEqual(f.attributes(row,'5gnr')[1:],('att','AT&T','123456','5G NR 35/3 Mbps','Outdoor stationary + in-vehicle'))
        self.assertEqual(f.attributes(row,'mobilevoice')[4],'Mobile voice')
        with self.assertRaises(ValueError): f.attributes({**row,'mindown':10},'5gnr')
        with self.assertRaises(ValueError): f.attributes({**row,'environmnt':5},'5gnr')
        self.assertEqual(f.carrier('Unknown Verizon-like company'),'other')

    def test_discovery_requires_matched_release(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); (p/'bdc_06_4GLTE_mobile_broadband_h3_J26_10nov2026.zip').touch(); (p/'bdc_06_Cable_fixed_broadband_J26_10nov2026.zip').touch()
            groups=f.discover(p); self.assertEqual(len(groups),1)
            with self.assertRaises(ValueError): f.select_groups(groups,'06')

    def test_invalid_geometry(self):
        with self.assertRaises(ValueError): list(f.polygon_parts({'type':'Polygon','coordinates':[[[0,0],[1,0],[1,1],[0,1]]]},lambda x,y:(x,y)))


@unittest.skipUnless(importlib.util.find_spec('shapefile') and importlib.util.find_spec('pyproj'),'Optional compiler GIS dependencies unavailable')
class CompilerIntegration(unittest.TestCase):
    def make_zip(self,folder,kind,tech,down,up,voice=False,bad=False):
        import shapefile
        from pyproj import CRS
        base=folder/'source'
        with shapefile.Writer(str(base),shapeType=shapefile.POLYGON) as w:
            w.field('h3_res9_id','C',15); w.field('brandname','C',60); w.field('providerid','N',6); w.field('environmnt','N',1)
            if not voice:
                w.field('technology','N',3); w.field('mindown','N',3); w.field('minup','N',3)
            for brand,env in [('AT&T',0),('Verizon',1),('T-Mobile',1),('AT&T',0)]:
                w.poly([[[-121,38],[-121,38.001],[-120.999,38.001],[-120.999,38],[-121,38]]])
                w.record('892aa8458c7ffff',brand,123456,5 if bad else env,*(() if voice else (tech,down,up)))
        base.with_suffix('.prj').write_text(CRS.from_epsg(4326).to_wkt())
        path=folder/f'bdc_06_{kind}_mobile_{"voice" if voice else "broadband"}_h3_J26_10nov2026.zip'
        with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
            for ext in ('.shp','.shx','.dbf','.prj'): z.write(base.with_suffix(ext),'nested/file'+ext)
        return path

    def test_compile_read_preserve(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); source=p/'downloads'; source.mkdir(); out=p/'fcc-coverage'
            self.make_zip(source,'4GLTE',400,5,1); self.make_zip(source,'5GNR',500,7,1); self.make_zip(source,'MobileVoice',0,0,0,True)
            key,files=f.select_groups(f.discover(source),'06')[0]
            messages=[]; pack=f.build_group(key,files,out,messages.append)
            self.assertTrue(any('100%' in x for x in messages)); self.assertTrue(any('SHA-256' in x for x in messages))
            with sqlite3.connect(pack) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM shapes').fetchone()[0],1)
                self.assertEqual(db.execute('SELECT count(*) FROM membership').fetchone()[0],9)
            catalog=Catalog(p/'cellular-reference.sqlite3'); meta=catalog.metadata(); self.assertEqual(len(meta),18)
            import json
            profile=json.dumps(['att','2026-11-10','4G LTE 5/1 Mbps','Outdoor stationary only'])
            view=catalog.view((-121.1,37.9,-120.9,38.1),[],['att'],[profile]);self.assertEqual(len(view['coverage']),1)
            union=json.dumps(['verizon','2026-11-10','4G LTE 5/1 Mbps','Outdoor stationary (all)'])
            self.assertEqual(len(catalog.view((-121.1,37.9,-120.9,38.1),[],['verizon'],[union])['coverage']),1)
            self.assertEqual(catalog.view((-10,0,10,10),[],['att'],[profile])['coverage'],[])
            with patch('openrf.cellular_catalog.MAX_VIEW_VERTICES',3):
                self.assertEqual(catalog.view((-121.1,37.9,-120.9,38.1),[],['att'],[profile])['limited'],['coverage:att'])
            old=pack.read_bytes(); self.make_zip(source,'MobileVoice',0,0,0,True,bad=True)
            with self.assertRaises(ValueError): f.build_group(key,files,out,messages.append)
            self.assertEqual(pack.read_bytes(),old)
            files['mobilevoice'].write_bytes(b'bad zip')
            with self.assertRaises(zipfile.BadZipFile): f.build_group(key,files,out,messages.append)
            self.assertEqual(pack.read_bytes(),old)

if __name__=='__main__': unittest.main()
