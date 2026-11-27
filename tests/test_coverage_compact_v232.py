import json
from contextlib import closing
import sqlite3
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from importlib.util import find_spec
from openrf import fcc_coverage as f
from openrf import coverage_compact as c
from openrf.cellular_catalog import Catalog


class CompactTest(unittest.TestCase):
    def fixture(self,folder,provider,carrier,points):
        path=folder/f'fcc-06-{provider}.sqlite3'
        with closing(sqlite3.connect(path)) as db, db:
            db.executescript(f.DDL)
            db.execute('INSERT INTO profiles VALUES (1,?,?,?,?,?)',(carrier,carrier,provider,'Mobile voice','Outdoor stationary only'))
            for i,(cell,x,y) in enumerate(points,1):
                geom={'type':'Polygon','coordinates':[[[x,y],[x+.001,y],[x+.001,y+.001],[x,y+.001],[x,y]]]}
                w,s,e,n,v,raw=next(f.polygon_parts(geom,lambda x,y:(x,y)))
                db.execute('INSERT INTO shapes VALUES (?,?,?,?)',(i,cell,raw,v));db.execute('INSERT INTO spatial VALUES (?,?,?,?,?)',(i,w,e,s,n));db.execute('INSERT INTO membership VALUES (1,?)',(i,))
            meta={'format':'openrf-fcc-h3','version':1,'state':'06','provider_id':provider,'filing':'J26','vintage':'2026-11-10','source':f.SOURCE,'saved_at':'2026-11-25','layers':c.layers(db)}
            db.execute('INSERT INTO metadata VALUES (?,?)',('manifest',json.dumps(meta)))
        return path

    def test_codec_holes_negative_coordinates(self):
        rings=[[[-121.1234567,38.1234567],[-121.1234566,38.2],[-121.2,38.2],[-121.1234567,38.1234567]], [[-121.13,38.15],[-121.14,38.16],[-121.15,38.15],[-121.13,38.15]]]
        self.assertEqual(c.decode(c.encode(rings)),rings)
        with self.assertRaises(ValueError): c.decode(c.encode(rings)+b'\x00')

    def test_shared_pack_activation_and_fallback(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); folder=root/'fcc-coverage';folder.mkdir()
            p1=self.fixture(folder,'131425','verizon',[('892aa8458c7ffff',-121,38),('892aa8458d7ffff',-122,39)])
            p2=self.fixture(folder,'130077','att',[('892aa8458c7ffff',-121,38),('892aa8458e7ffff',-123,40)])
            before=[p.read_bytes() for p in (p1,p2)]
            cat=Catalog(root/'catalog.sqlite3'); local=(-121.1,37.9,-120.9,38.1); state=(-125,32,-113,43)
            def snapshot(box):
                result=cat.view(box,[],['att','verizon']);return sorted((x['carrier'],x['polygon'],x.get('reports')) for x in result['coverage'])
            local0=snapshot(local); wide0=snapshot(state)
            out=c.optimize(folder,'06',lambda _:None)
            self.assertEqual([p.read_bytes() for p in (p1,p2)],before)
            with closing(sqlite3.connect(out)) as db, db:
                self.assertEqual(db.execute('SELECT count(*) FROM shapes').fetchone()[0],3)
                self.assertEqual(db.execute('SELECT count(*) FROM membership').fetchone()[0],4)
                self.assertEqual(db.execute('SELECT typeof(h3) FROM shapes LIMIT 1').fetchone()[0],'integer')
            self.assertEqual(snapshot(local),local0)
            c.set_active(folder,'06',True)
            self.assertTrue(all(m['fcc_file'].startswith('compact-v2/') for m in cat.metadata().values()))
            self.assertEqual(snapshot(local),local0);self.assertEqual(snapshot(state),wide0)
            c.set_active(folder,'06',False);self.assertFalse(any(m['fcc_file'].startswith('compact-v2/') for m in cat.metadata().values()))
            c.set_active(folder,'06',True)
            p1.touch();self.assertFalse(any(m['fcc_file'].startswith('compact-v2/') for m in cat.metadata().values()))
            with self.assertRaises(ValueError): c.set_active(folder,'06',True)

    def test_failed_conversion_preserves_previous(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d); p=self.fixture(folder,'131425','verizon',[('892aa8458c7ffff',-121,38)])
            out=c.optimize(folder,'06',lambda _:None);before=out.read_bytes()
            with patch.object(c,'decode',return_value=[]):
                with self.assertRaises(ValueError): c.optimize(folder,'06',lambda _:None)
            self.assertEqual(out.read_bytes(),before)


@unittest.skipUnless(find_spec('shapely') and find_spec('pyproj'),'Optional GIS dependencies missing')
class GeoPackageTest(unittest.TestCase):
    def test_geopackage_input(self):
        from shapely.geometry import Polygon
        from shapely import wkb
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);src=root/'source';src.mkdir();gpkg=root/'file.gpkg'
            with closing(sqlite3.connect(gpkg)) as db, db:
                db.executescript('''CREATE TABLE gpkg_geometry_columns(table_name TEXT,column_name TEXT,geometry_type_name TEXT,srs_id INTEGER);
                INSERT INTO gpkg_geometry_columns VALUES ('coverage','geom','POLYGON',4326);
                CREATE TABLE gpkg_spatial_ref_sys(srs_id INTEGER,organization TEXT,organization_coordsys_id INTEGER,definition TEXT);
                INSERT INTO gpkg_spatial_ref_sys VALUES (4326,'EPSG',4326,'');
                CREATE TABLE coverage(fid INTEGER PRIMARY KEY,geom BLOB,h3_res9_id TEXT,environment INTEGER,technology INTEGER,mindown INTEGER,minup INTEGER);''')
                poly=Polygon([(-121,38),(-121,38.001),(-120.999,38.001),(-120.999,38)])
                geom=b'GP\x00\x01'+struct.pack('<i',4326)+wkb.dumps(poly)
                db.execute('INSERT INTO coverage VALUES(1,?,?,?,?,?,?)',(geom,'892aa8458c7ffff',1,400,5,1))
            name='bdc_06_130077_4GLTE_mobile_broadband_h3_J26_10nov2026geo.zip';path=src/name
            with zipfile.ZipFile(path,'w') as z: z.write(gpkg,'bdc_06_130077_4GLTE_mobile_broadband_h3_J26_24oct2026.gpkg')
            self.assertEqual(f.archive_format(path),'geopackage');self.assertEqual(f.inspect_zip(path,'4glte')[0],1)
            key,files=f.select_groups(f.discover(src,'geopackage'),'06',provider='130077')[0]
            out=f.build_group(key,files,root/'fcc-coverage',lambda _:None)
            meta=c.manifest(out);self.assertEqual(meta['sources'][0]['format'],'geopackage');self.assertIn('24oct2026',meta['sources'][0]['members'][0]);self.assertEqual(meta['vintage'],'2026-11-10')
            self.assertEqual(len(Catalog(root/'catalog.sqlite3').view((-121.1,37.9,-120.9,38.1),[],['att'])['coverage']),1)
            dest=root/'direct'/'fcc-coverage'
            direct=c.build_direct(dest,'06',src,preferred='geopackage',progress=lambda _:None)
            self.assertEqual(c.manifest(direct)['layers'],meta['layers'])
            self.assertEqual(c.manifest(direct)['sources'][0]['format'],'geopackage')
            c.set_active(dest,'06',True,standalone=True)
            self.assertEqual(len(Catalog(dest.parent/'catalog.sqlite3').view((-121.1,37.9,-120.9,38.1),[],['att'])['coverage']),1)
