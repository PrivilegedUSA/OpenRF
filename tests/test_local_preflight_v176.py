"""Local WSL preflight launchers: syntax and CI source-list drift checks."""
from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class LocalPreflightTests(unittest.TestCase):
    def test_linux_launcher_syntax_and_explicit_no_push(self):
        source = (ROOT / 'tools/test-openrf-linux.sh').read_text('utf-8')
        result = subprocess.run(['bash', '-n', str(ROOT / 'tools/test-openrf-linux.sh')],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('python_bin="${1:-python3}"', source)
        self.assertIn('unittest discover -s tests -q', source)
        self.assertIn('tests/*.js', source)
        self.assertNotRegex(source, r'git\s+(push|commit|add)|curl\s|wget\s')

    def test_powershell_launcher_targets_wsl_and_project_directory(self):
        source = (ROOT / 'tools/Test-OpenRF.ps1').read_text('utf-8')
        self.assertIn('Join-Path $PSScriptRoot', source)
        self.assertIn('wslpath -u $projectRoot', source)
        self.assertIn('bash ./tools/test-openrf-linux.sh', source)
        self.assertNotRegex(source, r'(?i)git\s+(push|commit|add)|Expand-Archive|Invoke-WebRequest')

    def test_node_syntax_files_match_github_linux_ci(self):
        workflow = (ROOT / '.github/workflows/openrf-linux.yml').read_text('utf-8')
        local = (ROOT / 'tools/test-openrf-linux.sh').read_text('utf-8')
        checked = set(re.findall(r'node --check (openrf/static/[\w-]+\.js)', workflow))
        local_sources = set(re.findall(r'openrf/static/[\w-]+\.js', local))
        self.assertGreater(len(checked), 8)
        self.assertEqual(checked, local_sources)


if __name__ == '__main__':
    unittest.main()
