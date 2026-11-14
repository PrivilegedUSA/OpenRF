# OpenRF v0.2.67 — Search and route overlay cleanup

## Changed managed files

- `openrf/static/app.js`: collapse search only after a confirmed road route; isolate destination editing from route review; recompute route-choice position after layout changes.
- `openrf/static/app.css`: prevent Directions and Choose a Route from overlapping expanded search while preserving route state.
- `openrf/static/index.html`, `openrf/__init__.py`, `README.md`, `CHANGELOG.md`, current-version test fixtures.
- `tests/test_navigation_panel_flow_v067.js`: regression assertions for success/error state and overlay visibility.

## Automated validation

1. Python unit suite: `python3 -m unittest discover -s tests -q`.
2. JavaScript suite: `for f in tests/*.js; do node "$f" || exit 1; done`.
3. Syntax checks for Python, JS and Valhalla helper shell script.
4. Isolated Chromium layout/transition smoke at 800×480 and phone/desktop sizes, checking top positions across expand, successful collapse, and manual close.
5. Re-extract the delivered ZIP, rerun suites, compare release paths and hashes of bundled offline resources against v0.2.66.

## Manual WSL verification

- Enter a destination and choose Get directions. After a **successful Valhalla road route**, search should collapse to Where to? and Directions/Choose a Route should sit just below it with no overlap. Compare both routes.
- Re-open Where to?; route sheets should temporarily hide. Close search; route sheets must return to their compact positions without empty gaps. Repeat several times.
- Enter an invalid/unavailable destination: error remains visible and search stays open for correction. Expand Directions and verify sticky Print/Save row and single scroll area; map buttons remain clickable.
- Route alternatives may finish asynchronously. Confirm the late comparison doesn't reopen the search or leave the choices at the expanded-search position.

## Limits

Visual interaction uses a local isolated DOM+CSS/JS harness, not a physical touchscreen. Real Valhalla routing, GNSS driving, Docker restart behavior and GitHub CI are not verified in this release. No maps, private cameras, sessions, or routing data are included beyond prior release resources.
