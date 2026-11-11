# OpenRF v0.2.12 — Test notes

## Added or changed files

- `openrf/tile_archive.py` — ZIP-to-raster-MBTiles converter with safe staging and clipping.
- `openrf/map_areas.py` — provider-neutral tile plan manifest.
- `openrf/server.py` — two new loopback-only endpoints with Host/Origin protection.
- `openrf/static/index.html`, `app.js`, `app.css` — tile ZIP import UI and plan export, responsive controls and explicit rights/attribution.
- `tests/test_tile_archive.py`, `tests/test_frontend.js`, `tests/test_server.py` — regression and version tests.
- `README.md`, `CHANGELOG.md`, `docs/OFFLINE_MAPS.md`, `docs/TILE_ZIP_IMPORT.md`, `docs/ARCHITECTURE.md`, radar roadmap and `openrf/__init__.py` — docs/version.

## Local tests

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node tests/test_frontend.js
```

## Manual Windows Firefox / Ubuntu smoke test

1. Stop a running OpenRF with Ctrl+C; update from the downloaded ZIP using `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`. Restart in Ubuntu with `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Confirm version `0.2.12` at `http://localhost:8765`.
2. In Map, open **Manage offline map areas** and choose a saved plan (or save a small one). Export tile-plan JSON. Check per-zoom ranges and no tile URLs.
3. Try importing a previously licensed raster XYZ ZIP with valid `z/x/y.png` tiles for your area. Enter attribution, source name and proper rights acknowledgment. Confirm offline basemap selection and map display without internet. If you do not have such a ZIP, **do not harvest public OSM raster tiles**; keep this test pending.
4. Try a wrong archive type, no rights checkbox, a duplicate output filename and a ZIP outside the saved area. Confirm errors leave existing maps and observations unchanged.
5. Reopen the app and verify stored plans, investigations, snapshots, USB diagnostics, archived Android source and the default online map path are intact.

## Validation limits

Automated tests use synthetic map fixtures and mock HTTP requests only. Browser UI use, real licensed provider ZIPs, WSL Firefox display, Raspberry Pi hardware, sensor firmware flashing and live wireless/radar reception are **not verified** in this environment. No new installation was performed on the user's Windows machine. No external downloads, source Git pushes or CI success are claimed.
