# OpenRF v0.2.147 — App Settings and Offline Field Readiness

## What changed

The complete ZIP uses `openrf-bundle.json` at archive root with `{"project":"OpenRF","formatVersion":1,"version":"0.2.147"}` and all managed app sources under `project/`. The existing updater, Git/CI metadata, credentials, private maps, database, GPS histories and evidence remain outside the package.

**App Settings** now appears at the lower end of the desktop sidebar, above the connection/RF status labels. It is **not** inside Map Settings. The new workspace contains:

1. **Device storage:** Linux/WSL filesystem capacity for the location holding OpenRF's private database; free, used, total and warning level. On a WSL install on `C:`, this will reflect the Windows drive hosting OpenRF's local data, not a simulated Pi SD card. If Linux cannot report sizes, it shows `—` rather than zero. Refresh is manual and uses `GET /api/device/storage` with no query options, external requests, directory scans or deletion.
2. **Offline field readiness:** Explicit manual check of local routing service, installed visual map packages, optional local HGT tile inventory, battery gauge, storage capacity and GPS/route limitations. It reads only the local OpenRF server. Green/reported items mean an API returned a usable status; they are **not** proof of safe navigation, adequate geographic coverage, a verified GNSS fix, battery/runtime or sensor readiness. Neither location permission nor Wi-Fi/SDR scans start during the check.

## Acceptance checklist

1. At the target **1280×800** desktop size, click **App Settings** in the lower sidebar. It should open a distinct workspace with full-width panels. The map's right-hand settings, tools and altitude overlay should remain unchanged. On compact screens the Settings entry must be reachable from the drawer.
2. Verify **Free**, **Used** and **Total** reflect the actual mounted filesystem used for OpenRF local data (`df -h` on WSL is a useful comparison). `—` means unavailable; **Low space** appears with less than 1 GiB or less than 10% free.
3. Click **Check field readiness** with and without Docker/Valhalla available. The road router state should change; offline raster/vector inventories remain separate from road graph coverage, and HGT counts are optional.
4. Check **Battery** remains unverified on WSL with no Linux-exposed gauge; do not treat absent readings as 0% charge. **GPS / route coverage** remains unverified because this control does not request position or plan any route.
5. Return to Map, Emergency, and another page; verify no duplicate headers, missing controls or forced installation changes.

## Automated tests

From the installed `project/` directory:

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -p 'test_*.py' -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/app.js
node --check openrf/static/app-settings.js
```

New tests cover filesystem stats and unknown/low thresholds, local-only storage API/asset availability, settings sidebar integration, storage bar/unit formatting, no calls on Map startup, read-only local preflight, explicit unknown GPS and battery states, and no external/location requests.

**Verification:** 409 Python tests and 113 JavaScript test scripts passed; both JavaScript syntax checks passed. Actual Raspberry Pi hardware, touchscreen rendering and Windows/WSL installation remain operator checks.

## Install on Windows/WSL

Download the whole `OpenRF-v0.2.147.zip` into Downloads. Do not extract it; run the existing updater from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The updater is responsible for backup and managed-source replacement and normally attempts GitHub commit/push; `-NoPush` suppresses the push. Restart OpenRF and refresh the browser afterward. This document does not claim your actual install or remote CI passed.

## Remaining work / next patch

- **Next planned v0.2.148:** improve offline area/route coverage verification, so a selected trip can be checked against local map/routing resources before departure rather than only listing installed packages. Do not present a service health check as proof the chosen route is supported.
- Still needs real field hardware: a battery HAT driver with accurate gauges and safe poweroff, Pi GNSS tests, 7-inch screen/Firefox layout verification, actual moving GPS/backtrack testing, and compatible RF receiver modules. Offline map inventories do not certify coverage or current legal road/trail access.
