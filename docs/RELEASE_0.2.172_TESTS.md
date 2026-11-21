# OpenRF v0.2.172 — USB weather bridge and CI regression fix

This complete OpenRF patch is based on v0.2.171. The ZIP-root manifest must be exactly `{"project":"OpenRF","formatVersion":1,"version":"0.2.172"}` and all installable source must remain under `project/`. Keep your existing Windows `Update-OpenRF.ps1` and `Setup-OpenRF.ps1`, Git metadata, local data, identities and credentials **outside** the ZIP and under user ownership. This is the next weather milestone, **not** the end of weather work or a pivot to installers.

## New working software foundation

1. **User-selected USB ports.** Weather Station → Stations & Sensors → **Wired weather sensors · USB / ESP32** has Refresh ports, Probe, Read one snapshot, and per-sensor Save. Refresh uses the existing read-only Linux USB serial inventory and device-permission diagnostics; it never opens the candidates. Probe and Read open a specifically selected inventoried `/dev/ttyUSB#` or `/dev/ttyACM#` at 115200 baud, exchange fixed commands for at most a few seconds, and close the handle. No automatic connection or continuous device session.
2. **OpenRF Weather Serial v1.** An explicitly programmed USB bridge can respond to `OPENRF WEATHER HELLO 1` and `OPENRF WEATHER SNAPSHOT 1` newline commands with one JSON object each, under a strict 32 KiB line limit. HELLO must advertise `openrf.weather.serial.v1`, non-empty source identity, firmware label/version, and `capabilities:["WEATHER"]`. SNAPSHOT includes the same hardware ID and up to 16 distinct sensor ID/channel entries with supported SI measurements. Missing/invalid/out-of-range values, unsupported fields, ambiguous identities and firmware error replies do not become fake observations. Generic USB weather stations and commercial protocols without this bridge are **not** automatically supported.
3. **Read → select → Save.** Each completed explicit Read supplies server-held, randomly identified, ten-minute receipts. An operator chooses one decoded sensor and a local station. The browser sends only receipt IDs and station ID; it cannot insert fabricated hardware readings. Failed saves do not consume the receipt; already saved samples are rejected. The weather history and exported CSV show **OPENRF_SERIAL_WEATHER_REPORTED**, the device-reported hardware/sensor/model/channel, and original SI fields.
4. **Time/freshness provenance.** OpenRF stores its own **UTC read-completion time** as the observation timestamp, never blindly trusts the microcontroller's clock. Optional device-provided measurement time/age is preserved separately. Age greater than 120 seconds is **STALE_DEVICE_REPORTED**; absent age remains **UNKNOWN_AGE**; future clock skew remains marked **CLOCK_SKEW_UNVERIFIED**. Even a zero-second device-reported age is not independently proven. New SQLite columns preserve these labels alongside every selected hardware-reported reading.
5. **Port ownership.** Weather operations refuse a port currently held by OpenRF's Meshtastic, MeshCore or active Reticulum RNode transports, and share the existing OpenRF serial sensor operation mutex. The host will still report an error if a *separate OS process* holds a port; OpenRF does not forcibly close someone else's connection. RTL-SDR/rtl_433 radio conflict guards remain unchanged.
6. **Example firmware.** The *source-only*, opt-in `firmware/esp32-s3-weather-bme280-v1/` is an experimental ESP32-S3 + I2C BME280 read-on-command bridge for temperature, humidity and barometric pressure. It uses Arduino-ESP32 3.x and the separately installed Adafruit BME280 library. It does **not** measure wind, rain, sunlight, GNSS or unspecified hardware and is **not compiled/tested on a physical ESP32** in this release.

## GitHub Actions issue reported for v0.2.171

The attached Actions log had **508 Python tests run with 3 assertion failures** and 2 expected optional-dependency skips. The three failures were:

- `test_app_settings_v147` demanded `app-settings.js?v=0.2.169` despite the browser correctly serving `?v=0.2.171`.
- `test_reticulum_tabs_v163_http` demanded `reticulum-tabs.js?v=0.2.169` despite the app serving `?v=0.2.171`.
- `test_weather_v168` demanded the old `OpenRF v0.2.169` comment despite shipping the v0.2.171 weather script.

The failures concern **outdated test expectations**, not proof of a broken weather device or runtime. Their checks now derive the installed backend version or validate stable script identity. A new Node.js canonical-version test verifies the backend, sidebar, major browser asset cache versions, bundle docs and optional Electron metadata agree. Other older JS tests check script inclusion without hard-coded minor release numbers to avoid the same false failure during future updates. GitHub Actions must be rerun *after the new source reaches the repository*; a local success is not a claim that remote CI passed. If stale v0.2.169 tests remain on GitHub after updating, compare the tracked test contents to this ZIP and report the updater's managed-path output.

## Automated validation

From the extracted `project/` directory:

