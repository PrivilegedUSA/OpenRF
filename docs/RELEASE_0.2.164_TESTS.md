# OpenRF v0.2.164 — Reticulum stamp worker and Dashboard connection settings

## What changed

1. Reticulum tabs are now **Dashboard → Inbox → Contacts → Files**. The TCP listener/peer settings are inside a new closed **LAN & TCP settings** disclosure, adjacent to the existing HaLow, RNode, and diagnostic disclosures. These are part of Dashboard, not a fifth Connections tab. Existing form nodes are moved, rather than recreated, and controls do not initiate radio/network activity until the operator enables them.
2. Fixed the WSL/Python 3.14 report: on a path request, `RNS.Stamps` tried to launch a helper from OpenRF's `daemon=True` Reticulum process. Python denied child creation, then raised a follow-on `can only join a started process`. The optional worker is now `daemon=False`; the server still owns it and stops/reaps it explicitly, including on graceful SIGTERM, UI Stop and Ctrl+C.
3. Inbox displays send feedback **under the Send button**, rather than only in hidden Dashboard status. A path request shows **Message NOT sent**; LXMF queue acceptance says delivery is not confirmed; local errors are visible. An HTTP 202 merely reports accepted local processing, not that another device received the message.
4. When optional RNS/LXMF packages are unavailable to the active Python, Dashboard displays an actionable warning including the server's `sys.executable`. An explicit Enable attempt remains possible and surfaces backend errors instead of a silently disabled button.

## Test the installed version

1. Install the full `OpenRF-v0.2.164.zip` using the existing `Update-OpenRF.ps1` updater from your Downloads folder, then **restart** the prior v0.2.163 Python backend / Electron window. Check `/api/health` reports `0.2.164` to avoid testing a stale server.
2. In WSL, check the Python environment OpenRF actually uses: `~/.venvs/openrf/bin/python -c "import RNS, LXMF; print('RNS and LXMF installed')"`. Packages installed in a different Python (such as Windows Python) are not sufficient. Start the OpenRF backend from that venv as documented for your setup.
3. Open **Messages → Reticulum → Dashboard**. Verify the four tabs switch, **Connection settings** contains collapsed **LAN & TCP settings**, **Wi-Fi HaLow**, **RNode**, and **Diagnostics**. Verify the TCP toggle still exists, is off by default and only becomes active if the operator opts in.
4. Enable LAN messaging after addressing any *actual* UDP port conflict. Confirm an LXMF address appears; open Inbox. On another consenting Reticulum/LXMF-capable device, discover/announce the peer identity. Type a recipient address and test Send. If no route exists, the inline status says discovery requested and **message NOT sent**. After a path exists, a queued result explicitly says **delivery NOT confirmed**. Observe actual incoming reception on the second device separately before calling the test successful.
5. Stop Reticulum. Confirm the address is no longer active and no OpenRF-owned Reticulum worker remains. Close the server normally and inspect processes/UDP bindings if necessary; other independent Reticulum instances must not be killed automatically.

## Automated checks

- `python3 -m unittest discover -s tests -q`
- `for f in tests/*.js; do node "$f" || break; done`
- `python3 -m unittest discover -s tests -p 'test_reticulum_stamp_worker_v164.py' -v` covers the process factory daemon setting, owned-process cleanup, and a real two-level Python `spawn` test requiring nested child creation.
- `node tests/test_reticulum_tabs_v162.js` checks the four tabs, preserved input nodes, nested Dashboard settings, default-collapsed panels, unread badge, keyboard navigation and visible Inbox send status.

Results in the packaging environment: **460 Python unit/integration tests passed; 132 JavaScript test files passed.** No hardware-in-the-loop test was attempted.

## Limits and security

No live Reticulum traffic or recipient receipt was verified by the regression suite. Python subprocess simulation is not a substitute for an RNS/LXMF two-device radio/LAN test; RF hardware, WSL IP multicast, BLE/Bluetooth, Pi screen, and LXMF delivery all remain unverified. Stop requires server cooperation; a forced power-off or `SIGKILL` is not a graceful cleanup. The Reticulum worker is started only after explicit Enable. The unauthenticated OpenRF HTTP API remains bound to loopback; TCP peer/listener and RF-forwarding features are opt-in and require operator/network authorization. No required dependency, schema migration, location upload, automatic transfer or LXST voice calling was added.
