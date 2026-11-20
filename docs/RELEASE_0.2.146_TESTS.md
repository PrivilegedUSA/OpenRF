# OpenRF v0.2.146 — installation and verification

## Release contents

Complete `OpenRF-v0.2.146.zip` with ZIP-root `openrf-bundle.json`:

```json
{"project":"OpenRF","formatVersion":1,"version":"0.2.146"}
```

Everything installable is under `project/`; updater scripts, Git metadata, private OpenRF data, personally saved tracks, credentials and maps are **not** bundled. No change to the local SQLite schema, battery API, altitude telemetry or location permission behavior.

## Manual 1280×800 checklist

1. On a **1280×800 fine-pointer** monitor, start OpenRF on **Map**. The left sidebar should remain open with **no X button** next to the logo; the top-right map hamburger should also remain hidden.
2. See **ALTITUDE / — ft** (unless a recent, accurate GPS height is actually available) **inside the map**, near the lower-right corner just above the map settings/add/layers buttons. Clock, battery status and Emergency icon remain in the top header.
3. Pan and zoom the map and switch to USGS Topographic, Satellite and any installed offline regional maps. The badge should stay fixed to the map viewport, not move with geographic tiles or overlap the bottom-left map credits and legend. A title/tooltip still identifies the reported source/reference and uncertainty when available.
4. Resize narrower than **900 CSS pixels**. Open the collapsed navigation drawer with the hamburger and confirm its **X** is visible and closes the drawer. On short (≤850px), coarse-pointer 901–1400px screens, the drawer still gets a close X. On large/fine-pointer layouts the sidebar is persistent and cannot be closed.
5. On **Emergency** or **Overview**, check that the altitude badge is not displayed on those pages; all existing tabs and quick actions still work.

## Automated test commands

From the installed WSL `project/` directory:

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -p 'test_*.py' -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/app.js
node --check openrf/static/map-elevation.js
```

The new `test_altitude_sidebar_v146.js` verifies that only one altitude DOM element exists and that it lives within the map viewport, and checks the exact compact/desktop CSS contract. The unchanged Python tests protect routing, Emergency, GPS, hardware, map and local API behavior.

**Results:** 406 Python tests passed, 112 JavaScript test scripts passed, and both JavaScript syntax checks passed. No physical 7-inch touchscreen or desktop-browser rendering was claimed as verified by these code tests.

## Update command

Download the whole ZIP to Windows Downloads; do not extract it. From any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The installed updater validates, backs up, replaces managed sources and by default attempts a GitHub commit/push (use `-NoPush` if needed). Restart the Python app, refresh the browser and confirm the version label. Installing, physical Pi touchscreen behavior, actual GPS hardware and live RF capabilities require operator confirmation.

## Limitations

Code and stylesheet contract tests do not prove pixel-perfect Firefox/Chromium layout on a physical 7-inch screen. No GPS altitude was fabricated or field-tested; real GNSS height may be unavailable on WSL. The moving/paused navigation HUD and third-party map tile failures still require field testing.
