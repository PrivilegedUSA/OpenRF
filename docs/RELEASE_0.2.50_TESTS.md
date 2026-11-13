# OpenRF v0.2.50 — map-first field usability

## Changes

| Area | Result |
| --- | --- |
| Map view | 100dvh height in normal mode, no Focus Map toggle |
| Search | single existing route form hidden before JS loads; compact, floating Where to? opens/collapses it |
| Menu | floating right-hand hamburger on ≤900 CSS-pixel / coarse-touch layouts; persistent sidebar on desktop |
| Tools | bottom-map button scrolls to existing detailed trip planning / offline maps / survey managers, without losing them |
| Map controls | map attribution, layers, add marker, navigation HUD and optional vector/raster controls remain accessible |
| Navigation | unchanged existing routing API, map pin, explicit guidance lifecycle, no new automatic location requests |

## Run tests after extraction (Ubuntu/WSL)

```bash
cd /mnt/c/projects/OpenRF
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
for t in tests/*.js; do node "$t"; done
node --check openrf/static/app.js
bash -n run-openrf.sh tools/setup-valhalla-wsl.sh
```

## UI manual check

1. At approximately **800×480**, open Map. Verify the basemap is full-height, the hamburger floats upper-right, and **Where to?** is a single compact bar upper-left. There is no separate Focus Map button.
2. Tap Where to?, enter a destination, and close it; reopen to confirm input text remains. Escape should collapse unless destination pin selection is currently active. None of these controls should start a scan or destination lookup by themselves.
3. Try a local saved destination / authorized online address search, a route, then optional navigation. Route and follow settings must be unchanged. Guidance hides the large search panel and the Tools shortcut.
4. Tap **Tools** near the map bottom to scroll to detailed trip, map settings, survey points, and **Offline maps** below the map. Check switching pages returns to compact search.
5. Verify manual add marker, Layers and Scan panel, attribution/license disclosure and vector/raster switch on 800×480, 390×844 and desktop. Check a keyboard-only flow: hamburger, search open, Escape, Tools.

## Verification and limitations

- 187 Python tests and the complete JavaScript test suite pass in the build environment; see the version's release notes for any updated final run counts.
- Isolated Chromium **HTML/CSS + extracted actual search-control JavaScript** passed at 800×480, 390×844 and 1450×900. Test verified layout dimensions, non-overlap, toggle state, retained input, Escape, and scrolling to map tools. The map body used an obvious placeholder fill; **no real tiles, GNSS, RF hardware or actual backend Javascript MapLibre integration was exercised in that isolated browser run**.
- Browser direct HTTP access to localhost is restricted in the build environment; Python HTTP route tests execute separately. Physical 5-inch Pi touchscreen, outdoor driving, USB adapters, live SDR and GitHub CI have not been verified.
