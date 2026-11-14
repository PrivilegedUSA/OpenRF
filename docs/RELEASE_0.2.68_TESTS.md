# OpenRF v0.2.68 — Destination selection and stale-route reset

## Changes

- Matched the map-selected destination action card to expanded Directions, Search and Choose a Route panels at 430px maximum, with the same right-side toolbar clearance.
- Centralized clearing of a previous route when a genuinely different destination is chosen: map pick, draggable destination, typed/suggested address and explicit clear preview.
- Cleared the prior route line, directions, route-choice cards, comparison state, camera-count summary, stale preview/export state and per-trip exclusions; persisted avoidance settings and saved exclusions remain intact.
- Added stale asynchronous Valhalla reply guard: if the destination changes before a prior road request completes, the old reply is ignored instead of overwriting the new selection. No server endpoint changed.

## Regression tests run in the build environment

- `python3 -m unittest discover -s tests -p 'test_*.py' -q` — 237 tests passed (ResourceWarnings for database handles occurred in existing fixtures).
- `for f in tests/*.js; do node "$f"; done` — 46 JavaScript test files passed, including `test_destination_reset_v068.js` which evaluates the real reset function and a deferred Valhalla response.
- `node --check openrf/static/app.js` and `python3 -m compileall -q openrf` — passed.
- Isolated Chromium style checks at 800×480, 497×800, 390×844, 480×320 and 1450×900 — selected-destination sheet widths/alignment and toolbar clearance passed. Background map tiles and live navigation were not tested by the isolated check.
- Archive manifest/root layout, all prior source path retention, offline resource hashes, and no bundled private databases/keys — checked as part of packaging.

## After installing — user acceptance test

1. Route from one Northern California place to another so Main and Alternate choices appear.
2. Open Where to? → Choose destination on map; pick a *different* point.
3. Verify old main/alternate route cards, route line, Directions turn list and previous camera counts disappear. The Selected destination card should match the Directions width and leave right-side controls clickable.
4. Tap Get directions and verify only the newly calculated route and its choices appear. Repeat using a typed address or selected saved suggestion.
5. Verify ALPR camera layers and saved avoidance preferences remain unchanged.
6. Try with Docker/Valhalla stopped: old route choices should still clear, while Get directions reports a truthful routing error.

## Limits

- No actual GPS drive, live Valhalla graph, remote geocoder, Raspberry Pi or physical RF receiver was available in this test environment.
- The new route reset does not change camera data, map tile storage, road costing, autonomous rerouting or hardware collection.
