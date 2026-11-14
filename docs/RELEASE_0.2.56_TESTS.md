# OpenRF v0.2.56 — release tests and limitations

## Scope

Optional nationwide ALPR snapshot download and **optional expanded Valhalla road-graph region setup** (NorCal, California, US West, US). This patch does **not** add California/Nevada vector basemaps; the existing Amador/Calaveras visual basemap and v0.2.52 map UI are preserved. Large road PBFs and generated graphs are never included in the release.

## Changed/added files

- `openrf/national_alpr.py`, `openrf/camera_catalog.py`, `openrf/server.py`: bounded national ALPR importer, stage-and-replace local snapshot, view filtering and HTTP update/status/upload endpoints
- `openrf/static/camera-layers.js`, `openrf/static/index.html`, `openrf/static/app.css`: operator-triggered national sync, status and local file fallback
- `tools/setup-valhalla-wsl.sh`: four explicit Valhalla routing coverage profiles with planning, size/space guardrails, independent data directories and existing Docker service compatibility
- `tests/test_national_alpr_v056.py`, `tests/test_national_alpr_ui_v056.js`: snapshot staging, failure, API and UI regression tests
- `tests/test_valhalla_profiles_v056.py`: no-network CLI profile and safety-contract checks
- Docs: `docs/VALHALLA_ROUTING_REGIONS.md`, `docs/LOCAL_VALHALLA_WSL.md`, README, changelog, this file

## Regression checks (from project/)

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -q
for f in tests/*.js; do node "$f" || exit 1; done
python3 -m compileall -q openrf
for f in openrf/static/*.js; do node --check "$f" || exit 1; done
bash -n tools/setup-valhalla-wsl.sh
bash tools/setup-valhalla-wsl.sh --plan --region west
```

## User checks after installing

1. Refresh OpenRF browser: Map → Layers; confirm ALPR/red-light/speed switches persist and existing manual locations aren't removed. Choose the explicit nationwide sync only when ready for online download. Confirm progress and that a failed sync keeps previous data.
2. If direct national sync is unavailable, import a previously downloaded GeoJSON/GeoJSON.gz using the local file control. Confirm source and community-mapped labels. Turn off internet and verify saved camera markers still load for the current viewport.
3. From Ubuntu, run `bash tools/setup-valhalla-wsl.sh --status`, then `--plan --region california`, `--plan --region west`, `--plan --region us`. These commands must not download or install anything.
4. To actually install a larger routing region, run `--install --region california` (or choose another deliberately) after ensuring Docker is working, and monitor `--logs`. Once the graph is built, test an **actual road route** between Sacramento and Modesto. For US West, also test across the Nevada border. A responding `/status` endpoint is not proof of coverage.
5. Stop/start Docker/WSL; verify routing source files and private camera database persist. Confirm OpenRF's offline visual map is unchanged.

## Test limits

Python tests use a controlled national GeoJSON sample and fake/isolated CLI inputs; they don't download the live national feed or build a Valhalla graph. No physical SDR/radio or GPS hardware, large OSM PBF, live interstate Valhalla routing, Raspberry Pi field usage, or GitHub CI success has been verified. Size/RAM estimates are conservative planning thresholds only, not graph benchmarks. Camera avoidance and automatic rerouting are still proposed features.
