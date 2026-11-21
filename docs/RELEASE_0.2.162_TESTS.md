# OpenRF v0.2.162 — Reticulum workspace tabs

## Scope

- Inbox opens first with thread browser, voice notes, contacts, optional local-history controls and unread status.
- Dashboard: service state, Reticulum enable/stop, LXMF identity, optional manual announcement and shortcuts.
- Connections: opt-in TCP, HaLow interface selection, RNode/LoRa setup and diagnostics.
- Files: Bluetooth Classic and Reticulum Resource files, still explicit-send/receive only.
- The tab layer moves original elements, preserving existing JavaScript event bindings and form values. It does not install LXST or implement voice calls.

## Local checks

1. Install through the existing `Update-OpenRF.ps1` script using the **whole `OpenRF-v0.2.162.zip`**.
2. Restart the backend (`cd /mnt/c/projects/OpenRF && python3 -m openrf`) and open `http://127.0.0.1:8765`.
3. Select **Messages → Reticulum**. Verify **Inbox** is selected immediately and contains the conversation list, composer, saved contacts and local-history settings. No Reticulum network activity should start merely by opening the page.
4. Select all four tabs. Check **Dashboard** enables/stops Reticulum (only after pressing the appropriate button), **Connections** retains TCP/HaLow/RNode/diagnostics, and **Files** contains both Bluetooth and Reticulum transfer options.
5. Switch tabs using the mouse and Left/Right/Home/End keys; verify selection and content, no page jump or duplicate handlers. Switch away and back; the active tab should remain while the app remains open. Refresh resets Reticulum to Inbox.
6. On a 1280×800 and a narrower screen, check for readable tab labels and no horizontal page scrolling. Unread Reticulum messages should update the Inbox tab badge. Check attachment selection and draft text survive switching tabs.
7. Before depending on files or messages in the field, test real device-to-device delivery and consent/receipts on Linux/Raspberry Pi with appropriate hardware.

## Automated verification

- `node tests/test_reticulum_tabs_v162.js` covers initial tab selection, ownership of original elements, connection/file classification, keyboard navigation and unread updates.
- `python3 -m unittest discover -s tests -p 'test_*.py' -q`
- `for test in tests/*.js; do node "$test" || exit 1; done`
- `node --check openrf/static/reticulum-tabs.js`

## Limits

**Automated result:** 457 Python unit/integration tests and 132 JavaScript test files passed locally. The backend also started on an isolated loopback port with an isolated scratch database. A separate attempt to run a Chromium/Playwright screenshot test was blocked by this environment (`process_singleton_posix.cc: socket() failed: Operation not permitted`), so **live 1280×800 and 800×480 visual browser verification remains for the user**.

Tests exercise the source and simulated browser DOM, not a physical touchscreen, pair of Reticulum peers, Bluetooth adapter, RNode, audio peripheral, signal quality, or delivery. Live LXST calling is **not bundled or implemented** by this patch. There is no required Python/Node dependency change, server endpoint, database migration, or automatic RF transmission.
