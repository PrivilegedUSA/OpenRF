# OpenRF v0.2.139 — Release testing and installation

This is a complete Linux/WSL OpenRF source update (not an Android APK). The ZIP root contains `openrf-bundle.json` with `{"project":"OpenRF","formatVersion":1,"version":"0.2.139"}` and all installable sources under `project/`. The updater, `.git/`, `.openrf-state/`, credentials, personal data and `local-data/` are not packaged.

## Main changes

- `openrf/static/app.css`: restore right-hand Trip/Map settings/GPS/Offline map tools and lower-right navigation settings gear in both navigation follow states; add 7px compass-to-recenter separation, 12px recenter-to-tool group alignment; Emergency sidebar triangle inherits pale text; Analysis page cards stack with 16px gap; small opt-in navigation recording card.
- `openrf/static/index.html`: accessible Walk/Drive track selector, simple record/backtrack instructions, record/stop controls in the follow HUD, bumped static asset versions.
- `openrf/static/app.js`: opt-in recorder bridge and reliable stop/cancel lifecycle tied to follow mode; new fresh-browser-GPS-to-recorded-start Valhalla route request; no automatic navigation or GPS storage.
- `openrf/static/field-breadcrumbs.js`: stored mode labels, reverse preview, recorded-start routing action, shared recorder state, opt-in/private warnings.
- `openrf/breadcrumbs.py`, `openrf/server.py`: additive `travel_mode` column, strict POST validation, backward-compatible default pedestrian, mode-aware GPX/GeoJSON, preserved historical track points.
- `openrf/__init__.py`: bump package version. `tests/test_breadcrumbs.py`, `tests/test_server.py`, `tests/test_breadcrumb_return_v139.js`: new mode, upgrade and return-action cases; updated existing test contracts.

## Test results in development workspace

- `PYTHONPATH=tests:. python3 -m unittest discover -s tests -p 'test_*.py' -q` — **385 tests, passed**.
- `for f in tests/*.js; do node "$f" || break; done` — **106 JavaScript scripts, passed**.
- `node --check openrf/static/app.js` and `node --check openrf/static/field-breadcrumbs.js` — passed.
- No live browser screenshots, local Docker Valhalla road-graph request, GPS fix, USB SDR hardware, Raspberry Pi or on-road driving tests were performed here. These must be verified on the operator's installation before field use.

## Install in Windows / WSL

1. Download the complete `OpenRF-v0.2.139.zip` to the Windows **Downloads** folder. Do not extract it manually into the project.
2. From any PowerShell directory, run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

   The existing updater validates the bundle, makes a backup, replaces managed project files and attempts a Git commit/push by default; use `-NoPush` if desired. A push initiates CI, not proof of CI success. Do not overwrite locally managed files or personal data.
3. Start/restart OpenRF as usual in WSL, e.g. `cd /mnt/c/projects/OpenRF && python3 -m openrf` (provided Python and project setup are already installed).

## Manual review at 1280×800 (seven-inch touchscreen target)

1. Open Map and verify all four right-hand tool icons plus the gear near the lower-right layers/+ icons. Zoom/tilt/compass should have a small recenter gap and a separate but nearby four-button group. Start a valid Valhalla walking route and **Start walking navigation**. Repeat for driving: all controls should stay reachable; settings sheets should not block the entire viewport until tapped. Also inspect 800×480 and touch target spacing.
2. Emergency should use the pale sidebar triangle while the top-header warning stays yellow. Analysis should contain two full-width cards, vertically stacked with space between them.
3. Without starting recording, start walking/driving guidance; verify no private breadcrumb session was created. Tap **Record this walk/drive**, acknowledge consent and grant browser geolocation. An accurate fresh position (≤100m, ≤30 seconds) is required for a saved point. Verify Stop & save, then check Map → GPS → tracks. Clicking Stop guidance should stop a linked recorder; independent GPS-tool recordings require their own Stop. Hiding the tab stops the watch.
4. Record and stop separate Walking and Driving trips. Verify saved mode labels, ordered reverse preview, GPX/GeoJSON exports, old pedestrian recordings after the schema upgrade, and deletion protection while recording.
5. With Docker Valhalla and a suitable local route graph running, click **Route to recorded start** on a stopped trip. The app requests a *new* browser fix and local mode-specific route. If valid, inspect the suggested route and optionally tap Start navigation. If missing/weak GPS or no routing graph, check the explicit failure or non-navigable direct-line notice. It must never silently start navigation or treat a prior track as a safe road/path.

### Boundaries and cautions

- This is **browser-position history**, not guaranteed GNSS, an emergency beacon, or a background/location-locked recorder. Closing/hiding the tab interrupts recording, and precision, clock, driver, and local storage limits apply. Only sessions explicitly started by the user save data.
- A **reverse preview** is only a visual reversal of historical reported points; it has no follow-along instructions. **Route to recorded start** plans a fresh road/path route that **may not retrace the exact track**; a disconnected local Valhalla graph yields no valid directions. It does not know current closures, private gates, terrain, trail suitability, or live traffic. Plan manually and obey road/path conditions; do not use the UI interactively while driving.
- Existing GPS watches, offline maps and private databases are not deleted. No automatic upload or RF transmissions were added.
