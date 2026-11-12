# OpenRF v0.2.36 — Route-camera follow testing

## Changes and what is NOT implemented

- **Start navigation** requires a real local Valhalla road route. The initial tilted camera is on the **route start**, visually oriented along road geometry while OpenRF asks for browser/GNSS location. This is NOT a live vehicle position.
- On receiving a fresh approximate desktop fix close to the route (for example ±107 m), the map moves to the **reported** location in a forward-looking, route-aligned view. The camera rotation is **planned road orientation, not the device's actual heading**. The blue dot remains browser-reported; no fictitious GPS fix is generated. The panel says live turn timing is unavailable and keeps the route's planned turn list.
- With reliable speed and moving heading from browser GNSS or gpsd, the camera uses that **measured** heading; estimated route progress and distance to turns require precise recent fixes. An uncertain/off-route location never triggers live turn claims or rerouting. Raster fallback cannot pitch/rotate.
- When the user **drags** the map, camera follow pauses instead of snapping back; tap the right-side **recenter crosshair** to resume following. Stop or leaving Map ends active GPS polling. Existing saved/printable route sheet and all map/observation/sensor controls remain.
- No spoken turn announcements, turn-by-turn road testing, automatic rerouting or nationwide Valhalla road graph. No account, GPS track upload or saved navigation history.

## WSL/Firefox procedure

1. On Windows, put `OpenRF-v0.2.36.zip` in Downloads and run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'` (the updater remains outside project/ and is not bundled).
2. Stop any old Python OpenRF server; from Ubuntu run `cd /mnt/c/projects/OpenRF && python3 -m openrf`, then load `http://127.0.0.1:8765/` in Firefox with Ctrl+Shift+R.
3. Ensure local Valhalla is healthy via `bash tools/setup-valhalla-wsl.sh --status`; use Get directions for a location inside Northern California, then Start navigation.
4. Even on a desktop with ~±107 m browser accuracy, MapLibre should enter a **tilted route-oriented view**, with the blue dot at the *reported* position and a clear caveat saying the angle is based on the planned road. The planned turn list remains available, but **no live turn timing**.
5. Drag the map deliberately: its camera should stop fighting pan and zoom. Tap recenter and verify it resumes at the most recent real position. Without location permission, it may show a **route start preview** that must not look like measured GPS.
6. Stop navigation, change pages, check that GPS polling ceases. Read-only GNSS endpoint is optional and unavailable when no compatible gpsd receiver is connected. The offline MapLibre area still needs the appropriate local map tiles; outside Amador/Calaveras tiles cannot be invented.

## Reproducible checks

- `python3 -m compileall -q openrf`
- `python3 -m unittest discover -s tests -q`
- `node --check openrf/static/app.js && node --check openrf/static/route_guidance.js`
- `node tests/test_follow_camera_v036.js`, plus all JS suites in the Linux CI workflow.
- ZIP root `openrf-bundle.json` must declare version 0.2.36; all installed source files live under `project/`. Do not include private data, Windows updater, .git, credentials or signing keys.
- **Limitations:** no actual desktop Firefox headless screen result, Raspberry Pi GNSS receiver, moving-road GNSS performance, online autocomplete availability or GitHub CI success has been verified with this release.
