# OpenRF v0.2.60 — camera-aware navigation integration

## Source and migration

Full release updates the complete managed source under `project/` with a ZIP-root manifest for version `0.2.60`. There are no database schema changes. The update must not replace `.git/`, `.openrf-state/`, `local-data/`, credentials, personal captures or the separately built Valhalla graph. Camera preferences are **session-only**, not persisted and do not enable automatic camera scanning or location uploads.

## What changed

- `openrf/static/index.html`: remove camera route options from inside the hidden Directions accordion, add a floating route-options chip and dedicated panel, destination-entry and map-picked buttons, and a live-navigation entry point.
- `openrf/static/app.js`: opt-in camera preference state, bounded comparison request management and stale-result protection, explicit alternate selection, conservative reroute preference propagation, route-preview transition and overlay close behavior.
- `openrf/static/app.css`: map-first, dark-teal, scrollable camera route overlay for 800×480, 390×844 and short landscape sizes.
- `openrf/__init__.py`, `openrf/static/index.html`, `README.md`, `CHANGELOG.md`, version-aware test fixtures, this document and `openrf-bundle.json`: release/version updates.
- `tests/test_navigation_camera_integrated_v060.js`: verify that camera controls are in the destination/navigation flow, not buried inside Directions, and that opt-in/explicit selection constraints remain.

## Local verification

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
for f in tests/*.js; do node "$f"; done
bash -n tools/setup-valhalla-wsl.sh
```

A local HTTP health check can confirm the new version. Browser layout tests are isolated CSS/HTML smoke tests; browser access to `localhost` is restricted in the build environment, so full click-through and local Valhalla integration must be checked on the user's machine.

## Stationary/manual checks (not while driving)

1. Start the existing Northern California Valhalla container with `--start` and verify `--doctor` before planning any route. Do not download a nationwide graph for this test.
2. On Map, expand **Where to?**, open **Camera route preferences**, check the opt-in and desired categories; close it. Get directions to a reachable destination.
3. The **Camera routes** overlay should appear, compare reported cameras using locally saved records, and show normal vs alternative time/distance and camera counts when possible. The original route remains in place unless **Use alternative** is explicitly selected. Missing records or Valhalla exclusions should leave the original road route intact.
4. Verify the map-picked Destination card disappears after a road route is calculated. Confirm the route chip can reopen camera options independently of the Directions turn list.
5. Start navigation, open **Camera routes** from the GPS follow HUD and change the categories. No unexpected live route changes. A manual alternative cannot be chosen while active navigation is running. Carefully test accurate off-route fixes only with controlled GPS fixtures or by a passenger; inaccurate/stale or DEMO locations must not trigger real rerouting.
6. Validate camera classes are not mistaken for verified active enforcement devices; compare two routes with different report counts. Look for road distance/time tradeoffs and the warning that data may be incomplete.
7. Confirm OpenRF's v0.2.52 map layout, offline vector resources, survey, SDR, BLE, CHIRP, and radio workspaces remain intact.

## Limits

Camera-aware alternatives use local, source-labeled reported infrastructure positions and approximate Valhalla road exclusions. A reduction in nearby mapped reports is not proof that cameras are absent or inactive. No live road incident/traffic provider is connected, and no vehicle/GNSS live drive was verified. Intermediate-stop routes still require manual replanning if off-route. Do not operate the display while driving. No new required dependencies, external API calls, background tracking, or private data are included in the release.
