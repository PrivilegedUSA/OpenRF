# OpenRF v0.2.171 — Wireless weather sensor receiver and archive

This is a complete source release based on **v0.2.170**. The ZIP root must contain `openrf-bundle.json` with exactly `{"project":"OpenRF","formatVersion":1,"version":"0.2.171"}` and all managed files under `project/`. The PowerShell updater, setup script, `.git`, credentials, local investigations and SQLite records are **not** overwritten or included in the ZIP. Preserve the Windows updater already installed on the user's machine.

## Implemented

1. **Bounded, manually initiated receive.** In **Weather Station → Stations & Sensors**, create/select a station and use **Wireless weather sensors · RTL-SDR**. Pick 433.92, 868.3 or 915 MHz and a 10-, 20- or 30-second window. Click **Listen for sensors**. OpenRF invokes the separately installed `rtl_433` Linux executable with fixed, validated arguments (first RTL-SDR device, selected frequency, bounded runtime, SI units, newline-delimited JSON). **Stop listening** ends an active capture; **Refresh receiver status** shows availability and the last transient results. The server never starts a listen merely because it launched, a user visited the page, or a status request occurred.
2. **Decoder-reported weather candidates.** Only messages containing a recognized weather field plus decoder-reported model and device ID become candidate cards. Other RF events are not retained. Candidate cards show any reported temperature, humidity, wind, gust, direction, rain *rate* and pressure plus battery and model/ID/channel, marked **UNVERIFIED**. A candidate is only a report from `rtl_433`, not verified physical identity, calibration, freshness or time. The displayed UTC time is the **host capture-window completion time**, not a packet-origin timestamp. Empty scans do not create sensor records or imply no nearby sensors.
3. **Explicit selective archive.** After a completed listen, select a saved OpenRF weather station and tap **Save this sensor** on one card. The browser sends only a temporary server-issued run ID, candidate ID and station ID. The server looks up the candidate in memory, rejects invented/expired receipts, and writes that one normalized observation to local SQLite as `RTL433_RECEIVER_REPORTED`. Raw JSON output and unrelated code events are never saved to history. Capture candidates expire after ten minutes. The receiver does not remain connected after the window.
4. **Exclusive SDR access.** The Weather receiver, OpenRF **Radio Receiver** (rtl_fm) and **SDR spectrum capture** cannot start while one of the other two OpenRF jobs is running. This prevents these OpenRF operations from fighting over the same first RTL-SDR device. Processes launched independently of OpenRF may still contend for it and are not controlled by OpenRF.
5. **Accurate rain semantics and migration.** `rain_rate_mm_h` is stored, charted, exported and optionally entered manually/imported from WeeWX separately from `rain_interval_mm`. The `rtl_433` decoder's cumulative `rain_mm` reading is intentionally **not** converted to interval rainfall. Transactional schema upgrade preserves all previous weather readings, UTC timestamps, IDs, source descriptions and station assignments. Distinct sensors in the same station can share the same UTC capture timestamp without overwriting each other.

## Software prerequisites and honest hardware status

- OpenRF itself uses the Python 3.11+ standard library for this adapter; there is no mandatory Python sensor package. Install the optional **`rtl_433` command-line program** using a package or build appropriate to your Ubuntu/WSL or Raspberry Pi OS distribution, and confirm `command -v rtl_433`. This does **not** confirm hardware connection.
- Connect a compatible USB **RTL-SDR receive-only** dongle and appropriate antenna **visible inside Linux**. Windows seeing a USB device does not guarantee that Ubuntu WSL can access it; device passthrough, drivers, permissions and shared SDR ownership must be verified when hardware is present.
- Compatibility depends on the specific weather sensor protocol and frequency. An unknown or unsupported sensor may yield no decodes. Receive only; no sensor pairing, proprietary cloud account, RF transmission, automatic collection or periodic background job is provided.
- **No live RTL-SDR, Ecowitt station or attached outdoor weather hardware was available during code validation.** Unit conversions, decoder framing and receiver lifecycle were tested with **synthetic test fixtures**, never passed off as real observations. Pi 7-inch touch readability and USB passthrough have not been validated here.

## Automated tests

From the extracted `project/` directory with Python and Node.js installed:

```bash
python3 -m compileall -q openrf tools/build_release_zip.py
python3 -m unittest discover -s tests -q
node --check openrf/static/weather.js
node --check openrf/static/app.js
for test_file in tests/*.js; do node --check "$test_file" && node "$test_file" || exit 1; done
```

