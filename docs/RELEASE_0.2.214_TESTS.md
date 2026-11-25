# OpenRF v0.2.214 — Recovery release

Recreated from the user-provided v0.2.212 ZIP; the undeliverable original v0.2.214 archive was unavailable. No new roadmap features, database migrations, cache deletions, or dependencies. This is a cumulative ZIP for the existing PowerShell source updater.

## Changes

- MapLibre: request a complete style replacement (`diff:false`) so the existing style-load path reinstalls GeoJSON sources and layers and forces local/public mesh marker redraws. Retain the current map state and preferences. The existing walking-path highlight depends on the Default vector source and is not available on the raster-only USGS styles.
- Regional camera imports: POST `/api/cameras/import-osm` (or `/api/cameras/import-start`) now returns HTTP 202 and current job state; GET `/api/cameras/import-status` returns the current/last job. One regional job can run at a time, separately from the national ALPR job. Jobs live in the running server, not in a browser request. Browser reloads can resume status polling; stopping or restarting OpenRF does not resume a transfer.
- OSM query: request camera nodes and ALPR way centers plus enforcement relations and their explicit device nodes, instead of downloading full relation road geometry. This uses role-filtered relation recursion as documented at https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL. Do not infer a camera from a traffic signal or enforcement relation center. Report provider failures, fallback and result counts. Existing manual and downloaded records remain untouched by failed imports.
- Regional and national download progress: use received bytes divided by HTTP Content-Length when supplied. Otherwise show an indeterminate bar and received bytes. Processing and saving are distinct phases; completion means local save succeeded. Existing national transactional snapshot replacement is retained.
- No additional public mesh, cellular, coverage or national enforcement data sources were added. Community-mapped locations are not independently verified.

## Verification

- Uploaded v0.2.212 archive passed CRC and manifest checks. No original source files removed.
- Python full suite and JavaScript full suite run locally; see final release validation summary below.
- New server job tests cover duplicate rejection, provider fallback, actual bytes, successful saving and preservation on failure. Updated HTTP contract and frontend tests cover HTTP 202, status polling, refresh recovery, measurable progress, counts and layer visibility. The style reset callback test covers three basemap changes with synthetic map objects.
- A full Chromium application test was attempted, but the environment blocked navigation to the local app server (`ERR_BLOCKED_BY_ADMINISTRATOR`). Actual rendered map overlays and live Overpass/national providers remain unverified. Raspberry Pi hardware, Windows updater, download delivery and GitHub CI are also unverified.

## Acceptance on the user's installation

1. Stop the running OpenRF process (Ctrl+C in WSL). Download this ZIP and verify SHA-256 before updating. Avoid selecting any previously corrupt v0.2.213 or v0.2.214 archive.
2. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'` then `cd /mnt/c/projects/OpenRF && python3 -m openrf` in WSL.
3. Enable existing MeshCore and ALPR layers. Confirm saved counts and pins before switching Default → Satellite → Topographic → Default without reloading. Check that enabled pins return after each style finishes loading. Do not delete or redownload existing snapshots merely to test this.
4. Zoom to a city or county and import OSM cameras. Check the progress bar and provider name. Refresh the browser while the job runs; verify that status returns and the job continues. Check the final per-type counts or specific provider errors. Enable Speed and Red-light layers to display returned records. Zero returned records do not establish absence of cameras.
5. Only if desired, run a national ALPR update and check byte progress and saving/completion status. Existing cached records must remain available if the update fails.

## Changed files

- Backend: `openrf/camera_catalog.py`, `openrf/camera_jobs.py` (new), `openrf/national_alpr.py`, `openrf/server.py`, `openrf/__init__.py`.
- Frontend: `openrf/static/app.js`, `camera-layers.js`, `mesh-dashboard.js`, `app.css`, `index.html`, and `weather.js` (version header only).
- Regression tests: `tests/test_camera_jobs_v214.py` and `test_map_style_restore_v214.js` (new), `test_camera_import_v055.py`, `test_camera_import_feedback_v212.js`, `test_map_layers_v211.py`.
- Release metadata: `openrf-bundle.json`, `BUNDLE_FORMAT.md`, `README.md`, `CHANGELOG.md`, this file and Electron `backend.js`, `package.json`, `package-lock.json`.

## Final release validation summary

- Python 3.13.5: 626 tests passed, 0 failures (80.196 seconds). Initial full run found a stale weather asset version header; corrected it and reran the entire suite successfully.
- Node.js v22.16.0: all 170 JavaScript regression scripts passed.
- Python compileall, modified JavaScript syntax checks and Valhalla shell syntax check passed.
- Live provider connectivity and real browser rendering were not verified.
