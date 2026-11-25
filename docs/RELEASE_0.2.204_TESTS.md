# v0.2.204 — Touchscreen and final stabilization

Builds on v0.2.202 and v0.2.203; the bundles are complete and cumulative. Review their migration and privacy notes before upgrading. No automatic hardware connection or RF transmission is introduced.

The Mesh Network workspace puts the protocol overview and node inventory first; history, topology and health remain accessible in collapsible sections. The node table is limited to 50 rows per page (all inventory remains searchable), has a sticky header and keyboard-accessible scroll region. Touch controls are at least 44 CSS pixels tall. Existing history charts remain present during node detail refreshes, unchanged cards and table rows are not rebuilt, interface details preserve expansion, and history settings requests are serialized with dashboard refreshes. The node history displays supported cached route changes. Clear history also clears the currently loaded chart.

## Automated verification

Run `python3 -m unittest discover -s tests -v`, `for f in tests/*.js; do node "$f" || exit; done`, and `python3 -m compileall -q openrf`. The optional isolated Chromium test `python3 tools/mesh_dashboard_smoke.py --chromium /usr/bin/chromium` requires Playwright and a local Chromium executable. It loads the actual workspace HTML, CSS and dashboard JS into an offline page with synthetic API data, checking 1280x800 and 800x480 layout, pagination, search, history during refresh, conversation event, map adapters, and recording settings. It does not run the full application frontend, real MapLibre renderer, live radio, hardware or network. Do not interpret test data as a scan.

## Hardware acceptance checklist (not yet performed)

1. Stop OpenRF and make a private offline backup of the data directory. Install the complete latest source ZIP, launch with `python3 -m openrf`, verify version and check the Emergency Hub's main-DB backup. Check that any existing mesh history survived migration, and both recording checkboxes reflect the intended consent.
2. Start with radios disconnected: confirm clear unavailable/disconnected states, no unexpected radio connections, no invented markers, no outgoing radio traffic.
3. With an authorized Meshtastic USB radio, connect in the messaging workspace; compare names/roles/timestamps/positions against the radio's own SDK/client; verify only reported positions map. Confirm no transmission merely by opening or refreshing dashboard. Send only a deliberate test message to an authorized device; open its node history without changing a draft.
4. With an authorized MeshCore Companion radio, compare the manually refreshed contact list, advertisement positions/times and repeater roles. Confirm repeaters have no direct-message shortcut. With Reticulum, explicitly enable your authorized test network, compare cached paths/interface counters against runtime diagnostics and test an intentional LXMF message. Check a slow or disconnected worker cannot turn a dashboard response into a message response. Test Stop and reconnect.
5. At 1280x800 on the physical 7-inch display, check sidebar, touch target sizes, scroll behavior, map marker selection, active navigation controls, message drafts and Surveillance Hub webcam preview/recording. Confirm the new dashboard doesn't interfere with other pages.
6. Enable snapshot recording then separately opt into background collection; move to another workspace. Check local recording status, changing telemetry, no duplicate unchanged snapshots, restart persistence, retention and clear behavior. Run 24–72 hours with your own radios and check disk, CPU and memory using `top`, `free -h`, and `df -h`. These are manual checks, not certified endurance or battery tests.
7. Stop via Ctrl+C; verify all OpenRF-owned radio/collector processes stop. Restart and repeat. Keep main and dedicated mesh history DB backups separate; local backups must remain private. See v0.2.202 for recovery instructions.

No live hardware, Windows updater, physical touchscreen, Raspberry Pi runtime or GitHub Actions outcome is claimed by this release.

## Additional integration check

A local HTTP server using a temporary synthetic legacy database was started with v0.2.204. It migrated history, preserved snapshot opt-in while turning background consent off, served the dashboard and history, created an encrypted emergency backup, accepted explicit background consent, completed a collection attempt without hardware, cleared and disabled recording, and joined the collector during shutdown. No real device or private data was involved. SQLite ResourceWarnings remain in the full Python run even after connection-lifecycle fixes; they are not considered resolved application-wide.

## Verified release results

- Python 3.13.5: Ran 611 tests in 80.208s; OK.
- JavaScript: 164 scripts, 0 failures.
- Python compilation passed.
- Isolated offline Chromium workspace smoke test passed at 1280×800 and 800×480; no real server or live radios in the browser test.
- No original bundle files removed.

### Changed files relative to previous release

- `openrf-bundle.json`
- `project/BUNDLE_FORMAT.md`
- `project/CHANGELOG.md`
- `project/openrf/__init__.py`
- `project/openrf/static/app.css`
- `project/openrf/static/index.html`
- `project/openrf/static/mesh-dashboard.js`
- `project/openrf/static/weather.js`
- `project/tools/openrf-electron/backend.js`
- `project/tools/openrf-electron/package-lock.json`
- `project/tools/openrf-electron/package.json`
- `project/docs/RELEASE_0.2.204_TESTS.md`
- `project/tests/test_mesh_stabilization_v204.js`
- `project/tools/mesh_dashboard_smoke.py`
