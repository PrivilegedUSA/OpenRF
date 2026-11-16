# OpenRF v0.2.89 — Messaging unread badge alignment and foreground refresh

## Behavior

- The sidebar parent **Messages** is an expandable navigation group, with no number between its title and arrow.
- **Mesh messages** and **Reticulum** each show a small teal unread number to the right of their respective labels, but only if that inbox has unread incoming messages.
- The header envelope shows **the sum of both unread counts**, not all historical messages. Opening one inbox clears only that inbox's unread count. A Reticulum-only unread total routes the envelope directly to Reticulum.
- An already enabled transport performs a read-only inbox refresh when OpenRF's browser tab regains focus or becomes visible. Browser background timers may be throttled; the foreground refresh reduces notification delay but does not promise instant delivery while a tab is hidden. Reticulum and Meshtastic still require explicit Enable/Connect.

## Automated tests

From the release `project/` directory:

```bash
python3 -m unittest discover -s tests -q
node --check openrf/static/mesh.js
node --check openrf/static/reticulum.js
node tests/test_mesh_sidebar_counts_v089.js
node tests/test_reticulum_unread_v085.js
for script in tests/*.js; do node "$script" || exit 1; done
```

## Operator test

1. Start OpenRF on WSL. Open the hamburger, expand **Messages**, and check that the parent has no number and child counters sit at the right edge of the appropriate subpage.
2. On Sideband, connect to the operator-enabled Reticulum TCP listener on the Windows computer's LAN IPv4 and port 4242. Receive an actual LXMF text while on a different OpenRF page.
3. Check the header envelope total and the Reticulum-only submenu number. Open **Mesh messages** first; the Reticulum number must remain. Then open Reticulum; its count must clear.
4. Repeat for a real connected Meshtastic USB node if available. No simulated messages should produce a badge.
5. Switch away from the OpenRF browser tab, receive a real LXMF message, then return. Verify a prompt badge update after focus (subject to the transport reporting a new inbound event).
6. Inspect the sidebar at ~800×480 landscape and on a narrow portrait viewport for alignment and sideways scrolling.

## Limitations

The automated tests cover DOM state, CSS contract and event logic, not actual Sideband/WSL delivery, hardware or a live touchscreen. Unread counters are local to the current browser page session and are reset when the page reloads. They are not message receipts, history totals or persistent read-state synchronization. No Reticulum AutoInterface multicast fix is included.
