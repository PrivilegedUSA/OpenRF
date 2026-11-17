# OpenRF v0.2.95 — USB RNode + Reticulum transport groundwork

## What changed

- **Reticulum → RNode / LoRa hardware & relay setup** offers a read-only Linux USB serial candidate list. It does not identify firmware or connect a port merely by opening the page.
- On explicit approval, OpenRF builds an isolated, short-lived RNS configuration adding one USB **RNodeInterface**. Parameters are validated, constrained to user-selected values, and do not change OpenRF's base private config file.
- A second optional checkbox enables RNS `enable_transport = Yes` for actual transport forwarding. The generated RNode configuration uses `No` without that checkbox even if a custom operator config contains `Yes`. No proxy or Meshtastic bridge is created.
- Existing Reticulum AutoInterface, opt-in TCP port 4242, per-contact threads, unread counters, contacts, local-history privacy and independent Meshtastic functionality are preserved.

## Development smoke tests

```sh
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || exit 1; done
```

## Real hardware verification when an RNode is available

1. Attach an RNode board running actual **RNode firmware**, with an antenna compatible with its hardware band. Check allowed frequencies, powers and airtime for your jurisdiction. Do not assume a generic SX1262/Meshtastic radio accepts RNode protocol.
2. Check `/dev/ttyUSB*` or `/dev/ttyACM*` inside the *same Linux environment* as OpenRF. For WSL you may need `usbipd` passthrough; user and group permissions should allow access without broad `chmod 666`.
3. **Stop Meshtastic** if it has claimed the same physical port. Open the Reticulum page, expand the RNode setup, and **Check USB ports**. Inspect candidate and permission hints; note that no device was probed.
4. Choose the USB port and appropriate frequency, bandwidth, power, SF and coding rate agreed by both RNode nodes. The prefilled 915 MHz profile is a convenience example, not a hardware/legal verification.
5. Check **Add selected USB RNode**, press **Enable LAN messaging**, read the RF warning, and approve only if ready. The worker may configure and transmit through the radio. Open **Connection diagnostics** to see actual RNS-reported interface status and traffic. A counter/announce is **not** proof of delivery.
6. For a deliberate fixed relay node, stop Reticulum, then also check **Enable Reticulum transport forwarding**, approve both warnings, and measure actual operation with cooperating endpoints. Avoid uncontrolled repeated transmitting or needless high-traffic setups. **Stop Reticulum** when finished.
7. Confirm LXMF messages both ways with distinct identities, and ensure the retained inbox/read badges behave normally. Neither a sender queue acknowledgment nor a matching port name establishes on-air receipt.

## Limits and future work

- No physical RNode/915 MHz link, relay forwarding, HaLow (802.11ah), BATMAN-adv mesh or Pi USB/touch field test was possible in this development workspace. The app does **not** identify attached RNode firmware, channel peers, antenna suitability or the legality of the user-entered radio values.
- One RNode serial interface per OpenRF worker for now. Additional transceivers, RNodeMultiInterface, Wi-Fi/BLE RNode transports, multi-radio coordination, channel planning, airtime settings, and HaLow are separate follow-on changes; avoid assuming any of those are already implemented.
- OpenRF does not turn Meshtastic CLIENT devices into RNode radios, and does not alter Meshtastic firmware roles or bridge its messages to Reticulum.
- Optional Linux `rns`/`lxmf` packages are still needed to start Reticulum. The local OpenRF HTTP API remains loopback-only. No new migrations or required network service are introduced.
