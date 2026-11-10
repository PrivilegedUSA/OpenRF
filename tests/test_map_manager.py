"""v0.2.10: bounded, local-only import/remove of synthetic test MBTiles.

Tests never download maps or submit simulated RF observations as live.
"""
from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.offline_maps import (MAX_IMPORT_BYTES, MapBusy, MapExists, MapNotFound,
                                available_maps, import_map, remove_map)
from openrf.server import create_server
from openrf.storage import Repository
from test_offline_maps import fixture, PNG


class MapImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name) / 'maps'
        self.folder.mkdir()
        self.lock = threading.Lock()
        self.source_folder = Path(self.temp.name) / 'external'
        self.source_folder.mkdir()
        self.original = fixture(self.source_folder, 'original')
        self.payload = self.original.read_bytes()

    def tearDown(self):
        self.temp.cleanup()

    def test_install_and_remove_stays_in_private_map_directory(self):
        info = import_map(self.folder, 'my-area', io.BytesIO(self.payload), len(self.payload), self.lock)
        self.assertEqual(info['id'], 'my-area')
        self.assertEqual(info['bounds'], [-121.0, 37.0, -119.0, 40.0])
        self.assertEqual(len(available_maps(self.folder)), 1)
        self.assertEqual((self.folder / 'my-area.mbtiles').read_bytes(), self.payload)
        self.assertTrue(remove_map(self.folder, 'my-area', self.lock))
        self.assertEqual(available_maps(self.folder), [])
        self.assertEqual(self.original.read_bytes(), self.payload, 'Original source was not altered')

    def test_refuses_to_overwrite_existing_package(self):
        import_map(self.folder, 'existing', io.BytesIO(self.payload), len(self.payload), self.lock)
        with self.assertRaises(MapExists):
            import_map(self.folder, 'existing', io.BytesIO(self.payload), len(self.payload), self.lock)
        self.assertEqual((self.folder / 'existing.mbtiles').read_bytes(), self.payload)

    def test_bad_data_incomplete_upload_and_invalid_name_leave_no_installed_file(self):
        for name, payload, declared in [('bad', b'x'*300, 300), ('short', self.payload, len(self.payload)+100)]:
            with self.subTest(name=name), self.assertRaises((MapNotFound, ValueError)):
                import_map(self.folder, name, io.BytesIO(payload), declared, self.lock)
        for name in ('../private', '.staging', 'bad/name', 'bad\\name', 'bad%2Fname'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                import_map(self.folder, name, io.BytesIO(self.payload), len(self.payload), self.lock)
        self.assertEqual(list(self.folder.iterdir()), [], 'No temporary imports or broken maps remain')

    def test_rejects_vector_and_missing_image_payload(self):
        vector = fixture(self.source_folder, 'vector', 'pbf')
        with self.assertRaises(MapNotFound):
            import_map(self.folder, 'vector', io.BytesIO(vector.read_bytes()), vector.stat().st_size, self.lock)
        bogus = fixture(self.source_folder, 'badpng', png=b'<html>error</html>')
        with self.assertRaises(MapNotFound):
            import_map(self.folder, 'badpng', io.BytesIO(bogus.read_bytes()), bogus.stat().st_size, self.lock)
        self.assertEqual(available_maps(self.folder), [])

    def test_limit_lock_and_symlink_protection(self):
        for count in (0, 99, MAX_IMPORT_BYTES+1):
            with self.assertRaises(ValueError):
                import_map(self.folder, 'large', io.BytesIO(b''), count, self.lock)
        self.lock.acquire()
        with self.assertRaises(MapBusy):
            import_map(self.folder, 'busy', io.BytesIO(self.payload), len(self.payload), self.lock)
        self.lock.release()
        (self.folder / 'outside.mbtiles').symlink_to(self.original)
        with self.assertRaises(MapNotFound):
            remove_map(self.folder, 'outside', self.lock)
        self.assertTrue(self.original.exists())


class MapImportHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.server = create_server(Repository(cls.root / 'investigation.sqlite3'), port=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]
        cls.source = fixture(cls.root, 'fixture')
        cls.payload = cls.source.read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.temp.cleanup()

    def call(self, method, path, body=None, headers=None):
        conn = HTTPConnection('127.0.0.1', self.port, timeout=5)
        h = {'Host': f'localhost:{self.port}', **(headers or {})}
        conn.request(method, path, body=body, headers=h)
        response = conn.getresponse()
        content = response.read()
        code = response.status
        mime = response.getheader('Content-Type', '')
        conn.close()
        return code, json.loads(content) if mime.startswith('application/json') else content

    def test_end_to_end_upload_catalog_tile_and_remove_without_data_loss(self):
        observation = self.server.repository.add_observation({'label': 'Test-only saved survey', 'kind': 'MANUAL'})
        status, result = self.call('POST', '/api/maps/import', self.payload,
                   {'Content-Type':'application/octet-stream','X-OpenRF-Map-Id':'county-area'})
        self.assertEqual(status, 201, result)
        self.assertEqual(result['map']['id'], 'county-area')
        status, listing = self.call('GET', '/api/maps')
        self.assertEqual(status, 200)
        self.assertFalse(listing['downloads_enabled'])
        self.assertTrue(listing['imports_enabled'])
        self.assertEqual(listing['maps'][0]['bounds'], [-121., 37., -119., 40.])
        status, raw = self.call('GET', '/api/maps/county-area/tiles/2/1/1.png')
        self.assertEqual((status, raw), (200, PNG))
        status, removed = self.call('DELETE', '/api/maps/county-area')
        self.assertEqual((status, removed), (200, {'removed': True}))
        status, listing = self.call('GET', '/api/maps')
        self.assertEqual(listing['maps'], [])
        self.assertEqual(self.server.repository.list_observations()[0]['id'], observation['id'])

    def test_duplicate_rejection_origin_rejection_and_invalid_package(self):
        headers = {'Content-Type':'application/octet-stream','X-OpenRF-Map-Id':'duplicate'}
        status, _ = self.call('POST', '/api/maps/import', self.payload, headers)
        self.assertEqual(status, 201)
        status, duplicate = self.call('POST', '/api/maps/import', self.payload, headers)
        self.assertEqual(status, 409)
        self.assertIn('Rename', duplicate['error'])
        status, _ = self.call('DELETE', '/api/maps/duplicate', headers={'Origin':'https://outside.test'})
        self.assertEqual(status, 403)
        status, _ = self.call('POST', '/api/maps/import', self.payload, {**headers, 'Origin':'https://outside.test', 'X-OpenRF-Map-Id':'outside'})
        self.assertEqual(status, 403)
        status, _ = self.call('POST', '/api/maps/import', b'not SQLite' * 20,
                    {'Content-Type':'application/octet-stream','X-OpenRF-Map-Id':'corrupt'})
        self.assertEqual(status, 400)
        self.assertFalse((self.server.map_directory/'corrupt.mbtiles').exists())
        status, _ = self.call('DELETE', '/api/maps/duplicate')
        self.assertEqual(status, 200)

    def test_prohibited_paths_and_formats(self):
        status, _ = self.call('DELETE', '/api/maps/../db')
        self.assertEqual(status, 404)
        status, _ = self.call('POST', '/api/maps/import', self.payload,
                    {'Content-Type':'application/json', 'X-OpenRF-Map-Id':'badtype'})
        self.assertEqual(status, 415)
        status, _ = self.call('POST', '/api/maps/import', self.payload,
                    {'Content-Type':'application/octet-stream', 'X-OpenRF-Map-Id':'../bad'})
        self.assertEqual(status, 400)
