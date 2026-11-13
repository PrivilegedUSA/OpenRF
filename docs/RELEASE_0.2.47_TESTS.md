# OpenRF v0.2.47 — One-shot browser site metadata for completed SDR sweeps

## Implemented

- Spectrum adds an **unchecked** browser-position option that obtains a geolocation fix only when an operator presses Start short capture, immediately before launching the existing bounded `rtl_power` process. If the user refuses location, browser geolocation is unavailable, timestamp is old, metadata is wrong, or browser clock disagrees, **a geotagged capture is not started**; unchecking the option preserves ordinary location-free captures.
- Optional investigation selector includes only currently active sessions. The local API rejects absent, closed, invalid or nonexistent session IDs. The completed-capture metadata stores session association but does **not** add a SQLite observation, affect existing session counters, or magically verify receiver/device identity.
- Private local sidecar JSON stores `observer_fix`: latitude/longitude, browser-reported accuracy metres, fix timestamp in UTC, fix age seconds, server attach UTC and explicit `BROWSER_REPORTED` / `gnss_verified: false` fields. No spoofing guarantees are implied. Local capture metadata records the device-specific subprocess start/finish UTC timestamps separately from rtl_power's **unverified timezone** CSV frame timestamps.
- `GET /api/sdr/survey/sites` retrieves **only completed location-bearing sweeps**. `GET /api/sdr/survey/sites.geojson` exports them with a warning and all coordinates, optionally filtered to a known associated investigation via `session_id`. No RF amplitude per source, derived emitter location, RSSI distance, position track, or interpolation is exported.
- Map → Recorded SDR survey sites offers a session filter and an **unchecked** local layer, including raster fallback with pink separate observer markers. No position layer is turned on automatically. GeoJSON download requires explicit confirmation; do not share sensitive exact survey coordinates publicly.
- Existing Spectrum recorded-file analysis, DEMO, frequency comparison, offline maps and route planning remain intact.

## Developer verification (Ubuntu / WSL)

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -p 'test_*.py' -q
for file in tests/*.js; do node "$file"; done
node --check openrf/static/app.js
node --check openrf/static/spectrum.js
bash -n run-openrf.sh
```

- **187 Python unittest tests passed** (including 6 new v0.2.47 tests): fresh vs stale fix, malformed/malicious site payload, no fake sensor data, opt-in successful stub capture, stopped/failed exclusion, session validation, filter and GeoJSON privacy warnings, deleting capture removes site.
- **26 JavaScript test files passed**, including new capture-start/DOM/map provenance contracts.
- **Chromium 800×480 simulated UI test passed** with actual HTML/CSS/Spectrum JS and *mocked* local API/browser geolocation: location OFF by default, denial blocks start with readable message, a fresh permitted fix and active investigation are included in the start request, no page exceptions. Browser smoke does not constitute physical SDR or GNSS verification.
- Release ZIP audit checks root manifest version, all v0.2.46 managed files retained, bundled offline-map resources byte-identical, no local credentials/SQLite/Git caches and no reserved updater scripts under project/; ZIP CRC checked and tests rerun after extraction.

## Operator smoke test

1. Stop OpenRF with Ctrl+C. Download `OpenRF-v0.2.47.zip` to Windows Downloads, install using your existing updater, restart Ubuntu with `cd /mnt/c/projects/OpenRF && python3 -m openrf`, and hard-refresh http://localhost:8765. Header should read **0.2.47**.
2. Open Spectrum: optional location checkbox must be **OFF**. Click it to opt in only for a future 5–30 second capture. Choose an active investigation if one exists. Without a real Linux-visible RTL-SDR and `rtl_power`, do **not** expect a completed capture or a plotted RF survey point. You can still inspect DEMO and historical CSVs without locations.
3. With an actually compatible, connected receiver, start an explicit short capture. If location was opted in, authorize one browser fix. Validate that a successful, saved capture displays reported accuracy; rejected/stale location should stop the start and explain why. Device/receiver location has NOT been independently verified.
4. Open Map → Recorded SDR survey sites (below map), turn on the layer manually, optionally filter by investigation, inspect a pink observer point and explicitly export the GeoJSON only if needed. Never treat a plotted site as an emitter coordinate. Turn the layer off when not needed.
5. Confirm old offline regional vector maps, survey waypoints, navigation, Wi-Fi/BLE discovery, stored captures, and comparison still load. A capture deleted from Spectrum also disappears from the site list when refreshed.

## Unverified and unsupported

- No physical RTL-SDR, Raspberry Pi 5-inch touchscreen, WSL USB passthrough, native GNSS, calibrated power, transmitter localization, source identity, real RF scanning or real browser geolocation was tested. Browser smoke uses a fake position only in a test fixture and test-stub CSV; production makes no synthetic live position claim.
- No background GPS recording, continuous SDR streaming, inferred trajectory, source triangulation, or RF heatmap. A desktop browser position may be offset significantly from the antenna/receiver and the browser-provided fix may be inaccurate. CSV timezones remain unverified.
- No user machine installation, GitHub push/CI success, physical output, or actual radio data is claimed.
