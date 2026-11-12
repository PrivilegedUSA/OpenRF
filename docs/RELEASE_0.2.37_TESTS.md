# OpenRF v0.2.37 — DEMO navigation and planned-turn status

## Summary of functional changes

- First planned maneuver becomes the navigation headline even when a real GPS fix is approximate, with a conspicuous **Planned** prefix and **LIVE timing paused** accuracy statement. The existing stringent live-maneuver quality guard remains in effect.
- **DEMO route playback** only after a real `ROAD_ROUTE` returned from local Valhalla and the user presses **Start navigation**. Open **Test route (DEMO · no GPS)**, press **Play DEMO**, then Pause/Resume or Stop DEMO. Select 1× / 5× / 20× simulation time. A visible orange **DEMO** marker advances along the calculated road line, changing the displayed turn and driving camera. The demo is not a real GNSS fix, a speed-limit estimate, or real-time guidance. It never invents a Valhalla road route. The orange marker is separate from the real browser location dot.
- Play DEMO cancels browser geolocation watching and local gpsd polling. Pause holds simulated coordinates; Stop removes the marker, timer and HUD. Browser/GNSS watches do not restart automatically. No DEMO coordinates are written to SQLite, RF observations, waypoint sessions, exports or HTTP logs. Stop/leave Map also cleans up.
- Camera during DEMO: MapLibre 55° tilt, ~16.8 zoom, route heading, bottom-of-map device placement. Raster fallback can only recenter in 2D. Dragging pauses auto follow; the recenter crosshair resumes. No physical GNSS receiver has been verified.

## Windows/WSL installation

1. Stop any running OpenRF Python server with Ctrl+C; leave installed Valhalla Docker container running.
2. Download `OpenRF-v0.2.37.zip` to Downloads. From **Windows PowerShell** run:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`

3. From **Ubuntu WSL** run `cd /mnt/c/projects/OpenRF && python3 -m openrf`; open `http://127.0.0.1:8765/` in Firefox and press Ctrl+Shift+R.
4. Run `bash tools/setup-valhalla-wsl.sh --status` to verify the existing local routing service. Use **Get directions** to calculate a road route inside its Northern California coverage, then **Start navigation**.
5. The initial planned route maneuver should be the main banner even with desktop location ±100 m; this **does not** promote coarse position to live turn timing.
6. Expand **Test route (DEMO · no GPS)**. Select 5× and press **Play DEMO**. Verify orange DEMO pin moves, a teal planned route remains, the driving camera faces forward down the route, and turns change. Use Pause, Resume, Stop DEMO. After stopping, start a new navigation session to reactivate real GPS if desired.
7. Drag map and use recenter to pause/resume camera updates. Verify saved observations, offline map, map settings, Layers, printable route HTML and export still work. Do not test while actually driving.

## Reproducible tests

- `python3 -m compileall -q openrf`
- `python3 -m unittest discover -s tests -q`
- `node --check openrf/static/app.js && node --check openrf/static/route_guidance.js`
- `for test_file in tests/*.js; do node "$test_file"; done`
- `node tests/test_navigation_demo_v037.js` verifies interpolation, directional camera, next-turn progression, cancellation of real GPS watch / GNSS polling, pause/resume, marker removal and cleanup without modifying the browser fix.

## Scope and limitations

- DEMO positions are generated exclusively on the user's device after an explicit click; they are not actual GPS/RF readings and never appear as live data. The simulation runs on a virtual 35 mph × speed-multiplier schedule, not legal speed limits, traffic or accurate ETA.
- Browser geolocation with ±100 m accuracy is insufficient to know current lane or issue safe turn-now prompts; no exception has been made to live-guidance safety rules.
- Live GPS-follow, real time maneuvers, and directions are beta; spoken instructions, automatic rerouting, nationwide Valhalla routing, real road safety checks, actual Firefox touchscreen and Raspberry Pi GNSS field measurements are not verified here.
- Map glyph and vector resources, third-party credits and regional offline coverage are unchanged. The old Android code is retained for reference; this remains a Linux release.
- We have not confirmed GitHub CI succeeds: a previously observed intermittent USB serial API test failure may recur on GitHub runners despite local test success.
- All installable code resides in `project/`; ZIP root `openrf-bundle.json` declares `0.2.37`. Windows updater, `.git` and private files are excluded.
