"""v0.2.147 bounded opt-in topographic downloads; no real network calls."""
import tempfile
import threading
import unittest
from pathlib import Path

from openrf.map_areas import save_area
from openrf.offline_maps import tile_bytes, available_maps, MapExists
from openrf.topographic_download import download_area, TopoError, TopographicJobs
from test_offline_maps import PNG


class TopographicDownloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.folder=Path(self.tmp.name)/'maps'
        self.lock=threading.Lock()
        self.plan=save_area(self.folder,'Synthetic area TEST ONLY',[-122,30,-110,42],5,5,self.lock)

    def tearDown(self):
        self.tmp.cleanup()

    def test_user_selected_area_is_atomic_and_mixed_images_are_served(self):
        calls=[]
        def fake(z,x,y):
            calls.append((z,x,y))
            return PNG if len(calls)%2 else b'\xff\xd8\xff' + b'RECORDED_TEST_IMAGE'
        result=download_area(self.folder,self.plan,'test-topo',self.lock,fetch=fake)
        self.assertGreater(result['tiles_downloaded'],0)
        self.assertEqual(len(calls),result['candidate_tiles'])
        self.assertTrue(result['complete'])
        self.assertEqual(result['map']['format'],'mixed')
        self.assertIn('USGS',result['map']['attribution'])
        self.assertEqual(len(available_maps(self.folder)),1)
        raw,mime=tile_bytes(self.folder,'test-topo',*calls[0])
        self.assertEqual(raw,PNG)
        self.assertEqual(mime,'image/png')
        if len(calls)>1:
            self.assertEqual(tile_bytes(self.folder,'test-topo',*calls[1])[1],'image/jpeg')
        with self.assertRaises(MapExists):
            download_area(self.folder,self.plan,'test-topo',self.lock,fetch=fake)

    def test_cancel_bad_image_and_excessive_area_never_publish(self):
        for ident,opts in [('cancelled',{'cancelled':lambda: True}),
                           ('bad',{'fetch':lambda *args:b'<html>Error</html>'})]:
            with self.subTest(ident=ident), self.assertRaises(TopoError):
                download_area(self.folder,self.plan,ident,self.lock,**opts)
            self.assertFalse((self.folder/(ident+'.mbtiles')).exists())
        self.assertFalse(any(p.suffix=='.part' for p in self.folder.iterdir()))
        self.assertEqual(available_maps(self.folder),[])
        huge=save_area(self.folder,'Too big',[-125,24,-60,49],5,8,self.lock)
        with self.assertRaises(TopoError):
            download_area(self.folder,huge,'large',self.lock,fetch=lambda *args:PNG)

    def test_online_permission_and_filename_validation(self):
        jobs=TopographicJobs(self.folder,self.lock)
        with self.assertRaises(TopoError):jobs.start(self.plan['id'],'foo',False)
        with self.assertRaises(TopoError):jobs.start(self.plan['id'],'../../private',True)
        self.assertEqual(jobs.status()['state'],'idle')
        with self.assertRaises(TopoError):download_area(self.folder,self.plan,'../illegal',self.lock,fetch=lambda *args:PNG)


if __name__=='__main__':unittest.main()
