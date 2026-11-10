#!/usr/bin/env python3
"""Explicit, one-time, online download of version-pinned MapLibre JS/CSS.

Run ONLY while connected and only if you want the full vector UI assets stored
locally. Never prefetches map tiles; does not touch investigation data.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from urllib.request import Request, urlopen

VERSION = '5.24.0'
BASE_URL = f'https://unpkg.com/maplibre-gl@{VERSION}/dist/maplibre-gl'
FILES = {'.js': ('application/javascript', 'javascript'), '.css': ('text/css', 'css')}
MAX_SIZE = 12 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser(description='Store pinned MapLibre JS/CSS for offline use; does not download tiles')
    parser.add_argument('--data-dir', type=Path, default=Path.home()/'.local/share/openrf',
                        help='Parent of openrf.sqlite3 for custom --db installations')
    args = parser.parse_args()
    directory = args.data_dir / 'assets'
    for suffix in FILES:
        url = BASE_URL + suffix
        req = Request(url, headers={'User-Agent': f'OpenRF-MapAssetSetup/{VERSION}'})
        try:
            with urlopen(req, timeout=30) as response:
                if response.url.split('?')[0].startswith('https://') is False:
                    raise ValueError('Only HTTPS asset downloads are allowed')
                raw = response.read(MAX_SIZE + 1)
            if not raw or len(raw) > MAX_SIZE or b'<html' in raw[:200].lower():
                raise ValueError(f'Unexpected MapLibre asset payload: {url}')
            directory.mkdir(parents=True, exist_ok=True)
            target = directory / f'maplibre-gl-{VERSION}{suffix}'
            temp = target.with_suffix(suffix + '.tmp')
            temp.write_bytes(raw)
            temp.replace(target)
            print(f'Saved {target} ({len(raw):,} bytes)')
        except Exception as exc:
            parser.exit(1, f'MapLibre asset download failed ({url}): {exc}\n')
    print('Library assets are now local. OpenFreeMap vector tiles remain online; use raster MBTiles offline.')


if __name__ == '__main__':
    main()
