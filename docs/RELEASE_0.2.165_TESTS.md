# OpenRF v0.2.165 — Chat chronology and LXMF receipt tracking

## Changes

1. **Messages → Reticulum → Inbox** and **Messages → Mesh messages** display conversations in chronological, oldest-to-newest order using each message's reported UTC timestamp. The newest message is at the bottom, like an SMS conversation. Entering a Reticulum thread, opening the Inbox tab or visiting Mesh messages scrolls the message viewport to the bottom. During automatic polling, the view follows a new arrival only if the user was already near the bottom (48-pixel tolerance); manually scrolling up stays put.
2. New **LXMF delivery and failed callbacks** update only the exact outbound event that registered them, never an incoming record or another message. A queued message becomes **Delivered · LXMF receipt confirmed** only on a delivery callback, or **Delivery failed** on an LXMF failure callback. History opt-in stores later status transitions and will not downgrade a confirmed result to an older queued snapshot. The Send status beside the composer reports the same transition when that send is still tracked in the live session.
3. The original `QUEUED_WITH_LXMF_NOT_DELIVERED` result still means the LXMF router has accepted the message for processing, not that the destination has confirmed receiving it. The recipient may actually receive it while a sender still shows Queued if its delivery confirmation is lost or delayed. Older v0.2.164 messages have no registered callback and are **not** retroactively marked delivered.
4. Added a separate, future MeshCore integration plan; this release **does not implement MeshCore** and does not start any network/radio automatically.

## Verification

After updating with the complete ZIP, stop/restart the previous backend and Electron application so `/api/health` reports `0.2.165`.

1. Navigate to **Messages → Reticulum → Inbox**. Open an existing conversation containing both old received messages and a newer sent one. The oldest message should appear first and the most recent one at the bottom.
2. Scroll up within the conversation, allow another inbound message to arrive, and verify you can keep reading the older messages without jumping. Scroll to the bottom and receive another message: the viewport should follow the latest message. Leave and reopen the thread: the latest message should be visible again.
   Repeat the ordering and scroll check on the separate **Mesh messages** inbox with a compatible real radio, if available.
3. On two consenting, separately configured Reticulum/LXMF endpoints, establish a route and send a new message. Initial **Queued** is expected; wait for the sender's actual LXMF delivery callback to see **Delivered**. Verify the receiving device has the message separately. Temporarily lost receipts can leave Queued despite the recipient having a copy; this is not a claim the destination failed. A failed callback must display failure without claiming delivery.
4. If private Reticulum history is enabled, stop/restart OpenRF and check that a confirmed receipt status survives the restart. Reticulum identity, message history and radios stay under the existing local privacy rules. Existing v0.2.164 queued messages remain unchanged.

Automated commands (from `project/`):

- `python3 -m unittest discover -s tests -q`
- `for file in tests/*.js; do node "$file" || break; done`
- `python3 -m unittest discover -s tests -p 'test_reticulum_delivery_v165.py' -v`
- `node tests/test_reticulum_inbox_order_v092.js`
- `node tests/test_reticulum_tabs_v162.js`
- `node tests/test_mesh_inbox_order_v165.js`

Expected clean-release results: **463 Python tests** and **133 JavaScript test files** passed in the package workspace; the Python suite includes the three new simulated receipt/persistence tests.

## Limits

The regression suite uses simulated callbacks and local persistence; no real LXMF receipt, peer, Pi, RNode/LoRa radio, or MeshCore firmware was available in the packaging environment. Confirmation is only as reliable as the upstream LXMF delivery callback and does not mean a person read the message. No backend HTTP API was exposed to the LAN, no account/sign-in was added, and no automatic network or RF activity was introduced.
