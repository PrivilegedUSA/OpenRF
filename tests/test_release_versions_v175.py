"""Prevent Python/JS/Electron/lockfile version drift in GitHub Actions."""
import json
from pathlib import Path
import re
import unittest

from openrf import __version__


ROOT = Path(__file__).resolve().parents[1]


class ReleaseVersionConsistencyTests(unittest.TestCase):
    def test_versioned_source_files_match_backend(self):
        version=__version__
        html=(ROOT/'openrf/static/index.html').read_text('utf-8')
        backend=(ROOT/'tools/openrf-electron/backend.js').read_text('utf-8')
        manifest=(ROOT/'BUNDLE_FORMAT.md').read_text('utf-8')
        package=json.loads((ROOT/'tools/openrf-electron/package.json').read_text('utf-8'))
        lock=json.loads((ROOT/'tools/openrf-electron/package-lock.json').read_text('utf-8'))
        self.assertIn(f'FIELD CONSOLE · {version}',html)
        self.assertIn(f'/static/weather.js?v={version}',html)
        self.assertIn(f"const EXPECTED_VERSION = '{version}';",backend)
        self.assertEqual(package['version'],version)
        self.assertEqual(lock['version'],version)
        self.assertEqual(lock['packages']['']['version'],version)
        self.assertRegex(manifest,r'"version": "'+re.escape(version)+r'"')


if __name__=='__main__':
    unittest.main()
