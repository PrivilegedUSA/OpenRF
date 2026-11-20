# OpenRF v0.2.154 — Raster pan continuity and honest map location

The complete source ZIP has ZIP-root `openrf-bundle.json` followed by `project/`:

```json
{"project":"OpenRF","formatVersion":1,"version":"0.2.154"}
```

## What changed

- `openrf/static/app.js` — repeated horizontal world tiles have independent DOM keys with wrapped XYZ requests; camera movement is clamped at north/south bounds; fallback source card hides only after a tile has loaded. Manual recenter reports actual results as visible transient feedback and optionally performs one fresh local GNSS check (directly in native Electron with no browser provider, or after a failed browser request).
- `tools/openrf-electron/preload.js` — exposes only whether a geolocation provider key is configured, never the credential itself, so native OpenRF can avoid a misleading browser timeout.
- `openrf/static/index.html`, `openrf/static/app.css` — small map-location feedback overlay and updated cache tags.
- `openrf/server.py` — the existing loopback-only local GNSS endpoint now accepts an explicit `map-recenter` consent header in addition to `navigation-follow`. No service runs on its own and the endpoint never saves coordinates.
- `tests/test_raster_pan_location_v154.js`, `tests/test_local_gnss.py` — independent repeat-tile/polar clamp verification, explicit source notice behavior, stale/accuracy protection and server permission checks. Other release/version tests were updated.
- Native shell version check, package manifest and docs updated. No required package or database schema change.

## Install & launch

Download `OpenRF-v0.2.154.zip` into Windows Downloads and close your old Electron/terminal backend. From PowerShell (any directory):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Then, in Ubuntu WSL:

```bash
cd /mnt/c/projects/OpenRF/tools/openrf-electron
OPENRF_URL=http://127.0.0.1:8765/ npm start
```

Or, to use **only the web application** without Electron, start the Python backend from `C:\projects\OpenRF` as usual and visit `http://127.0.0.1:8765/` in Firefox. The updater's GitHub push starts CI but does not prove tests or installation succeeded.

## Manual checks on user's 1280×800 WSLg window

1. Open Map with WebGL unavailable and select **Topo · online**. After tiles load, the fallback selection card should go away. The Layers button can still change source.
2. Drag across the map horizontally, even at the initial whole-world zoom. The map should pan continuously, repeating wrapped world tiles instead of showing blank grid. Drag vertically toward the poles; avoid scrollable dark gaps beyond geographic coverage. Zoom to street scale and pan again.
3. Tap the recenter crosshair. A temporary status message appears on the map while a real position is requested. If Electron cannot geolocate and no local `gpsd` receiver is available, the message must say so. No simulated position should appear. Repeat with the ordinary Firefox `localhost:8765` application; browser/OS location permission may work there.
4. If a local GNSS receiver is actually connected and `gpsd` reports a fresh 2D/3D fix with horizontal accuracy, the same explicit recenter action may use it; stale/no-accuracy fixes must not move the map. The GNSS server endpoint without a consent header remains forbidden.
5. Confirm the one-line sidebar labels, offline raster pack choices, browser tabs, SOS/radio page and small-device layout still work.

## Limits and next step

Tests run in the source environment. Neither the user's WSLg renderer/USGS connection nor physical Raspberry Pi GPU, GPIO, battery, touchscreen or GNSS devices can be verified here. Electron does not include a free geolocation service: its Chromium browser API needs a separately configured location provider; **no API key or billing integration** was introduced. A `gpsd` read merely asks a connected local receiver—it cannot invent coordinates on a PC without one.

Suggested next patch after WSL confirmation: validate Pi kiosk/WebGL hardware, USB GNSS integration and actual x64/ARM64 Debian installation dependencies.
