# OpenRF v0.2.91 — Reticulum contacts, conversations and private history

## What's changed

- A **Contacts** panel lets the operator save, edit, remove, or select a nickname for a public 32-character LXMF address. Labels are user-entered local names, **not authenticated identities**. Saving and selecting a contact do not send or announce anything.
- **Conversation** shows all messages or filters to one contact/peer. The Reply button continues to prefill the verified-format sender address without transmitting. Invalid addresses never become reply targets.
- **Local message history** is opt-in and stored in a separate private SQLite file under the local Reticulum runtime directory, outside Git. Default: session memory only. Enabling saves the current in-memory session plus future incoming and queued outgoing rows; up to 1,000 records are retained. Disabling deletes saved message rows while keeping contact labels. An explicit Clear Messages action removes saved and current-session messages; it does not delete contacts.
- Message labels distinguish **received with a validated LXMF signature** from **queued locally with LXMF, delivery unconfirmed**. No synthetic delivery receipt, automatic retransmission, or remote-server sync has been added. Missing-path requests remain **not sent**.
- Connection details show local RNS interface state, counts of reported peer entries/clients, and the explicit TCP option. These do **not** establish that Sideband/another device actually received a message.

All contacts and stored texts stay on this device. SQLite message text is **not encrypted at rest**. Contacts require an explicit save; read-only page loads do not create a contacts or message-history database.

## Automated tests

From the OpenRF project root in Ubuntu WSL:

```bash
python3 -m unittest discover -s tests -v
for test_file in tests/*.js; do node "$test_file"; done
```

New Python regression tests (`test_reticulum_messaging_v091.py`) cover idle no-write behavior, input validation, private permissions, contact persistence, per-worker event IDs, idempotent history import, clearing/disabling, offline access after the worker stops, and same-origin/loopback API restrictions. JavaScript tests (`test_reticulum_messaging_v091.js`) exercise contact naming, conversation selection, reply behavior and honest message labels without any RF traffic.

## Manual checks on your WSL and Sideband setup

1. Open **Messages → Reticulum**. Confirm the Reticulum transport is still **OFF** on launch. Open Contacts and save your Sideband phone's actual 32-digit LXMF address with a nickname. Confirm it appears after hard-refreshing the page. Nothing should announce or connect automatically.
2. Choose a contact and press **Message**. It should fill the destination field and focus the compose box, but it must not send until you press Send.
3. Explicitly start Reticulum with your usual AutoInterface/TCP settings. Send a genuine LXMF message from Sideband; it should be shown as received with a validated signature. Choose that peer in the Conversation selector to see only that chat.
4. Turn **Save Reticulum messages on this device** on, accepting the plaintext storage warning. Send another real message and inspect the saved-count label. Stop Reticulum: the saved inbox should remain visible. Restart OpenRF: saved history and contacts should still be present. The Reticulum listener should still start only if you explicitly enable it.
5. Send to a known address from OpenRF. An outgoing message accepted by the local LXMF router should read **Queued with LXMF · delivery not confirmed**, even if the peer receives it later. When no route is known, the send attempt should say **not sent**.
6. Disable history. Saved message count should go to zero; contacts should remain. Re-enable only if you intentionally want to store the current in-memory session and future messages. Test Clear Messages; confirm it removes messages but leaves contacts.
7. Confirm your 5-inch/800×480 landscape layout has no horizontal scrolling when Contacts is expanded. Repeat sending and receiving with actual hardware; simulated tests cannot establish radio compatibility or delivery.

## Current limitations

- LXMF/RNS dependencies and physical Sideband/Reticulum delivery were **not exercised by automated tests**. They require the user's actual network and optional packages.
- A locally queued outbound message is **not** proof of delivery. This release does not register a validated remote delivery-acknowledgment callback.
- History sync imports verified worker event snapshots when the browser polls or the operator stops Reticulum. A process crash before its next sync could lose recent unsaved worker messages; unlike storing every event inside the worker, the first release does not promise crash-proof retention.
- Saved nicknames are local claims and cannot authenticate a peer identity. No cross-device contact synchronization occurs.
