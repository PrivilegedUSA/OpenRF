"""v0.2.58 camera-aware road comparisons: all data local, opt-in, never pretend verified."""
import tempfile
import unittest
from pathlib import Path
from openrf.storage import Repository
from openrf import camera_catalog, camera_routes
from openrf.routing import RouteError, RouteUnavailable


class RouteCameras(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.repo=Repository(Path(self.temp.name)/'openrf.sqlite3')
        self.coords=[[-120.70,38.40],[-120.69,38.40],[-120.68,38.40],[-120.67,38.40],[-120.66,38.40]]
        self.road={'type':'ROAD_ROUTE','is_driving_route':True,'coordinates':self.coords,
                   'origin':self.coords[0],'destination':self.coords[-1],'stops':[],
                   'distance_miles':3.0,'duration_seconds':360,'maneuvers':[]}
        self.locations=[{'latitude':p[1],'longitude':p[0]} for p in (self.coords[0],self.coords[-1])]

    def tearDown(self):self.temp.cleanup()

    def add(self,lat,lon,kind='ALPR',state='REPORTED'):
        camera_catalog.add_manual(self.repo,{'type':kind,'state':state,'label':'Example, unverified',
             'latitude':lat,'longitude':lon,'source':'Test fixture'})

    def test_report_exact_proximity_not_city_bbox(self):
        self.add(38.4003,-120.68)
        self.add(38.4100,-120.68,kind='RED_LIGHT')  # Inside bounds? outside bbox pad ~= report but far from route.
        self.add(38.4004,-120.69,kind='SPEED')
        result=camera_routes.route_cameras(self.repo,self.road)
        self.assertEqual(result['count'],2)
        self.assertEqual({c['type'] for c in result['sites']},{'ALPR','SPEED'})
        self.assertTrue(all(c['state']=='REPORTED' for c in result['sites']))
        self.assertEqual(camera_routes.route_cameras(self.repo,self.road,['ALPR'])['count'],1)
        self.assertFalse(result['incomplete'])

    def test_alternate_requested_only_with_exclusions_and_never_automatically_used(self):
        self.add(38.4002,-120.68)
        alt={**self.road,'coordinates':[[ -120.70,38.40],[-120.695,38.407],[-120.685,38.407],[-120.66,38.40]],
             'distance_miles':3.7,'duration_seconds':440}
        calls=[]
        def router(locations,**kwargs):
            calls.append(kwargs)
            return alt if kwargs.get('exclude_locations') else self.road
        reply=camera_routes.compare(self.repo,self.locations,['ALPR'],router=router)
        self.assertEqual(len(calls),2)
        self.assertIn('exclude_locations',calls[1])
        self.assertEqual(reply['standard_cameras']['count'],1)
        self.assertEqual(reply['alternative_cameras']['count'],0)
        self.assertEqual(reply['standard']['distance_miles'],3.0)
        self.assertEqual(reply['alternative']['distance_miles'],3.7)
        self.assertEqual(reply['exclusions_used'],1)

    def test_failure_and_invalid_inputs_keep_normal_route(self):
        self.add(38.4001,-120.68)
        def router(_points,**kw):
            if kw.get('exclude_locations'):raise RouteError('No path found')
            return self.road
        reply=camera_routes.compare(self.repo,self.locations,['ALPR'],router=router)
        self.assertIsNone(reply['alternative'])
        self.assertEqual(reply['standard']['type'],'ROAD_ROUTE')
        self.assertIn('unchanged',reply['detail'])
        with self.assertRaisesRegex(ValueError,'category'):
            camera_routes.compare(self.repo,self.locations,['PEOPLE'],router=router)
        with self.assertRaises(ValueError):
            camera_routes.route_cameras(self.repo,{'type':'DIRECT_DISTANCE_ONLY'})
        def unavailable(_points,**kw):
            if kw.get('exclude_locations'):raise RouteUnavailable('Router offline')
            return self.road
        self.assertIsNone(camera_routes.compare(self.repo,self.locations,['ALPR'],router=unavailable)['alternative'])

    def test_near_endpoint_is_not_excluded(self):
        self.add(38.4,-120.6999)
        calls=[]
        def router(_points,**kw):calls.append(kw);return self.road
        result=camera_routes.compare(self.repo,self.locations,['ALPR'],router=router)
        self.assertIsNone(result['alternative'])
        self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
