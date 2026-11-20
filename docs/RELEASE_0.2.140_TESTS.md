# OpenRF v0.2.140 — Emergency tabs + live reverse breadcrumb follow

The complete update bundle has ZIP-root `openrf-bundle.json` with `{"project":"OpenRF","formatVersion":1,"version":"0.2.140"}`; all installable source is beneath `project/`. No Windows updater, local data, personal positions, credentials, signing keys or Git metadata are packaged.

## Changed files

- `openrf/static/index.html`: accessible five-tab Emergency switcher, optional backtrack HUD, GPS saved-track instructions and fresh asset cache versions.
- `openrf/static/emergency-tabs.js` **new**: groups the existing emergency panels without cloning/migrating their forms or persisted records. Keyboard Left/Right/Home/End tabs, aria-selected, dashboard first, direct action shortcuts, and tabs that remain usable on 1280×800 and narrow layouts.
- `openrf/static/app.css`: compact sticky Emergency tabs, responsive horizontal tab list, dashboard shortcuts, and visual backtrack HUD with clear inaccurate/off-track state. Preserves map toolbar visibility fixes from v0.2.139.
- `openrf/static/breadcrumb_follow.js` **new**: pure local approximate distance-to-saved-track geometry, quality and stale-fix gating. Never interprets stored points as verified roads or trails.
- `openrf/static/field-breadcrumbs.js`: explicit **Follow reverse track (GPS)** control for saved Walking/Driving tracks, map blue marker, limited accuracy/off-track and distance-to-original-start reports; Stop/pagehide/visibility/leave-Map lifecycle. No additional GPS history saved; no backend change.
- `openrf/static/app.js`: cancels live breadcrumb follow if route navigation starts and prepares a clean map for a manually started reverse follow. Existing driving/walking route navigation remains separate.
- `tests/test_backtrack_follow_v140.js`, `tests/test_emergency_tabs_v140.js` **new**: coordinate projection, GPS quality, fresh fix, watch stop, no data writes, original emergency form ownership, accessible tab selection and navigation. `openrf/__init__.py`, static versions and version-pinned tests updated.

## Automated checks

- `PYTHONPATH=tests:. python3 -m unittest discover -s tests -p 'test_*.py' -q`: **385 passed**.
- `for f in tests/*.js; do node "$f" || break; done`: **108 passed**.
- JavaScript syntax checks for `app.js`, `field-breadcrumbs.js`, `breadcrumb_follow.js`, and `emergency-tabs.js`: passed.
- Local development server booted on a dedicated loopback port against a disposable test SQLite file. **Chromium browser screenshot verification was blocked** by container sandbox/socket permissions; no successful screenshot, physical Raspberry Pi touchscreen, live GNSS fix, road trial or real Valhalla routing check is claimed.

## Installation

1. Download `OpenRF-v0.2.140.zip` into Windows Downloads. Do **not** manually extract into your project.
2. Run from any PowerShell directory:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

   The existing updater validates, backs up and installs managed source and attempts commit/push by default (optional `-NoPush`). A Git push only initiates CI, it is not guaranteed success.
3. Restart the local server in WSL after stopping the old instance (`Ctrl+C`):

   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```

## Manual test checklist — 1280×800 seven-inch landscape

1. Open **Emergency**: the yellow/brown “In immediate danger?” notice should always remain available, with **Dashboard** active at first entry. Its local overview and quick access links should appear at the top. Select each of the five tabs; only the chosen panel group should be visible. Check keyboard Left/Right/Home/End, `Tab`, focus, long forms and narrow touchscreen horizontal tab scrolling.
2. In **SOS & Check-ins**, create **only a draft** and a local check-in in your test data. Check expected form validation. In Radio & Messages, verify all existing handoff, outbox, team, protocol and inbox controls are present and nothing is transmitted by clicking a tab or quick shortcut. Device & Backup should offer health checks first and encrypted backup below. Plans & References should retain saved notes and library.
3. In **Map → right-side GPS → Walking & driving tracks**, inspect a **stopped** walking history with two or more positions. Tap **Follow reverse track (GPS)**, review the consent prompt, and allow browser geolocation. Your reported position should appear blue; amber/green show the historical reverse line ends. The HUD should give only approximate distance to the original recorded start, with ±reported accuracy. No route turn instructions are inferred.
4. Try an inaccurate or stale browser fix: progress must pause. If your location is far from the recorded line, a distinct off-track warning should appear. In a stationary test, simulate these through test fixtures if outdoor GPS is unavailable. Stop should remove the live marker and release the watch; hiding the tab or leaving Map must also stop it. No new saved position should be created by follow alone.
5. Repeat with a saved **Driving** track, keeping the device out of the driver's hands while moving. Verify the mode-specific tolerance and that the record/stop GPS controls still work independently. Tapping regular Start navigation should end the reverse-follow watch.
6. Compare the three independent saved-track actions: **Reverse track preview** uses no GPS, **Follow reverse track (GPS)** shows live relation to historical fixes only, and **Route to recorded start** requests a fresh route from local Valhalla. Do not treat a straight-line fallback, offline map drawing, or the original track itself as a verified navigable road or path.

## Remaining limitations

- Browser geolocation is not guaranteed accurate GNSS. Follow stops on hidden/closed browser tabs, requires fresh reliable readings and cannot be counted on for emergency rescue or unattended/locked-screen recording.
- Backtracking computes geometric proximity to historical reported coordinates, not a surveyed corridor; off-track thresholds cannot account for missing points, tunnels, access restrictions, new hazards or speed. There is **no reverse-track turn-by-turn voice guidance** and no automatic reroute on a historical line. For road directions use the separate local Valhalla route, if available; even that may be outdated.
- Offline map data, local router availability and external radio/receiver hardware were not changed. Real-world Pi battery/GPS/router testing remains necessary.
