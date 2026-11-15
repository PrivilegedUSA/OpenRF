# OpenRF v0.2.75 — Empty-map clicks and mesh text foundation

## Implemented

- MapLibre background click and raster background tap no longer open Add Survey Observation. The map toolbar + remains the intentional new-observation action. Destination/area selection taps, panning, saved observation points and camera-report click popups are unchanged.
- The Radio screen now includes a Meshtastic section that lists only visible local Linux USB serial ports, connects/disconnects after a button press, and reports whether the optional Python Meshtastic SDK is available. No radio is opened on app startup or status refresh.
- With a compatible configured Meshtastic node, send a channel broadcast (`^all`) or direct node ID (`!1234abcd`) and receive decoded text via the documented Python pubsub API. Byte-bounded user-entered text and explicit channel index 0–7; no arbitrary hardware commands or modem/role reconfiguration.
- Session-local message log capped at 100, with no disk persistence, GPS fields or automatic forwarding by OpenRF. Submitting a packet to the USB radio is not evidence of over-the-air or recipient delivery.
- Normal and Relay-focused application modes. The latter suppresses OpenRF-originated sending, relying on the attached node's existing automatic Meshtastic CLIENT retransmission. It does not write REPEATER/ROUTER firmware roles or prove that any packets were rebroadcast.
- Restore missing HTTP static serving for `navigation_health.js` introduced with v0.2.74.

## Automated verification

Run from `project/`:

```bash
python3 -m unittest discover -s tests -q
for test_file in tests/*.js; do node "$test_file" || exit 1; done
node --check openrf/static/app.js
node --check openrf/static/mesh.js
python3 -m compileall -q openrf
bash -n tools/setup-valhalla-wsl.sh
```

Mock-transport tests exercise strict port paths and UTF-8 message bounds, no sending while disconnected/relay-focused, radio-text provenance, bound inbox and disconnect cleanup, same-origin HTTP checks, real-status static assets and submitted-vs-delivered receipts. The JS contract verifies that background map clicks do not open observation forms, the map + remains wired, the new UI is present and decoded messages are displayed as text (not HTML).

## Hardware field verification (pending)

1. Connect a compatible Meshtastic radio running supported firmware to a visible Linux USB serial port. WSL may require explicit USB passthrough from Windows; on Raspberry Pi OS verify serial permissions.
2. Install the optional Python `meshtastic` package in the environment running OpenRF. In the radio's own configuration utility, select the appropriate local legal region/channel and ordinary CLIENT role. Never assume the device is configured based only on USB detection.
3. Radio → LoRa mesh messaging → Refresh → select device → Connect USB node. Observe connected status without claiming RF coverage.
4. From a second independently configured node on the same mesh, send a short message and confirm OpenRF receives it. Send a small broadcast, then a direct message, checking the second node for actual receipt/ACK; OpenRF itself says only submitted-to-radio until then.
5. Set Relay-focused and confirm OpenRF refuses to send, then test whether the firmware relays third-party traffic using *three* positioned radios; software status alone cannot verify forwarding. Return to Normal and disconnect. Check that the in-memory text log is cleared.
6. Click an empty vector map, then an empty raster fallback map: neither should open the observation dialog. Press + to open it deliberately. Ensure destination picking still selects a map point.

## Limitations

No physical Meshtastic radio, legal RF spectrum test, over-the-air delivery, real repeater deployment, Raspberry Pi device, WSL USB passthrough or live browser GPS drive has been verified in this environment. The Meshtastic Python SDK is optional and was not connected to hardware in these tests; no message is fake or preloaded into a live inbox. The obsolete REPEATER firmware role is intentionally not configured.
