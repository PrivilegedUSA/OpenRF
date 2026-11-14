# OpenRF v0.2.63 — release and test notes

## Scope
- Place route-choice cards below the Directions heading and hide them whenever the Directions list expands, preserving selection behavior.
- Present all five common route-avoidance categories in one plain list. Leave specific-road exclusions under the collapsed advanced section.
- Remove repeated `Leg 1` labels from printed, planned, and following turn lists.
- Reject malformed road-exclusion results whose last maneuver is more than 150 meters short of the reported route geometry endpoint. Preserve the old planned route and directions if an exclusion-specific recalculation fails.

## Checks
- `python3 -m unittest discover -s tests -q` — 237 tests passed.
- `for f in tests/*.js; do node "$f" || exit 1; done` — 41 files passed.
- `python3 -m compileall -q openrf` and `node --check openrf/static/app.js` and `node --check openrf/static/route_guidance.js` — passed.
- Isolated Chromium layout checks at 800×480, 390×844, 480×320, and 1450×900; full Directions panel and Choice controls do not overlap in simulated layout. This is not a connected map-server end-to-end navigation test.
- New tests: `test_route_completion_v063.py` and `test_route_completion_v063.js` for abbreviated road-exclusion response rejection, route preservation logic, formatting and settings layout.

## Install and field test
1. Stop OpenRF in WSL with Ctrl+C; download the full ZIP to Windows Downloads.
2. From Windows PowerShell: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
3. In Ubuntu (WSL): `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
4. Test a short route with Valhalla running, inspect route alternatives and all maneuvers through destination, then add one temporary road exclusion and recalculate. If an incomplete response is returned, the old route should remain and a clearly worded error should appear.
5. Remove a temporary/saved exclusion through Route preferences and recalculate to verify recovery.

## Unverified limitations
- No access to the user's live Valhalla graph, Docker instance, GNSS, Raspberry Pi touchscreen or GitHub CI. A recalculated route with fewer turns can be legitimate if it still reaches the destination. One-point avoidance cannot guarantee avoiding an entire named road, gate or a camera. Driving signage and legal road access take priority.
- The end-of-maneuver check catches an incomplete tail, not inaccurate individual intermediate turn names.
- Existing offline map, camera database and local private data have not been modified by the bundle.