```bash
python3 -m compileall -q openrf tools/build_release_zip.py
python3 -m unittest discover -s tests -q
node --check openrf/static/weather.js
node --check openrf/static/app.js
for test_file in tests/*.js; do node --check "$test_file" && node "$test_file" || exit 1; done
```

The new `tests/test_weather_serial_v172.py` uses **synthetic firmware frames**, mocked serial I/O, HTTP server fixtures and a temporary SQLite v0.2.171 database to test the bridge and migration. Updated `tests/test_weather_frontend_v168.js` asserts that **no serial request happens on initial Weather page visit**, the user must explicitly refresh/probe/read, and only a selected receipt is saved. A new asset/version test addresses the attached CI failure class. All tests preserve the existing map/navigation/radio/messaging/Ecowitt/WeeWX/rtl_433 behavior, within the limits of simulation.

**Local verification (2026-11-21): 516 Python tests passed and 139 Node.js suites passed**, including JavaScript syntax checks and Python compilation. These runs used synthetic weather samples; they do not establish Pi/WSL serial permissions, successful Arduino firmware compilation, real I2C sensor accuracy or GitHub-hosted CI success.

## Physical hardware testing — not yet performed

1. On Raspberry Pi OS or WSL Ubuntu, confirm a real ESP32-S3 appears as `/dev/ttyACM#` or `/dev/ttyUSB#`; WSL may require `usbipd-win` passthrough. Verify Linux permissions with `id -nG` and `ls -l /dev/ttyACM0`, not `chmod 666` or root-run OpenRF. No port should be opened merely by showing Weather Station or tapping Refresh USB ports.
2. Compile and flash the optional sketch using the board's correct USB CDC setting and I2C pinout, power a compatible 3.3 V BME280 sensor, close Arduino Serial Monitor, explicitly Probe, then Read. The UI must report honest hardware labels and SI values; compare against a reference instrument for accuracy. If no sensor is attached, firmware should return a `SENSOR_NOT_AVAILABLE` error, not zero readings.
3. Test disconnection during a read, wrong firmware/protocol, multiple candidate USB ports and a port already used by an active Meshtastic/MeshCore/Reticulum session. Probe/read must not reconfigure those owned ports; verify no false claims of a connected weather station.
4. Use a programmed bridge with known old/unknown/future-dated samples to check **STALE**, **UNKNOWN_AGE**, and **CLOCK_SKEW** labels, confirm stored host UTC and source identifiers in CSV. Try several sensors with the same receipt second. Make sure saving one does not silently save the rest.
5. Verify on the 7-inch Raspberry Pi touchscreen and WSL browser that the new Weather card fits and all buttons remain reachable. The field checks do not require radio transmission, Wi-Fi internet, an account or external server.

## Windows install

Download `OpenRF-v0.2.172.zip` into Downloads, then use the installed updater (explicit ZIP selection avoids stale `(1)` copies):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath 'C:\Users\brand\Downloads\OpenRF-v0.2.172.zip'
```

The updater normally backs up installed source, commits, and *attempts* a GitHub push; add `-NoPush` if you only want a local install. GitHub branch divergence or network failures can reject a push even when **local installation succeeded**. The ZIP is standard Windows-compatible ZIP32; check its CRC or re-download it if PowerShell reports `Central Directory corrupt`.

Launch Ubuntu WSL after installation:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

## Files changed and remaining weather milestones

- **New:** `openrf/weather_serial.py`, `tests/test_weather_serial_v172.py`, `tests/test_release_asset_versions_v172.js`, `firmware/esp32-s3-weather-bme280-v1/*`, this document.
- **Updated:** `openrf/weather.py` migration/provenance; `openrf/server.py` safe serial endpoints and port sharing; `openrf/static/index.html` and `weather.js` USB weather workflow; `openrf/sensor_connections.py` hardware status; existing frontend and CI version-sensitive regression tests, version metadata, `README.md`, `CHANGELOG.md`, manifest.
- **License:** `LICENSE` contains the complete GNU GPLv3 text, distributed for the user's previously selected **GPL-3.0-or-later** project license; independent third-party libraries keep upstream notices.
- **Next weather milestones before .deb installers:** opt-in scheduled recording sessions, disk/retention limits and reliable stop behavior; then richer history comparisons, stale-sensor flags/alerts and final field-UI polish. Specific weather hardware types without compatible firmware will still need their own adapters and real-device verification. After weather is ready, move to tested end-user `.deb` installers for **OpenRF and OpenRF Pocket**, update the download site, then prepare test-feedback outreach to creators.

## Primary references

- [Adafruit BME280 official Arduino library](https://github.com/adafruit/Adafruit_BME280_Library) — temperature/humidity/pressure read APIs and dependency installation.
- [Arduino-ESP32](https://github.com/espressif/arduino-esp32) — board-specific USB and I2C behavior.
- [Microsoft WSL USB guidance](https://learn.microsoft.com/windows/wsl/connect-usb) — physical USB passthrough requirement.
