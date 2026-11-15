# OpenRF v0.2.71 — Route chooser to new destination

## Changed files

- `openrf/static/app.js` — route-card/search/pick transitions, no-alternate rendering guard, stale address suggestion invalidation.
- `openrf/static/app.css` — no route-review hit targets during map-destination selection.
- `tests/test_destination_route_card_transition_v071.js` — four complete no-manual-X cycles, single-route and cancelled-search cases.
- `tests/test_destination_multicycle_v070.js` — keep earlier repeated-pick mocks compatible with the new cleanup.
- `openrf/__init__.py`, `openrf/static/index.html`, version-sensitive tests, `README.md`, `CHANGELOG.md`, this note, and ZIP-root `openrf-bundle.json` — release metadata and guidance.

## Interactive acceptance on your computer

1. Stop the running OpenRF server (Ctrl+C), install the ZIP with the reserved PowerShell updater, start OpenRF and hard refresh the browser (Ctrl+Shift+R).
2. Ensure your existing local Valhalla service is available. Choose a map destination and Get directions. If reported camera preferences are enabled, let comparison finish so **Choose a route** appears.
3. **Do not click the X on Choose a route.** Click **Where to?**, then **Choose destination on map**. The old route cards and Directions must leave the map; tap an ordinary map point and verify it becomes the new destination.
4. Get directions for that new point, then repeat Step 3 at least three more times, including a tap where an old route card or line had been. Each tap must work without manually closing the old chooser.
5. Open and then close Where to? without selecting a new destination: the unchanged old route and chooser should return. When map selection is active, a second press of Choose destination must not toggle selection off; Escape cancels.
6. Disable all camera avoidance switches, or pick a route with no reported cameras: the single Main route card must render without blank content or a JavaScript error. On a route where an actual alternate exists, both colored lines and the choice controls must remain usable.
7. Confirm drag-to-pan returns after successful selection, gestures do not unintentionally select a destination, right-hand map tools work, saved avoidance preferences and map layers remain unchanged.

## Automated checks and limitations

Run from `project/` in WSL:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
for f in tests/*.js; do node "$f" || exit 1; done
bash -n tools/setup-valhalla-wsl.sh
```

JavaScript regression tests exercise the route chooser and map input event state using isolated DOM mocks; they do not by themselves prove the user-installed browser, actual MapLibre hit testing or local Valhalla graph. This update does not add a new camera dataset, external geocoder, GPS logging, live traffic, radio hardware integration or automatic network traffic. Real driving, Raspberry Pi and GitHub CI remain unverified. Do not operate the touchscreen while driving.
