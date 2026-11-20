"""v0.2.148 opt-in 3DEP model data, offline reuse, validity and privacy tests."""
import json
import tempfile
import threading
import unittest
from pathlib import Path

from openrf.route_elevation import profile, ElevationError, _key, _validated


class RouteElevationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.folder=Path(self.temp.name)
        self.lock=threading.Lock()
        self.points=[[-120.6345,38.4882],[-120.635,38.489],[-120.636,38.49]]

    def tearDown(self):
        self.temp.cleanup()

    def test_offline_cache_miss_never_calls_provider(self):
        def fail(*args):raise AssertionError('No network is allowed for offline profile check')
        result=profile(self.folder,self.points,False,self.lock,fetch=fail)
        self.assertEqual(result['status'],'not_prepared')
        self.assertFalse(list(self.folder.iterdir()))

    def test_opt_in_preparation_persists_without_route_coordinates(self):
        calls=[]
        def fetch(lon,lat):calls.append((lon,lat));return 850+len(calls)*5
        result=profile(self.folder,self.points,True,self.lock,fetch=fetch)
        self.assertEqual(result['status'],'prepared')
        self.assertEqual(result['elevations_m'],[855,860,865])
        self.assertEqual(result['available_points'],3)
        self.assertEqual(len(calls),3)
        cache=(self.folder/'.openrf-route-elevation.json').read_text()
        self.assertIn(_key(_validated(self.points)),cache)
        self.assertNotIn('-120.6345',cache,'Raw route coordinates must not be stored in cache')
        reused=profile(self.folder,self.points,False,self.lock,fetch=lambda *args: (_ for _ in ()).throw(AssertionError('Offline cache used')))
        self.assertEqual(reused['status'],'cached')
        self.assertEqual(reused['elevations_m'],result['elevations_m'])

    def test_partial_data_and_bad_requests(self):
        sequence=iter([815,None,825])
        partial=profile(self.folder,self.points,True,self.lock,fetch=lambda *args:next(sequence))
        self.assertTrue(partial['partial'])
        self.assertEqual(partial['available_points'],2)
        invalid=[[[0,0]],[[0,0],[0,0]],[[float('nan'),0],[1,1]],[[0,100],[1,2]],[[1,'2'],[2,3]]]
        for points in invalid:
            with self.subTest(points=points), self.assertRaises(ElevationError):
                profile(self.folder,points,True,self.lock,fetch=lambda *args:1200)
        with self.assertRaises(ElevationError):
            profile(self.folder,self.points,'true',self.lock,fetch=lambda *args:1200)

    def test_no_false_profile_when_usgs_has_no_usable_heights(self):
        with self.assertRaises(ElevationError):
            profile(self.folder,self.points,True,self.lock,fetch=lambda *args:None)
        self.assertFalse((self.folder/'.openrf-route-elevation.json').exists())


if __name__=='__main__':unittest.main()
