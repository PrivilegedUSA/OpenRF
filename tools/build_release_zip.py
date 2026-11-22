"""Build a deterministic Windows-compatible OpenRF bundle (ZIP32/Deflate).

Usage from a directory containing `work176/`:
  python3 work176/project/tools/build_release_zip.py \
      --source-root work176 --output OpenRF-v0.2.176.zip

The bundle contains only openrf-bundle.json at ZIP root and managed project/.
User-owned updater scripts, Git, local data and credentials are never collected.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo


def build(source_root: Path, output: Path) -> dict:
    source_root = source_root.resolve()
    output = output.resolve()
    manifest_file = source_root / 'openrf-bundle.json'
    project = source_root / 'project'
    if not manifest_file.is_file() or not project.is_dir():
        raise ValueError('Source must contain ZIP-root openrf-bundle.json and project/.')
    manifest = json.loads(manifest_file.read_text('utf-8'))
    if (set(manifest) != {'project', 'formatVersion', 'version'}
            or manifest['project'] != 'OpenRF' or manifest['formatVersion'] != 1
            or not isinstance(manifest['version'], str)
            or not re.fullmatch(r'\d+\.\d+\.\d+', manifest['version'])):
        raise ValueError('Invalid OpenRF bundle manifest.')
    expected_name = f"OpenRF-v{manifest['version']}.zip"
    if output.name != expected_name:
        raise ValueError('Expected archive filename ' + expected_name)
    def skipped(path: Path) -> bool:
        return path.name == '.DS_Store' or path.suffix == '.pyc' or any(
            part in ('__pycache__', '.pytest_cache') for part in path.relative_to(source_root).parts)

    dirs = [project] + [p for p in sorted(project.rglob('*')) if p.is_dir() and not skipped(p)]
    files = [manifest_file] + [p for p in sorted(project.rglob('*')) if p.is_file() and not skipped(p)]
    reserved = {'.git', '.openrf-state', 'local-data', 'credentials',
                'Update-OpenRF.ps1', 'Setup-OpenRF.ps1'}
    if any(reserved.intersection(path.relative_to(source_root).parts) for path in dirs + files):
        raise ValueError('Reserved local/user-managed content cannot be bundled.')
    if any(p.is_symlink() for p in dirs + files):
        raise ValueError('Release source must not contain symlinks.')
    if output in files:
        raise ValueError('Output archive cannot be under the installable project/.')
    stamp = (2026, 11, 21, 12, 0, 0)
    with ZipFile(output, 'w', compression=ZIP_DEFLATED, compresslevel=6,
                 allowZip64=False) as archive:
        for directory in dirs:
            info = ZipInfo(directory.relative_to(source_root).as_posix() + '/', date_time=stamp)
            info.create_system = 0
            info.external_attr = 0x10
            info.compress_type = ZIP_STORED
            archive.writestr(info, b'')
        for file in files:
            info = ZipInfo(file.relative_to(source_root).as_posix(), date_time=stamp)
            info.create_system = 0
            info.extra = b''
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, file.read_bytes(), compress_type=ZIP_DEFLATED,
                             compresslevel=6)
    with ZipFile(output, 'r') as archive:
        names = archive.namelist()
        if archive.testzip() is not None:
            raise ValueError('Archive CRC verification failed.')
        if names.count('openrf-bundle.json') != 1 or json.loads(
                archive.read('openrf-bundle.json')) != manifest:
            raise ValueError('Release manifest verification failed.')
        if not all(name == 'openrf-bundle.json' or name.startswith('project/') for name in names):
            raise ValueError('Bundle includes a path outside project/.')
        if any(info.file_size >= 2**32 or info.compress_size >= 2**32 or
               info.extra for info in archive.infolist()):
            raise ValueError('Release contains ZIP64-sized or extended entries.')
        if any(info.filename.startswith('project/local-data/') for info in archive.infolist()):
            raise ValueError('Local data must never be bundled.')
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    return {'file': str(output), 'version': manifest['version'],
            'entries': len(names), 'bytes': output.stat().st_size, 'sha256': digest}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--source-root', required=True, type=Path)
    cli.add_argument('--output', required=True, type=Path)
    args = cli.parse_args()
    print(json.dumps(build(args.source_root, args.output), indent=2))


if __name__ == '__main__':
    main()
