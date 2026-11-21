# OpenRF v0.2.166 — MeshCore integration verification

## What was added

New independent MeshCore USB Companion controller (`openrf/meshcore_radio.py`), loopback-only API routes, standalone Messages sidebar page with serial Connect/Disconnect/Refresh and contact-driven direct chat, conservative 120-byte messages, process-memory-only history (200 rows), receive/ACK events, chronological newest-at-bottom conversation bubbles, unread counts, and cross-protocol USB ownership checks.

This release **does not** include the MeshCore Python SDK, MeshCore firmware, channel broadcasts, radio frequency configuration, network forwarding, any demonstrated RF measurements, Pi binary build or verified over-the-air delivery. MeshCore radio ACKs are packet acknowledgments, never read receipts.

## Automated tests (no radio attached)

Run from the extracted `project/` directory in Linux (WSL or Pi):

```bash
python3 -m compileall -q openrf
python3 -m unittest discover -s tests -v
node --check openrf/static/app.js
node --check openrf/static/meshcore.js
for test_file in tests/*.js; do node "$test_file"; done
```

**Result on 2026-11-21:** 471 Python unit tests passed, all 134 JavaScript suites passed, and Python/JavaScript syntax checks passed. These include new Python fake-radio event/ACK tests, an SDK-shaped async loop test, actual loopback API tests, serial-port conflict tests, and JavaScript conversation ordering/scroll-follow tests. They do not establish device/firmware compatibility.

## Real-radio checklist (pending hardware)

1. Stop OpenRF, install optional official library in its exact Python environment: `python3 -m pip install meshcore`. If your Linux uses an externally managed Python environment, use an existing application virtualenv or a new venv; do not bypass system package protections. No internet is needed after SDK installation for serial radio messaging.
2. Flash **MeshCore Companion USB Serial** firmware appropriate to the exact compatible board/region and attach an antenna tuned to the legally permitted frequency. Meshtastic/RNode firmware on the same board is not compatible. Do not transmit without the correct regional/radio setup.
3. On WSL, use supported USB passthrough so the port is actually visible in Ubuntu, and check ownership/permissions of `/dev/ttyUSB*` or `/dev/ttyACM*`. On Raspberry Pi OS, connect directly and use normal serial device permissions. Avoid opening the same serial port in a second tool.
4. Launch `cd /mnt/c/projects/OpenRF && python3 -m openrf` (WSL) or `cd /path/to/OpenRF && python3 -m openrf` (Pi), using the same Python where `meshcore` was installed. Open `http://localhost:8765` → Messages → MeshCore. Observe that **nothing connects just by opening the page**. Press Refresh, select a candidate serial port, then press Connect.
5. Record actual connected radio model/firmware and contact count. Refresh the contact list, open a direct conversation, and send one short, non-sensitive message to a second known MeshCore companion. Verify whether it appears in the other radio/client and how the matching MeshCore ACK event changes the bubble. Log any ACK delays/errors. No ACK must remain visibly unconfirmed.
6. Scroll upward, have a peer send a text: view should hold its scroll position; when near the bottom, a new text should follow downward. Reopen the chat to check that the latest message is at the bottom. Verify manual unread clearing, unknown sender display, Disconnect/reconnect, and that server restart clears MeshCore session text.
7. With Meshtastic connected to USB port A, try MeshCore on port A: expect **409 port in use**; a separate port B should remain available. Repeat with a running Reticulum RNode and reverse the order (MeshCore already connected, then Meshtastic/Reticulum). These tests should not alter the other protocol sessions.
8. Test Ubuntu WSL USB passthrough and Raspberry Pi OS separately. Capture only scrubbed status/exception text for feedback; avoid sharing private message bodies or public keys unnecessarily.

## Files changed

- `openrf/meshcore_radio.py` — optional hardware transport, bounded memory inbox, event correlation
- `openrf/server.py`, `openrf/mesh_connections.py` — API/lifecycle and USB port ownership
- `openrf/static/index.html`, `app.js`, `mesh.js`, `meshcore.js`, `app.css` — navigation, separate chat, style, unread notifications
- `tests/test_meshcore_v166.py`, `tests/test_meshcore_v166.js` — fake transport/API and UI tests
- `openrf/__init__.py`, Electron metadata, `README.md`, `CHANGELOG.md`, `docs/THIRD_PARTY.md`, and MeshCore plan — version, documentation and optional dependency attribution

No existing local-data, updater scripts, Reticulum keys, Meshtastic conversation histories or customer data are included in the bundle. The `project/` subtree is installable source only.
