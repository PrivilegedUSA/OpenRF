import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from openrf import national_traffic as t,camera_catalog as c
from openrf.storage import Repository
from test_national_traffic_v217 import fixture

def chicago(n=30):
    return json.dumps([{'address':f'{i} Example','latitude':41.8+i/10000,'longitude':-87.7,'approaches':'NB'} for i in range(n)]).encode()

class SupplementTests(unittest.TestCase):
    def test_independent_cache_and_failed_refresh(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Repository(Path(tmp)/'db.sqlite');t.ingest(repo,fixture());t.ingest_chicago(repo,chicago(),'SPEED');t.ingest_chicago(repo,chicago(),'RED_LIGHT')
            self.assertEqual(t.status(repo)['speed_count'],110);self.assertEqual(t.status(repo)['red_light_count'],70)
            self.assertEqual(len(c.list_sites(repo,[-88,41,-87,43],types=['RED_LIGHT'])['sites']),30)
            t.ingest(repo,fixture());self.assertEqual(t.status(repo)['speed_count'],110)
            with self.assertRaises(ValueError):t.ingest_chicago(repo,chicago(2),'RED_LIGHT')
            self.assertEqual(t.status(repo)['red_light_count'],70)
            manager=t.UpdateManager(repo)
            def download(url,accept):
                if url==t.CHICAGO['RED_LIGHT']:raise OSError('fixture outage')
                return fixture() if url==t.URL else chicago()
            with patch.object(manager,'download',side_effect=download):manager.run()
            self.assertTrue(manager.status()['partial']);self.assertEqual(manager.status()['phase'],'ready');self.assertIn('RED_LIGHT',manager.status()['error']);self.assertEqual(t.status(repo)['red_light_count'],70)
    def test_invalid_geography_and_record_type(self):
        for data in (b'{}',chicago().replace(b'-87.7',b'0')):
            with self.assertRaises(ValueError):t.parse_chicago(data,'RED_LIGHT')
