# OpenRF v0.2.24 test guide

1. On Windows download `OpenRF-v0.2.24.zip` to Downloads. Stop a running OpenRF server with Ctrl+C. Then run:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```
2. Restart in Ubuntu:
   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```
3. Open `http://localhost:8765` and press Ctrl+F5. On Map the map should be immediately under a small destination bar; GPS waypoint and optional offline-map controls should be below the map, not above it.
4. Allow browser location; default navigation origin should populate automatically. Try a saved destination name (after saving one in the expanded trip planner) or `38.48, -120.62` and Preview. Must clearly show a **direct line, not a road route**. Entering an unrecognized street address should show that address lookup is not implemented, not invent a route.
5. Deny browser location; no default starting coordinates should be invented. In Plan a trip, enter a custom starting point for an opt-in direct-line preview; verify no automatic browser GPS history is saved.
6. Verify Plan a trip opens below the map, and picking a destination by tapping the map does not create an RF observation.
7. Open Map +. Use my location should follow Latitude, Longitude, then Accuracy meters. Saving should still require pressing Save locally.
8. Open Offline basemap and Offline map files below the map; validate import and plan controls remain functional. Check ⓘ attribution can still be opened.
9. Verify existing Sessions, Analysis, Hardware and exported records are unchanged. The app does not request external geocoding/routing or require a radio.

Automated: `python3 -m unittest discover -s tests`, then `node tests/test_frontend.js`, `node tests/test_navigation_frontend.js` plus other JavaScript suites in CI.

Real Firefox map display, live sensors, route engine and Raspberry Pi physical hardware have not been verified by automated tests. Road graph preparation and real turn-by-turn remain unimplemented.

6. In both MapLibre and offline raster modes, locate the small crosshair button below zoom/compass. Press it with a recent browser fix, then after more than a minute. The latter must request location again, not reuse an old fix. No waypoint, scan, or route should be saved by the action.
