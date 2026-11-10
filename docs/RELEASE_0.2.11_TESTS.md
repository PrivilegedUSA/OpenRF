# OpenRF v0.2.11 — Release verification

## Managed changes from v0.2.10

- **New** `openrf/map_areas.py`: strict geographic bounds/zoom plan validation, private catalog persistence, GeoJSON export, local-only MBTiles cropped subset creation with tile and byte limits, staging and no-overwrite publishing.
- Updated `openrf/server.py`: plans, exports and build API with Host/Origin checks and operation locking; no remote map URL ingestion.
- Updated `openrf/static/{index.html,app.js,app.css}`: area planner with two-corner selection and visible-viewport/manual modes, live rectangle outline, private saved-plan list, source map picker and license attestation, responsive layouts.
- **New** `tests/test_map_areas.py`; updated `tests/test_frontend.js` and `tests/test_server.py` for version/contract tests.
- Updated `docs/OFFLINE_MAPS.md`, `docs/ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`, `openrf/__init__.py`, radar status document. Historical Android source untouched.

## Reproducible tests

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node tests/test_frontend.js
```

## Manual field test on Windows Firefox

1. Start OpenRF with `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Open `http://localhost:8765`, expand **Map → Manage offline map areas**. Enter bounds around an area using two map corners or **Use visible map**, then give it a name and save it. Confirm zoom and tile cap messages, map outline, export GeoJSON, and plan persistence after restart.
2. Switch to **Offline / raster**. Repeat two-corner selection without network; confirm those two clicks do **not** create an observation. Cancel selection and click the map normally; it should then open the manual observation form as before.
3. Import a **licensed raster MBTiles** source with matching coverage, choose a saved plan, and check local derivative permission only if permitted. Create a new filename, build, select the resulting basemap, and verify it displays without internet. Check copied count and that zooms outside the source are blank. Repeated output name must fail without overwriting.
4. Confirm original source, existing observations, investigations, USB diagnostics and Wi-Fi survey buttons are unchanged. Delete a saved plan and confirm the derived map remains; deleting a map must not remove observations.

## Tested limits

Python tests exercise synthetic SQLite raster tiles, boundary checks, zoom budgets, private plan lifecycle, HTTP endpoints, license gating, no-data errors and no-overwrite creation. Browser integration, full Firefox/MapLibre map gestures, real large map packages, physical Raspberry Pi storage and RF hardware were **not** tested in this environment. There is no automatic remote tile downloader, GPS/route tracking, radar detection or source geolocation. Existing investigation SQLite schema is unchanged.
