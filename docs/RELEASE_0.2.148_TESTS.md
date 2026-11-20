# OpenRF v0.2.148 — Route Offline Tile Checks and SOS Radio Handoff

## What's in this release

`OpenRF-v0.2.148.zip` is a complete bundle with `openrf-bundle.json` at ZIP root:

```json
{"project":"OpenRF","formatVersion":1,"version":"0.2.148"}
```

All installable source remains under `project/`. The existing updater, private SQLite database, offline map downloads, external Valhalla graphs, credentials, Git history and radio keys stay outside this bundle.

1. **Local route tile sampling:** Once local driving or walking directions exist, expand **Offline tiles along this route** in the directions sheet and click **Check offline map tiles**. The browser submits **13 sampled route coordinates** to the localhost-only API. The backend reads installed vector and offline raster MBTiles at their available zoom and reports how many sampled tiles each **single basemap** includes. The new endpoint is `/api/navigation/route-coverage`, a bounded, read-only local `POST` with *only* `points`. It does not fetch remote map tiles, request current GPS, download coverage, persist a track or upload coordinates.
2. **Honest SOS path:** In **Emergency → SOS & Check-ins**, **Save UNSENT draft** remains local only. **Save & prepare radio send** does the same local save, opens the existing **Radio & Messages → Emergency radio handoff** form, selects the draft and prompts for a specific radio recipient. The operator must still review the message and explicitly confirm a handoff over configured Meshtastic or Reticulum equipment. A radio handoff is not a 911 call, and even a reported routing acknowledgment is *not* proof that a person received or read the message. No automatic retry or broadcast was added.
3. **Remembered map style:** **Map → Layers → Base map** now stores the last selected Default/Satellite/Topographic option in browser-local preferences. After reloading or restarting, that selection is restored; private/blocked storage or unrecognized values fall back to Default. Restored Satellite and Topographic load **online USGS** tiles for the viewed area automatically, so enabling them once opts that browser into future viewed-map-area requests until Default is selected. Manual alternate map source/raster switches save Default. No coordinates or RF history are stored with this preference.

## Manual acceptance checks

1. Run the app at the target **1280×800** layout. Go to Map, plan a local *walking* route and expand directions → **Offline tiles along this route**. Click **Check offline map tiles**. Expect per-map counts out of 13, and explicit gap/coverage caveats. Repeat with driving directions. No permission prompt or external tile request should be caused by this check.
2. With no local map archive at the route, the check should say no installed basemap covers all 13 samples. With a regional vector/raster archive available, the sample count may rise; this is *not* guaranteed to reach 13, nor proof of continuous map coverage. **The local Valhalla service and its actual road/trail graph are a separate prerequisite.**
3. Open Emergency → SOS & Check-ins. Enter sample draft text, optionally attach a *fresh* browser-reported position, and click **Save UNSENT draft**. It should save only, report no transmission, and leave the SOS tab visible.
4. Click **Save & prepare radio send** with another draft. After the explicit local-save confirmation it should switch to **Radio & Messages**, preselect that draft, and focus the radio recipient field. No send or automatic queue action should occur. Without configured radio hardware, the manual send remains unavailable or reports a genuine connectivity failure. **Do not use emergency testing to transmit to unconsenting recipients.**
5. Refresh and revisit existing Emergency drafts/outbox and other pages; data, tab layout, GPS and map side controls should be unchanged.
6. On Map → Layers choose **Satellite**, then reload/restart OpenRF: Satellite should remain selected. Repeat with **Topographic** and **Default**. If internet is unavailable, the remembered online layer may not render; switch to Default or an installed offline raster. Verify the picker remains usable at 1280×800 and in compact drawer mode.

## Tests actually run

From `project/`:

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -p 'test_*.py' -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/app.js
node --check openrf/static/emergency-sos.js
node --check openrf/static/emergency-handoff.js
```

**Result: 413 Python tests passed, 115 JavaScript test scripts passed, and all three JavaScript syntax checks passed.** New tests exercise per-map actual-tile sample counts, positive-but-not-certified coverage, invalid/bounded sample rejection, loopback HTTP restrictions, local-only endpoint behavior, draft-only SOS-to-radio navigation, saved basemap selections, invalid selections and blocked browser storage. The archive manifest/source-root check is performed separately before delivery.

## Boundaries / known limitations

- **Sampled tiles are not full trip coverage.** Thirteen points can miss intermediate gaps; certain raster zoom levels may not be suitable at all zooms. The selected current basemap may differ from the installed map counted. Real road/trail access, route graph stability, terrain clearance, weather, power and GPS fix need independent verification. The check needs an existing *actual local* Valhalla route to be useful.
- **Emergency:** Meshtastic or Reticulum can attempt local addressed handoff only with compatible connected/configured equipment and specific recipients. There is no built-in emergency-services delivery, guarantee of delivery, automatic resend, or substitute for official emergency channels (911 in the US when available).
- Live Raspberry Pi GNSS, moving walking/driving follow, RF devices, actual radio delivery, map boundary field travel, battery HAT telemetry and touchscreen visual rendering have **not** been verified in this environment.
- No SQLite schema migration or additional required Python dependency.

## Install on Windows / WSL

Download the complete `OpenRF-v0.2.148.zip` into Downloads; do not manually extract it. From any PowerShell working directory run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

The existing updater validates, backs up, installs managed paths and normally attempts a GitHub commit/push (`-NoPush` to avoid pushing). Restart OpenRF and reload the browser. This document does **not** claim the updater was run, GitHub CI passed or actual RF/GNSS hardware was exercised.

## Next planned patch

**v0.2.149:** improve selected-route **offline area preparation**: a bounded, explicit workflow for identifying or building missing local raster coverage for a trip, with source/licensing, storage estimates and no silent downloads. Pair this with honest Raspberry Pi 7-inch layout and field-device readiness checks as hardware becomes available.
