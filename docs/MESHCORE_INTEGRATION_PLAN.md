# MeshCore as a third, independent OpenRF messaging transport

**Status: independent USB Companion messaging foundation implemented in v0.2.166; physical hardware testing remains outstanding.**

OpenRF provides separate Meshtastic, Reticulum/LXMF and MeshCore workflows. MeshCore is another LoRa messaging protocol; it is not a protocol option for an already-running Meshtastic or RNode node. Its current integration uses the external optional official `meshcore` Python Companion SDK for USB serial, never forwards between networks, and does not open or transmit without user action. Firmware/range/device compatibility have not been physically verified.

## Portable Raspberry Pi hardware

- Select one **supported LoRa device flashed with MeshCore USB Serial Companion firmware** and connect it to the Pi using USB. A compatible Heltec SX1262-based board is a candidate; check the current MeshCore flasher's exact board and regional firmware before buying or flashing. The radio needs a correctly tuned antenna, legal local frequencies and appropriate power settings.
- One physical LoRa board generally runs one firmware role at a time; do not assume a single Meshtastic-flashed board can simultaneously serve the MeshCore and Reticulum/RNode transports. For simultaneous use, budget separate compatible boards/radio interfaces. A dedicated board can be re-flashed to switch protocols, but not used across them concurrently.
- WSL may not expose attached USB/BLE radio hardware without explicit USB passthrough. Raspberry Pi OS will eventually need permission checks for the selected serial device and exclusive port ownership. Never auto-open, scan or transmit on an unselected device.

## Implemented in v0.2.166

1. **Read-only inventory:** Linux `/dev/ttyUSB*` and `/dev/ttyACM*` ports are labeled as unverified candidates. USB port listing is not a MeshCore firmware probe. SDK detection does not import the package or open a device.
2. **Explicit USB transport:** The optional `meshcore` SDK is loaded only after Connect. An isolated asyncio thread drives `MeshCore.create_serial()`, reads radio contacts, fetches pending radio text after connection, observes ACK events, and closes on Disconnect or server exit. No advertise, channel change, power setting, forwarding, or automatic connection is requested by OpenRF.
3. **Direct messaging:** Select a stored radio contact and send a short direct text (maximum 120 UTF-8 bytes). Incoming prefixes match only uniquely identified radio contacts. Unknown senders appear as read-only conversations, not fabricated contacts. Outgoing rows show either submitted to radio (ACK unconfirmed) or a matching network ACK received; neither proves a human read the message. A radio submission error does not claim delivered or encourage blind retry.
4. **Privacy and conflict checks:** Up to 200 messages live only in process memory; no opt-in disk history in this first patch. The loopback API checks against active Meshtastic and Reticulum RNode serial claims and serializes concurrent Connect attempts. Background browser polls are read-only; no protocol bridge or unsolicited RF transmission.
5. **Touchscreen inbox:** New MeshCore page under Messages, contact list, direct conversation bubbles, oldest at top, scroll-to-newest on open, follow new messages only near bottom, manual unread marking, and offline-capable local assets.

## Next phases (requires real Companion radio tests)

1. **Field tests:** Two independent MeshCore Companion radios with legal regional frequencies/antennas; check SDK event payload formats, direct message reception, ACK timing, reconnect behavior, contacts refresh, and USB permissions.
2. **Metadata:** Validate on-hardware firmware version, contact discovery behavior, timestamp clocks, and trustworthy source metadata. Preserve source-side timestamps only when independently defined and available.
3. **Storage:** Add a separately controlled, explicitly opt-in private SQLite history/erase feature after real message lifecycle tests. Never silently share with Meshtastic or LXMF history.
4. **Optional enhancements:** Device battery/status and detailed radio diagnostic counters if reported; contacts management, message expiry, and narrow retry controls. Consider an opt-in unified view only with clearly labeled protocols and no cross-protocol forwarding.

## Primary sources

- MeshCore firmware and companion roles: https://github.com/meshcore-dev/MeshCore
- Python official Companion SDK, `pip install meshcore` (MIT): https://github.com/meshcore-dev/meshcore_py
- Official MeshCore CLI, supporting BLE/TCP/USB serial and companion firmware selection: https://github.com/meshcore-dev/meshcore-cli
- MeshCore JavaScript companion library and serial connection examples: https://github.com/meshcore-dev/meshcore.js
- Device/firmware compatibility and flasher: https://meshcore.io/flasher
