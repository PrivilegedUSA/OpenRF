"""v0.2.58 private camera catalog and import-only CHIRP profiles, no live RF/network."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from openrf.storage import Repository
from openrf import camera_catalog as cam, chirp_channels as chirp


CHIRP_SAMPLE = '''Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,Mode,Comment
0,TEST LOCAL,146.520000,,0.000000,,88.5,88.5,FM,Sample only
1,WEATHER,162.550000,,0.000000,,88.5,88.5,FM,Receive channel
'''


class CameraRadioTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'db.sqlite3'
        self.repo=Repository(self.path)

    def tearDown(self): self.tmp.cleanup()

    def test_camera_types_and_verification_require_source(self):
        for kind in ('ALPR','RED_LIGHT','SPEED'):
            record=cam.add_manual(self.repo,{'type':kind,'label':'Reported intersection',
                'latitude':38.4,'longitude':-120.6,'source':'Field notes'})
            self.assertEqual(record['state'],'REPORTED')
        listing=cam.list_sites(self.repo,[-121,38,-120,39])
        self.assertEqual({c['type'] for c in listing['sites']},cam.TYPES)
        self.assertTrue(all(c['state']=='REPORTED' for c in listing['sites']))
        with self.assertRaisesRegex(ValueError,'Verified requires'):
            cam.add_manual(self.repo,{'type':'SPEED','state':'VERIFIED','label':'Test',
              'latitude':38.4,'longitude':-120.6,'source':'notes'})
        with self.assertRaises(ValueError):
            cam.add_manual(self.repo,{'type':'UNKNOWN','label':'Test','source':'notes',
              'latitude':38.4,'longitude':-120.6})
        with self.assertRaises(ValueError):
            cam.add_manual(self.repo,{'type':'ALPR','label':'Test','source':'notes',
              'latitude':True,'longitude':-120.6})
        self.assertEqual(len(cam.list_sites(Repository(self.path),[-121,38,-120,39])['sites']),3)

    def test_bbox_and_import_are_bounded_and_never_promote_to_verified(self):
        fixture={'type':'FeatureCollection','features':[
          {'type':'Feature','id':'way/1','geometry':{'type':'Point','coordinates':[-120.5,38.4]},'properties':{'brand':'Flock Safety','direction':'NE'}},
          {'type':'Feature','id':'way/2','geometry':{'type':'Point','coordinates':[-125.0,38.4]},'properties':{'brand':'Unknown'}}]}
        with self.assertRaisesRegex(ValueError,'Zoom'):
            cam.import_feed(self.repo,[-130,30,-110,45],fetch=lambda:fixture)
        for _ in range(2):
            out=cam.import_feed(self.repo,[-121,38,-120,39],fetch=lambda:fixture)
            self.assertEqual(out['matched'],1)
        entries=cam.list_sites(self.repo,[-121,38,-120,39])['sites']
        self.assertEqual(len(entries),1)
        self.assertEqual(entries[0]['state'],'COMMUNITY_MAPPED')
        self.assertIn('OpenStreetMap',cam.ATTRIBUTION)
        self.assertTrue(cam.remove(self.repo,entries[0]['id']))
        self.assertFalse(cam.list_sites(self.repo,[-121,38,-120,39])['sites'])

    def test_chirp_profile_read_only_import_and_validation(self):
        out=chirp.import_csv(self.repo,'My F8HP','BF-F8HP',CHIRP_SAMPLE)
        self.assertEqual(out['channel_count'],2)
        saved=chirp.profiles(Repository(self.path))
        self.assertEqual(saved[0]['channels'][0]['frequency_mhz'],146.52)
        self.assertEqual(saved[0]['model'],'BF-F8HP')
        with self.assertRaisesRegex(ValueError,'Location and Frequency'):
            chirp.import_csv(self.repo,'bad','UV-5R','Name,Freq\n1,10\n')
        with self.assertRaisesRegex(ValueError,'frequency'):
            chirp.import_csv(self.repo,'bad','UV-5R',CHIRP_SAMPLE.replace('146.520000','-12.0'))
        self.assertTrue(chirp.delete(self.repo,out['id']))
        self.assertFalse(chirp.profiles(self.repo))


if __name__=='__main__':unittest.main()
