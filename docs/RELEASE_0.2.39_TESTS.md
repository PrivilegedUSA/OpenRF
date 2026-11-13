# OpenRF v0.2.39 — Real Linux Bluetooth LE discovery

## Install

1. Stop any active OpenRF server with Ctrl+C. Download `OpenRF-v0.2.39.zip` into Windows Downloads.
2. From **Windows PowerShell**, run:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`

   The updater verifies, backs up and installs the bundle and pushes the Git commit by default. This document does not claim you ran it or that CI succeeded.
3. From **Ubuntu/WSL**, run `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Open `http://127.0.0.1:8765/` in Firefox and press Ctrl+Shift+R.

## Manual checks

- Open **Analysis → Bluetooth LE discovery (on demand)**. Without a Linux-visible Bluetooth controller, click Scan: expect an actionable `no_controller`/BlueZ unavailable message; no records. A Windows built-in Bluetooth adapter is not normally exposed to WSL. Do **not** treat this as a successful empty RF scan.
- On **native Linux/Raspberry Pi OS** with suitable controller and BlueZ, click Scan once. It should take approximately eight seconds, showing only actual LE events. This can initiate normal Bluetooth LE discovery, but never pairing or connecting. It may return zero events even if devices exist; BlueZ properties may have been cached.
- Select a real device and click Save. Choose whether to attach the *observer* location captured when the scan started. If no recent location was present at scan time, save without coordinates. Verify SENSOR/BLE provenance in Saved. A mapped dot should appear only when observer coordinates are attached.
- Duplicate Save, fake scan IDs, devices absent from last results and invented RSSI sent in the client body must be rejected. A real one-shot BLE retrieval is not automatically persisted; a scan is rate-limited to one every 15 seconds and receipts expire after 10 minutes.
- Recheck Wi-Fi scan/filters, Map Dark/Light and offline regional MBTiles, Valhalla, turn sheets, offline map controls, existing investigations, Map settings gear/X, and USB sensor probe.

## Automated checks and limits

- Run `python3 -m unittest discover -s tests -q` and `for t in tests/*.js; do node "$t" || exit; done` in `C:\projects\OpenRF` inside Ubuntu (`/mnt/c/projects/OpenRF`).
- BLE tests use mocked BlueZ output; there was no physical BLE hardware attached to the build environment. No BLE scan on WSL/Pi was verified. No history, stable device identity, estimated distance or transmitter location can be inferred from BlueZ identifiers/RSSI.
- Bluetooth commands are fixed (no user-controlled shell or rf emissions except normal LE discovery). Controller access and Bluetooth behavior vary with kernel, adapter and BlueZ release.
- No required third-party Python packages, database schema changes or automatic uploads. Records and map data stay private and local unless you choose an external address lookup.
