"""Public static script and private observer map source delivery, no remote RF tests."""
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path
from openrf.storage import Repository
from openrf.server import create_server


class SurveyMapAssetTests(unittest.TestCase):
    def test_map_script_is_served_locally_and_does_not_record_observations(self):
        with tempfile.TemporaryDirectory() as path:
            repo=Repository(Path(path)/'private.sqlite3')
            before=repo.list_observations()
            server=create_server(repo,port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                origin=f'http://127.0.0.1:{server.server_port}'
                with urllib.request.urlopen(origin+'/static/survey_map.js',timeout=4) as response:
                    js=response.read().decode('utf-8')
                    self.assertEqual(response.status,200)
                    self.assertIn('function visible(',js)
                    self.assertIn('transmitter position',js)
                    self.assertIn('javascript',response.headers.get('Content-Type',''))
                with urllib.request.urlopen(origin+'/',timeout=4) as response:
                    html=response.read().decode('utf-8')
                    self.assertIn('/static/survey_map.js?v=0.2.40',html)
                    self.assertIn('id="map-observation-detail"',html)
                self.assertEqual(before,repo.list_observations())
            finally:
                server.shutdown()
                server.server_close()
                thread.join(4)
