# OpenRF v0.2.66 — Navigation sheet alignment and pinned export actions

## Changed files

- `openrf/static/app.css`: align expanded destination search and route choices with Directions; retain the narrower, collapsed Where-to bar and free right-side toolbar. Make the Directions summary and export row sticky inside the sole scroll container.
- `openrf/static/index.html`: place Print / Save HTML / Save JSON between the Directions summary and scrollable turn content. Bump the frontend cache-busting version.
- `openrf/static/app.js`: measure the Directions summary height to position the sticky export row correctly when the summary wraps.
- `openrf/__init__.py`, `README.md`, `CHANGELOG.md`, test version fixtures, and new `tests/test_navigation_sheets_v066.js`.

## Regression checks

1. Run `python3 -m unittest discover -s tests -q` and `for f in tests/*.js; do node "$f" || exit; done`.
2. Check Python compilation, JavaScript parsing and the optional Valhalla shell script syntax.
3. Using isolated Chromium markup with the real app CSS, compare expanded search, route choices and Directions sheet widths/left edges at 800×480, 497×800, 390×844, 480×320 and desktop. Confirm the right-hand toolbar remains accessible.
4. Scroll a long test turn list and verify the Directions summary and Print / Save HTML / Save JSON stay at the same screen position and that there is only one scroll container.
5. Extract the final complete ZIP and rerun Python/JS suites, compare release paths and SHA-256 hashes of bundled offline resources against v0.2.65.

## Manual WSL verification

- On Map, expand Where to? and confirm it aligns with Directions; calculate a route and confirm Choose a Route aligns too, while the right map controls remain clickable.
- Expand Directions with a long route. Scroll to later turns: the summary and Print/Save buttons should remain visible, without a second internal scrollbar. Use the existing Print/Save actions and check the outputs remain correct.
- Confirm the compact collapsed search and route-choice selection keep their prior behavior. No change to route calculations, saved preferences, or private data is expected.

## Limitations

The browser smoke uses isolated local HTML/CSS rather than a running Valhalla server; physical Raspberry Pi touch behavior, live GPS routing and route-sheet printing on the user's PC remain unverified. No external data source, sensor, routing graph or personal data is included in this release.
