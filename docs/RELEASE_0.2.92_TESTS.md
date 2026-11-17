# OpenRF v0.2.92 — Reticulum newest-first inbox

## Scope

- Render received and queued Reticulum LXMF texts newest-first within All messages and each selected conversation.
- Do not mutate backend event order or change the signature, delivery, unread, privacy or network semantics from v0.2.91.
- Keep the latest item at the top; retain the older-message reading position across background refreshes; start each newly selected conversation at the top.
- Warn when trying to save an existing LXMF address; never rename it silently. Rename only via the explicit Edit action, with Cancel edit to escape. Reject duplicate creations at the local API and maintain SQLite's single row per address.

## Automated checks

```bash
cd project
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || exit 1; done
```

- `tests/test_reticulum_inbox_order_v092.js`: ascending inbox rows rendered descending, input data unchanged, repeated renders stable, per-peer filtering newest-first, top vs older-message scroll behavior.
- `tests/test_reticulum_contact_duplicates_v092.js`: same-address quick-save warning, blocked accidental duplicate, explicit locked-address edit and cancel controls.
- `tests/test_reticulum_messaging_v091.py`: duplicate address normalization, 409 API conflict, explicit edit via `update:true`, and 404 missing edit target.
- Existing Reticulum contact/reply and HTTP privacy tests continue to run.

## Manual operator check (requires real Reticulum peer)

1. Open OpenRF → Reticulum and manually start its transport. Use an authorized peer (such as Sideband) to exchange at least three test messages.
2. In **All messages**, verify the most recently received/queued event appears at the very top.
3. Select a conversation; verify that its latest event also appears first. Change to another conversation and back; the top should show its latest event again.
4. Scroll down to read older messages. Wait for automatic refresh; verify the view does not jump to the newest message without an explicit selection.
5. Try **Save recipient as contact** on a saved address: it should say **already saved** and offer Edit, without changing the nickname or making another row.
6. Select **Edit** on the existing contact, rename it, and choose **Update contact**; there should still be one row for that address. Try **Cancel edit** and verify the form returns to Save contact.
7. Try Reply. If you have explicitly enabled private local history, restart OpenRF and confirm the same newest-first order is used.

## Limits

The mock DOM and API tests do not establish real LXMF delivery, Radio/Sideband interoperability or the Raspberry Pi 800×480 layout. Queued messages remain **delivery not confirmed**. Opt-in SQLite message bodies remain unencrypted at rest. History remains off by default.
