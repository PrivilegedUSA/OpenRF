"""v0.2.12 local tile-ZIP to MBTiles tests. All tiles are synthetic fixtures.

These tests do not contact or copy any map tile server. TEST data is not RF.
"""
import io
import json
import tempfile
import threading
import unittest
import zipfile
from http.client import HTTPConnection
from pathlib import Path
from openrf.map_areas import area_tile_manifest, get_area, save_area
from openrf.offline_maps import MapBusy, MapExists, available_maps, tile_bytes, TileMissing
from openrf.server import create_server
from openrf.storage import Repository
from openrf.tile_archive import import_xyz_zip, TileArchiveError, MAX_ZIP_BYTES
from test_offline_maps import PNG


def make_zip(entries, *, compression=zipfile.ZIP_DEFLATED):
    out=io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=compression) as archive:
        for key, value in entries.items():
            archive.writestr(key,value)
    return out.getvalue()


def kwargs(data, *, scheme='xyz', rights=True, name='converted', credit='SYNTHETIC TEST SOURCE'):
    return {'output_id':name, 'source_stream':io.BytesIO(data), 'length':len(data),
            'attribution':credit, 'source_name':'TEST ONLY fixture', 'scheme':scheme,
            'rights_confirmed':rights}


class TileZipLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.folder=Path(self.temp.name)/'maps'
        self.folder.mkdir()
        self.lock=threading.Lock()
        self.area=save_area(self.folder,'Planned field area',[-125,30,-115,45],2,3,self.lock)
        self.data=make_zip({'licensed/tiles/2/0/1.png':PNG,
                            'licensed/tiles/2/1/1.png':PNG,
                            'licensed/LICENSE.txt':b'SYNTHETIC TEST ONLY'})

    def tearDown(self):
        self.temp.cleanup()

    def imp(self, archive=None, **options):
        a=self.data if archive is None else archive
        return import_xyz_zip(self.folder,self.area['id'],lock=self.lock,**kwargs(a,**options))

    def test_import_clips_and_flips_xyz_rows_and_preserves_source_and_plans(self):
        source=bytes(self.data)
        before=(self.folder/'.openrf-map-areas.json').read_bytes()
        result=self.imp()
        self.assertEqual(result['tiles_imported'],1)
        self.assertEqual(result['tiles_ignored'],1)
        self.assertEqual(result['map']['attribution'],'SYNTHETIC TEST SOURCE')
        self.assertEqual(result['map']['bounds'],[-125.,30.,-115.,45.])
        self.assertEqual(tile_bytes(self.folder,'converted',2,0,1)[0],PNG)
        with self.assertRaises(TileMissing):tile_bytes(self.folder,'converted',2,1,1)
        self.assertEqual(source,self.data)
        self.assertEqual((self.folder/'.openrf-map-areas.json').read_bytes(),before)
        self.assertEqual([m['id'] for m in available_maps(self.folder)],['converted'])
        self.assertFalse(any('.part' in f.name for f in self.folder.iterdir()))

    def test_tms_input_and_top_level_tile_paths(self):
        data=make_zip({'2/0/2.png': PNG})
        result=self.imp(data,scheme='tms')
        self.assertEqual(result['tiles_imported'],1)
        self.assertEqual(tile_bytes(self.folder,'converted',2,0,1)[0],PNG)

    def test_export_provider_neutral_plan_has_ranges_not_urls_or_positions(self):
        plan=area_tile_manifest(self.area)
        self.assertEqual(plan['schema'],'openrf.offline-area-plan.v1')
        self.assertEqual(plan['tile_ranges'][0]['z'],2)
        self.assertEqual(plan['tile_ranges'][0]['x_min'],0)
        self.assertEqual(plan['tile_ranges'][0]['y_min_xyz'],1)
        self.assertEqual(plan['candidate_tile_slots'],self.area['candidate_tiles'])
        self.assertIsNone(plan['tile_urls'])
        self.assertNotIn('http://',json.dumps(plan))
        self.assertNotIn('https://',json.dumps(plan))

    def test_requires_permission_attribution_and_safe_target(self):
        for options in ({'rights':False},{'credit':''},{'name':'../escape'},
                        {'name':'.hidden'},{'name':'../../private'}, {'credit':'a\nheader'}):
            with self.subTest(options=options),self.assertRaises(TileArchiveError):
                self.imp(**options)
        self.assertEqual(len(available_maps(self.folder)),0)

    def test_rejects_unsafe_zip_entries_and_unsupported_content(self):
        cases=[
            {'../private/2/0/1.png':PNG},
            {'root\\2\\0\\1.png':PNG},
            {'tiles/2/0/1.pbf':b'pretend vector'},
            {'2/0/1.png':PNG,'2/0/1.jpg':b'\xff\xd8\xffxxxx'},
            {'2/4/1.png':PNG},
            {'tiles/2/0/1.png':b'<html>bad image</html>'},
            {'2/0/1.png':PNG,'tiles/2/0/1.png':PNG},
            {'4/0/1.png':PNG},
        ]
        for item in cases:
            with self.subTest(item=list(item)),self.assertRaises(TileArchiveError):
                self.imp(make_zip(item))
        with self.assertRaises(TileArchiveError):self.imp(b'x'*300)
        self.assertEqual(len(available_maps(self.folder)),0)
        self.assertFalse(any('.part' in f.name for f in self.folder.iterdir()))

    def test_symlink_zip_entries_rejected(self):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            info=zipfile.ZipInfo('2/0/1.png')
            info.create_system=3
            info.external_attr=(0o120777<<16)
            z.writestr(info,PNG)
        with self.assertRaises(TileArchiveError):self.imp(out.getvalue())

    def test_no_overwrite_busy_lock_short_input_or_size_limit(self):
        self.imp()
        contents=(self.folder/'converted.mbtiles').read_bytes()
        with self.assertRaises(MapExists):self.imp()
        self.assertEqual((self.folder/'converted.mbtiles').read_bytes(),contents)
        self.lock.acquire()
        try:
            with self.assertRaises(MapBusy):self.imp(name='different')
        finally:self.lock.release()
        with self.assertRaises(TileArchiveError):
            import_xyz_zip(self.folder,self.area['id'],'short',io.BytesIO(self.data),len(self.data)+20,
                           'CREDIT','Source','xyz',True,self.lock)
        with self.assertRaises(TileArchiveError):
            import_xyz_zip(self.folder,self.area['id'],'huge',io.BytesIO(),MAX_ZIP_BYTES+1,
                           'CREDIT','Source','xyz',True,self.lock)
        self.assertEqual([m['id'] for m in available_maps(self.folder)],['converted'])


class TileZipHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.folder=Path(cls.temp.name)
        cls.server=create_server(Repository(cls.folder/'observations.sqlite3'),port=0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.port=cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=4)
        cls.temp.cleanup()

    def call(self,method,path,payload=None,headers=None):
        conn=HTTPConnection('127.0.0.1',self.port,timeout=10)
        conn.request(method,path,body=payload,headers={'Host':f'localhost:{self.port}',**(headers or {})})
        res=conn.getresponse()
        data=res.read()
        status=res.status;mime=res.getheader('Content-Type',''); disposition=res.getheader('Content-Disposition','')
        conn.close()
        return status, json.loads(data) if mime.startswith('application/json') and not disposition else data

    def test_http_plan_json_import_and_investigation_preservation(self):
        obs=self.server.repository.add_observation({'kind':'MANUAL','label':'Do not lose user data'})
        area=save_area(self.server.map_directory,'HTTP test area',[-125,30,-115,45],2,2,self.server.map_lock)
        ident=area['id']
        status,plan=self.call('GET',f'/api/maps/areas/{ident}.plan.json')
        self.assertEqual(status,200)
        obj=json.loads(plan)
        self.assertEqual(obj['area_id'],ident)
        self.assertFalse(obj['tile_urls'])
        zip_data=make_zip({'tiles/2/0/1.png':PNG})
        headers={'Content-Type':'application/zip','X-OpenRF-Map-Id':'zip-test',
                 'X-OpenRF-Source-Name':'SYNTHETIC',
                 'X-OpenRF-Attribution':'Synthetic%20attribution%20for%20test',
                 'X-OpenRF-Tile-Scheme':'xyz','X-OpenRF-Rights-Confirmed':'true'}
        status,result=self.call('POST',f'/api/maps/areas/{ident}/import-xyz',zip_data,headers)
        self.assertEqual(status,201,result)
        self.assertEqual(result['tiles_imported'],1)
        status,tile=self.call('GET','/api/maps/zip-test/tiles/2/0/1.png')
        self.assertEqual((status,tile),(200,PNG))
        status,err=self.call('POST',f'/api/maps/areas/{ident}/import-xyz',zip_data,{**headers,'X-OpenRF-Map-Id':'no-rights','X-OpenRF-Rights-Confirmed':'false'})
        self.assertEqual(status,400,err)
        status,err=self.call('POST',f'/api/maps/areas/{ident}/import-xyz',zip_data,{**headers,'X-OpenRF-Map-Id':'cross-origin','Origin':'https://elsewhere.invalid'})
        self.assertEqual(status,403,err)
        self.assertEqual(self.server.repository.list_observations()[0]['id'],obs['id'])
        status,err=self.call('GET','/api/maps/areas/0000000000000000.plan.json')
        self.assertEqual(status,404,err)


if __name__=='__main__': unittest.main()
