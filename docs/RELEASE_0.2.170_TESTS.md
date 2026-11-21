# OpenRF v0.2.170 — Sidebar, Ecowitt LAN, WeeWX import and icon cleanup

This complete release starts with the tested `OpenRF-v0.2.169.zip` and preserves all other OpenRF features, previous version history, and local records. The release ZIP has the exact ZIP-root `openrf-bundle.json` manifest `{ "project":"OpenRF", "formatVersion":1, "version":"0.2.170" }`, with all installable sources under `project/`. Local data, `.git`, credentials, updater/setup PowerShell scripts and field logs are not bundled.

## New operations

1. **Sidebar:** Overview; Messages (Meshtastic, Reticulum, MeshCore); Map; Emergency; Analysis; Signal Viewer; Radio Receiver; Ham Radio; Sessions; Hardware; Web Browser; Weather Station; Trips & Maps; Saved. App Settings remains in the bottom rail. Map remains the initial workspace, as before.
2. **Ecowitt read:** In Weather Station → Stations & Sensors, create/select a local station, manually enter an Ecowitt gateway's RFC1918 IPv4 address, and select **Read once · preview only** or **Read once & save**. Each click initiates exactly one outbound GET request to `http://<LAN IPv4>/get_livedata_info` with a three-second timeout. No background connection, auto-refresh, network scan, RF transmission, DNS lookup, internet address, HTTP redirect or public listener. There is no guarantee that the responding host is genuine hardware: results are **ECOWITT_GATEWAY_REPORTED / NOT HARDWARE VERIFIED**. The stored time is **OpenRF's UTC response time**, not an invented sensor measurement time. Outdoor temperature, humidity, wind, pressure, UV and solar irradiance are mapped only if provided in supported units; gauge totals are never substituted for interval rainfall. An unrecognized response produces an error, not a simulated reading. Local capture is optional.
3. **WeeWX history:** Import an operator-selected UTF-8 WeeWX archive CSV with `dateTime` (Unix seconds), `usUnits` (US=1, METRIC=16, METRICWX=17) and one or more recognizable columns (`outTemp`, `outHumidity`, `barometer`, `windSpeed`, `windGust`, `windDir`, `rain`, `UV`, `radiation`). WeeWX archive `rain` is per-interval rain. Readings are converted to SI and tagged **IMPORTED_HISTORICAL**, source `WeeWX archive CSV`. No WeeWX installation or background service is necessary to use a file. The existing manual and generic historical CSV forms are unchanged. Each import is atomic, max 160 kB/500 rows, duplicates skipped; errors reject the whole import. A `.sdb` SQLite database is **not** accepted directly: export CSV first.
4. **Main site icon:** Four revised PNGs in `openrf/static/assets/` (`openrf-icon-32.png`, `-180.png`, `-192.png`, `-512.png`) replace the original white-rim assets. The navy rounded-square tile remains; the *outside canvas corners are transparent PNG alpha*, not black or white. The manifest, Apple touch reference, browser favicon and optional Electron icon path keep their existing filenames.

The weather database migration transparently rebuilds only the weather-readings table when the older source constraint is detected. Existing MANUAL and IMPORTED_HISTORICAL records, IDs, timestamps and measurement values remain unchanged. `source_device` is added; older entries have an empty source device. No scan or hardware read is triggered by migration.

## Automated validation on WSL Ubuntu or Pi OS

