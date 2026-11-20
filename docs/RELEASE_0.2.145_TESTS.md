# OpenRF v0.2.145 — release verification and installation

## Contents

Complete Linux-first `OpenRF-v0.2.145.zip`, containing a ZIP-root `openrf-bundle.json` with `{ "project":"OpenRF", "formatVersion":1, "version":"0.2.145" }` and installable source only under `project/`. It preserves existing navigation, GPS backtracking, radio, survey and emergency functionality. No PowerShell updater, local databases, downloaded map packages, credentials or user evidence are included. No SQLite migration or new required Python dependency.

## Changes to check in the UI

1. At 1280×800 with an open left sidebar, go to **Emergency → Dashboard**. **Quick access** should be immediately below the five tabs, above Operations and Readiness; select **Prepare SOS draft** or **Family check-in** and verify it opens the intended local tab/form without transmitting anything.
2. At **Map → Layers → Base map**, choose **Topographic** and pan/zoom while USGS tiles are loading. The rendered map should not be covered by a false **Map tiles not visible** warning. With a network failure and no loaded tiles, a real failure can still be shown. Verify Default/installed-vector mode remains usable offline.
3. Find the compact **BATTERY** badge near the header clock/altitude. On WSL without a Linux-exposed battery it must show **—**. If the Pi battery HAT exposes a single valid `/sys/class/power_supply/*/capacity`, verify the reported percent/status matches Linux. Multiple batteries and missing/bad readings deliberately show **—**; estimated runtime, calibration and safe shutdown are not provided.
4. Choose **Map → Layers → Offline maps → Offline elevation data for routes**. Import a **licensed uncompressed SRTM-compatible raw HGT** grid named for its geographic tile (`N38W121.hgt`, for example) with an honest source/provenance label. Formats accepted: **1201×1201×2 bytes** (3 arc-second) or **3601×3601×2 bytes** (1 arc-second). The server copies it into the private `maps/terrain-hgt/` directory, with a maximum 32 HGT files. Never share or commit these files without checking data licensing and permission. No external provider is contacted for an import.
5. With Valhalla locally available, plan a walking or driving route within the imported geographic tile. Expand **Route elevation profile** and select **View offline profile** while disconnected: modeled terrain heights should display (or honest gaps for void/missing areas). A previously cached USGS route profile is also usable offline. Only **Prepare online**, after an explicit confirmation, permits requesting new USGS samples over the internet. Map imagery/contour lines are not an HGT elevation file; neither height source is your live GPS altitude or a verified travel-grade assessment.

## Automated tests

Run from WSL, in the installed OpenRF project directory:

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -p 'test_*.py' -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/app.js
node --check openrf/static/battery-status.js
node --check openrf/static/emergency-tabs.js
```

New tests cover an actual raw-HGT loopback HTTP import and delete, cross-origin denial, bad lengths/path names, symlink/duplicate rejection, private permissions, missing/void sample gaps, an offline route without USGS fetches, Linux sysfs reported and absent batteries, and UI ordering/asset presence. Existing Python/JavaScript regression suites run without a physical receiver.

**Release result:** 406 Python tests and 111 JavaScript test scripts passed; syntax checks of `app.js`, `battery-status.js` and `emergency-tabs.js` passed. Chromium/Playwright graphical inspection could not run because the execution environment denied its browser-process socket, so no desktop screenshot/visual sign-off is claimed.

## Install or update on Windows/WSL

Download the complete ZIP to Windows **Downloads**, leave the archive intact, then from any PowerShell directory run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The existing updater should validate the manifest, back up current managed files, install `project/` and by default attempt a git commit/push (use its `-NoPush` option to suppress that). Restart the OpenRF server and refresh the browser so new versioned JavaScript loads. This document does not claim your local install, GitHub push or CI passed.

## Limits and follow-up

- Live USGS tile error states, full desktop/7-inch touchscreen rendering, Pi power board drivers, GNSS location source, real-world HGT vertical datums, actual hills/void accuracy, offline Valhalla road graph, genuine moving backtrack follow and RF hardware were **not** verified by code-only tests.
- SRTM-compatible `.hgt` data is supplied by the operator and marked unverified. Check source license, attribution, geographic coverage, vertical datum, terrain vintage and fitness before any field decision. The application does not download SRTM or certify route elevation.
- A Linux `power_supply` percentage does not itself establish remaining runtime, battery health, safe-shutdown readiness or board support. Raspberry Pi hardware needs a supported battery HAT driver before real levels can appear.
- Do not assume a map showing contours/roads verifies trail access or current road conditions. Driving interaction should be kept minimal, without touching the controls while underway.
