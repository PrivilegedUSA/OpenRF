"""v0.2.146: operator imported terrain is local, bounded and not GNSS."""
import io
import struct
import tempfile
import threading
import unittest
from pathlib import Path

from openrf.route_elevation import profile
from openrf.terrain_hgt import TerrainError, install, list_tiles, remove, sample_point, sample_route, tile_name


class HgtTerrainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.constant_tile=struct.pack('>h',851)*(1201*1201)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.folder=self.root/'terrain-hgt'
        self.lock=threading.Lock()

    def tearDown(self):
        self.temp.cleanup()

    def install(self,name='N38W121.hgt',data=None):
        return install(self.folder,name,'Operator supplied SRTM test dataset',
                       io.BytesIO(self.constant_tile if data is None else data),
                       len(self.constant_tile if data is None else data),self.lock)

    def test_constant_terrain_and_route_profile_work_entirely_offline(self):
        self.assertEqual(tile_name(-120.6345,38.4882),'N38W121')
        data=self.install()
        self.assertEqual(data['tile']['resolution_arcseconds'],3)
        self.assertFalse(data['tile']['source_verified'])
        self.assertEqual(sample_point(self.folder,-120.6345,38.4882),851)
        self.assertEqual(sample_point(self.folder,-119.5,38.5),None)
        points=[[-120.6345,38.4882],[-120.635,38.489],[-120.636,38.49]]
        def no_network(*args):
            raise AssertionError('Local HGT sampling must never contact USGS')
        result=profile(self.root/'profiles',points,False,threading.Lock(),fetch=no_network,
                       terrain_folder=self.folder)
        self.assertEqual(result['status'],'local_terrain')
        self.assertEqual(result['elevations_m'],[851,851,851])
        self.assertFalse(result['partial'])
        self.assertFalse(result['source_verified'])
        self.assertFalse((self.root/'profiles').exists(),'No coordinate or profile cache was created')
        self.assertEqual((self.folder/'N38W121.hgt').stat().st_mode & 0o777,0o600)

    def test_partial_missing_coverage_and_void_values_are_not_invented(self):
        self.install()
        points=[[-120.6,38.5],[-119.6,38.5],[-120.4,38.7]]
        elevations=sample_route(self.folder,points)
        self.assertEqual(elevations,[851,None,851])
        result=profile(self.root/'profiles',points,False,self.lock,terrain_folder=self.folder)
        self.assertTrue(result['partial'])
        self.assertEqual(result['available_points'],2)
        # An HGT void is -32768. Never reinterpret it as an altitude.
        void=struct.pack('>h',-32768)*(1201*1201)
        self.install('N39W121.hgt',void)
        self.assertIsNone(sample_point(self.folder,-120.4,39.4))

    def test_rejects_invalid_names_sizes_duplicate_and_symlink(self):
        for name in ('../../secret.hgt','N90W121.hgt','N38W181.hgt','N38W121.zip','x.hgt'):
            with self.subTest(name=name),self.assertRaises(TerrainError):
                install(self.folder,name,'Source test',io.BytesIO(self.constant_tile),len(self.constant_tile),self.lock)
        with self.assertRaises(TerrainError):
            install(self.folder,'N38W121.hgt','Source test',io.BytesIO(b'0'*10),10,self.lock)
        self.install('n38w121.HGT')
        self.assertEqual(len(list_tiles(self.folder)),1)
        with self.assertRaises(TerrainError):self.install()
        self.assertTrue(remove(self.folder,'N38W121',self.lock)['removed'])
        self.assertEqual(list_tiles(self.folder),[])
        self.folder.mkdir(exist_ok=True)
        (self.folder/'N38W121.hgt').symlink_to(self.root/'external.hgt')
        with self.assertRaises(TerrainError):self.install()

    def test_incomplete_stream_leaves_no_import_or_partial_tile(self):
        with self.assertRaises(TerrainError):
            install(self.folder,'N38W121.hgt','Source test',io.BytesIO(self.constant_tile[:1024]),len(self.constant_tile),self.lock)
        self.assertEqual(list(self.folder.iterdir()),[])
        self.assertEqual(list_tiles(self.folder),[])


if __name__=='__main__':unittest.main()
