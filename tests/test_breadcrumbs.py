"""Private, opt-in browser-position breadcrumbs; all locations below are test fixtures."""
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

from openrf.breadcrumbs import BreadcrumbStore, MAX_POINTS


def fix(**changes):
    position = {'latitude':38.1234,'longitude':-120.5678,'accuracy_m':7.5,
                'fix_age_seconds':1,'observed_utc':datetime.now(timezone.utc).isoformat(),
                'source_device':'BROWSER_GEOLOCATION'}
    position.update(changes)
    return position


class BreadcrumbTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.database=Path(self.tmp.name)/'openrf.sqlite3'
        self.store=BreadcrumbStore(self.database)

    def tearDown(self):
        self.tmp.cleanup()

    def test_start_stop_delete_is_explicit_and_persistent(self):
        self.assertEqual(self.store.sessions(),[])
        session=self.store.start('Evening walk')
        self.assertEqual(session['state'],'RECORDING')
        with self.assertRaisesRegex(ValueError,'already active'):
            self.store.start('Another')
        self.assertFalse(self.store.delete(session['id']))
        self.assertTrue(self.store.append(session['id'],fix())['saved'])
        self.assertEqual(self.store.sessions()[0]['point_count'],1)
        self.assertTrue(self.store.stop(session['id']))
        self.assertFalse(self.store.stop(session['id']))
        self.assertEqual(BreadcrumbStore(self.database).geometry(session['id'])['point_count'],1)
        self.assertTrue(self.store.delete(session['id']))
        self.assertEqual(self.store.sessions(),[])
        with self.assertRaisesRegex(ValueError,'Unknown'):
            self.store.geometry(session['id'])

    def test_unfinished_sessions_interrupted_after_server_restart(self):
        ident=self.store.start('Interrupted')['id']
        reopened=BreadcrumbStore(self.database)
        self.assertEqual(reopened.sessions()[0]['state'],'INTERRUPTED')
        self.assertFalse(reopened.stop(ident))
        with self.assertRaisesRegex(ValueError,'stopped'):
            reopened.append(ident,fix())
        self.assertTrue(reopened.delete(ident))

    def test_stale_inaccurate_fake_and_malformed_positions_never_saved(self):
        ident=self.store.start('Safety validation')['id']
        invalid=[
            fix(accuracy_m=101),fix(accuracy_m=-1),fix(fix_age_seconds=31),
            fix(latitude=100),fix(longitude=-181),fix(latitude=float('nan')),
            fix(source_device='EXTERNAL_GPS'),fix(observed_utc='not-a-time'),
            fix(observed_utc=(datetime.now(timezone.utc)-timedelta(minutes=2)).isoformat()),
            fix(observed_utc=(datetime.now(timezone.utc)+timedelta(minutes=2)).isoformat()),
            fix(latitude=True),{**fix(),'extra_field':'danger'}
        ]
        for payload in invalid:
            with self.subTest(payload=payload),self.assertRaises(ValueError):
                self.store.append(ident,payload)
        self.assertEqual(self.store.geometry(ident)['point_count'],0)

    def test_distances_and_exports_keep_browser_provenance(self):
        ident=self.store.start('Creek & <ridge>')['id']
        self.store.append(ident,fix())
        next_time=(datetime.now(timezone.utc)+timedelta(seconds=10)).isoformat(timespec='seconds')
        with patch('openrf.breadcrumbs._utc',return_value=next_time):
            self.assertTrue(self.store.append(ident,fix(latitude=38.124))['saved'])
            self.assertFalse(self.store.append(ident,fix(latitude=38.125))['saved'])
        geometry=self.store.geometry(ident)
        self.assertEqual(geometry['point_count'],2)
        self.assertGreater(geometry['distance_m'],50)
        self.assertLess(geometry['distance_m'],100)
        self.assertEqual(geometry['source'],'BROWSER_REPORTED_UNVERIFIED')
        geojson=self.store.geojson(ident)
        coords=geojson['features'][0]['geometry']['coordinates']
        self.assertEqual(coords,[[-120.5678,38.1234],[-120.5678,38.124]])
        xml=self.store.gpx(ident)
        root=ElementTree.fromstring(xml)
        self.assertIn('Creek &amp; &lt;ridge&gt;',xml)
        self.assertNotIn('<hdop>',xml)
        self.assertEqual(len(root.findall('.//{http://www.topografix.com/GPX/1/1}trkpt')),2)
        self.assertIn('BROWSER',geojson['features'][0]['properties']['source'])

    def test_rejects_impossible_jump_and_limits(self):
        ident=self.store.start('Bounded')['id']
        self.store.append(ident,fix())
        next_time=(datetime.now(timezone.utc)+timedelta(seconds=10)).isoformat(timespec='seconds')
        with patch('openrf.breadcrumbs._utc',return_value=next_time):
            with self.assertRaisesRegex(ValueError,'Impossible jump'):
                self.store.append(ident,fix(latitude=39.5))
        with sqlite3.connect(self.database) as conn:
            conn.executemany('''INSERT INTO breadcrumb_points (session_id,received_utc,observed_utc,
                latitude,longitude,accuracy_m,fix_age_seconds) VALUES (?,?,?,?,?,?,?)''',
                [(ident,'2026-01-01T00:00:00+00:00','2026-01-01T00:00:00+00:00',
                  38.1234,-120.5678,5.0,1.0)]*(MAX_POINTS-1))
        with self.assertRaisesRegex(ValueError,'Maximum track points'):
            self.store.append(ident,fix())
        for invalid in ('', ' '*6,'a'*81,7,None):
            with self.assertRaises(ValueError):
                self.store.start(invalid)


if __name__=='__main__':
    unittest.main()
