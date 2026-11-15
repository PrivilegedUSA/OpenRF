# OpenRF v0.2.72 — Route preservation and coordinate-search regression

## Changes

1. Where to? opening and address drafts leave the previously calculated road route intact. Only selecting an actual replacement destination or committing Get directions discards the old route. Starting Choose destination on map hides the chooser but leaves the road line for orientation; Escape cancels without losing the route. A tap replaces it, including during third and later cycles.
2. A single drivable route is automatically the selected route. The Choose a route panel is shown only when an alternate drivable route actually exists.
3. Numeric latitude/longitude pairs entered or re-focused in the destination search stay local. They are never forwarded as address-autocomplete requests to MapTiler or Photon.

## Tests

From the `project/` source folder:

```bash
python3 -m unittest discover -s tests -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/app.js
python3 -m compileall -q openrf
```

Manually in WSL with local Valhalla ready:

1. Obtain a road route. Open Where to? and close it without changing anything. Confirm the original line, directions and two-route comparison (if present) return.
2. Open Where to?, choose a map destination, then press Escape without placing a point. Confirm original route and turn list remain.
3. Repeat choosing a new destination on the map four times. Confirm each chosen map tap replaces the old route and Get directions still accepts subsequent taps without closing any chooser manually.
4. Reopen Where to? when the input contains a numeric latitude/longitude pair. Confirm no MapTiler HTTP 400 appears, then press Get directions to route to those coordinates.
5. Check a route with no viable camera-aware alternative. Confirm Directions display automatically and Choose a route does not appear; check a real two-route result still permits route selection.

## Limits

Automated frontend tests simulate DOM interactions and do not establish actual browser rendering, network provider availability, a local Valhalla road graph, current GPS accuracy, Raspberry Pi hardware, or RF receiver functionality. No live traffic integration or mesh radio messaging was added by this patch.
