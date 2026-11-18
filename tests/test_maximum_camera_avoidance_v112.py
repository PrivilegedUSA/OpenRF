"""Opt-in camera-priority mode: report count dominates route cost, bounded trials."""
import unittest
from unittest.mock import patch
from openrf import camera_routes


def site(ident, lat, lon):
    return {'id':ident, 'type':'ALPR', 'latitude':lat, 'longitude':lon, 'distance_m':15}


def report(sites):
    return {'count':len(sites), 'nearby_count':len(sites), 'sites':sites,
            'incomplete':False, 'unknown_direction_count':len(sites)}


class CameraPriorityTests(unittest.TestCase):
    def setUp(self):
        a=[-120.7,38.4]; b=[-120.66,38.4]
        self.main={'type':'ROAD_ROUTE','is_driving_route':True,'coordinates':[a,b],
                   'distance_miles':3,'duration_seconds':400}
        self.detour1={**self.main,'coordinates':[a,[-120.685,38.409],b],
                      'distance_miles':8,'duration_seconds':1600}
        self.detour2={**self.main,'coordinates':[a,[-120.67,38.425],b],
                      'distance_miles':80,'duration_seconds':12000}
        self.points=[{'latitude':38.4,'longitude':-120.7},
                     {'latitude':38.4,'longitude':-120.66}]
        self.reports=[report([site('old',38.4,-120.68)]),
                      report([site('new',38.408,-120.68)]),report([])]

    def run_comparison(self, mode):
        calls=[]
        def router(_points, **kwargs):
            calls.append(kwargs)
            return (self.main,self.detour1,self.detour2)[min(len(calls)-1,2)]
        with patch.object(camera_routes,'route_cameras',side_effect=self.reports):
            result=camera_routes.compare(None,self.points,['ALPR'],router=router,mode=mode)
        return result,calls

    def test_maximum_prefers_zero_reports_over_distance_or_time(self):
        result,calls=self.run_comparison('maximum')
        self.assertEqual(len(calls),3)
        self.assertEqual(result['attempts'],2)
        self.assertIs(result['alternative'],self.detour2)
        self.assertEqual(result['alternative_cameras']['count'],0)
        self.assertEqual(result['preferred'],'alternate')
        self.assertGreater(result['alternative']['duration_seconds'],self.main['duration_seconds']*20)
        self.assertEqual(len(calls[2]['exclude_locations']),2)

    def test_balanced_remains_single_request_and_manual_selection(self):
        result,calls=self.run_comparison('balanced')
        self.assertEqual(len(calls),2)
        self.assertEqual(result['attempts'],1)
        self.assertIs(result['alternative'],self.detour1)
        self.assertEqual(result['preferred'],'standard')

    def test_invalid_mode_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'mode'):
            camera_routes.compare(None,self.points,['ALPR'],mode='no_limits')

    def test_count_not_suppressed_by_unmatched_lens_bearing(self):
        self.assertEqual(camera_routes._view_sector('N'),(0,0))
        self.assertFalse(camera_routes._direction_matches_road(
            38.40005,-120.68,self.main['coordinates'],(0,0),120))
        # This is only an *estimate*: the camera must still remain in route_cameras.count.


if __name__=='__main__':unittest.main()
