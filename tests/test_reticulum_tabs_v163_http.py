"""Catch regressions where a bundled frontend script is not served at all."""
from html.parser import HTMLParser
from http.client import HTTPConnection
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from urllib.parse import urlsplit

from openrf.server import create_server
from openrf.storage import Repository


class _Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            attr = dict(attrs)
            src = attr.get('src', '')
            if src.startswith('/static/'):
                self.paths.append(urlsplit(src).path)


class ReticulumStaticAssetTests(unittest.TestCase):
    def test_all_index_scripts_are_actually_served(self):
        with TemporaryDirectory() as temp:
            server = create_server(Repository(Path(temp) / 'db.sqlite3'), port=0)
            worker = Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                port = server.server_address[1]

                def get(path):
                    conn = HTTPConnection('127.0.0.1', port, timeout=5)
                    try:
                        conn.request('GET', path, headers={'Host': f'localhost:{port}'})
                        response = conn.getresponse()
                        return response.status, response.read()
                    finally:
                        conn.close()

                status, html = get('/')
                self.assertEqual(status, 200)
                self.assertIn(b'/static/reticulum-tabs.js?v=0.2.163', html)
                parser = _Scripts()
                parser.feed(html.decode('utf-8'))
                self.assertIn('/static/reticulum-tabs.js', parser.paths)
                for path in parser.paths:
                    with self.subTest(script=path):
                        code, body = get(path)
                        self.assertEqual(code, 200, f'{path} is referenced by HTML but not served')
                        self.assertTrue(body, f'{path} has no bytes')
                self.assertIn(b'window.OpenRFReticulumTabs', get('/static/reticulum-tabs.js')[1])
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
