# OpenRF v0.2.94 — Reticulum threads

## What changed

- The Reticulum inbox opens to a full-width list of conversations (contacts plus distinct peers with actual LXMF events).
- Selecting a conversation opens an in-page thread with **← Conversations**, name/address, one Copy address action and Save contact when the sender is not saved.
- Reply and Copy actions are no longer repeated on every received bubble. Each thread has one composer.
- A New message button opens manual recipient entry. Unsent drafts remain distinct between peers in current browser memory.
- Existing messages, optional private SQLite history, contacts and explicit unread acknowledgments are preserved; opening a thread never sends or marks messages read.

## Automated regression

```bash
cd project
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || exit 1; done
```

- `tests/test_reticulum_threads_v094.js`: verifies conversation order, saved no-message contacts, full-width thread state, per-peer isolation, Back/New flows, header actions, scoped unsent drafts and removal of per-bubble controls.
- Existing Reticulum tests cover private history, contact de-duplication, inbox ordering, outgoing-status truthfulness, reply fallback and unread counts.

## Operator test (requires real Reticulum peer)

1. Open Reticulum after the update. Verify the main inbox shows a list of peers, not two narrow message columns.
2. Select a contact. Confirm only that contact's messages appear in a full-width thread, newest at the top, with one composer directly beneath them.
3. Confirm the Back button returns to the list. Select another contact and verify its messages and recipient address are different.
4. Type an unsent draft for Contact A, switch to Contact B and back. A's text should return, never appear in B's composer, and never be transmitted automatically.
5. Try New message and type a 32-character LXMF address. Only press Send deliberately. On an LXMF queue acceptance, the view should become that peer's normal thread. A path request is **not** a sent message.
6. Try Copy address and Save contact in the thread header. Existing contact edits and history privacy controls must still work.
7. Receive a new genuine message while viewing the thread; unread badges should stay until Mark all as read, just as in v0.2.93.
8. Check the 800×480 Raspberry Pi-target layout: full-width message area, no sideways scrolling, readable controls, and Back button visible.

## Limits

The UI is an in-page thread view, not a separate URL. Drafts are memory-only, not durable across tab reloads. No delivery/read receipts are inferred. Local history remains opt-in and unencrypted at rest. Actual Reticulum/Sideband peer connectivity, message delivery, native browser layout and Raspberry Pi screen operation need field testing.
