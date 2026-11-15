# OpenRF 0.2.76 — Mesh communications UI and privacy

The message-history store is disabled by default, stays outside Git, and is opt-in only. Turning history off deletes stored messages; Clear messages erases both memory and disk history. Messages are received only from the connected radio callback or created after explicit send.

Tests: `python3 -m unittest discover -s tests`; `for f in tests/*.js; do node "$f" || exit 1; done`; `node --check openrf/static/mesh.js`. Hardware tests not performed.

Manual test: open Radio with no hardware (must show disconnected), check Save History toggle; verify no invented messages. Use two compatible Meshtastic nodes for real send/receive testing, then confirm per-node conversations and Reply pre-fill do not send automatically. Verify history survives process restart only when saving is enabled. Disable and check deletion. Never advertise a radio transmission as delivered solely because the USB SDK accepted it.
