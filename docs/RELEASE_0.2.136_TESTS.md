# OpenRF v0.2.136 — walking directions and icons

## Operator verification (WSL / Firefox)

1. Install `OpenRF-v0.2.136.zip` with your existing `Update-OpenRF.ps1`, restart OpenRF and hard-refresh Firefox to pick up the new `route_guidance.js` code. Verify **FIELD CONSOLE · 0.2.136** in the sidebar.
2. Under **Map → Where to?**, check that Drive is a solid side-profile car and Walk is a solid walking person (Font Awesome Free). **Get driving directions** and **Plan walking route** have *no* arrow; **Start navigation** (enabled only for a verified driving route) has the location arrow.
3. Start Docker Desktop, then in Ubuntu/WSL check the local router with `bash tools/setup-valhalla-wsl.sh --doctor` (or **Check local road router** on the map). A running Docker desktop alone does not establish that the `openrf-valhalla` container and pedestrian graph are reachable.
4. Choose **Walk**, set a starting point you know, then pick a nearby destination on an OSM-mapped road/path. Press **Walking directions**. If local Valhalla returns a valid pedestrian route, the dashed walking geometry and an expanded **Walking directions** turn list should appear; no “verified road route required” message. If it cannot find a connection, the direct line is explicitly marked **not walkable**.
5. Repeat with **Drive**. Verified road routes must continue to show turn instructions and guarded **Start navigation**; walking mode must never enable Start or vehicle GPS follow.
6. Switch through **Emergency, Overview, Analysis, Spectrum, Radio Receiver, Messages, Ham Radio, Saved, Sessions and Hardware**. Check that the page title appears only once, with the existing description and actions retained. The clock/calendar must be in the header control row without covering the Linux/offline status badges, Emergency shortcut or Messages button. The clock displays your **device/browser local time**; it does not sync a time source.
7. Check at both ~800×480 touchscreen size and large-sidebar desktop width. Confirm no extra headers or map-startup error, and the bottom-left map legend remains beside map credits.

## Automated coverage and limits

- `node tests/test_walking_route_sheet_v136.js`: regression through the walking route planning and turn-list code, plus driving-only follow guards and button markup.
- `python3 -m unittest tests.test_branding_v107 -q`: the offline SVG is served from a fixed allowlist with correct image MIME type.
- `node tests/test_header_single_title_v136.js`: all non-map pages use their in-page heading and the clock no longer has absolute centering that overlaps status pills.
- Run all Python `unittest discover` tests and `tests/*.js` in a Node loop for broader regression confidence.
- The test walking route is synthetic **test-only** coordinates/turns, not proof of a real path. Actual Valhalla graph coverage, local Docker health, current trail access/closures, GPS accuracy and Raspberry Pi hardware have not been verified here. The operator should test real coordinates and obey posted access rules. Browser screenshot QA may be unavailable in restricted containers and is not implied by static layout assertions.
