"""Best-effort restart of an *existing* local Valhalla container at OpenRF startup.

Never downloads, builds, creates containers or starts Docker Desktop. The
operator can disable with OPENRF_VALHALLA_AUTOSTART=0. No network addresses
other than the established local Valhalla service are configured here.
"""
from __future__ import annotations
import os
import shutil
import subprocess


def ensure_existing_valhalla(*, which=shutil.which, runner=subprocess.run, environ=None):
    env = os.environ if environ is None else environ
    if env.get('OPENRF_VALHALLA_AUTOSTART','1').lower() in ('0','false','no'):
        return 'Automatic restart of the existing Valhalla container is disabled.'
    binary = which('docker')
    if not binary:
        return 'Valhalla auto-start skipped (Docker CLI unavailable). Start Docker Desktop to use local routing.'
    try:
        inspect = runner([binary, 'inspect', '--format', '{{.State.Running}}', 'openrf-valhalla'],
                         capture_output=True, text=True, timeout=4, check=False)
        if inspect.returncode != 0:
            return 'Docker is unavailable or no existing OpenRF Valhalla container was found. Start Docker Desktop if needed; no download was started.'
        if inspect.stdout.strip().lower() == 'true':
            return 'Existing Valhalla container is running; route availability depends on graph coverage.'
        started = runner([binary,'start','openrf-valhalla'], capture_output=True, text=True,
                         timeout=10, check=False)
        if started.returncode:
            return 'Valhalla container could not restart; check Docker Desktop and --doctor.'
        return 'Existing Valhalla container restarted (road routing will be ready after its HTTP service starts).'
    except (OSError, subprocess.TimeoutExpired):
        return 'Valhalla auto-start was unavailable or timed out. Start Docker Desktop and use --doctor.'
