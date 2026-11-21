# MeshCore as a third, independent OpenRF messaging transport

**Status: planned only; not implemented in v0.2.165.**

OpenRF currently provides separate Meshtastic and Reticulum/LXMF workflows. MeshCore is another LoRa messaging protocol; it is not a protocol option for an already-running Meshtastic or RNode node. We can give it its own optional, explicit-enable transport and eventually reconcile inbox views only after independent send/receive, author identity, timestamp, error, and receipt behaviors have been proven.

## Portable Raspberry Pi hardware

- Select one **supported LoRa device flashed with MeshCore USB Serial Companion firmware** and connect it to the Pi using USB. A compatible Heltec SX1262-based board is a candidate; check the current MeshCore flasher's exact board and regional firmware before buying or flashing. The radio needs a correctly tuned antenna, legal local frequencies and appropriate power settings.
- One physical LoRa board generally runs one firmware role at a time; do not assume a single Meshtastic-flashed board can simultaneously serve the MeshCore and Reticulum/RNode transports. For simultaneous use, budget separate compatible boards/radio interfaces. A dedicated board can be re-flashed to switch protocols, but not used across them concurrently.
- WSL may not expose attached USB/BLE radio hardware without explicit USB passthrough. Raspberry Pi OS will eventually need permission checks for the selected serial device and exclusive port ownership. Never auto-open, scan or transmit on an unselected device.

## Incremental implementation proposal

1. **Readiness:** Optional package detection and read-only serial candidate inventory (unsupported vs hardware present vs verified MeshCore firmware); no guessing based on `/dev/ttyUSB*` existence.
2. **Opt-in transport:** An isolated worker using a documented MeshCore companion-radio protocol/client library. Bind exclusively to the selected USB serial endpoint, with explicit Connect / Disconnect and safe cleanup. Do not run one USB port concurrently with Meshtastic or RNode.
3. **Messaging:** Get identity and contacts, receive signed/encrypted messages with genuine sender/time provenance, and implement user-triggered outgoing sends and status mapping. Keep local drafts/history private and clearly distinguish queued, transmitted, acknowledged and unverified states from actual MeshCore firmware reports.
4. **UX integration:** Add a MeshCore entry inside Messages only when an implementation exists, then consider the planned unified Inbox (separate protocols clearly labelled). Never forward a message across Meshtastic, MeshCore, or LXMF automatically, including emergency SOS, without explicit authorization and protocol-aware privacy controls.
5. **Field tests:** Two independent MeshCore companions with matching region/frequencies; check real discovery, messaging, receipt semantics, link reliability, time stamps, reboot recovery, and coexistence with separate Meshtastic/Reticulum modules. Record limits without inventing radio measurements.

## Primary sources

- MeshCore firmware and companion roles: https://github.com/meshcore-dev/MeshCore
- Official MeshCore CLI, supporting BLE/TCP/USB serial and companion firmware selection: https://github.com/meshcore-dev/meshcore-cli
- MeshCore JavaScript companion library and serial connection examples: https://github.com/meshcore-dev/meshcore.js
- Device/firmware compatibility and flasher: https://meshcore.io/flasher
