"""Manual observation browser location must remain labeled and validated."""
import tempfile
import unittest
from pathlib import Path
from openrf.storage import Repository, normalize_observation


class ManualLocationTests(unittest.TestCase):
    def test_saved_browser_fix_keeps_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Repository(Path(tmp) / 'observations.sqlite3')
            item = repo.add_observation({
                'label':'Visual roadside observation',
                'latitude':38.486, 'longitude':-120.623, 'accuracy_m':107,
                'location_source':'BROWSER_REPORTED', 'fix_age_seconds':3.5,
            })
            self.assertEqual(item['location_source'],'BROWSER_REPORTED')
            self.assertEqual(item['fix_age_seconds'],3.5)
            self.assertEqual(item['source'],'MANUAL')
            self.assertEqual(item['source_device'],'Manual entry')
            self.assertEqual(repo.get_observation(item['id'])['latitude'],38.486)

    def test_manual_coordinate_entry_has_no_browser_fix_claim(self):
        data=normalize_observation({
            'label':'Map-selected point', 'latitude':0,'longitude':0,
            'location_source':'MANUAL_ENTRY'
        })
        self.assertEqual(data['location_source'],'MANUAL_ENTRY')
        self.assertIsNone(data['fix_age_seconds'])

    def test_no_false_fixes_or_partial_browser_metadata(self):
        invalid=[
            {'location_source':'BROWSER_REPORTED'},
            {'latitude':10,'longitude':20,'location_source':'BROWSER_REPORTED','accuracy_m':10},
            {'latitude':10,'longitude':20,'location_source':'BROWSER_REPORTED','accuracy_m':10,'fix_age_seconds':61},
            {'latitude':10,'longitude':20,'location_source':'BROWSER_REPORTED','accuracy_m':10,'fix_age_seconds':-1},
            {'latitude':10,'longitude':20,'location_source':'FAKE_GPS'},
            {'latitude':10,'longitude':20,'location_source':'MANUAL_ENTRY','fix_age_seconds':1},
            {'location_source':'MANUAL_ENTRY'},
            {'latitude':10,'longitude':20,'location_source':'UNSPECIFIED','fix_age_seconds':1},
        ]
        for values in invalid:
            with self.subTest(values=values), self.assertRaises(ValueError):
                normalize_observation({'label':'Test','kind':'MANUAL', **values})

if __name__ == '__main__': unittest.main()
