"""Offline MBTiles integration tests. Files here are synthetic tile fixtures, not real maps."""
import base64
import sqlite3
import tempfile
import unittest
from pathlib import Path

from openrf.offline_maps import available_maps, map_info, tile_bytes, MapNotFound, TileMissing

# A tiny actual PNG, generated solely for protocol tests; not a real map tile.
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=')


def fixture(directory, name='survey', fmt='png', *, png=PNG, tms_y=2):
    path = directory / f'{name}.mbtiles'
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE metadata (name text, value text)')
        db.executemany('INSERT INTO metadata VALUES(?,?)', [('format', fmt),('name','Synthetic TEST ONLY'),
                         ('minzoom','2'),('maxzoom','4'),('bounds','-121,37,-119,40'),('attribution','TEST')])
        db.execute('CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)')
        db.execute('INSERT INTO tiles VALUES (2,1,?,?)',(tms_y, png))
    return path


class RasterMBTilesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_catalog_and_tms_xyz_flip(self):
        fixture(self.folder)
        maps = available_maps(self.folder)
        self.assertEqual(len(maps), 1)
        self.assertEqual(maps[0]['name'], 'Synthetic TEST ONLY')
        self.assertEqual(maps[0]['bounds'], [-121., 37., -119., 40.])
        # y=1 in XYZ is 2 in TMS at z2.
        raw, mime = tile_bytes(self.folder,'survey',2,1,1)
        self.assertEqual(raw, PNG)
        self.assertEqual(mime, 'image/png')
        with self.assertRaises(TileMissing):
            tile_bytes(self.folder,'survey',2,1,2)

    def test_no_scan_of_private_paths_symlinks_or_unsafe_identifiers(self):
        fixture(self.folder)
        for ident in ('../survey', 'survey/../secret', '.hidden', 'survey%2f..', 'survey\\secret'):
            with self.assertRaises(MapNotFound):
                map_info(self.folder,ident)
        (self.folder / 'linked.mbtiles').symlink_to(self.folder / 'survey.mbtiles')
        self.assertEqual(len(available_maps(self.folder)),1)
        with self.assertRaises(MapNotFound):
            tile_bytes(self.folder,'linked',2,1,1)

    def test_reject_nonraster_malformed_and_bad_magic(self):
        fixture(self.folder, 'vector',fmt='pbf')
        fixture(self.folder, 'invalid',fmt='png',png=b'<html>bogus</html>')
        (self.folder / 'corrupt.mbtiles').write_bytes(b'not sqlite')
        self.assertEqual([m['id'] for m in available_maps(self.folder)],[])
        with self.assertRaises(MapNotFound):
            tile_bytes(self.folder,'invalid',2,1,1)
        with self.assertRaises(MapNotFound):
            map_info(self.folder,'vector')
        with self.assertRaises(MapNotFound):
            map_info(self.folder,'corrupt')

    def test_missing_map_dir(self):
        self.assertEqual(available_maps(self.folder/'absent'), [])
