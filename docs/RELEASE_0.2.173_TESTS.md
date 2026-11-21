# OpenRF v0.2.173 — Opt-in weather recording and session history

This complete Linux/Raspberry Pi OpenRF release continues from v0.2.172. Root manifest: `{"project":"OpenRF","formatVersion":1,"version":"0.2.173"}`. Managed source is exclusively under `project/`; local repositories, updater scripts, identities, GPS history and credentials remain user-owned and outside the ZIP.

## User-facing behavior

1. Open **Weather Station → Stations & Sensors** and create a saved station if you do not have one.
2. For Ecowitt, enter the *exact* private-LAN IPv4 of a supported gateway (for example `192.168.1.40` as an example only, not a detected IP). For USB recording, first use **Refresh USB ports → Probe → Read one snapshot** to learn its explicit `ttyACM#`/`ttyUSB#` port and selected bridge-reported sensor ID/channel. The device must speak OpenRF Weather Serial v1; ordinary USB weather products are not automatically compatible.
3. Under **Weather Station → Dashboard → Weather recording**, select a station and a source. Choose a 1, 2, 5, 10 or 15 minute interval and click **Start recording**. The worker takes its first snapshot shortly after Start and continues until you click **Stop recording**, a limit is reached, or three consecutive failures occur. Status and results are displayed in the dashboard and **History → Recording sessions**.
4. Automatic USB saves reject device-reported stale (>120 seconds), unknown-age or skewed-clock samples; repeated UTC sensor times are skipped too. Recorded Ecowitt data remains *gateway reported / unverified*, with no reliable device sampling-time freshness claim. Every saved sample has the source kind, host UTC timestamp and recording session ID; the exported CSV includes that ID. No radio scanner/rtl_433 capture is auto-started or left running as part of these recordings.
5. When OpenRF closes or restarts, recording stops; an abnormal interruption is recorded as `INTERRUPTED` on the next startup and never auto-resumes. Stop can take several seconds if a bounded read was already in flight. The server refuses overlapping sessions and concurrent USB port operations, including ports used by Meshtastic, MeshCore, and Reticulum.

Limits: 72 hours / 5,000 saved records per session, 250 session records per OpenRF database, and 50,000 saved observations per station before another recording can be started. The recorder never silently deletes old history. Recording interval controls are sampled in seconds, not exact wall-clock scheduling. Network/USB errors appear in the session error count and after three consecutive errors recording is marked `FAILED`. The page polls the *local recording status only* while visible; that status request does not contact a weather device.

## Local regression checks

From extracted `project/`:

```bash
python3 -m compileall -q openrf tools/build_release_zip.py
python3 -m unittest discover -s tests -q
for test_file in tests/*.js; do node --check "$test_file" && node "$test_file" || exit 1; done
```

New `tests/test_weather_recording_v173.py` uses fake weather values, a temporary SQLite database, backend HTTP test calls, a simulated Ecowitt response, stale/duplicate USB samples, interrupted-session recovery and MeshCore USB ownership checks. Updated `tests/test_weather_frontend_v168.js` checks that no automatic recording begins on page load and that Start/Stop/status/history operate through explicit requests. The v0.2.172 GitHub Actions stale-version expectation fixes remain in the bundle; GitHub-hosted CI must still run after your updater pushes.

**Local test results (2026-11-21): 522 Python tests and 139 JavaScript suites passed**, including backend HTTP fixtures, existing navigation/mesh/messaging regressions and weather UI checks. These use synthetic/test sensor values only. We have **not** verified Raspberry Pi touchscreen layout, powered ESP32/BME280 wiring, USB passthrough/permissions, actual Ecowitt gateway firmware, long-term field retention, or GitHub Actions execution on a pushed commit.

## Install and launch

Put `OpenRF-v0.2.173.zip` in Windows Downloads and use your already-installed updater from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

If Downloads contains older similarly named ZIPs, supply your actual downloaded file explicitly with the updater's `-ZipPath` parameter. The updater performs its normal local validation/backup/managed install and *attempts* a GitHub push; a push request does not prove CI passed. To launch in Ubuntu WSL:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

## Changed paths and later weather work

- New: `openrf/weather_recording.py`, `tests/test_weather_recording_v173.py`, this release document.
- Updated: `openrf/weather.py` (migrations, association, CSV), `openrf/server.py` (recording HTTP and protected USB polling), `openrf/static/index.html`, `openrf/static/weather.js`, `tests/test_weather_frontend_v168.js`, `README.md`, `CHANGELOG.md`, release manifest, Python/Electron versions and current-version browser assets/regressions.
- Existing MeshCore, Reticulum, Meshtastic, navigation, SDR one-shot, offline map and emergency systems were preserved, not rebuilt.
- Next weather milestone: better dashboard/history comparisons, sensor alerts/staleness presentation and physical-device verification. Only after weather is finished do we return to Linux `.deb` installers for OpenRF and Pocket.
