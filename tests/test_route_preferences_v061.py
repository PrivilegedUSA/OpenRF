"""v0.2.76 route preference validation, loopback costing, separate camera exclusions."""
import io
import json
import unittest
from openrf.routing import RouteError, local_route, route_preferences
from openrf import camera_routes


class Reply(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self,*_): self.close()


class RoutePreferences(unittest.TestCase):
    LOCATIONS=[{'latitude':38.4,'longitude':-120.7},{'latitude':38.5,'longitude':-120.6}]
    def test_preferences_reject_bad_values(self):
        invalid=[{'avoid_highways':'no'}, {'avoid_tolls':1}, {'extra':1},
                 {'exclude_locations':[{'latitude':0,'longitude':181}]},
                 {'exclude_locations':[{'latitude':0,'longitude':0,'url':'http://evil'}]},
                 {'exclude_locations':[{'latitude':0,'longitude':0}]*9}]
        for pref in invalid:
            with self.subTest(pref=pref),self.assertRaises(RouteError):route_preferences(pref)
    def test_preference_payload_and_bounded_loopback_only(self):
        points=[]
        def fake(req,timeout):
            self.assertEqual(req.full_url,'http://127.0.0.1:8002/route')
            payload=json.loads(req.data);points.append(payload)
            return Reply(json.dumps({'trip':{'summary':{'length':2,'time':180},'legs':[
                {'shape':'_c`|gA~`yzyF_pR_pR','maneuvers':[]}]}}).encode())
        # Normalization occurs after the request, so malformed fixture geometry
        # must not affect assertions about the outgoing Valhalla request.
        try:
            local_route(self.LOCATIONS,port=8002,open_connection=fake,options={
              'avoid_highways':True,'avoid_tolls':True,
              'exclude_locations':[{'latitude':38.42,'longitude':-120.65}]},
              exclude_locations=[{'latitude':38.44,'longitude':-120.63}])
        except RouteError as error:
            self.assertIn('no directions',str(error))
        self.assertEqual(len(points),1)
        request=points[0]
        self.assertEqual(request['costing_options']['auto'],{'use_highways':0,'use_tolls':0})
        self.assertEqual(len(request['exclude_locations']),2)
        self.assertEqual(request['exclude_locations'][0],{'lat':38.42,'lon':-120.65})
        self.assertNotIn('date_time',request)
    def test_combined_limit(self):
        with self.assertRaisesRegex(RouteError,'combined'):
            local_route(self.LOCATIONS,options={'exclude_locations':[
              {'latitude':38.4,'longitude':-120.6}]*8},
              exclude_locations=[{'latitude':38.42,'longitude':-120.65}])
    def test_comparison_uses_same_preferences_for_both_routes(self):
        route={'type':'ROAD_ROUTE','is_driving_route':True,
               'coordinates':[[-120.7,38.4],[-120.68,38.4],[-120.6,38.5]],
               'origin':[-120.7,38.4],'destination':[-120.6,38.5], 'stops':[],
               'distance_miles':8,'duration_seconds':600,'maneuvers':[]}
        class Repo:pass
        actual=[]
        def router(_locations,**kwargs):actual.append(kwargs);return route
        # Mock camera reports; no DB or public map required.
        old=camera_routes.route_cameras
        try:
            camera_routes.route_cameras=lambda *_a,**_k:{'count':1,'sites':[
              {'latitude':38.45,'longitude':-120.64,'type':'ALPR'}],
              'incomplete':False,'radius_m':120,'types':['ALPR']}
            reply=camera_routes.compare(Repo(),self.LOCATIONS,['ALPR'],router=router,
                options={'avoid_tolls':True,'exclude_locations':[]})
        finally:camera_routes.route_cameras=old
        self.assertEqual(len(actual),2)
        self.assertEqual(actual[0]['options']['avoid_tolls'],True)
        self.assertEqual(actual[1]['options']['avoid_tolls'],True)
        self.assertEqual(len(actual[1]['exclude_locations']),1)
        self.assertIsNotNone(reply['alternative'])

if __name__=='__main__':unittest.main()
