"""v0.2.149: bounded route-corridor tile planning, atomic download and local API."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.server import create_server
from openrf.storage import Repository
from openrf.trip_maps import (TripMapError, trip_tile_plan, estimate_trip,
                              download_trip, TripMapJobs, fetch_trip_tile)


POINTS=[[-120.648,38.48],[-120.637,38.488],[-120.621,38.498]]
PNG=b'\x89PNG\r\n\x1a\n'+b'\x00'*30


class TripMapTests(unittest.TestCase):
    def test_corridor_has_real_tiles_and_does_not_use_route_bbox_as_tile_list(self):
        p=trip_tile_plan(POINTS,1,9,12,'topographic')
        self.assertGreater(p['tile_count'],0)
        self.assertLessEqual(p['tile_count'],384)
        self.assertEqual(p['tile_count'],len(set(map(tuple,p['tiles']))))
        self.assertTrue(all(z in (9,10,11,12) for z,_,_ in p['tiles']))
        self.assertEqual(p['preview_id'],trip_tile_plan(POINTS,1,9,12,'topographic')['preview_id'])
        wider=trip_tile_plan(POINTS,2,9,12,'topographic')
        self.assertGreaterEqual(wider['tile_count'],p['tile_count'])
        satellite=trip_tile_plan(POINTS,1,9,12,'satellite')
        self.assertNotEqual(p['preview_id'],satellite['preview_id'])
        report=estimate_trip(POINTS,1,9,12,'topographic')
        self.assertEqual(report['tile_count'],p['tile_count'])
        self.assertTrue(report['read_only'])
        self.assertFalse(report['external_requests'])
        self.assertFalse(report['gps_fix_checked'])
        self.assertFalse(report['graph_coverage_verified'])
        self.assertGreater(report['estimated_bytes_high'],report['estimated_bytes_low'])
        self.assertNotIn('tiles',report,'Preview must not expose an unbounded URL list')

    def test_all_geometry_parameters_are_bounded_and_no_arbitrary_source(self):
        bad=[
            ([],1,9,12,'topographic'),(POINTS*100,1,9,12,'topographic'),
            ([[0,0],[180,0]],1,9,12,'topographic'),
            ([[0,0],[1,81]],1,9,12,'topographic'),
            ([[0,0],[float('nan'),0]],1,9,12,'topographic'),
            ([[0,0],[True,1]],1,9,12,'topographic'),
            (POINTS,3,9,12,'topographic'),(POINTS,1.1,9,12,'topographic'),
            (POINTS,1,9,18,'topographic'),(POINTS,1,12,12,'topographic'),
            (POINTS,1,9,12,'https://attacker.example/tiles'),
            (POINTS,1,9,12,[]),
        ]
        for case in bad:
            with self.subTest(case=str(case)[:70]), self.assertRaises(TripMapError):
                trip_tile_plan(*case)

    def test_download_is_atomic_non_overwriting_and_no_partial_publish(self):
        plan=trip_tile_plan(POINTS,0.5,9,11,'topographic')
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            lock=threading.Lock()
            received=[]
            result=download_trip(folder,plan,'weekend-trip',lock,
                fetch=lambda source,z,x,y:(received.append((source,z,x,y)) or PNG))
            self.assertEqual(result['tiles_downloaded'],plan['tile_count'])
            self.assertTrue(result['complete'])
            self.assertEqual(len(received),plan['tile_count'])
            self.assertTrue((folder/'weekend-trip.mbtiles').is_file())
            original=(folder/'weekend-trip.mbtiles').read_bytes()
            with self.assertRaises(ValueError):
                download_trip(folder,plan,'weekend-trip',lock,fetch=lambda *_:PNG)
            self.assertEqual((folder/'weekend-trip.mbtiles').read_bytes(),original)
            with self.assertRaises(TripMapError):
                download_trip(folder,plan,'cancelled-trip',lock,cancelled=lambda:True,fetch=lambda *_:PNG)
            self.assertFalse((folder/'cancelled-trip.mbtiles').exists())
            with self.assertRaises(TripMapError):
                download_trip(folder,plan,'missing-trip',lock,fetch=lambda *_:(_ for _ in ()).throw(OSError('network down')))
            self.assertFalse((folder/'missing-trip.mbtiles').exists())
            self.assertFalse(list(folder.glob('.openrf-trip-*.part')),'Failed staging files must be removed')

    def test_only_fixed_usgs_tile_hosts_are_allowed(self):
        class Response:
            status=200
            def __enter__(self):return self
            def __exit__(self,*_):return False
            def read(self,length):return PNG
        class Opener:
            def __init__(self):self.urls=[]
            def open(self,request,timeout):
                self.urls.append(request.full_url)
                self.timeout=timeout
                return Response()
        opener=Opener()
        with patch('openrf.trip_maps._opener',opener):
            self.assertEqual(fetch_trip_tile('topographic',9,40,140),PNG)
            self.assertEqual(fetch_trip_tile('satellite',9,40,140),PNG)
        self.assertTrue(opener.urls[0].startswith('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/'))
        self.assertIn('/USGSImageryOnly/',opener.urls[1])
        self.assertEqual(opener.timeout,5)
        with self.assertRaises(TripMapError):fetch_trip_tile('untrusted',9,40,140)

    def test_preview_identity_and_jobs_do_not_persist_private_route_geometry(self):
        with tempfile.TemporaryDirectory() as temp:
            jobs=TripMapJobs(Path(temp),threading.Lock())
            inputs={'points':POINTS,'corridor_miles':1,'minzoom':9,'maxzoom':12,
                    'source':'satellite','map_id':'short-trip','confirm_network':False,
                    'preview_id':trip_tile_plan(POINTS,1,9,12,'satellite')['preview_id']}
            with self.assertRaises(TripMapError):jobs.start(inputs)
            inputs['confirm_network']=True
            inputs['preview_id']='wrong'
            with self.assertRaises(TripMapError):jobs.start(inputs)
            self.assertEqual(jobs.status()['state'],'idle')

    def test_trip_api_is_local_read_only_until_explicit_confirmation(self):
        with tempfile.TemporaryDirectory() as temp:
            server=create_server(Repository(Path(temp)/'test.sqlite3'),port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                port=server.server_address[1]
                def request(method,path,body=None,host=None):
                    conn=HTTPConnection('127.0.0.1',port,timeout=5)
                    headers={'Host':host or f'localhost:{port}'}
                    if body is not None:headers['Content-Type']='application/json'
                    conn.request(method,path,body=json.dumps(body) if body is not None else None,headers=headers)
                    resp=conn.getresponse();code=resp.status;raw=resp.read();conn.close()
                    data=json.loads(raw) if path.startswith('/api/') else raw
                    return code,data
                body={'points':POINTS,'corridor_miles':1,'minzoom':9,'maxzoom':12,'source':'topographic'}
                code,data=request('POST','/api/maps/trips/estimate',body)
                self.assertEqual(code,200)
                self.assertTrue(data['estimate']['read_only'])
                self.assertFalse(data['estimate']['external_requests'])
                self.assertEqual(request('GET','/api/maps/trips/status')[1]['download']['state'],'idle')
                self.assertEqual(request('POST','/api/maps/trips/estimate',{**body,'online':True})[0],400)
                self.assertEqual(request('POST','/api/maps/trips/estimate?online=1',body)[0],400)
                self.assertEqual(request('POST','/api/maps/trips/estimate',body,host='evil.example')[0],403)
                start={**body,'map_id':'test-trip','preview_id':data['estimate']['preview_id'],
                       'confirm_network':False}
                self.assertEqual(request('POST','/api/maps/trips/start',start)[0],409)
                self.assertEqual(request('GET','/static/trip-map.js')[0],200)
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__':unittest.main()
