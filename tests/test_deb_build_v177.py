"""Installer source consistency and negative archive-verifier cases (no hardware)."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    'openrf_deb_verify', ROOT/'tools/verify_openrf_deb.py')
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class DebBuildTests(unittest.TestCase):
    def test_metadata_and_build_launcher_paths(self):
        pkg = json.loads((ROOT/'tools/openrf-electron/package.json').read_text('utf-8'))
        lock = json.loads((ROOT/'tools/openrf-electron/package-lock.json').read_text('utf-8'))
        version = (ROOT/'openrf/__init__.py').read_text('utf-8').split('"')[1]
        self.assertEqual(pkg['version'], version)
        self.assertEqual(lock['version'], version)
        self.assertEqual(pkg['license'], 'GPL-3.0-or-later')
        self.assertEqual(lock['packages']['']['license'], pkg['license'])
        self.assertEqual(pkg['homepage'], 'https://github.com/PrivilegedUSA/OpenRF')
        self.assertNotIn('localhost', pkg['author'])
        self.assertEqual(pkg['build']['linux']['maintainer'], 'PrivilegedUSA')
        self.assertTrue({'LICENSE', 'COPYRIGHT'} <= {
            resource['to'] for resource in pkg['build']['extraResources']})

        script = ROOT/'tools/build-openrf-deb.sh'
        result = subprocess.run(['bash', '-n', str(script)], capture_output=True,
                                text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        content = script.read_text('utf-8')
        self.assertIn('npm ci --no-audit --no-fund', content)
        self.assertIn('test-openrf-linux.sh', content)
        self.assertIn('verify_openrf_deb.py', content)
        self.assertNotIn('sudo ', content)
        self.assertNotIn('git push', content)

        wrapper = (ROOT/'tools/Build-OpenRF-Deb.ps1').read_text('utf-8')
        self.assertIn('Join-Path $PSScriptRoot', wrapper)
        self.assertIn('wslpath -u $projectRoot', wrapper)
        self.assertIn('bash ./tools/build-openrf-deb.sh $Architecture', wrapper)
        self.assertNotIn('git push', wrapper)

    def test_deb_verifier_requires_matching_metadata_and_packaged_license(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'OpenRF-0.2.177-arm64.deb'
            path.write_bytes(b'mocked package; dpkg responses are synthetic')
            fields = {
                'Package': 'openrf', 'Version': '0.2.177',
                'Architecture': 'arm64', 'Maintainer': 'PrivilegedUSA',
                'Homepage': 'https://github.com/PrivilegedUSA/OpenRF',
                'Depends': ('libnss3, python3 (>= 3.11), '
                            'libgtk-3-0 | libgtk-3-0t64, '
                            'libatspi2.0-0 | libatspi2.0-0t64, '
                            'libasound2 | libasound2t64'),
            }
            files = tuple('./'+name for name in (
                'opt/OpenRF/openrf',
                'opt/OpenRF/resources/project/openrf/__main__.py',
                'opt/OpenRF/resources/project/openrf/static/index.html',
                'opt/OpenRF/resources/pi-startup.py',
                'opt/OpenRF/resources/LICENSE',
                'opt/OpenRF/resources/COPYRIGHT',
                'usr/share/applications/org.openrf.fieldconsole.desktop'))

            def fake_dpkg(*args):
                if args[0] == '-f':
                    return fields[args[-1]]
                return '\n'.join('-rw-r--r-- user group 123 Jan 01 00:00 '+p for p in files)

            with patch.object(VERIFIER, '_dpkg', side_effect=fake_dpkg):
                self.assertEqual(VERIFIER.verify(path, '0.2.177', 'arm64')['status'],
                                 'metadata and contents passed')
                fields['Architecture'] = 'amd64'
                with self.assertRaisesRegex(ValueError, 'Architecture mismatch'):
                    VERIFIER.verify(path, '0.2.177', 'arm64')
                fields['Architecture'] = 'arm64'
                with patch.object(VERIFIER, '_dpkg', side_effect=lambda *args:
                                  '\n'.join('-rw-r--r-- u g 10 Jan 01 00:00 '+p
                                            for p in files if not p.endswith('/LICENSE'))
                                  if args[0] == '-c' else fields[args[-1]]):
                    with self.assertRaisesRegex(ValueError, 'LICENSE'):
                        VERIFIER.verify(path, '0.2.177', 'arm64')

            with self.assertRaisesRegex(ValueError, 'Missing expected package'):
                VERIFIER.verify(path, '0.2.177', 'amd64')


if __name__ == '__main__':
    unittest.main()
