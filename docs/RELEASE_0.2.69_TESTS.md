# OpenRF v0.2.69 — Re-entering map destination selection

## Problem

On an existing Valhalla route, **Where to? → Choose destination on map** could fail to place a second pin, leaving the map pannable but not selectable. Road/gate avoidance and destination selection had separate capture listeners; leftover road picking could take the map click first, and a destination handler mounted only on the map canvas could miss route-overlay sibling elements.

## Changed files

- `openrf/static/app.js` — choose-map interaction state, map container capture handling, and mutually exclusive road/destination tap modes.
- `tests/test_map_destination_pick.js` — second destination after route with residual road-pick state and route-overlay tap coverage.
- `tests/test_destination_repick_v069.js` — full repeated-selection and map capture contract checks.
- `openrf/__init__.py`, `openrf/static/index.html` — version and cache-busting.
- `README.md`, `CHANGELOG.md`, this document — description and limitations.

## Manual acceptance after install

1. Start local OpenRF and ensure Valhalla is running. Choose a destination on the map, press Get directions and verify the teal road route and choices appear.
2. Open **Where to? → Choose destination on map** again. Tap a different point on the road/map, including a location near the previously displayed route. Verify a new red destination pin and a new **Get directions** action appear; map panning resumes after placing it.
3. Calculate the new route and confirm old turn instructions and route alternatives are gone.
4. Repeat with a road point selected from the route-avoidance settings before choosing another destination; the unfinished road pick should not take the new destination's map tap.
5. Cancel a pick with Escape or reopen text search; confirm normal panning and that existing saved ALPR map layers/road preferences remain unchanged.
6. Verify map zoom, compass, GPS recenter and right-hand tool controls remain available.

## Limits

- Unit/regression tests use a controlled MapLibre/raster mock for the pointer-to-coordinate conversion; they are **not** a substitute for using your active browser, local Valhalla routing graph and GPS.
- No live RF, actual GPS movement, physical Raspberry Pi or GitHub CI run was verified by this change.
