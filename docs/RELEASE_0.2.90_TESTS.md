# OpenRF v0.2.90 — Messaging, unread counters, and page navigation

## Included changes

1. The header envelope on non-map pages opens a keyboard-accessible two-choice dropdown: **Mesh messages** or **Reticulum**. The choices show their own unread counters, and the header badge shows their combined count. Escape and outside clicks close the menu.
2. Each receive-sequence-based unread count survives a hard refresh of the same tab. Reticulum status changes no longer discard unread counts. Meshtastic's local inbox can be checked read-only even if its USB link has just disconnected. Old message history and outgoing submissions do not increment counts; reading each inbox clears only its count.
3. The selected page is remembered per tab using session storage. If storage is unavailable, OpenRF safely defaults to Map. It is not saved across independent new tabs as a permanent preference.
4. Map is the initial page for every screen size and appears first in the sidebar, immediately above Overview.

The application still binds its development HTTP server to loopback by default. Neither the dropdown nor unread polling starts a radio, a Reticulum process, a network listener, a send, or an announcement.

## Automated checks

From the installed project root in WSL:

```bash
python3 -m unittest discover -s tests -v
for test_file in tests/*.js; do node "$test_file"; done
```

New `tests/test_messaging_navigation_v090.js` covers source layout, header choices, per-tab page restore, invalid/blocked storage handling, duplicate/old/outbound sequence protection, refresh carryover, worker restart behavior, and per-inbox read clearing. Older frontend and backend tests remain in the release.

## Manual acceptance in your browser

1. Open `http://localhost:8765` in a **new tab**. Map should load without manually navigating, on desktop and 800×480 landscape alike. Map should precede Overview in the sidebar.
2. Open Overview and hard-refresh (`Ctrl+Shift+R`). It should remain on Overview. Repeat with Analysis and Reticulum. Opening an entirely new tab to the app should show Map. Browser session-restore or tab duplication can intentionally copy tab state, depending on the browser.
3. On Overview, click the header envelope. Confirm Mesh messages and Reticulum appear as distinct choices. Pick each; use Escape and clicking elsewhere to close. The envelope stays hidden on the fullscreen Map as before; use the sidebar Messages menu there.
4. With a real Meshtastic USB node connected, or Reticulum explicitly enabled and receiving valid LXMF, navigate to Overview. Receive one new message **from another device**. The relevant sidebar badge and the combined header badge should rise. No badge should be created by sending a message or by opening already stored history for the first time.
5. Hard-refresh without opening the unread inbox. The counter should remain. Open **only** the Mesh inbox; only the Mesh count should clear. Then open Reticulum; its count should clear. New incoming messages after either page is closed should increment again.
6. If a Reticulum worker stops or the USB link drops after a message arrives, check that an unread count remains until you actually open its inbox. Disabled transports must not be started automatically by a counter refresh.

## Test limitations

- Automated tests exercise local message counters and navigation logic, not actual LoRa reception, Sideband networking, antenna performance or RF delivery confirmation.
- A receive-sequence increment proves OpenRF recorded an incoming event on the currently observed backend, not that the sender saw a delivery receipt.
- Session storage may be unavailable or blocked in private browsing; then page selection and unread counts operate only in memory until a refresh.
- On a newly opened tab without an existing counter baseline, historic messages are treated as already seen to avoid fabricating new notifications.
