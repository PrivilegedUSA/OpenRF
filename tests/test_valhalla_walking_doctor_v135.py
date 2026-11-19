"""Read-only --doctor checks both modes and never uses a browser/GPS location."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


TOOL = Path(__file__).resolve().parents[1] / 'tools' / 'setup-valhalla-wsl.sh'


class WalkingGraphDoctorTests(unittest.TestCase):
    def test_plan_is_offline_and_names_shared_pedestrian_graph(self):
        completed = subprocess.run(['bash', str(TOOL), '--plan', '--region', 'norcal'],
                                   capture_output=True, text=True, timeout=5)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn('separate walking PBF is not required', completed.stdout)
        self.assertIn('--doctor', completed.stdout)

    def _doctor(self, *, walking_error=False):
        with tempfile.TemporaryDirectory() as temp:
            bin_dir = Path(temp)
            docker = bin_dir / 'docker'
            docker.write_text('#!/bin/sh\nexit 0\n', encoding='utf-8')
            docker.chmod(0o755)
            curl = bin_dir / 'curl'
            curl.write_text('''#!/bin/sh
case " $* " in
  *'/status'*) printf '%s' '{}' ; exit 0 ;;
  *'"costing":"pedestrian"'*)
    if [ "$MOCK_WALKING_FAIL" = 1 ]; then
      printf '%s' '{"error":"No pedestrian tiles"}'
    else
      printf '%s' '{"trip":{"summary":{"length":0.2},"legs":[{"maneuvers":[]}]}}'
    fi
    exit 0 ;;
  *) printf '%s' '{"trip":{"summary":{"length":35.0},"legs":[{"maneuvers":[]}]}}'; exit 0 ;;
esac
''', encoding='utf-8')
            curl.chmod(0o755)
            env = os.environ.copy()
            env['PATH'] = f'{bin_dir}:{env.get("PATH", "")}'
            env['MOCK_WALKING_FAIL'] = '1' if walking_error else '0'
            return subprocess.run(['bash', str(TOOL), '--doctor'], env=env,
                                  capture_output=True, text=True, timeout=12)

    def test_local_example_checks_both_route_costing_modes(self):
        completed = self._doctor()
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn('Sacramento-to-Auburn drivable graph is available', completed.stdout)
        self.assertIn('Pedestrian sample: OK', completed.stdout)
        self.assertIn('not your GPS', completed.stdout)
        self.assertIn('Neither sample verifies', completed.stdout)

    def test_missing_pedestrian_tiles_are_not_claimed_working(self):
        completed = self._doctor(walking_error=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn('Pedestrian sample: unavailable', completed.stdout)
        self.assertNotIn('Pedestrian sample: OK', completed.stdout)


if __name__ == '__main__':
    unittest.main()
