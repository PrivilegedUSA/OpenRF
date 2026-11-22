# OpenRF v0.2.175 — Local weather freshness and alert settings

Complete incremental source ZIP: `OpenRF-v0.2.175.zip`, with ZIP-root `openrf-bundle.json` declaring `{"project":"OpenRF","formatVersion":1,"version":"0.2.175"}` and managed source under `project/` only. Local updater scripts, Git, private data, and installed credentials are not bundled.

## Behavior

- Dashboard freshness indicator shows the age of the selected station's latest **saved** weather record, using the local backend UTC clock rather than assuming the browser clock is correct. Missing records and old archives do not imply a physically connected or disconnected device. Recency cutoff is configurable per station (5 / 15 / 30 / 60 / 120 minutes), default 30.
- Local alerts start **OFF** for each saved station. Click **Enable in-app threshold warnings** and **Save alert settings** to store optional °F low/high temperature, mph high gust and in/hr high rain-rate limits in local SQLite. The new `/api/weather/alerts` GET/POST endpoints read/write preferences only; they never start Ecowitt, USB, RTL-SDR or any network listener. All API fields are strictly validated in SI units.
- A threshold warning is only displayed while Weather Dashboard is visible and a user-started recorder is currently active for exactly that station. The latest saved reading must belong to that session, be less than the configured stale age, and come from the eligible Ecowitt gateway or USB source. Manual/imported/historical/one-shot and prior-session readings cannot trigger it. For USB, missing/unknown/stale device-reported ages are rejected; Ecowitt remains gateway-reported with a host receipt time, not verified sensor time.
- Stale recording status is a warning about a **missing recent saved session sample**, not a verified physical sensor failure. The display does not beep, create OS/system notifications, send mesh messages, run background alarms, upload data, automatically resume recording or search for sensors.
- The Weather Recording controls still sit below temperature, wind, humidity, rain and the freshness/alert panel. Every existing station, saved reading, comparison, recording session and CSV export is preserved.

## Reproducible checks

From the unzipped `project/` directory:

```bash
python3 -m compileall -q openrf tools/build_release_zip.py
python3 -m unittest discover -s tests -q
for test_file in tests/*.js; do node --check "$test_file" && node "$test_file" || exit 1; done
```

`tests/test_weather_alerts_v175.py` checks defaults, persistence across DB reopen, station isolation, strict invalid input rejection, no implicit recorder starts, and GET/POST API validation. `tests/test_weather_frontend_v168.js` additionally exercises explicit enabling, real source-session gating, historical/manual exclusion, fresh versus stale/unknown USB, host UTC recency and no implicit writes/receiver activity. All test measurements are **SYNTHETIC FIXTURES**, not readings from real weather instruments.

**Local automated result:** 529 Python tests and 140 JavaScript suites passed with Python 3.12 and Node.js (source/syntax/functional tests); dedicated `tests/test_release_versions_v175.py` checks Python, CSS/JS cache-key HTML, Electron backend version, Electron package/lockfile and release format agreement before users publish another patch. Test suites do not establish that the updater stages every local modification in Git; see the post-update check below.

## Install and field checks

1. Download the full `OpenRF-v0.2.175.zip` into Windows Downloads. With WSL/Ubuntu/OpenRF stopped, run from any PowerShell directory:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

   To force this archive when several downloads exist, append `-ZipPath 'C:\Users\YOURNAME\Downloads\OpenRF-v0.2.175.zip'` (replace the username).
2. Start in Ubuntu WSL:

   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```

3. Open Weather Station → Dashboard. With no station, check that the freshness indicator says **NO STATION**. Add a station, save a *manual* reading, and verify that its provenance/age is displayed without triggering threshold warnings.
4. Enable/save thresholds for one station; close and reopen the page and confirm persistence. Check that other stations remain disabled. Turning the page on or saving preferences must not automatically connect to weather hardware.
5. If compatible **authorized** hardware is present, explicitly start an Ecowitt or exact OpenRF Weather Serial v1 recording and observe only the supported source-reported readings. Confirm an in-session threshold warning is displayed only when a fresh saved sample actually crosses a configured limit. Confirm stale/unknown USB age or a stopped recorder suppresses temperature/wind/rain alarms. Check Session History and CSV exports remain intact.
6. After updating, inspect `git status --short` in Ubuntu and verify managed release files are included in the Git commit. The updater previously left versioned source files modified and uncommitted, causing GitHub CI mismatches. Do **not** use `git add .` because local `node_modules`, Python bytecode and private files must stay out of Git. Confirm the newly triggered GitHub Actions run separately; a successful push is not a successful test run.

## Limits

No live Ecowitt device, rtl_433 receiver, serial weather sensor, RTC precision, physical Raspberry Pi 1280×800 touchscreen, Windows updater-script repair or post-push GitHub Actions result has been verified by synthetic tests. Source-reporting does not establish calibration or actual outdoor conditions. WSL hardware passthrough and compatible firmware remain optional setup work. The existing PowerShell updater is outside the release bundle and requires a separate user-provided copy before it can be audited and changed.
