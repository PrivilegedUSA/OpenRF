# OpenRF v0.2.58 — testing and operational limitations

## Local tests

Run from `project/` after extracting the complete release ZIP:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
node --check openrf/static/route_guidance.js
for f in tests/*.js; do node "$f"; done
bash -n tools/setup-valhalla-wsl.sh
```

## Interactive checks in WSL (do not test while driving)

1. Run Docker Desktop with Ubuntu WSL integration. `wsl -d Ubuntu -- bash -lc "cd /mnt/c/projects/OpenRF && python3 -m openrf"`. Confirm startup prints an existing Valhalla container restart/running status. Do not build more road data for this test.
2. Run `wsl -d Ubuntu -- bash -lc "cd /mnt/c/projects/OpenRF && bash tools/setup-valhalla-wsl.sh --doctor"`; check the local Sacramento-to-Auburn reference route succeeds.
3. Plan a local route. Expand `Directions` on the map. Check source-labeled camera count, with a clear missing-data warning. Try each camera category. Compare a route; ensure it changes only after pressing `Use alternative` and confirming. If no cameras are mapped, show a no-comparison explanation.
4. Use manual fixed positions or a controlled browser/GNSS fixture to verify repeated accurate off-route moving fixes produce a recalculation attempt, whereas stale/uncertain fixes and stopped navigation do not. Do **not** use DEMO movement as live GPS evidence. Observe route remains intact if Valhalla is unavailable.
5. Check that neither camera comparisons nor GPS following create investigation observations or persistent travel traces. Camera catalog snapshots should remain in local state after updating.
6. Confirm map toolbar and popup layout at 800×480; verify offline basemap still loads and other pages work.

## Limitations

- Road routing depends on the **existing, accessible** local Valhalla HTTP service at 127.0.0.1:8002, Docker Desktop startup, and a built routing graph. This patch only restarts an existing container; it cannot turn Docker Desktop on automatically or guarantee it will survive every restart.
- Camera avoidance is approximate: `exclude_locations` removes nearby road edges, not an exact camera field of view. A reported point is not proven to be a working camera; sources may be incomplete, stale or imprecise. Zero matched pins never guarantees camera-free travel.
- GPS accuracy, heading and fix freshness vary by device. No lane instructions, live traffic, spoken prompts, real-time camera operation, or tested hardware are included. Prioritize road laws and driving safety.
- Synthetic fixtures and local tests are not a verified physical Raspberry Pi/GNSS or real driving test. No external ALPR feed, Docker daemon, GitHub CI run, or network API test was performed during packaging.
