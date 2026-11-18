"""The shipped web console serves only approved OpenRF branding assets."""

import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository


class BrandingHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.server = create_server(Repository(Path(cls.temporary.name) / 'db.sqlite3'), port=0)
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join(timeout=3)
        cls.temporary.cleanup()

    def request(self, path):
        connection = HTTPConnection('127.0.0.1', self.port, timeout=5)
        connection.request('GET', path, headers={'Host': f'localhost:{self.port}'})
        response = connection.getresponse()
        status, mime, body = response.status, response.getheader('Content-Type'), response.read()
        connection.close()
        return status, mime, body

    def test_official_images_and_compatibility_favicon(self):
        paths = [
            '/favicon.ico',
            '/static/assets/openrf-icon-32.png',
            '/static/assets/openrf-icon-180.png',
            '/static/assets/openrf-icon-192.png',
            '/static/assets/openrf-icon-512.png',
            '/static/assets/openrf-wordmark-light.png',
            '/static/assets/openrf-tower-light.png',
        ]
        for path in paths:
            with self.subTest(path=path):
                status, mime, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(mime, 'image/png')
                self.assertTrue(body.startswith(b'\x89PNG\r\n\x1a\n'))
        self.assertEqual(self.request('/favicon.ico')[2], self.request('/static/assets/openrf-icon-32.png')[2])

    def test_branding_manifest_and_document_references(self):
        status, mime, raw = self.request('/manifest.webmanifest')
        self.assertEqual((status, mime), (200, 'application/manifest+json; charset=utf-8'))
        manifest = json.loads(raw)
        self.assertEqual(manifest['name'], 'OpenRF Field Console')
        self.assertEqual({icon['sizes'] for icon in manifest['icons']}, {'192x192', '512x512'})
        status, mime, html = self.request('/')
        self.assertEqual(status, 200)
        self.assertIn(b'openrf-wordmark-light.png', html)
        self.assertIn(b'/static/assets/openrf-icon-32.png', html)
        self.assertIn(b'FIELD CONSOLE', html)
        self.assertNotIn(b'<div class="logo">', html)

    def test_assets_are_explicitly_allowlisted(self):
        status, mime, raw = self.request('/static/assets/not-an-approved-image.png')
        self.assertEqual(status, 404)
        self.assertIn('application/json', mime)


if __name__ == '__main__':
    unittest.main()
