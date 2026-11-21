# OpenRF v0.2.167 — Unified messaging tabs and verification

## Scope

Starting from the complete v0.2.166 release, this patch renames **Mesh messages** to **Meshtastic** and gives Meshtastic and MeshCore the same top-level **Dashboard / Inbox / Contacts** layout used by Reticulum. Reticulum retains its **Files** tab for its already implemented Resource transfer features; neither Meshtastic nor MeshCore gains file transfer in this release.

Dashboard contains each protocol's status, manual USB connection and preferences. Inbox retains each original message list, composer and read/ACK indicators. Contacts exposes Meshtastic's locally recorded nodes and nicknames or MeshCore's reported Companion radio contacts (not proof a radio is online). Selecting an existing contact opens the relevant Inbox, with messages oldest-to-newest. The new navigation moves existing DOM elements, preserving bound handlers and draft text. Opening a tab does not connect or transmit.

The three transports stay independent: no forwarding, automatic connection or new backend radio behavior is included. Existing opt-in Meshtastic history, in-memory-only MeshCore text and independent Reticulum storage behavior are unchanged.

## Automated checks (no radios attached)

From the extracted `project/` directory on Linux/WSL or Raspberry Pi OS with Python 3.11+ and Node.js installed:

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -q
node --check openrf/static/app.js
node --check openrf/static/mesh.js
node --check openrf/static/meshcore.js
node --check openrf/static/messaging-tabs.js
for test_file in tests/*.js; do node "$test_file" || exit 1; done
```

The new `tests/test_messaging_tabs_v167.js` checks the exact HTML IDs, renamed sidebar, both tab groups, retained elements, keyboard navigation and switching to the bottom of the Inbox. The existing HTTP static-asset test also guards against a 404 for `messaging-tabs.js`.

**Local results, 2026-11-21:** 471 Python tests passed; all 135 JavaScript test files passed; Python bytecode compilation and the listed JavaScript syntax checks passed. Simulated/mocked integration coverage is not evidence of a working physical MeshCore or Meshtastic radio.

## Manual UI checks (pending actual installation)

1. Update using the complete `OpenRF-v0.2.167.zip` through the usual `Update-OpenRF.ps1` workflow. Restart the local backend and reload the browser/Electron window so the new JavaScript is loaded.
2. Open **Messages → Meshtastic**. Verify the sidebar, page heading, top Messages menu and breadcrumb distinguish it from **MeshCore**. The three tabs should be visible without horizontal scrolling on the intended touchscreen.
3. Select Meshtastic **Dashboard**: status and Connect/Disconnect/Refresh controls should be visible. Open **Contacts**, verify the saved-node/nickname directory, and choose a node. It should open the existing **Inbox** with that recipient in the composer. Test explicit Save nickname and clear-history consent without changing unrelated history.
4. Open **Messages → MeshCore** and view **Dashboard**: the USB list remains candidates only; there must be no automatic connection. Open **Contacts** and see either the disconnected prompt or the radio-provided contacts. Selecting a radio contact should open **Inbox** and its conversation. With no compatible hardware, send is unavailable.
5. In both Inbox tabs check chronological messages (newest at bottom), bottom-follow only when already near the end, manual unread clearing, legibility on small touchscreens and preserving unsent compose text while switching tabs. No new messages or simulated hardware data should appear.
6. Open **Messages → Reticulum**: its four tabs including **Files**, existing opt-in connection controls, contacts, LXMF messaging and Resource interface must be unchanged. Confirm none of the three pages forwards text or requests a USB port automatically.

## Hardware testing remains outstanding

No physical MeshCore Companion USB radio, Meshtastic radio, Reticulum RNode, real RF delivery/ACK, WSL USB passthrough, Raspberry Pi touchscreen or serial-port contention was verified by this UI patch. Use the existing [v0.2.166 hardware and network test checklist](RELEASE_0.2.166_TESTS.md) when hardware is available. Do not interpret an SDK submission as a network ACK or recipient read receipt.

## Changed files

- `openrf/static/index.html`, `app.css`, `app.js` — names, shared tabs and layout
- `openrf/static/messaging-tabs.js` (new) — accessible manual tab selection; no radio operations
- `openrf/static/mesh.js`, `meshcore.js` — contact-to-Inbox routing and unread badges
- `openrf/server.py` — allow new JavaScript static asset
- `tests/test_messaging_tabs_v167.js` (new), updated sidebar-label regression assertions
- `.github/workflows/openrf-linux.yml` — syntax check for new script
- `openrf/__init__.py`, Electron package metadata, versioned tests, `BUNDLE_FORMAT.md`, `README.md`, `CHANGELOG.md` and this document — complete v0.2.167 release metadata and checks

The ZIP includes the full managed `project/` source and root manifest only. User-maintained updater scripts, repositories, keys and local data are excluded.
