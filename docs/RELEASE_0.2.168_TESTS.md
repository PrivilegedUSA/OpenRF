# OpenRF v0.2.168 — Weather Station foundation and test checklist

## Actual implemented functions

This update is built on the complete v0.2.167 source ZIP. **Weather Station** appears in the sidebar with three tabs:

1. **Dashboard:** Saved station count, reading count, manual Refresh, station selector, latest archived temperature/wind/humidity/interval-rain values or dashes when unavailable. A permanent **NO LIVE SENSOR** badge prevents confusion with actual sensor connections.
2. **Stations & Sensors:** Operator-created local station names and notes (no connection claim); explicitly entered manual values in °F, mph, inches, and %; imported local CSV files containing UTC timestamp and SI measurements. Imports have a 160 kB and 500-row limit, reject invalid files atomically, and skip duplicate rows.
3. **History:** Offline trend chart for temperature, wind/gust, humidity, rain per observation interval, pressure and UV (when present); 24-hour/7-day/30-day/year/all-saved views; accessible text table with MANUAL or IMPORTED_HISTORICAL provenance; download of at most 50,000 latest station records as CSV.

The backend maintains `weather_stations` and `weather_readings` tables in the existing user-owned private OpenRF SQLite path, outside the release ZIP and Git. Records contain a named station, observed UTC, record-creation UTC, source_kind and typed optional SI values. No migration overwrites existing rows. Browsers cannot submit a measurement as verified hardware data; only MANUAL and IMPORTED_HISTORICAL source kinds are accepted. Server stays loopback-only, with origin and Host checks.

### Supported CSV format

UTF-8 CSV must include `observed_at_utc` (an ISO-8601 timestamp including `Z` or an explicit timezone offset) and one or more of:

```
temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,wind_gust_mps,wind_direction_deg,rain_interval_mm,uv_index,solar_wm2
```

All measurements are optional per row, but each row must have at least one measured number. `rain_interval_mm` means precipitation **during the reported observation interval**; it is NOT a cumulative rain-counter reading. Negative speed, nonfinite numbers, invalid percentages, years before 1970 and future-dated entries are rejected. A downloaded OpenRF export can be re-imported into another station; its previous source category is retained in the exported file as evidence, while the newly imported copy is tagged `IMPORTED_HISTORICAL`.

One example CSV with **invented TEST VALUES ONLY** (do not interpret as weather in your area):

```csv
observed_at_utc,temperature_c,humidity_pct,wind_speed_mps,rain_interval_mm
2026-11-20T12:00:00Z,12.5,60,2.0,0.0
2026-11-20T13:00:00Z,13.1,58,3.2,0.2
```

No samples are preloaded into the application's database. The downloadable blank template contains headers only.

## Automated checks

Run from the extracted `project/` directory in WSL Ubuntu or Raspberry Pi OS (Python 3.11+ and Node.js):

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
node --check openrf/static/weather.js
for test_file in tests/*.js; do node "$test_file" || exit 1; done
```

New test files: `tests/test_weather_v168.py` covers validation, empty/no-live startup, historical ordering, persistence, UTC normalization, idempotent/atomic imports, export roundtrips and loopback API safety; `tests/test_weather_frontend_v168.js` covers sidebar/markup, tab navigation, no automatic writes, explicit manual entry with unit conversion and honest status labels.

**Local results on 2026-11-21:** 482 Python tests and all 136 JavaScript test files passed, along with `compileall` and JavaScript syntax validation. These are deterministic software tests, not a Raspberry Pi touchscreen, connected weather station or live RF measurement check.

## Manual field-console checks after installation

1. Download and install the complete release using `Update-OpenRF.ps1`, then restart the backend and reload the UI. In WSL: `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
2. Open **Weather Station**. Verify **NO LIVE SENSOR**, zero (or prior saved) records, no unsolicited network access, no RF scanning and no new weather radio session. Dashboard values must show dashes until a station has stored readings.
3. Under **Stations & Sensors**, add “My test station”. This must **not** attempt USB or wireless connection. Log a real reading from a separate thermometer if available, or enter a clearly documented test value and check that the saved record is tagged MANUAL. A blank record is rejected.
4. Visit **History**, select the station, verify the measured value, UTC time, trend and MANUAL label. Create two records at different times, restart OpenRF and verify local persistence. Existing Meshtastic, MeshCore and Reticulum chats and maps should be unchanged.
5. Make a small historical CSV using real observations or the explicitly invented test values above, select it through the file picker and import. Verify HISTORICAL labels and chronological sorting; repeating the import should report duplicates, not inflate the archive. Download CSV and inspect source/time/unit fields. The chart's 1,000-row screen cap and export's 50,000-row cap are independent.
6. Check 1280×800 touchscreen legibility and narrow-width stacking on the actual 7-inch Pi display when available. USB passthrough, Pi touch, SDR and weather station hardware have **not** been validated here.

## Planned, not yet supported

- Automatic local gateway readings (e.g. selected Ecowitt models), WeeWX archive synchronization, supported `rtl_433` sensor reception, USB/ESP32 weather node protocol, MQTT ingestion, and unattended logging/backfill.
- Weather alerts, automatic sensor discovery, wind compass, rain-counter conversion, station location mapping, remote gateway authentication and advanced historical aggregation.
- Continuous logging while OpenRF is off requires an independently powered logger/gateway with retained readings; this release does not provide one.

No third-party weather library or driver is bundled. Hardware adapters must use explicit consent and robust capability verification before readings may be called LIVE. There is no automatic forwarding over Meshtastic, MeshCore or Reticulum.

## Files changed

- `openrf/weather.py` (new) — isolated local weather SQLite store, validation, import/export
- `openrf/server.py` — loopback weather endpoints, asset allowlist, store initialization
- `openrf/static/index.html`, `app.css`, `app.js`, `weather.js` (new) — sidebar, 3-tab workspace, forms, chart and navigation
- `tests/test_weather_v168.py`, `tests/test_weather_frontend_v168.js` (new) — storage/HTTP/DOM tests
- `.github/workflows/openrf-linux.yml`, `openrf/__init__.py`, Electron metadata, test version assertions, `BUNDLE_FORMAT.md`, root `openrf-bundle.json`, `README.md`, `CHANGELOG.md` — version, CI and release metadata

The ZIP contains only the OpenRF manifest and managed source under `project/`, not local measurements, credentials, updater scripts, or a Git repository.
