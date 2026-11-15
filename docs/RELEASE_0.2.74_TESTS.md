# OpenRF v0.2.74 — Clickable map dots and GPS freshness watchdog

## Release scope

- MapLibre circle features with actual click handlers (ALPR/red-light/speed-camera reports, saved survey observations, series, SDR sites and waypoints) show a hand-pointer on hover. Empty map remains draggable; destination/area pick modes retain the crosshair. Raster camera buttons already use a pointer.
- A small indicator on the live GPS navigation card distinguishes waiting, accurate, approximate, lost and DEMO positions. GPS loss is evaluated against the newest *valid source timestamp*, not the arrival of duplicate browser callbacks or gpsd polls.
- Fifteen seconds after the last actual valid fix (or navigation start without one), live turn timing is paused, approach banners and lane indicators are removed, queued voice guidance silenced and planned directions preserved. The map view is not teleported to invented coordinates. A fresh fix resumes the existing quality restrictions and the chip notes initial recovery.
- No new background requests: optional read-only gpsd continues polling only during a user-started live navigation session. Position remains in memory, never written to a survey or sent to a map provider. DEMO playback disables real acquisition and uses its own label.

## Automated checks (from `project/`)

```bash
python3 -m unittest discover -s tests -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/app.js
node --check openrf/static/navigation_health.js
python3 -m compileall -q openrf
bash -n tools/setup-valhalla-wsl.sh
```

The v0.2.74 JavaScript test fakes MapLibre hover events and a stopped GPS callback clock, checks all intended marker layers, overlapping hover transitions, pointer restoration and selector mode guards; it also checks one-shot signal loss, preserved planned turns, DEMO exemption and recovery with an approximate fix. This is deterministic logic testing, not a physical GNSS/MapLibre acceptance test.

## Field checks to perform when hardware is available

1. With an online vector map or installed offline vector tiles, hover a mapped camera and saved survey observation, and verify the hand-pointer plus click popup. Move onto an empty road: the normal pan cursor returns. **Choose destination on map** must still show a crosshair and accept a tap.
2. Start a Valhalla route and real GPS follow. Check the new GPS indicator for reported source accuracy. If the browser gives only an approximate fix, the app must keep live turn timing paused.
3. With the vehicle safely stopped, temporarily disconnect the physical GNSS receiver or revoke geolocation, then wait at least 15 seconds. A GPS-lost warning should replace live turn timing while the same planned directions remain visible. Reconnect/re-authorize and check for recovery and normal accuracy gating.
4. Switch to the explicitly labeled DEMO route, and confirm the indicator says DEMO rather than live positioning. End DEMO to end the session cleanly. Do not treat DEMO as safe driving guidance.

## Limits

User hardware/permissions, browser geolocation delivery, local gpsd availability, real Valhalla routing, audio playback and Raspberry Pi performance could not be verified here. The software cannot guarantee continuous satellite coverage, locate vehicles from coarse desktop IP positions, or substitute for road signs. Do not manipulate the touchscreen while driving.
