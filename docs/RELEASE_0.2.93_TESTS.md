# OpenRF v0.2.93 — Unread messages stay unread on their own page

## Change

Both Mesh and Reticulum increment unread counters for real inbound events regardless of the selected page. An inbox being visible is not proof that messages were read. The counter persists until the operator selects that inbox's **Mark all as read** control (or explicitly clears all its messages). The full-screen map shows its compact envelope only while messages are unread.

Both inboxes now render received texts on the left and outgoing/queued texts on the right, with small readable time labels and the original full UTC timestamp in a tooltip. Latest messages appear at the top in both inboxes and per-peer filters. Outgoing message status still never claims receipt or reading by another person.

## Automated tests

```bash
cd project
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || exit 1; done
```

- `tests/test_unread_active_inbox_v093.js`: checks incoming while already on Mesh or Reticulum, successive incoming counts, polling duplicates, same-tab refresh, explicit acknowledgment, and the first new unread after that acknowledgment.
- `tests/test_chat_bubbles_v093.js`: checks latest-first Meshtastic rows, per-peer filtering, incoming vs outgoing bubble classes, no event-order mutation and truthful queue status.
- Existing v0.2.92 Reticulum ordering tests check its new incoming/outgoing bubble classes.
- Existing navigation, unread aggregation, Meshtastic status and Reticulum contacts/history suites remain.

## Manual test

1. Start OpenRF in Ubuntu. Connect a compatible Meshtastic USB node or explicitly enable a working Reticulum link to an authorized peer.
2. Open the matching Mesh Messages or Reticulum page and leave it open. Have the peer send one actual new message. Confirm the new-message badge appears in the header and sidebar even though the inbox remains visible.
3. Send a second inbound message. The unread count should increment. Outgoing messages, refreshes and unchanged polls should not increment it.
4. Switch to Overview or Map and back. The unread badge should still be present. On Map, the top-right envelope should appear only while something is unread.
5. Select **Mark all as read** on that inbox only. Its badge should disappear, while unread items in the other inbox (if any) stay unread.
6. Send another incoming message without leaving the inbox. The badge should return.
7. Refresh the browser tab and verify the count persists when session storage is allowed.
8. Check both message pages on the target 5-inch screen: incoming bubbles should be left-aligned, outgoing right-aligned; newest first; no horizontal scrolling. Verify the small displayed times are sensible in the device's local timezone and the original UTC time remains available by pointer hover.

## Limits

Counts are per browser tab and depend on valid inbound receive sequences; they are not server-side read receipts or cross-device synchronization. A first-ever poll in a new tab establishes a baseline to avoid labeling historical messages as new. Browser storage can be denied; in that case counters remain live until reload but cannot persist through refresh. No real RF/Sideband hardware tests or Raspberry Pi touchscreen test were performed for this release.
