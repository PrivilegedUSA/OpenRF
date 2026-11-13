# OpenRF v0.2.40 — Wireless survey-map integration

## Installation and startup

1. Stop OpenRF with Ctrl+C in Ubuntu. Download `OpenRF-v0.2.40.zip` to Windows Downloads.
2. In **Windows PowerShell** (any directory) run:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`

   The existing reserved updater performs its own validation/backups and Git push by default. Its output may still mention an obsolete Android APK; actual CI tests the Linux source. We do not claim you have run it or that GitHub CI succeeded.
3. In **Ubuntu** run `cd /mnt/c/projects/OpenRF && python3 -m openrf`, then Firefox `http://127.0.0.1:8765/` and Ctrl+Shift+R. Local Valhalla and all map resources are unaffected by this patch.

## On-device smoke tests (5-inch mobile emulation / actual touchscreen when available)

- Open **Survey Map → Layers**. Change Marker colors between category, RSSI (dBm), Wi-Fi quality (%). **Gray** means missing/irrelevant measurement; recorded value colors do not imply a transmitter location. Set Saved records to last day / week, check old records vanish from *this view* without deletion. Change category checkboxes and opt-in DEMO; all results should respect them. Select all dates to restore history.
- If you already have saved Wi-Fi/BLE observations **with observer coordinates**, tap a pin in MapLibre or fallback raster. The inspector must show the actual source/identifier, time, device and available frequency, RSSI or quality. Selecting **Open history / comparison** must use the same receiver/identifier/measurement unit/frequency, never mixed samples. A single reading must not fabricate a comparison. The compact recent mapped list also has Inspect actions. Pin locations represent measurements made at the observer, **not** the target transmitter or BLE device.
- Without any saved geolocated wireless observations, the list should be empty and the map must not create dummy readings. With a saved observation that lacks coordinates, it belongs in Discoveries and detailed analysis but **not** on the map.
- The map sheet offers **Scan Wi-Fi once** and **Scan BLE once**. In WSL without a passed-through supported radio, expect an unavailable/controller error, never made-up live readings. On compatible native Linux hardware, BLE uses the existing one-shot BlueZ driver and returns an ephemeral list; Save of an observed result is explicit. A scan must not automatically record observations or infer a transmitter's position. Wi-Fi quality % is never RSSI dBm.
- Check custom OpenRF Dark/Light, offline regional vector coverage, raster fallback markers, map GPS/recenter, Add observation, Sessions, captures/reports, turn guidance and DEMO driving, BLE analysis, and map settings gear/X. BLE and Wi-Fi scans are not required to verify the offline UI.

## Automated verification

From `project/` run:

`python3 -m compileall -q openrf`

`python3 -m unittest discover -s tests -q`

`for test_file in tests/*.js; do node "$test_file" || exit; done`

The new `test_survey_map_v040.js` covers location-only map markers, DEMO opt-in, time windows, distinct metrics, strict historical grouping and UX hooks; `test_survey_map_v040.py` verifies static-serving from localhost without writing observations. Tests do not assert the presence of actual RF hardware or browser rendering.

## Modified files and release limitations

New: `openrf/static/survey_map.js`, `tests/test_survey_map_v040.js`, `tests/test_survey_map_v040.py`, `docs/RELEASE_0.2.40_TESTS.md`. Modified: `openrf/static/app.js`, `openrf/static/index.html`, `openrf/static/app.css`, `openrf/server.py`, version manifest, `openrf/__init__.py`, `README.md`, `CHANGELOG.md`, and a few existing regression assertions updated for the new module/version. No required third-party Python dependencies, database changes, credentials or online map downloads. No physical Wi-Fi/BLE or Raspberry Pi tests; no real-world signal calibration, geometry inference or reliable distance estimate.
