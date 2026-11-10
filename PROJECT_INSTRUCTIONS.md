# OpenRF — Project Instructions (Linux / Raspberry Pi)

## Mission
Build OpenRF as a free, open-source, offline-first, general-purpose **portable RF investigation platform**. The primary target is a self-contained Raspberry Pi device with a touchscreen, battery, GPS, Wi-Fi/BLE/SDR and optional specialized receiver modules. Use Windows 11 + Ubuntu WSL for development before hardware purchase. Android is no longer required. Preserve archived Android work for reference; don't pretend Linux code is an Android app.

## Local project and release delivery
- Windows root: `C:\projects\OpenRF`, Linux WSL root: `/mnt/c/projects/OpenRF`.
- Every release must be a **complete** `OpenRF-vX.Y.Z.zip` with ZIP-root `openrf-bundle.json` equal to `{ "project":"OpenRF", "formatVersion":1, "version":"X.Y.Z" }`; all installable source under `project/`.
- Reserve outside `project/`: `Update-OpenRF.ps1`, `Setup-OpenRF.ps1`, `.gitignore`, `.git/`, `.openrf-state/`, `local-data/`, credentials, personal investigation data and signing keys.
- Updates: user downloads ZIP into Downloads, then runs `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'` from any PowerShell directory. It validates, backs up, installs managed paths, commits and pushes to GitHub by default; supports `-NoPush` and `-ZipPath`. **Never claim user actually ran it without confirmation.** Its old output may still mention an Android APK; v0.2.0+ runs Linux tests, not APK builds.
- Use a Linux CI workflow to test Python, JavaScript, release packaging. GitHub push starts a build/test attempt, not guaranteed success.
- Prefer whole bundles and one-line commands to manual patches. Review the most recent available source ZIP before editing, increment versions and preserve working functions. Include changelog, test steps, changed files and test limits.

## Software architecture
- Primary app: Python 3.11+ backend with local HTTP/JSON API and SQLite; portable, touchscreen-friendly HTML/CSS/JavaScript UI. For first releases prefer Python stdlib to avoid ABI issues with Python 3.14 or ARM64.
- Design for 5-inch Raspberry Pi Touch Display 2 (720×1280 portrait; optional landscape) first: large touch targets, map-first handheld view, hamburger navigation drawer without sideways scrolling, easy-to-dismiss map layers/sensor panel. Preserve a good desktop WSL layout and detailed Analysis view. Scanner readings with no defensible survey coordinates must never be plotted as transmitter pins.
- Maps: MapLibre + OpenStreetMap-derived datasets (OpenFreeMap for early online tiles); plan reproducible offline area caching for field use. Navigation and routing (Valhalla etc.) are later phases.
- Keep boundaries for map, wireless discovery, hardware drivers, observations, investigations, alarms, and export. Define a common typed observation format that records source device, time, evidence/quality, frequency/unit, optional RSSI, coordinates + accuracy, and survey-vs-estimated-source meaning.
- The backend works on WSL and Raspberry Pi OS; hardware drivers are optional plugins. Plan USB SDR, ESP32-S3, RTL-SDR, HackRF, CC1101/sub-GHz, GPS, compatible 4G/5G modems, optical sensors and directional antennas. Report supported, unsupported, connected, stale and failed states clearly.
- Start locally bound to loopback for safety. Avoid exposing the unauthenticated development API to the LAN/internet. Raw logs and GPS data stay outside Git and local by default. No required account, ads or automatic uploads.

## Accuracy and hardware limitations
- Separate verified map features, user reports, visual candidates, probable wireless signatures, generic observations and unidentified signals. An RF detection alone doesn't prove a Flock camera or person was present.
- **Phone/receiver location is not a transmitter location**; RSSI alone cannot give reliable direction or distance. Support multi-location heatmaps and uncertainty regions only with defensible measurement methods. Do not invent GPS readings, current scan results, signal values, RF frequency coverage or confidence percentages.
- WSL normally cannot directly use monitor-mode Wi-Fi/BLE built into the Windows PC; use hardware driver detection and clear unsupported states. Raspberry Pi does not inherently receive all RF bands. SDR and dedicated microwave/optical equipment expand what can actually be observed.
- Explicitly mark demo/prerecorded data as DEMO/HISTORICAL throughout; never show it as live. Ensure external sensor readings carry hardware identity, UTC timestamp, measurement units, GNSS fix age, accuracy, and stale flags.
- Any Flipper-Zero-like controls (garage remotes, IR, NFC, sub-GHz) must be for owned/authorized equipment with lawful pairing. No jamming, spoofing, unapproved interception, bypassing access systems, or intrusive individual tracking.

## Feature roadmap
1. **v0.2 Linux foundation:** local UI, map, manual observations, durable sessions, exports, hardware inventory; offline database. No fake scans.
2. Native Linux wireless discovery using compatible driver hardware, real session collection and detailed BLE/Wi-Fi frames/metadata with quality controls.
3. GPS-linked wireless survey maps, RSSI graphs, meaningful historic comparisons and uncertainty-aware location estimation.
4. External sensor box: USB hub / ESP32 and RTL-SDR, sensor capability negotiation, spectrum/waterfall display and calibrated signal interpretation.
5. Integrate optional cellular modem, sub-GHz, optical/IR and specialized sensors as technically supported.
6. Full portable Raspberry Pi touchscreen kiosk, reliable power/battery/cooling, case design, offline maps, opt-in proximity alerts, travel mode and evidence-limited route comparisons.

## Quality and communication
- Clearly distinguish implemented code from proposed features. Never imply a GitHub CI success, APK, physical sensor reading, or installation was verified without evidence.
- Build a working version incrementally. Run tests, check source ZIP against starter bundle format, note lack of live RF hardware tests, and explain changes and remaining limitations. Prefer code reuse and small migrations over rebuilds. Keep old source available when changing platforms.
- Record library licenses and map data attribution; choose an open-source license before public distribution.
- Provide easy launch/testing instructions in WSL/Windows and Raspberry Pi when supported. Keep the app field-readable, privacy-preserving, offline-first and free of distracting UI when driving.
