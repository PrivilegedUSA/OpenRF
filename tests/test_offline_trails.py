"""Local operator-supplied GPX references, never fabricated live hiking trails."""
import tempfile
import unittest
from pathlib import Path

from openrf.offline_trails import TrailStore, parse_gpx


GPX='''<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OpenRF test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Sample fixture</name><trkseg>
    <trkpt lat="38.5" lon="-120.5"/><trkpt lat="38.501" lon="-120.501"/>
  </trkseg><trkseg><trkpt lat="38.7" lon="-120.7"/>
    <trkpt lat="38.701" lon="-120.701"/></trkseg></trk>
</gpx>'''


class OfflineTrailsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'imported-trails.sqlite3'
        self.store=TrailStore(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_multisegment_track_keeps_gap_unconnected(self):
        parsed=parse_gpx(GPX)
        self.assertEqual(parsed['point_count'],4)
        self.assertEqual(len(parsed['segments']),2)
        self.assertGreater(parsed['distance_m'],250)
        self.assertLess(parsed['distance_m'],450)
        self.assertEqual(parsed['bounds'],[-120.701,38.5,-120.5,38.701])
        self.assertEqual(parsed['segments'][0][0],[-120.5,38.5])

    def test_import_is_local_stored_reloaded_and_attributed(self):
        self.assertEqual(self.store.list(),[])
        item=self.store.import_gpx({'name':'Creek & ridge','attribution':'My own GPS file','gpx':GPX})
        self.assertEqual(item['source'],'USER_IMPORTED_GPX_UNVERIFIED')
        self.assertEqual(item['point_count'],4)
        self.assertEqual(TrailStore(self.path).list()[0]['name'],'Creek & ridge')
        restored=TrailStore(self.path).get(item['id'])
        self.assertEqual(restored['attribution'],'My own GPS file')
        self.assertIn('not verified',restored['warning'].lower())
        gj=self.store.geojson(item['id'])
        self.assertEqual(gj['features'][0]['geometry']['type'],'MultiLineString')
        self.assertEqual(len(gj['features'][0]['geometry']['coordinates']),2)
        self.assertTrue(self.store.delete(item['id']))
        self.assertFalse(self.store.delete(item['id']))
        with self.assertRaisesRegex(ValueError,'not found'):
            self.store.get(item['id'])

    def test_single_route_is_linestring(self):
        route='<gpx><rte><rtept lat="38.5" lon="-120.5"/><rtept lat="38.6" lon="-120.6"/></rte></gpx>'
        item=self.store.import_gpx({'name':'Walking route','attribution':'Original work','gpx':route})
        self.assertEqual(self.store.geojson(item['id'])['features'][0]['geometry']['type'],'LineString')

    def test_xml_dtd_entities_scripts_and_bad_coordinates_are_rejected(self):
        invalid=[
            '<!DOCTYPE gpx [<!ENTITY x "large">]><gpx>&x;</gpx>',
            '<gpx><trk><trkseg><trkpt lat="nan" lon="0"/><trkpt lat="1" lon="2"/></trkseg></trk></gpx>',
            '<gpx><trk><trkseg><trkpt lat="91" lon="0"/><trkpt lat="1" lon="2"/></trkseg></trk></gpx>',
            '<gpx><trk><trkseg><trkpt lat="1" lon="-181"/><trkpt lat="2" lon="3"/></trkseg></trk></gpx>',
            '<gpx><trk><trkseg><trkpt lon="0"/><trkpt lat="1" lon="2"/></trkseg></trk></gpx>',
            '<html><trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg></trk></html>',
            '<gpx><wpt lat="1" lon="2"/></gpx>',
            '<gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>',
            '<gpx>', '', 'x'*500001,
        ]
        for xml in invalid:
            with self.subTest(xml=xml[:35]),self.assertRaises(ValueError):
                parse_gpx(xml)

    def test_bounded_metadata_and_explicit_source(self):
        for bad in [
            {'name':'','attribution':'Me','gpx':GPX},
            {'name':'Route','attribution':'','gpx':GPX},
            {'name':'Route','attribution':'A'*241,'gpx':GPX},
            {'name':'A'*101,'attribution':'Me','gpx':GPX},
            {'name':'Route','attribution':'Me','gpx':GPX,'sneaky':'field'},
        ]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                self.store.import_gpx(bad)
        self.assertEqual(self.store.list(),[])

    def test_point_limit_does_not_write_anything(self):
        xml='<gpx><rte>'+''.join('<rtept lat="38.5" lon="-120.5"/>' for _ in range(5001))+'</rte></gpx>'
        with self.assertRaisesRegex(ValueError,'5,000'):
            self.store.import_gpx({'name':'Oversize','attribution':'Test data','gpx':xml})
        self.assertEqual(self.store.list(),[])


if __name__=='__main__':
    unittest.main()
