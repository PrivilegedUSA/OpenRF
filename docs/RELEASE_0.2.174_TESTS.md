# OpenRF v0.2.174 — Weather comparisons and sidebar active-page visibility

This complete incremental Linux release is based on v0.2.173. The ZIP-root `openrf-bundle.json` identifies `{"project":"OpenRF","formatVersion":1,"version":"0.2.174"}`. Only managed source appears under `project/`; the updater, Git directory, local data, credentials, identities and keys are excluded.

## What changed

1. **Sidebar restored selection:** The app already remembered the selected page in browser session storage; now `showPage()` also reveals that button in the appropriate scrolling sidebar container. Wide/7-inch view scrolls the left navigation list without jumping the main document. A narrow open drawer scrolls the sidebar itself, but no hidden drawer is moved behind the scenes. Meshtastic, Reticulum and MeshCore subnavigation remains expanded when one of those pages is selected. A newly opened tab still starts on Map as before.
2. **Weather Recording relocated:** Weather Station → Dashboard now shows the four recorded weather metric cards immediately after the hub summary, followed by the source/freshness disclaimer, then the complete Recording card. Recording is still strictly user-started and does not resume on startup.
3. **Optional history comparison:** Weather Station → History includes a checkbox below Station/Period/Measurement selectors. With a saved station selected, it compares archived non-null readings for the latest 1, 7, 30 or 365 days with the preceding equal-length UTC window using a read-only local SQLite query. Every statistic is based on available source-tagged samples only. If the previous period is empty, the difference remains unavailable; there are no invented zeros. The UI shows counts and ranges alongside converted display-unit means. `All saved` cannot be compared fairly against a preceding equal period and is explicitly disallowed for this optional comparison.

The comparator's averages are arithmetic *sample averages*, not time-weighted or calibrated observations. Mixed/manual/imported/hardware-reported source records can have different quality and sampling intervals. Rainfall-per-interval sample averages are **not total rainfall**, and no remote weather station, RTL-SDR, USB device or LAN gateway is contacted to build these comparisons.

## Test procedure

Run from the unzipped `project/` directory:

```bash
python3 -m compileall -q openrf tools/build_release_zip.py
python3 -m unittest discover -s tests -q
for test_file in tests/*.js; do node --check "$test_file" && node "$test_file" || exit 1; done
```

`tests/test_sidebar_active_scroll_v174.js` covers scroll-to-selection on wide, 7-inch-style and drawer navigation and verifies no top-level document `scrollIntoView`. `tests/test_weather_compare_v174.py` covers adjacent-window SQL boundaries, invalid inputs/SQL injection attempts, sparse/empty readings and read-only API requests. The expanded weather browser test checks comparison opt-in behavior, metric conversions, All-saved behavior and Recording placement. All weather hardware data in tests is synthetic or manually constructed.

**Local validation (2026-11-21): 525 Python tests and 140 JavaScript test suites passed**, including Python compilation and JavaScript syntax checks. Hardware verification is not included: real weather sensors, serial permissions, RTL-SDR availability, timing accuracy, touchscreen layout on a physical 1280×800 Pi, and the GitHub Actions job after pushing remain unverified.

## Installation

Place `OpenRF-v0.2.174.zip` in your Windows Downloads folder. From any PowerShell directory run the existing updater:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

If several similarly named ZIPs are present, explicitly select the intended path with the updater's `-ZipPath` parameter. Its normal update operation validates, backs up, installs managed source, commits and attempts to push; a push initiation does not prove GitHub CI passed. Start in Ubuntu WSL:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

### Changed files

- New: `tests/test_sidebar_active_scroll_v174.js`, `tests/test_weather_compare_v174.py`, `docs/RELEASE_0.2.174_TESTS.md`.
- Updated: `openrf/static/app.js`, `openrf/static/index.html`, `openrf/static/app.css`, `openrf/static/weather.js`, `openrf/weather.py`, `openrf/server.py`, `tests/test_weather_frontend_v168.js`; current release/version-sensitive tests, Python and Electron version metadata, release manifest, README and changelog.

Next weather milestone: selected sensor freshness/threshold alerts and final 7-inch field layout verification before `.deb` installer work for OpenRF and OpenRF Pocket.
