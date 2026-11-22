"""Read-only validation of one built OpenRF Debian package.

Run from the project directory:
    python3 tools/verify_openrf_deb.py path/to/OpenRF-0.2.177-amd64.deb 0.2.177 amd64
This checks metadata and package inventory; it never installs or executes it.
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


def _dpkg(*args: str) -> str:
    result = subprocess.run(('dpkg-deb', *args), capture_output=True,
                            text=True, check=False)
    if result.returncode:
        raise ValueError(f"dpkg-deb failed ({result.returncode}): {result.stderr.strip()}")
    return result.stdout.strip()


def verify(path: Path, version: str, architecture: str) -> dict[str, str]:
    if architecture not in ('amd64', 'arm64'):
        raise ValueError('Architecture must be amd64 or arm64.')
    if not path.is_file() or path.name != f'OpenRF-{version}-{architecture}.deb':
        raise ValueError(f'Missing expected package OpenRF-{version}-{architecture}.deb')

    for field, expected in [('Package', 'openrf'), ('Version', version),
                            ('Architecture', architecture)]:
        actual = _dpkg('-f', str(path), field)
        if actual != expected:
            raise ValueError(f'{field} mismatch: expected {expected}, got {actual!r}')

    depends = _dpkg('-f', str(path), 'Depends')
    if 'python3 (>= 3.11)' not in depends or 'libnss3' not in depends:
        raise ValueError(f'Missing mandatory Python/Chromium dependencies: {depends}')
    for alternative in ('libgtk-3-0 | libgtk-3-0t64',
                        'libatspi2.0-0 | libatspi2.0-0t64',
                        'libasound2 | libasound2t64'):
        if alternative not in depends:
            raise ValueError(f'Missing Debian old/new ABI dependency alternatives: {alternative}')
    homepage = _dpkg('-f', str(path), 'Homepage')
    if homepage != 'https://github.com/PrivilegedUSA/OpenRF':
        raise ValueError(f'Unexpected package homepage: {homepage!r}')
    maintainer = _dpkg('-f', str(path), 'Maintainer')
    if 'PrivilegedUSA' not in maintainer or 'localhost' in maintainer:
        raise ValueError('Missing public project maintainer name.')

    listing = _dpkg('-c', str(path))
    paths = {line.split()[-1].rstrip('/') for line in listing.splitlines() if line.strip()}
    required = (
        './opt/OpenRF/openrf',
        './opt/OpenRF/resources/project/openrf/__main__.py',
        './opt/OpenRF/resources/project/openrf/static/index.html',
        './opt/OpenRF/resources/pi-startup.py',
        './opt/OpenRF/resources/LICENSE',
        './opt/OpenRF/resources/COPYRIGHT',
        './usr/share/applications/org.openrf.fieldconsole.desktop',
    )
    missing = [entry for entry in required if entry not in paths]
    if missing:
        raise ValueError(f'Package missing required files: {missing}')
    if any(any(part in item.split('/') for part in (
            '.git', '.openrf-state', 'local-data', 'credentials', 'node_modules'))
            or item.endswith(('.sqlite', '.sqlite3', '.db', '.key')) for item in paths):
        raise ValueError('Package contains a forbidden local data/build directory or file.')

    return {'package': str(path), 'version': version, 'architecture': architecture,
            'maintainer': maintainer, 'status': 'metadata and contents passed'}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('version')
    parser.add_argument('architecture', choices=('amd64', 'arm64'))
    args = parser.parse_args()
    result = verify(args.package.resolve(), args.version, args.architecture)
    print('PASS: {package}: {status}'.format(**result))


if __name__ == '__main__':
    main()