New `tests/test_weather_rtl433_v171.py` exercises settings enforcement, model/ID and units, rejecting unsupported codes/cumulative rain as interval rain, no automatic device opening, simulated subprocess output/stop/empty reads, receipt validity, duplicate prevention, HTTP routes, SDR receiver conflicts, and migration of existing v0.2.170 records. Expanded `tests/test_weather_frontend_v168.js` checks **no** receiver action when the Weather page appears, explicit frequency/duration/start, one delayed status refresh, decoder labels, and selected-only saving. Results are deterministic mock tests; they do **not** prove real hardware decoding, weather accuracy, visual rendering or successful Windows installation.

**Local verification on 2026-11-21:** 508 Python `unittest` cases and 138 Node.js suites passed, plus Python compileall and JavaScript `--check` syntax validation. No physical RTL-SDR sensor was attached for these runs.

## Operator acceptance checks

1. Without hardware or `rtl_433`, launch OpenRF and open **Weather Station**. All existing MANUAL, Ecowitt, WeeWX and history controls should still work. Tap **Refresh receiver status**; a missing executable should be reported without connecting, adding a reading, or claiming a device is present.
2. With the optional tool present, explicitly select a local station and start a **10-second** listen at the known sensor's supported band. Before pressing **Listen**, inspect the SDR processes/LEDs: OpenRF must not have opened a device. Confirm the UI offers **Stop** while running and shows either bounded decoder-reported candidates or an honest empty/failure result afterward.
3. Run a concurrent OpenRF Radio Receiver or SDR capture attempt while weather is listening; it must be rejected as busy. Conversely, a weather start while those jobs are running must be rejected. Stop and verify other modes become usable. Also test a different program holding the RTL-SDR; OpenRF should report failure without inventing readings.
4. With a genuinely compatible physical weather sensor, record its brand/model, transmitter frequency, firmware and independent reference values. Compare the decoder-reported values/ID/battery against its own display or reliable station records. Check missing fields, low battery, stale transmissions, signal range and sample timing. **Only then** decide whether this device is suitable for continuous future integration; decoder identity alone is not proof.
5. Save one selected candidate. Check weather Dashboard/History, source `RTL433_RECEIVER_REPORTED`, reported model/ID/channel and listen-window UTC in exported CSV; no unrelated sensor or remote code should be saved. Rain *rate* should remain separate from interval rain. Restart and confirm the archive persists, while transient unsaved receiver cards do not.
6. Repeat on the target Raspberry Pi OS/touchscreen and Ubuntu WSL with USB passthrough, plus verify the old messaging/radio/map/sessions/hardware tabs. Try an absent USB device and disconnected antenna; never display demo results as actual observations.

## Install from Windows 11

Download `OpenRF-v0.2.171.zip` to the Windows Downloads folder. To avoid selecting an old `(1)` copy, explicitly specify the file path:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath 'C:\Users\brand\Downloads\OpenRF-v0.2.171.zip'
```

The updater typically backs up managed paths, commits, then attempts a GitHub push; append `-NoPush` for a local-only update. We cannot confirm any install or CI result until you run and report it. Launch in Ubuntu WSL after installation:

```bash
cd /mnt/c/projects/OpenRF
python3 -m openrf
```

If PowerShell reports **Central Directory corrupt**, validate the downloaded file (bytes/CRC) and download the ZIP again rather than assuming installation succeeded. The release builder emits ordinary Windows-compatible ZIP32 Deflate without ZIP64 extras. Reproduce from a directory containing `openrf-bundle.json` and `project/` with `python3 project/tools/build_release_zip.py --source-root . --output OpenRF-v0.2.171.zip`.

## Changes and future work

- New: `openrf/weather_rtl433.py`, `tests/test_weather_rtl433_v171.py`, this document.
- Updated: `openrf/weather.py` SQLite/WeeWX/manual schema and normalization; `openrf/server.py` local HTTP endpoints/SDR ownership; `openrf/static/index.html`, `openrf/static/weather.js` opt-in UI, source labels and rain-rate chart; `tests/test_weather_frontend_v168.js` explicit-action regression coverage.
- Version metadata, ZIP manifest, release docs and version-aware regression assertions; all previous features and source history remain included.
- **Next patch proposal:** user-initiated **direct USB serial / ESP32 weather sensors** with capability detection, strict source IDs, sample UTC/age, measured unit conversions and explicit station binding. Longer-term scheduled capture, genuine stale-sensor tracking and alerts should be opt-in and field-tested before adding them.

## Primary references

- [rtl_433 operation and options](https://github.com/merbanan/rtl_433/blob/master/docs/OPERATION.md) — `-T` bounded run, `-F json` and SI output option.
- [rtl_433 data formats](https://github.com/merbanan/rtl_433/blob/master/docs/DATA_FORMAT.md) — decoder fields including cumulative `rain_mm`, wind and pressure.
- [rtl_433 project](https://github.com/merbanan/rtl_433) — compatible receivers and supported hardware/protocols depend on model/build.
