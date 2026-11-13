"""No new server write routes: saved multi-location analysis is a private map view."""
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path
from openrf.storage import Repository
from openrf.server import create_server


class MultiLocationMapTests(unittest.TestCase):
    def test_read_only_spatial_assets_and_private_storage_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Repository(Path(directory) / 'local.sqlite3')
            initial = repo.list_observations()
            server = create_server(repo, port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                origin = f'http://127.0.0.1:{server.server_port}'
                for path, check in [('/', b'map-series-detail'),
                                    ('/static/survey_map.js', b'function spatialSeries('),
                                    ('/static/app.js', b'function renderMapSpatialSurvey()')]:
                    with urllib.request.urlopen(origin + path, timeout=4) as response:
                        self.assertEqual(response.status, 200)
                        self.assertIn(check, response.read())
                self.assertEqual(initial, repo.list_observations())
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=4)
