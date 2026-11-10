"""Offline area planning and locally cropped MBTiles (synthetic fixtures only)."""
import json
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.map_areas import (AreaError, _ranges, area_geojson, build_subset,
                              estimate, get_area, list_areas, remove_area, save_area)
from openrf.offline_maps import MapBusy, MapExists, available_maps, tile_bytes
from openrf.server import create_server
from openrf.storage import Repository
from test_offline_maps import PNG


def create_source(folder, name='source'):
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (name + '.mbtiles')
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE metadata (name TEXT, value TEXT)')
        db.executemany('INSERT INTO metadata VALUES (?,?)', [
            ('name','Synthetic local map TEST ONLY'), ('type','baselayer'),
            ('format','png'),('attribution','TEST-LICENSE'),
            ('bounds','-180,-66,0,66'),('minzoom','2'),('maxzoom','2')])
        db.execute('CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)')
        # XYZ x=0,y=1 => TMS y=2; XYZ x=1,y=1 => also TMS y=2.
        db.executemany('INSERT INTO tiles VALUES(?,?,?,?)', [(2,0,2,PNG),(2,1,2,PNG)])
    return path


class AreaLibraryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.folder=Path(self.tmp.name)/'maps'
        self.folder.mkdir()
        self.lock=threading.Lock()
        create_source(self.folder)

    def tearDown(self):
        self.tmp.cleanup()

    def test_area_creation_persistence_export_and_remove(self):
        bounds=[-125,30,-115,45]
        area=save_area(self.folder, '  Gold Country ',bounds,2,2,self.lock)
        self.assertEqual(area['name'],'Gold Country')
        self.assertEqual(area['candidate_tiles'],1)
        self.assertEqual(get_area(self.folder, area['id']),area)
        geometry=area_geojson(area)['features'][0]['geometry']
        self.assertEqual(geometry['coordinates'][0],[[-125,30],[-115,30],[-115,45],[-125,45],[-125,30]])
        self.assertEqual(len(list_areas(self.folder)),1)
        self.assertTrue((self.folder/'.openrf-map-areas.json').exists())
        self.assertEqual(remove_area(self.folder,area['id'],self.lock)['name'],'Gold Country')
        self.assertEqual(list_areas(self.folder),[])
        self.assertTrue((self.folder/'source.mbtiles').exists())

    def test_invalid_bounds_range_and_privacy(self):
        for bounds in ([160,30,-160,40],[-200,0,-110,40],[-125,-90,-115,44],
                       [float('nan'),30,-115,45],[0,0,0,1],[1,2,3],['-120',30,-119,40]):
            with self.subTest(bounds=bounds), self.assertRaises(AreaError):
                save_area(self.folder,'area',bounds,2,2,self.lock)
        for lo,hi in [(-1,2),(5,2),(2,19),(True,2),(2,2.0)]:
            with self.subTest(zooms=(lo,hi)),self.assertRaises(AreaError):
                save_area(self.folder,'area',[-125,30,-115,45],lo,hi,self.lock)
        with self.assertRaises(AreaError):
            save_area(self.folder,'global',[-180,-80,180,80],2,18,self.lock)
        self.assertEqual(list_areas(self.folder),[])

    def test_tile_edge_exact_and_lock(self):
        self.assertEqual(_ranges([-180,-85.05112878,180,85.05112878],0),(0,0,0,0))
        self.assertEqual(estimate([-125,30,-115,45],2,2),1)
        self.lock.acquire()
        with self.assertRaises(MapBusy):
            save_area(self.folder,'busy',[-125,30,-115,45],2,2,self.lock)
        self.lock.release()

    def test_create_subset_only_matching_tiles_with_permission(self):
        area=save_area(self.folder,'Subset',[-125,30,-115,45],2,2,self.lock)
        before=(self.folder/'source.mbtiles').read_bytes()
        with self.assertRaises(AreaError):
            build_subset(self.folder,area['id'],'source','cropped',False,self.lock)
        self.assertFalse((self.folder/'cropped.mbtiles').exists())
        result=build_subset(self.folder,area['id'],'source','cropped',True,self.lock)
        self.assertEqual(result['tiles_copied'],1)
        self.assertEqual(result['candidate_tiles'],1)
        self.assertEqual(result['map']['attribution'],'TEST-LICENSE')
        self.assertEqual(result['map']['bounds'],[-125,30,-115,45])
        self.assertEqual(tile_bytes(self.folder,'cropped',2,0,1)[0], PNG)
        with self.assertRaises(Exception):
            tile_bytes(self.folder,'cropped',2,1,1)
        self.assertEqual((self.folder/'source.mbtiles').read_bytes(),before)
        with self.assertRaises(MapExists):
            build_subset(self.folder,area['id'],'source','cropped',True,self.lock)
        self.assertEqual(len(available_maps(self.folder)),2)

    def test_empty_and_bad_target_do_not_publish_partial_output(self):
        area=save_area(self.folder,'Empty',[10,30,20,45],2,2,self.lock)
        with self.assertRaises(AreaError):
            build_subset(self.folder,area['id'],'source','empty',True,self.lock)
        with self.assertRaises(AreaError):
            build_subset(self.folder,area['id'],'source','../bad',True,self.lock)
        self.assertEqual(sorted(x.name for x in self.folder.glob('*.mbtiles')),['source.mbtiles'])
        self.assertFalse(any('.part' in x.name for x in self.folder.iterdir()))
        # Existing plans do not get deleted when a crop fails.
        self.assertEqual(len(list_areas(self.folder)),1)


class AreaAPIIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.root=Path(cls.temp.name)
        cls.server=create_server(Repository(cls.root/'user.sqlite3'),port=0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.port=cls.server.server_address[1]
        create_source(cls.server.map_directory)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=4)
        cls.temp.cleanup()

    def call(self,method,path,body=None,headers=None):
        conn=HTTPConnection('127.0.0.1',self.port,timeout=10)
        data=json.dumps(body).encode() if body is not None else None
        h={'Host':f'localhost:{self.port}',**(headers or {})}
        if body is not None:h['Content-Type']='application/json'
        conn.request(method,path,body=data,headers=h)
        res=conn.getresponse();raw=res.read();status=res.status;mime=res.getheader('Content-Type','');
        conn.close()
        return status,(json.loads(raw) if mime.startswith('application/json') else raw)

    def test_http_end_to_end_and_user_data_preservation(self):
        observation=self.server.repository.add_observation({'label':'Keep this private data','kind':'MANUAL'})
        code,response=self.call('POST','/api/maps/areas',{
            'name':'Planned area','bounds':[-125,30,-115,45],'minzoom':2,'maxzoom':2})
        self.assertEqual(code,201,response)
        area=response['area'];ident=area['id']
        code,listing=self.call('GET','/api/maps/areas')
        self.assertEqual(code,200);self.assertEqual(listing['areas'][-1]['id'],ident)
        self.assertFalse(listing['downloads_enabled'])
        code,geojson=self.call('GET',f'/api/maps/areas/{ident}.geojson')
        self.assertEqual(code,200)
        self.assertEqual(json.loads(geojson)['features'][0]['properties']['openrf_area_id'],ident)
        code,err=self.call('POST',f'/api/maps/areas/{ident}/build',{
            'source_map_id':'source','output_map_id':'local-region','rights_confirmed':False})
        self.assertEqual(code,400,err)
        code,result=self.call('POST',f'/api/maps/areas/{ident}/build',{
            'source_map_id':'source','output_map_id':'local-region','rights_confirmed':True})
        self.assertEqual(code,201,result)
        self.assertEqual(result['tiles_copied'],1)
        code,allmaps=self.call('GET','/api/maps')
        self.assertEqual(code,200);self.assertEqual(len(allmaps['maps']),2)
        code,raw=self.call('GET','/api/maps/local-region/tiles/2/0/1.png')
        self.assertEqual(code,200);self.assertEqual(raw,PNG)
        code,_=self.call('DELETE',f'/api/maps/areas/{ident}')
        self.assertEqual(code,200)
        self.assertEqual(self.server.repository.list_observations()[0]['id'],observation['id'])
        self.assertTrue((self.server.map_directory/'local-region.mbtiles').exists(), 'Deleting plan does not remove created package')

    def test_reject_cross_origin_url_inputs_missing_plan_and_duplicate(self):
        body={'name':'Test','bounds':[-125,30,-115,45],'minzoom':2,'maxzoom':2}
        code,_=self.call('POST','/api/maps/areas',body,{'Origin':'https://outside.invalid'})
        self.assertEqual(code,403)
        code,_=self.call('POST','/api/maps/areas',{**body,'url':'https://example.com/tiles'})
        self.assertEqual(code,400)
        code,_=self.call('DELETE','/api/maps/areas/0000000000000000')
        self.assertEqual(code,404)
        code,_=self.call('POST','/api/maps/areas/0000000000000000/build',{
            'source_map_id':'source','output_map_id':'new','rights_confirmed':True})
        self.assertEqual(code,400)


if __name__=='__main__': unittest.main()
