# OpenRF v0.2.51 — Overlay / destination patch tests

## Installed change summary

- Floating map icon rail (Trip, Settings, GPS-linked surveys, Offline maps) replaces below-map **Tools ↓** scrolling. Existing HTML controls are moved **within the live DOM**, not duplicated. On-screen panel width/height constrained for a 5-inch 800×480 landscape view.
- Map-picked destination stays actionable when the search collapses. **Get directions** submits the same quick Valhalla route flow; **Start navigation** is only exposed when the original road-route permission gate is true. Merely tapping a map point stores no observation, RF reading, or GPS history.
- MapTiler HTTP 400, 403, 429 and other errors have distinct, non-secret messages. Their causes are provider-defined; no provider credentials or requests were tested against MapTiler's live service.

## Local verification commands (WSL / Ubuntu)

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for t in tests/*.js; do node "$t"; done
node --check openrf/static/app.js
bash -n run-openrf.sh tools/setup-valhalla-wsl.sh
```

## Manual acceptance checks

1. At 800×480 open Map. Look for a compact search upper left, hamburger upper right (when narrow), four small SVG icons on the left and the existing `+` / layers controls lower right. There should be **no Tools down-arrow** and no scroll-to-bottom requirement.
2. Open Trip, Map Settings, GPS, and Offline in turn. Inspect that each panel scrolls internally. Switch between panels and verify no new GPS permission prompts, RF scans or downloads occur. Press Escape and X. The Map settings panel's **Address search setup** button should open the existing gear's private provider configuration.
3. From Where to?, select **Choose destination on map**; search collapses. Tap a map point and verify that **Get directions** and **Change pin** appear without reopening Where to?. Click Get directions. If Valhalla is absent, a direct-line geographic reference may be shown, but **Start navigation must remain unavailable**. If local Valhalla is installed, verify only a proper road route enables Start navigation. Dragging the point must invalidate an old road plan.
4. With online U.S. search enabled, verify typing and saved-place choices remain usable. MapTiler requests are opt-in and may leave the device; credentials are stored in private WSL config. For a 400, shorten query and retry; for 401/403 review key; for 429 check rate/quota. If online lookup fails, select a point on the map. Never paste API keys into issue reports.
5. In Offline maps, start 2-corner region selection; the overlay must close so both corners can be picked. Once selected, the offline panel reopens to edit/save bounds. Imported local MBTiles remain user-controlled.
6. Confirm offline basemap tiles, map attribution, logged-in local data, Spectrum recordings, session tools and manual observation workflows are unchanged. Actual MapLibre and geocoding behavior must be tested by the user on WSL; field GNSS and Pi hardware remain untested.

## Test scope / known limits

- Python unit/HTTP suite, JavaScript source/logic suite, Python compilation, JavaScript syntax and Bash syntax checks run in the build environment. Tests include mocked MapTiler failures, no actual upstream service access.
- The Chromium smoke test loads the real HTML/CSS and map-control JavaScript **in isolation**, with a clearly synthetic placeholder background, at 800×480, 390×844 and 1450×900. It verifies overlay click/close, no page scrolling, destination action and form submission, and viewport constraints. Browser requests to the local HTTP server were blocked by the sandbox, so full map tile and live routing interaction could not be verified in Chromium here. Local HTTP routes are independently exercised by Python tests.
- No Raspberry Pi, GPS, SDR, actual RF observation, or GitHub CI results verified. No changes to the private data directory, updater or Git state performed on the user's PC.
