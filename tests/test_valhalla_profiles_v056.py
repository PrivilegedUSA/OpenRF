"""v0.2.56 routing profile CLI tests; no real OSM downloads or Docker calls."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'tools/setup-valhalla-wsl.sh'


class ValhallaProfilesTests(unittest.TestCase):
    def run_script(self, *args, home=None, env_extra=None):
        env = dict(os.environ)
        if home is not None:
            env['HOME'] = str(home)
            env['OPENRF_VALHALLA_DATA_DIR'] = str(Path(home) / 'valhalla')
        if env_extra:
            env.update(env_extra)
        return subprocess.run(['bash', str(SCRIPT), *args], capture_output=True,
                              text=True, timeout=12, env=env)

    def test_plan_is_offline_and_offers_all_region_profiles(self):
        with tempfile.TemporaryDirectory() as tmp:
            for profile, fragment, suffix in [
                ('norcal', 'Northern California', '/north-america/us/california/norcal-latest.osm.pbf'),
                ('california', 'California', '/north-america/us/california-latest.osm.pbf'),
                ('west', 'US West', '/north-america/us-west-latest.osm.pbf'),
                ('us', 'Entire United States', '/north-america/us-latest.osm.pbf')]:
                proc = self.run_script('--plan', '--region', profile, home=tmp)
                self.assertEqual(proc.returncode, 0, proc.stderr)
                self.assertIn(fragment, proc.stdout)
                self.assertIn(suffix, proc.stdout)
                self.assertIn('no', proc.stdout.lower())
                self.assertNotIn('Downloading ', proc.stdout)
            self.assertFalse((Path(tmp) / 'valhalla').exists(), 'Plan must not create or download routing data')

    def test_usage_and_invalid_region(self):
        self.assertEqual(self.run_script('--help').returncode, 0)
        self.assertEqual(self.run_script('--plan', '--region', 'planet').returncode, 2)
        self.assertEqual(self.run_script('--region').returncode, 2)
        self.assertEqual(self.run_script('--install', '--install').returncode, 2)

    def test_status_without_docker_and_profile_data_stays_private(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'valhalla'
            (root / 'profiles' / 'west').mkdir(parents=True)
            pbf = root / 'profiles' / 'west' / 'us-west-latest.osm.pbf'
            pbf.write_bytes(b'PBF SAMPLE, not an installed Valhalla graph')
            proc = self.run_script('--status', home=tmp)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn(str(pbf), proc.stdout)
            self.assertIn('source PBF is not a built graph', proc.stdout)
            self.assertTrue(pbf.exists())

    def test_mocked_docker_new_region_is_loopback_and_preserves_old_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'valhalla'
            existing = root / 'norcal-latest.osm.pbf'
            existing.parent.mkdir(parents=True)
            existing.write_bytes(b'OSMHeader' + b'legacy')
            west = root / 'profiles' / 'west'
            west.mkdir(parents=True)
            pbf = west / 'us-west-latest.osm.pbf'
            # Sparse fixture avoids writing a multi-GB test file; it is NOT a valid OSM extract.
            with pbf.open('wb') as out:
                out.write(b'OSMHeader')
                out.truncate(1_000_000_100)
            bin_dir = Path(tmp) / 'bin'
            bin_dir.mkdir()
            docker = bin_dir / 'docker'
            docker.write_text("""#!/bin/sh
printf '%s\n' "$*" >> "$DOCKER_TEST_LOG"
case "$1 $2" in
  "info "|"image inspect") exit 0 ;;
  "container inspect") exit 1 ;;
esac
exit 0
""")
            docker.chmod(0o755)
            log = Path(tmp) / 'docker.log'
            proc = self.run_script('--install', '--region', 'west', home=tmp,
                env_extra={'PATH': str(bin_dir) + os.pathsep + os.environ['PATH'],
                           'DOCKER_TEST_LOG': str(log)})
            self.assertEqual(proc.returncode, 0, proc.stderr)
            calls=log.read_text()
            self.assertIn('run -d --name openrf-valhalla', calls)
            self.assertIn('127.0.0.1:8002:8002', calls)
            self.assertIn(str(west), calls)
            self.assertTrue(existing.exists(), 'No existing NorCal input may be removed')
            self.assertTrue(pbf.exists(), 'New profile input stays available')
            self.assertNotIn('Downloading ', proc.stdout)

    def test_invalid_pbf_rejected_without_changing_container(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'valhalla'
            root.mkdir()
            (root / 'norcal-latest.osm.pbf').write_bytes(b'invalid')
            bin_dir = Path(tmp) / 'bin'
            bin_dir.mkdir()
            docker = bin_dir / 'docker'
            docker.write_text('#!/bin/sh\nif [ "$1" = "info" ]; then exit 0; fi\nexit 1\n')
            docker.chmod(0o755)
            proc=self.run_script('--install', '--region', 'norcal', home=tmp,
                env_extra={'PATH':str(bin_dir)+os.pathsep+os.environ['PATH']})
            self.assertEqual(proc.returncode, 1)
            self.assertIn('incomplete', proc.stderr)
            self.assertTrue((root / 'norcal-latest.osm.pbf').exists())

    def test_legacy_container_and_loopback_contract(self):
        source = SCRIPT.read_text()
        self.assertIn("NAME='openrf-valhalla'", source)
        self.assertIn("-p '127.0.0.1:8002:8002'", source)
        self.assertIn('DATA_DIR="${OPENRF_VALHALLA_DATA_DIR:', source)
        self.assertIn('profiles/west', source)
        self.assertIn('MIN_FREE_GIB=100', source)
        self.assertIn('MIN_MEMORY_GIB=24', source)
        self.assertIn('OSMHeader', source)
        self.assertIn('previous_dir', source)
        self.assertIn('docker pull "$IMAGE"', source)
        self.assertNotIn('sudo', source)


if __name__ == '__main__':
    unittest.main()
