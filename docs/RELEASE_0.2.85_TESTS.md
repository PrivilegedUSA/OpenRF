# OpenRF v0.2.85 — Unread envelope and Reticulum text wrapping

## Verified context

The operator confirmed that a message sent from Android Sideband arrived in OpenRF's LXMF inbox via WSL's explicitly enabled Reticulum TCP listener on port 4242. The preceding diagnostics showed one connected TCP client and nonzero send/receive counters. This proves an actual LXMF receive on that tested setup; it does **not** prove delivery receipts, Wi-Fi mesh operation or other RF hardware capabilities.

## Changes

- Header envelope and Messages navigation badge now show the combined session-only unread count from incoming Meshtastic and genuine signed LXMF events. A title/aria-label includes a breakdown while unread. `99+` is shown for large totals.
- Reticulum uses the existing `/api/reticulum/messages` read-only endpoint to watch inbound `receive_sequence` every five seconds while its transport remains enabled. Polling does not enable the transport, attempt a connection, perform an announcement, send messages, scan RF or retain GPS coordinates.
- The first observed receive count becomes the baseline, so older session messages at page load don't create a false notification. Outgoing texts never increment unread; opening Messages marks the session's messages read. Stopping Reticulum clears its unread count. The counter does not persist across browser reloads.
- TCP checkbox copy and diagnostics use responsive wrapping and flexible minimum widths to prevent the long text and interface labels from exceeding the panel on narrow/5-inch screens.

## Test on Windows / WSL

Install the complete `OpenRF-v0.2.85.zip` with the usual updater:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Activate the optional Reticulum Python environment and start OpenRF in WSL:

```bash
source "$HOME/.local/share/openrf/reticulum-venv/bin/activate"
cd /mnt/c/projects/OpenRF && python -m openrf
```

1. Enable Reticulum with the direct TCP option selected. Confirm Sideband reconnects to the Windows LAN IP on port 4242. Existing firewall rules from v0.2.84 testing may remain; this release does not modify them.
2. Navigate **away from Messages** to Overview or another ordinary page so the envelope remains visible. Send one new Sideband text to OpenRF's LXMF address. Wait approximately five seconds (background tab timers can delay updates). Expect an amber `1` badge on the envelope and sidebar Messages entry.
3. Send two more genuine inbound texts; expect `3`. Outbound messages queued from OpenRF should **not** increase the number. If a connected Meshtastic node also reports inbound texts, its unread count should add to the same badge, not replace the LXMF count.
4. Open **Messages**. Both unread counts should clear, and the LXMF text should be visible in Reticulum's inbox. While remaining on Messages, incoming texts are immediately considered read (no new unread badge). Return to Overview and send a fresh message to check the counter resumes.
5. On a narrow browser (~480px CSS viewport) and a landscape 5-inch/~800×480 view, verify the **Also accept a direct Sideband TCP connection** label wraps entirely inside its bordered card; the long TCP interface name, IP/port, and UTC announce detail also stay inside the diagnostics card. Verify no horizontal page scrolling.
6. Stop Reticulum. Its contribution to the unread total should disappear. No TCP port should remain open from the stopped worker. A browser reload resets both in-memory unread counters without fabricating notifications from history.

## Automated checks and limits

Run Python tests with `python3 -m unittest discover -s tests -q`, JavaScript checks with `node tests/test_reticulum_unread_v085.js` and the existing `tests/*.js` scripts. Verify the complete ZIP manifest and source paths.

The counter and CSS were not field-verified on the operator's phone/PC or Raspberry Pi touchscreen in this release environment. No Android OS notifications, foreground-service push, inbox persistence, delivery read receipts or unauthorized network activity are added. The body of saved messages continues to follow the existing local-data privacy rules; unread counts exist only in browser memory.
