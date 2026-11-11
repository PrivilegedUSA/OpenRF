# OpenRF v0.2.22 — Manual observation GPS shortcut and startup error fix

## Changes

- Fixed the startup data refresh regression introduced in v0.2.21: nine local API responses were requested but only eight variables were destructured. The client then attempted to assign an undefined `readiness` identifier and reported a misleading "Unable to reach local OpenRF server" banner despite the server responding correctly.
- The startup error message now distinguishes a general data refresh failure from a confirmed network disconnection.
- Added **Use my location** to the Add survey observation dialog, available from Saved, Map (+), and Add observation manually. It uses `getCurrentPosition` only after clicking the button, with `maximumAge:0` and a timeout. It fills latitude, longitude, and browser-reported accuracy without posting to the API until Save locally.
- Saved manual observations now retain optional `location_source` (`BROWSER_REPORTED` / `MANUAL_ENTRY` / `UNSPECIFIED`) and `fix_age_seconds` in the existing SQLite columns. Invalid/incomplete browser metadata is refused. This does **not** establish the observed camera/device's exact position or prove RF hardware reception.
- A stale (>60 s) browser fix must be refreshed before saving. Failed or denied location requests do not overwrite existing fields. Closing/reopening the dialog and manually editing coordinates invalidates outstanding requests and removes browser accuracy attribution when no longer applicable.
- All maps, snapshots, session reports, GPS waypoints, earlier source and archived Android work remain unchanged. No new SQLite migration or dependency.

## Automated checks

From the Linux project folder:

```bash
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
node tests/test_frontend.js
node tests/test_history_analysis.js
node tests/test_signal_explorer.js
node tests/test_reports_frontend.js
node tests/test_readiness_frontend.js
node tests/test_manual_location_frontend.js
```

- `tests/test_manual_location_frontend.js` executes the startup refresh and a mocked browser geolocation callback, verifying the readiness assignment and location success/error/stale/pending behavior without real GPS.
- `tests/test_manual_observation_location.py` and the HTTP test cover manual source labels, coordinate accuracy/fix age and input rejection.
- Browser UI, hardware serial connections, real GPS accuracy and Raspberry Pi behavior still require physical testing.

## Local user test

1. Stop OpenRF with Ctrl+C in the Ubuntu terminal.
2. Download `OpenRF-v0.2.22.zip` to Downloads. From **Windows PowerShell** run:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`
3. From **Ubuntu** run:
   `cd /mnt/c/projects/OpenRF && python3 -m openrf`
4. In Firefox open `http://localhost:8765`, press **Ctrl+F5**, and confirm there is no `Readiness is not defined` banner. On Hardware, the read-only readiness checklist should display normally, even with no compatible device.
5. Open Map → +, or Saved → Add observation. Press **Use my location**. Grant Firefox geolocation permission. The form should show latitude, longitude, and accuracy with a browser-reported disclaimer. **No observation is saved until Save locally.**
6. Test Cancel, denied location permission, and manually editing a coordinate (accuracy should clear). A map-click should still prefill the clicked point. For stale fixes, retry Use my location.
7. After saving, check the observation's source stays `MANUAL` and its `location_source` is `BROWSER_REPORTED` when GPS was used. Existing private SQLite data is not part of the update ZIP.

## Limitations

Browser coordinates on a desktop/WSL setup can be approximate due to network/Wi-Fi/VPN geolocation. The shortcut records an **observer position**, not the exact location of a transmitter, radar or camera unless the person actually stands at that physical site. No continuous tracking or background acquisition was introduced. Navigation and radar remain on the future roadmap.
