"""v0.2.151: browser workspace is served locally with isolated web previews."""
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository


class BrowserWorkspaceHTTPTests(unittest.TestCase):
    def test_browser_asset_headers_and_local_api_are_not_public(self):
        with tempfile.TemporaryDirectory() as temp:
            server = create_server(Repository(Path(temp) / 'openrf.sqlite3'), port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                port = server.server_address[1]

                def get(path, host=None):
                    conn = HTTPConnection('127.0.0.1', port, timeout=5)
                    conn.request('GET', path, headers={'Host': host or f'localhost:{port}'})
                    response = conn.getresponse()
                    data = (response.status, response.read(), dict(response.getheaders()))
                    conn.close()
                    return data

                status, source, headers = get('/static/browser-workspace.js?v=0.2.151')
                self.assertEqual(status, 200)
                self.assertIn(b'openrf.browser.workspace.v1', source)
                self.assertEqual(headers['X-Frame-Options'], 'DENY')
                self.assertIn('frame-src https:', headers['Content-Security-Policy'])
                self.assertIn("default-src 'self'", headers['Content-Security-Policy'])
                self.assertIn("connect-src 'self'", headers['Content-Security-Policy'])
                status, html, _ = get('/')
                self.assertEqual(status, 200)
                self.assertIn(b'/static/browser-workspace.js?v=0.2.151', html)
                self.assertIn(b'sandbox="allow-scripts allow-forms"', html)
                self.assertIn(b'rel="noopener noreferrer"', html)
                self.assertEqual(get('/static/browser-workspace.js', 'evil.example')[0], 403)
                self.assertEqual(get('/api/device/storage', 'evil.example')[0], 403)
                self.assertEqual(get('/api/browser/fetch?url=https://example.com')[0], 404)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
