import csv
import io
import json
import tempfile
import unittest
from pathlib import Path

from openrf.storage import Repository, normalize_observation, to_csv, to_geojson


class RepositoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dbpath = Path(self.temp.name) / 'private.sqlite3'
        self.repo = Repository(self.dbpath)

    def tearDown(self):
        self.temp.cleanup()

    def test_manual_observation_persists_and_has_observer_semantics(self):
        item = self.repo.add_observation({'kind':'WIFI', 'label':'Observed RSSI (manual)',
              'identifier':'TEST-001', 'rssi_dbm':-65.5, 'frequency_mhz':2412,
              'latitude':38.5,'longitude':-121.6,'accuracy_m':12})
        self.assertEqual(item['source'], 'MANUAL')
        self.assertEqual(len(Repository(self.dbpath).list_observations()), 1)
        collection = to_geojson(self.repo.list_observations())
        self.assertEqual(collection['features'][0]['geometry']['coordinates'], [-121.6,38.5])
        self.assertEqual(collection['features'][0]['properties']['coordinate_meaning'], 'observer_position_not_transmitter_position')
        self.assertEqual(self.repo.stats()['mapped'], 1)

    def test_validation_catches_incorrect_or_partial_location(self):
        base={'kind':'MANUAL','label':'test'}
        for extra in ({'latitude':12}, {'latitude':91,'longitude':0}, {'longitude':181,'latitude':0},
                      {'latitude':'nan','longitude':0}, {'accuracy_m':20}, {'rssi_dbm':200},
                      {'label':' '}, {'kind':'UNKNOWN'}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                normalize_observation({**base,**extra})

    def test_session_lifecycle_and_interruption(self):
        session = self.repo.begin_session('Field exercise')
        self.assertEqual(session['status'], 'ACTIVE')
        with self.assertRaisesRegex(ValueError, 'Stop'):
            self.repo.begin_session('Second session')
        self.repo.add_observation({'label':'Field candidate','session_id':session['id']})
        self.assertEqual(self.repo.sessions()[0]['observation_count'], 1)
        self.assertTrue(self.repo.stop_session(session['id']))
        self.assertFalse(self.repo.stop_session(session['id']))
        with self.assertRaisesRegex(ValueError, 'no longer active'):
            self.repo.add_observation({'label':'late entry','session_id':session['id']})
        later = self.repo.begin_session('Interrupted run')
        self.assertEqual(Repository(self.dbpath).sessions()[0]['status'], 'INTERRUPTED')
        self.assertIsNone(Repository(self.dbpath).sessions()[0]['ended_at'])

    def test_demo_opt_in_is_distinguishable_and_clearable(self):
        self.assertEqual(self.repo.stats()['observations'], 0)
        self.assertEqual(self.repo.load_demo(),5)
        self.assertEqual(self.repo.load_demo(),0)
        self.assertEqual(self.repo.stats()['demo'],5)
        self.assertTrue(all(o['source']=='DEMO' for o in self.repo.list_observations()))
        self.assertEqual(self.repo.clear_demo(),5)
        self.assertEqual(self.repo.stats()['observations'],0)

    def test_csv_and_geojson_exclude_unlocated_and_escape_formulas(self):
        self.repo.add_observation({'kind':'MANUAL','label':'=SUM(1+1)', 'notes':'-1+2'})
        csvstr = to_csv(self.repo.list_observations())
        row=list(csv.DictReader(io.StringIO(csvstr)))[0]
        self.assertEqual(row['label'], "'=SUM(1+1)")
        self.assertEqual(row['notes'], "'-1+2")
        self.assertEqual(len(to_geojson(self.repo.list_observations())['features']),0)

    def test_delete_only_target(self):
        first=self.repo.add_observation({'label':'One'})['id']
        second=self.repo.add_observation({'label':'Two'})['id']
        self.assertTrue(self.repo.delete_observation(first))
        self.assertFalse(self.repo.delete_observation(first))
        self.assertIsNotNone(self.repo.get_observation(second))