From the **extracted** release `project/` directory:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
node --check openrf/static/weather.js
for test_file in tests/*.js; do node "$test_file" || exit 1; done
```

New `tests/test_weather_ecowitt_v170.py` checks strict private-LAN addresses, a one-shot GET with timeout, redirects, manufacturer unit mappings, no invented interval rain, preview-not-saved vs explicitly saved receipts, source provenance, old-database migration, HTTP routes, rejected browser-forged readings, and WeeWX three-unit conversions/idempotence/atomicity. New `tests/test_sidebar_weather_v170.js` checks exact navigation order, distinct messaging subpages and all favicon/PWA image sizes. Updated weather frontend tests simulate explicit gateway preview/save and selected WeeWX file submission; **their fixture measurements are not live readings**.

**Local result (2026-11-21): 497 Python tests and all 138 JavaScript suites passed.** Python compilation and `app.js`/`weather.js`/`hardware-tabs.js` JavaScript syntax checks passed. Hardware tests and visual 7-inch field checks remain outstanding.

## Manual acceptance checks

Without hardware:

1. Reload the UI at `http://127.0.0.1:8765` (or the printed local port). Check the exact 14-item sidebar order and that the three Messages children expand correctly. Confirm all pages and previous hardware tabs still work.
2. Under Weather Station, create a station and add a MANUAL reading. The Dashboard, history trend/table and CSV export should still work without network or a connected device.
3. Try an invalid/public gateway address such as `8.8.8.8` with **Read once · preview only**. It must fail immediately and save nothing. Without a real gateway, an unresponsive local IP should time out with an error; never present demo or inferred measurements as live.
4. Import an actual WeeWX-generated archive CSV after checking its `dateTime`, `usUnits` and column names. Confirm imported timestamps, unit conversions, interval rain, source labels and duplicate handling. This tests the file adapter, not hardware sensor accuracy.
5. Check favicon, installed web-app icon and touch icon on light and dark desktop/touchscreen backgrounds. The outer white edge artifacts should be gone; the four corners outside the rounded tile should show the background through true transparency. Hard-refresh or clear icon cache if the browser retains old PNGs.

With a compatible physical Ecowitt gateway (later hardware session):

1. Ensure the gateway is reachable from the Pi or WSL Linux network and exposes the *read-only local HTTP API*. Record model, firmware and own station calibration details. From OpenRF, enter only the gateway's local IPv4 address; no internet service is needed.
2. Tap **Read once · preview only**. Confirm the UI reports the gateway IP and OpenRF receipt UTC and source **GATEWAY REPORTED / UNVERIFIED**. Compare temperatures, humidity, wind/pressure/UV with the gateway display; test missing sensors and unit settings. Preview should leave history unchanged.
3. Tap **Read once & save** and confirm exactly one added reading, correct source device/UTC label, no automatic future updates, and preserved manual/imported records. Test LAN-disconnect, firmware error response, oversized/malformed reply and sensor offline/stale cases. Do not treat a response as verified sensor freshness.
4. Perform a 7-inch Raspberry Pi and Ubuntu WSL layout check: readable tabs, no inaccessible buttons, and browser icon corners at real screen sizes. USB/SDR drivers, `rtl_433`, ESP32/serial sensors, true live polling, automated rain intervals, direct WeeWX service access and alerting remain outside this patch.

## Install, verify and recover from corrupt downloaded ZIP

Save the complete file as `C:\Users\brand\Downloads\OpenRF-v0.2.170.zip`. Optionally validate before installing:

```powershell
$zip = 'C:\Users\brand\Downloads\OpenRF-v0.2.170.zip'
Get-Item -LiteralPath $zip | Select-Object Name, Length
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
$archive.Dispose()
```

Then invoke the normal updater, explicitly selecting that file (to avoid old `(1)` downloads):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath 'C:\Users\brand\Downloads\OpenRF-v0.2.170.zip'
```

The updater is configured to back up and push to GitHub by default; `-NoPush` is available for local-only installation. No claim is made that this updater actually ran or GitHub CI succeeded. Launch from WSL after installation:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

The release is packaged with plain Windows-compatible ZIP32 Deflate, without ZIP64 or special extra fields. Python CRC validation, Linux `unzip -t`, manifest/path checks and SHA-256 are performed as part of local packaging. An incomplete user-side download can still yield `Central Directory corrupt` and should be downloaded again.

Maintainers can reproduce the archive from the extracted source directory containing `project/` and `openrf-bundle.json` using `python3 project/tools/build_release_zip.py --source-root . --output OpenRF-v0.2.170.zip`. This builder rejects reserved local folders and emits verified SHA-256 metadata; its own synthetic fixture tests run in Linux CI.

## Official protocol references and integration limits

- Ecowitt, *HTTP API interface Protocol for LAN (Generic), v1.0.5*, `GET /get_livedata_info`: https://oss.ecowitt.net/uploads/20260109/HTTP%20API%20interface%20Protocol%20%28Generic%29-%28V1.0.5-2025-10-08%29%20.pdf
- Ecowitt product guidance listing the LAN HTTP API (e.g. GW2000): https://www.ecowitt.com/api/quickstart/product?id=178
- WeeWX 5.2 official units (US=0x01, METRIC=0x10, METRICWX=0x11): https://weewx.com/docs/5.2/reference/units/

These docs describe supported *formats*, not proof that OpenRF was tested against the specific hardware the user may buy. No physical weather devices or Raspberry Pi 7-inch screen were available during this release build.

## Files changed

- `openrf/static/index.html`, `app.css`, `weather.js` — requested sidebar order, two optional weather input panels, source/quality labels, touch-friendly layout.
- `openrf/weather.py`, `weather_ecowitt.py` (new), `server.py` — database migration and source provenance, strict Ecowitt local HTTP adapter, WeeWX archive converter and loopback JSON routes.
- `openrf/static/assets/openrf-icon-{32,180,192,512}.png` — corrected site/PWA/touch/desktop images.
- `tests/test_weather_ecowitt_v170.py`, `tests/test_sidebar_weather_v170.js` (new), `tests/test_weather_frontend_v168.js` (updated) — protocol/security/unit/migration/UI tests.
- `tools/build_release_zip.py`, `tests/test_release_builder_v170.py` (new) — reproducible plain ZIP32 release packaging and reserved-path/CRC checks.
- Version metadata in the backend, web assets, optional Electron, existing version-aware tests; `README.md`, `CHANGELOG.md`, `BUNDLE_FORMAT.md`, and `openrf-bundle.json`.
