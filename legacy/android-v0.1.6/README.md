# OpenRF v0.1.6 — Foreground investigation sessions

OpenRF is an experimental, privacy-first Android RF investigation and infrastructure documentation app. v0.1.6 adds **durable, user-started investigation sessions** to the working real BLE/Wi-Fi scanners, retaining completed scan snapshots across repeated surveys. No simulated data is used. It is not a full-spectrum RF analyzer, an ALPR detector, or a camera-identification system.

## What works

- **Map:** MapLibre and OpenFreeMap street/dark maps, automatic one-time GPS centering with permission; long-press to save manual observations.
- **Scanner → Bluetooth LE:** Explicitly tap Scan now. Collects real BLE advertisement results for up to 12 seconds. Deduplicates rotating observed identifiers within the run, shows advertised name (if present), observed address, RSSI (dBm), and observation time. Stop is available. Does not pair/connect to advertising devices.
- **Scanner → Wi-Fi:** Explicitly tap Scan now. Calls Android Wi-Fi scan API and waits for the system completion broadcast. Shows only newly updated, recent access-point results with SSID/BSSID, RSSI, frequency (MHz), basic advertised capabilities and timestamp. If Android throttles the scan or only cached results are available, OpenRF reports this instead of presenting cached readings as fresh.
- **Foreground-only:** BLE scanning is capped at 12 seconds, and active scans stop when leaving Scanner or when the app leaves the foreground. No continuous background scanner, passive tracking service, or automatic uploads.
- **Save survey point:** Tap Save survey point on a reading to request a fresh foreground phone location. The resulting Room observation includes radio type, identifier, RSSI, timestamp, signal metadata, GPS coordinates and location accuracy. These coordinates are **where the phone was at save time**, not where an emitter was located. If there is no recent location fix, the reading is not saved. Saved entries appear in Discoveries, on Map, and in CSV export; outside a named session no bulk capture is enabled.
- **Persisted manual notes, search/delete and local CSV export:** Same app package and original observation table, with a non-destructive Room schema v1→v2 migration, so existing local records should survive an in-place update.
- **Investigation sessions:** Start a named local session on Sessions, then manually run scans in Scanner. Each successfully completed BLE/Wi-Fi scan (including zero-result scans) is automatically stored in the active session with its timestamp and observed RSSI/frequency/identifiers. A one-shot phone location fix is attempted; missing coordinates remain missing. Session history can be reviewed with per-scan readings, and each session has a separate user-triggered CSV export.
- **Foreground privacy:** A session ends when you stop it or OpenRF leaves the foreground, and an interrupted session never auto-resumes. Switching tabs stops an active scan. No route recording, automatic camera identification, or uploads.
- **External SDR/ESP32:** Still not implemented. No invented detections or signal confidence scores.

## Install/update

Download `OpenRF-v0.1.6.zip` to Downloads, then run from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The updater validates and extracts this complete release source bundle, commits managed files, and pushes to GitHub unless given `-NoPush`. The GitHub Actions workflow runs JVM unit tests and an Android debug build. After a successful run, download **Actions → OpenRF Android Debug APK → latest run → Artifacts → `OpenRF-v0.1.6-debug-apk`** and install its APK (not the source ZIP). An upload/build attempt does not mean the APK is guaranteed to compile or install.

## First phone tests (including sessions)

1. Install as an update to v0.1.5 (do not uninstall first), check existing Map observations and Discoveries are still saved.
2. Open Scanner. On Bluetooth LE tap **Scan now**. Allow **Precise Location** and **Nearby devices** when Android asks. Ensure Location services and Bluetooth are enabled. Scan near a known BLE advertiser, confirm actual received entries show RSSI, identifier and timestamps, and wait for the scan to end automatically after 12 seconds.
3. On Wi-Fi tap **Scan now**. Allow precise location if prompted; turn Wi-Fi and Android Location services on. Confirm SSID/BSSID, dBm and frequency of discovered access points. Try scanning repeatedly: Android may throttle requests. Verify a denied/throttled scan never displays old results as new.
4. Save one BLE or Wi-Fi reading after a valid GPS/network fix. Confirm it appears under Discoveries as `BLE_SCAN` or `WIFI_SCAN`, marked `UNIDENTIFIED`, and that the Map marker/CSV clearly refers to the **phone observation point**. An unavailable current location should cause a clear message instead of invented coordinates.
5. Start a named session on Sessions, switch to Scanner and complete a BLE/Wi-Fi scan. Return to Sessions and verify cycle history, timestamps, and per-session CSV export. Repeat scans: later snapshots should be retained separately. Stop the session and verify later scans do not append to it.
6. Switch tabs or background the app mid-scan: radio scan activity should stop, and the session should be marked INTERRUPTED when backgrounded. Reenter Scanner to start a new scan. Disable Bluetooth, Wi-Fi or Location and verify explicit unavailable/error states instead of crashes.
7. Export CSV in Settings; confirm manual and explicitly saved radio readings appear in the same export. Existing manual records should remain unchanged.

## Radio and privacy limits

- Wi-Fi `startScan()` can be throttled by Android (typically foreground apps get four scans per two minutes on Android 9+); Android controls scanning. A scan can fail when Location services are off. Android Wi-Fi results may be cached: v0.1.5 filters by recent *platform timestamp* after a successful broadcast, but timestamps still cannot prove physical distance or identify a surveillance device.
- On Android 12+, BLE needs `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` to perform scanning and access adapter state; OpenRF also requests precise location because the purpose includes optional survey geotagging. On older Android versions BLE scanning needs location permission. Do not set the `neverForLocation` Bluetooth flag because this project can geotag results and filtering could drop some beacons.
- BLE advertisements can have randomized IDs; the device display name may be absent or misleading. RSSI changes with antenna orientation and environment. Wi-Fi BSSID can also be randomized. Neither scan type reliably detects Flock cameras or arbitrary RF frequencies.
- When you leave Scanner, any **non-session, unsaved** scan snapshot disappears. If a session is active, completed scan snapshots persist privately under Sessions but do not become Map markers. Saved survey locations and identifiers remain in the private Room database; CSV export is user-triggered. Avoid publishing device identifiers or precise personal routes without review.
- Online maps require data for new map areas; no offline downloads yet. OpenFreeMap receives normal tile-view requests but OpenRF does not upload investigation records.
- Choose an application license and complete third-party attribution review before public release.

## Build verification

Target Android SDK 35, compile SDK 36, min SDK 26, Java 17, Gradle 8.13, Room 2.8.3, MapLibre 13.7.1, Compose. Check `CHANGELOG.md`, `docs/ARCHITECTURE.md` and `docs/THIRD_PARTY.md` for release details. Release ZIP checks and targeted JVM tests can be performed in the packaging environment; a full Android build and phone behavior must be verified through GitHub Actions and an Android device.

For data migration details, scope limits, and the phone testing matrix, see `docs/SESSION_RECORDING.md`. Room upgraded from schema v1 to v2 with an explicit non-destructive migration.
