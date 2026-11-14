# OpenRF v0.2.61 — route chooser and road preferences

## Changes

- `openrf/static/app.js`, `index.html`, `app.css`: camera-route settings moved inside the existing route-settings gear, removing the overlapping standalone camera-route chip. A small **Choose a route** card now shows a main/alternate option when a distinct Valhalla alternative is returned. The alternative uses a dashed amber line; the selected route stays solid teal. A card or dashed line can be selected; no route switches automatically.
- Route preferences: prefer avoiding highways and tolls, and exclude **specific georeferenced road/gate points** found from actual planned maneuvers or picked on the map. A road name alone does not identify a segment and cannot automatically exclude every street with that name. Exclusions apply to a point snapped by Valhalla to its nearest road, not necessarily the intended gate. Do not assume the graph models every private gate or restriction.
- Road exclusions can be temporary for the current trip or saved using local browser storage (not synced with other browsers/devices). At most eight combined stored/temporary points. Temporary points are cleared after active navigation ends and when a different destination is entered. Saved ones remain until explicitly removed or browser storage is cleared. These points reveal local route preferences and may be sensitive; no upload or Git commit occurs.
- `openrf/routing.py` validates bounded preferences and forwards them to **loopback Valhalla**. Highway/toll avoidance is a **preference, not an absolute ban**; exclusions may make a route impossible. `openrf/camera_routes.py` applies identical road preferences to main and camera-aware alternate requests and caps combined exclusions. `openrf/server.py` accepts `options` only on the existing local routing and camera comparison requests.
- GPS off-route recalculation continues using the selected camera preferences and now also uses saved/temporary road options. No new sensor, map download or live traffic feed.
- Existing v0.2.52 map control layout and bundled offline map bytes are unchanged.

## Test commands from an extracted ZIP

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for f in tests/*.js; do node "$f"; done
node --check openrf/static/app.js
bash -n tools/setup-valhalla-wsl.sh
```

## Stationary/manual test with a running Northern California Valhalla graph

1. Open Map > Where to? > **Route preferences**, or tap the gear icon. Confirm the camera, highway, toll and road/gate options are in one scrolling settings sheet, not a chip overlapping the route header.
2. Check camera preferences (e.g. ALPR) and calculate a local road route known to have saved reports. If Valhalla returns an alternative, check the **Main** and **Alternate** cards and the solid teal / dashed amber road lines. Tap each; only the selected road route should become active. A one-route result must say why no alternative was found.
3. Enter a road name from a planned turn, press **Find in planned turns**, select a matching segment and save it for this trip, then calculate directions again. Alternatively choose **Pick a road spot on map** and tap a known road. Confirm the marked point is approximate and may exclude nearby connected roads. Try highway/toll preferences separately.
4. Save a specific point for future trips on the same browser, refresh, and verify it stays listed. Remove it and refresh again to ensure it is gone. Verify that changing a preference does not silently replace a route that is already active.
5. Navigate only with a passenger operating the controls. Check that off-route recalculation is still gated on reliable GPS and uses stored preferences. Never assume camera data or mapped road access is complete.

## Verification limits

Automated unit, source-contract and isolated Chromium layout checks do not confirm a real local Valhalla alternative was found, that a particular gate exists in OSM, or that any vehicle/GNSS drive or speech playback was tested. A browser may block local storage; in that case, saved points cannot be committed. No real sensor, road or private data was included in this release.
