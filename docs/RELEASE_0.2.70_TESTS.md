# OpenRF v0.2.70 — Repeating map destination selection

## Fix

The prior patch tested a second destination but could not establish reliable behavior after a *second Get directions* and a *third* destination pick. The new destination-map interaction starts picking idempotently (repeated starts never turn picking off). Map selection handles pointer release in capture phase before a generated click reaches MapLibre or an old SVG route overlay. Drags do not count as taps, and post-selection clicks cannot leak into observation/route handlers. The normal click listener remains a fallback. Keyboard Escape or opening text search still cancels.

## Changed files

- `openrf/static/app.js` — idempotent map-pick state, shared target filter, capture-phase pointer handling and drag/click-through guard.
- `tests/test_destination_multicycle_v070.js` — four complete destination/route-state cycles, repeated picks, panning, drags, controls and Escape.
- `tests/test_map_destination_pick.js`, `tests/test_destination_repick_v069.js` — updated the existing mocks and the intentional idempotent pick behavior.
- `openrf/__init__.py`, `openrf/static/index.html` — release version and JS cache busting.
- `README.md`, `CHANGELOG.md`, this file — notes and limitations.

## Manual acceptance: test three or more cycles

1. Install the patch, restart OpenRF and hard-refresh the browser (Ctrl+Shift+R). Keep Docker Desktop/Valhalla available.
2. Open **Where to? → Choose destination on map**. Tap a location, then Get directions. Verify a real road route appears.
3. Reopen Where to? and Choose destination on map. Tap another place (including one on the old route), then Get directions again.
4. **Repeat step 3 at least twice more.** The third and fourth map selections must place the new red pin and let Get directions request a new route. Normal panning resumes after each successful pick.
5. If necessary, press Choose destination on map twice during an unfinished pick. It should remain ready for a map tap, not turn off. Use Escape or opening the search form to cancel.
6. Try a drag gesture and the zoom/recenter controls while selection is armed: dragging must not place a destination, and controls must remain clickable.
7. Confirm saved ALPR visibility and saved road avoidances remain unchanged; the previous route lines and comparison cards clear after choosing a new destination.

## Verification and limits

- Python stdlib tests, all in-repository JS tests, JavaScript syntax and shell syntax were run.
- An isolated Chromium **real DOM** interaction test passed four pointer-driven selections across map and overlaid SVG route elements, plus drag and control checks. This does **not** prove behavior in the user's real MapLibre/browser and Valhalla configuration.
- Localhost Chromium-to-server navigation was blocked by the test browser's administrator policy. No real Valhalla graph, actual GPS, Raspberry Pi hardware, or GitHub CI was verified.
- No hardware measurement, new server endpoint, new remote provider, or camera dataset was added.
