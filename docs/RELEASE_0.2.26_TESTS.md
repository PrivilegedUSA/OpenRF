# OpenRF v0.2.26 — Address Lookup and Navigation Entry Fixes

## What changed

- Default basemap returns to the readable Liberty style. Dark style is still available in Map settings.
- Destination entry is full-width, with a paper-plane **Start navigation** button underneath. It requests a route plan; it does **not** start live turn-by-turn navigation.
- Check **Online address suggestions** on the map to authorize external address requests to the public Photon demo when no self-hosted Photon/MapTiler provider has been configured. Consent applies only until this page is reloaded. **No browser latitude/longitude is sent to Photon.** This feature requires internet access, has fair-use limits and is not production-guaranteed.
- Existing local Photon (`OPENRF_PHOTON_PORT`) or opt-in MapTiler (`OPENRF_MAPTILER_KEY`) setups still work. The configured provider takes precedence, and the form label describes the public fallback; check provider documentation before use.
- Address suggestions and geocoding are separate from road routing. A local Valhalla service with preprocessed road graph is still necessary for real road geometry and planned maneuvers. Without it, the app displays a dashed, clearly labeled DIRECT LINE preview, not a drivable route.
- When a recent browser origin fix is unavailable, the Start navigation control asks for a new one-shot browser location. No continuous tracking or automatic recording occurs.
- The UI shows errors and unsupported states clearly. Future driving-alert and camera-aware route preferences are NOT active.

## Manual Firefox checks

1. Stop OpenRF (Ctrl+C), install `OpenRF-v0.2.26.zip` with the usual PowerShell updater and restart the Ubuntu process.
2. Open `http://localhost:8765`; Ctrl+F5. Confirm the map is the earlier lighter Liberty style, not dark.
3. Confirm destination input is the full width, with the paper-plane **Start navigation** button below.
4. Enter `38.48, -120.62` and press Start navigation after allowing browser location. With no Valhalla, a dashed line and a clear road-routing-unavailable message should appear.
5. With online lookup unchecked and no local provider, type a street address. The status must explain how to enable address search rather than silently flickering.
6. Check Online address suggestions; type a specific address in a city. Confirm suggestions appear and are selectable (requires reachable Photon public demo). Press Start navigation; without Valhalla it must still label any preview as direct, not a road route.
7. Turn the online option off, refresh and confirm it stays off. Re-run tests below.

## Automated tests

```bash
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests
node tests/test_frontend.js
node tests/test_navigation_frontend.js
node --check openrf/static/app.js
```

Limitations: real Firefox, actual Photon server and public service reachability, Valhalla/road graph, Raspberry Pi, real road conditions and GPS accuracy have not been field-tested. Server tests use mocked HTTP provider responses. No private data, credentials, or third-party street tiles are included.
