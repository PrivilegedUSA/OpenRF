# OpenRF v0.2.137 — live walking follow

## What's changed

- `openrf/static/route_guidance.js`: pedestrian-only map matching and estimated walking maneuver progress. Existing driving route matching still rejects pedestrian plans by default.
- `openrf/static/app.js`: opt-in walking GPS lifecycle with fresh/accuracy/off-route gates, real map follow, stop cleanup and optional existing loopback `gpsd` fallback. Driving GPS mode remains separate.
- `openrf/static/index.html`, `openrf/static/app.css`: **Start walking navigation** below the valid pedestrian turn summary, and an uncluttered walking HUD with touch-friendly Stop button. No new dependency, backend endpoint, data migration or GPS recording.
- `tests/test_walking_follow_v137.js` and updated legacy UI assertions: direct-line protection, first/current/next instructions, accurate/weak/off-route/stale fix behavior, GPS permission only on Start and old callback rejection after Stop.
- Release version, browser asset cache keys and changelog updated to **0.2.137**.

## Install and check in WSL / Firefox

1. Download the complete `OpenRF-v0.2.137.zip` to Windows Downloads and run your existing updater from any PowerShell working directory:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

   Inspect the updater output for its actual result; restart the Linux app and hard-refresh the browser. The sidebar must show **FIELD CONSOLE · 0.2.137**. Do not replace local data or private files manually.

2. In Map → **Where to?**, choose **Walk**, an explicit start and a nearby destination. Use **Walking directions**. With a real local Valhalla pedestrian route, the expanded turn list now includes a separate **Start walking navigation** button. In Drive mode the existing **Start navigation** and car features stay unchanged.
3. Before moving, tap **Start walking navigation**. Observe the explicit browser location request (if available). The HUD should say **Waiting for live walking GPS** until a *real* fix arrives; it must not jump the blue position to the planned route start. Your current reported position should then center the north-up map, subject to reported accuracy. Use a safe stationary test first.
4. Try the real browser/location/GNSS environment with GPS accuracy at or better than ±35 m along a planned pedestrian path. The HUD should show a mapped walking maneuver and approximate remaining distance. Move cautiously and observe the next-turn text update as real fixes progress. A weak fix or position away from the mapped line must pause turn progression. Do not treat a planned trail as evidence of legal public access, passability or safety.
5. Drag the map manually: it should stay where moved. Tap the existing crosshair control to resume live map-follow. Tap **Stop**: the HUD should close, the route remain drawn, and Start walking navigation should be available again. Deny location permission to check that the app displays an unavailable/paused state instead of inventing a position.
6. Choose a location for which the local pedestrian graph cannot return a path. The fallback must say **direct line—not a walkable path**, and there must be **no enabled walking Start**. Recheck map and Emergency and other pages at ~800×480 and wide desktop dimensions for layout regressions.

## Automated tests and boundaries

```bash
cd /mnt/c/projects/OpenRF
PYTHONPATH=tests:. python3 -m unittest discover -s tests -p 'test_*.py' -q
for f in tests/*.js; do node "$f" || break; done
```

In the release workspace, **383 Python tests** and **103 JavaScript test scripts** passed. Pure guidance tests and a mocked browser callback are deterministic; they do **not** prove actual device GPS, Bluetooth, radio hardware, network exposure, Docker/Valhalla health, map-region connectivity, trail access or how browsers behave while locked/suspended. Some browsers require HTTPS or a localhost origin for geolocation. The map must remain an aid, not a safety-critical navigator. Automatic walking reroutes, voice cues and background/off-screen turn alerts are not implemented. The first walking follow session is foreground-only and stores no position history.
