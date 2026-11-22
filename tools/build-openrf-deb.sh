#!/usr/bin/env bash
# Build and inspect the optional native Electron Debian installers locally.
# Never installs system packages, opens LAN ports, or touches Git/Actions.
set -Eeuo pipefail

architecture="${1:-both}"
if [[ $# -gt 1 || ! "$architecture" =~ ^(amd64|arm64|both)$ ]]; then
  printf 'Usage: bash tools/build-openrf-deb.sh [amd64|arm64|both]\n' >&2
  exit 2
fi

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
shell_root="$project_root/tools/openrf-electron"

for cmd in python3 node npm dpkg-deb sha256sum; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'Missing %s. Install it in Ubuntu/WSL before building Debian packages.\n' "$cmd" >&2
    exit 2
  fi
done

version="$(python3 - "$project_root" <<'PY'
import json
import re
import sys
from pathlib import Path

project = Path(sys.argv[1])
package = json.loads((project/'tools/openrf-electron/package.json').read_text('utf-8'))
lock = json.loads((project/'tools/openrf-electron/package-lock.json').read_text('utf-8'))
python = (project/'openrf/__init__.py').read_text('utf-8')
backend = (project/'tools/openrf-electron/backend.js').read_text('utf-8')
match = re.search(r'__version__\s*=\s*"(\d+\.\d+\.\d+)"', python)
if not match:
    sys.exit('OpenRF Python version could not be read.')
version = match.group(1)
assert package['version'] == version, 'Electron package version mismatch'
assert lock['version'] == version == lock['packages']['']['version'], 'npm lock version mismatch'
assert f"EXPECTED_VERSION = '{version}'" in backend, 'Electron backend version mismatch'
assert package['license'] == lock['packages']['']['license'] == 'GPL-3.0-or-later', 'License metadata mismatch'
assert package['homepage'] == 'https://github.com/PrivilegedUSA/OpenRF', 'Project homepage mismatch'
print(version)
PY
)"

printf 'Building OpenRF %s Debian package(s): %s\n' "$version" "$architecture"
printf 'Run local tests before packaging; neither this script nor the tests use GitHub Actions.\n'
bash "$project_root/tools/test-openrf-linux.sh"

printf '\nInstalling pinned Electron build dependencies (npm ci may download packages)...\n'
cd "$shell_root"
npm ci --no-audit --no-fund

if [[ "$architecture" == 'amd64' || "$architecture" == 'both' ]]; then
  npm run build:deb:x64
  python3 "$project_root/tools/verify_openrf_deb.py" \
    "$shell_root/dist/OpenRF-$version-amd64.deb" "$version" amd64
  sha256sum "$shell_root/dist/OpenRF-$version-amd64.deb"
fi

if [[ "$architecture" == 'arm64' || "$architecture" == 'both' ]]; then
  npm run build:deb:arm64
  python3 "$project_root/tools/verify_openrf_deb.py" \
    "$shell_root/dist/OpenRF-$version-arm64.deb" "$version" arm64
  sha256sum "$shell_root/dist/OpenRF-$version-arm64.deb"
fi

printf '\nPASS: Installer builds and static package inspections completed.\n'
printf 'Output directory: %s/dist\n' "$shell_root"
printf 'Still required: a real GUI install/upgrade test and Raspberry Pi ARM64 touchscreen test.\n'
