# OpenRF v0.2.34 — road directions and GPS follow

## Implemented

- **Get directions** requests a drivable road plan from a configured, **local** Valhalla instance. The map then shows a **Directions** disclosure with numbered maneuver instructions and per-step distance. It can be reviewed with or without GNSS or internet after the route is calculated, until the page is refreshed.
- **Print** opens a print-friendly local page, **Save HTML** downloads a standalone, offline-readable route sheet with instructions (no route geometry), and **Save JSON** requires confirmation because it exports full route geometry and coordinate endpoints.
- **Start navigation** is enabled only after a real Valhalla route. It hides destination-search clutter, requests browser-reported positions on demand, and follows a fresh, accurate fix. Moving heading comes from `GeolocationCoordinates.heading` when there is reported speed, or from two separated accurate moving fixes; otherwise navigation remains north-up rather than inventing heading. Route-segment distance is used to show upcoming maneuver distances.
- Coarse positions (such as ±107 m from desktop Firefox) show the approximate position at a broader zoom **without giving unreliable road-level turn guidance**. Stale positions and off-route fixes are flagged; no automatic reroute or recorded location history.
- Settings gear moved next to the Add Observation and Layers map controls and styled to the same compact size; info/attribution remains bottom-left.

## Manual checks (WSL Firefox)

1. Run `cd /mnt/c/projects/OpenRF && bash tools/setup-valhalla-wsl.sh --status` in Ubuntu. Confirm local routing is reachable. Start OpenRF `cd /mnt/c/projects/OpenRF && python3 -m openrf` (port 8765).
2. Open `http://127.0.0.1:8765/` and hard refresh. Confirm **gear / + / Layers** controls at lower-right and attribution button bottom-left.
3. Select a valid local destination and **Get directions**. A collapsed **Directions** control should appear on the map. Expand: numbered maneuvers with miles per step and total route distance/time.
4. **Save HTML**; open the downloaded file *with Wi-Fi off* and ensure the written directions are available. Print or save to PDF via Firefox Print. **Save JSON** must require a sensitive-coordinates confirmation.
5. Press **Start navigation**. The destination-search panel should hide; a turn-status HUD with Stop remains. On desktop Firefox at ±107 m, look for an **approximate** message, a broad north-up map, and *no invented turn timing*. You can test GPS-follow mathematically with `node tests/test_route_guidance.js` but do **not** simulate a live GPS fix in the production interface.
6. Stop the follow mode. Destination controls return. Drag the destination pin, request fresh directions, and check exports now show the changed road plan.

## Pi/GNSS limitation

Raspberry Pi OS plus a USB GNSS receiver does **not automatically expose** that receiver through Firefox's `navigator.geolocation`. A suitable driver/bridge is still required, along with measurements of fix accuracy, age, refresh, course, and device heading while moving. v0.2.34 is **GPS-follow beta**, not production-quality spoken, automatic-rerouting or lane-guidance navigation. Never operate touch controls while driving; inspect route output against signage and road conditions. Offline routing coverage is limited by installed Valhalla road graphs, while rendering coverage is limited by installed offline map tiles.

## Tests / preservation

Runs Python stdlib API tests, JS pure route-follow and frontend checks, release manifest validation. Existing SQLite observations, RF sensor features, map data attribution, styles, survey captures, destinations, original Android archive and private paths are preserved. No new dependencies or database migrations. Live vehicle GNSS, Raspberry Pi, Bluetooth/USB RF and actual browser rendering are **not verified** by CI.
