# OpenRF v0.2.97 — Mesh connection overview

## Added

- **Hardware → Mesh radio connections** shows independent, read-only status for the Meshtastic USB session, explicitly started Reticulum worker/RNode ports, Linux serial-node accessibility, and RNS-reported counters. This panel does not start or query a radio's firmware; it reads local process/OS data only.
- `GET /api/mesh/connections` returns the evidence-limited snapshot. It does not return message contents, contact hashes, GPS positions, saved identity keys or USB device serial numbers. An inactive Reticulum service is never started or contacted for RNS diagnostics.
- **Disconnect Meshtastic** and **Stop Reticulum** perform existing API stop actions only after confirmation, and refresh their respective message-page controls. Neither action changes radio firmware settings, enables transport forwarding, creates messages or alters saved history.

## Tests

```sh
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || exit 1; done
```

## Stationary manual UI checks

1. Launch OpenRF with no radio hardware. Open **Hardware → Mesh radio connections**. Verify that neither service starts and no RNode interface or RF peer is claimed. Refreshing should never prompt for hardware access, send anything, or alter the message counter.
2. With hardware that has been separately verified and explicitly connected using **Messages → Mesh messages**, return to Hardware. Verify that the selected Linux USB port is tagged **Meshtastic USB session open** and the RF link remains **unverified**.
3. With RNS/LXMF installed and a verified separate RNode manually started under **Messages → Reticulum**, check the RNode-requested port and RNS-reported interfaces. An interface marked UP or an increasing TX/RX byte counter does not prove remote delivery.
4. From Hardware, use **Disconnect Meshtastic** or **Stop Reticulum**. Cancel the first confirmation; no stop should occur. Confirm a later attempt; the state should switch off, and the separate messaging page should refresh. Contacts and opted-in history should remain.
5. For WSL, make sure the USB device is passed into Ubuntu; Windows USB availability alone is not enough. An endpoint listed as **Not claimed by OpenRF** may still be used by another process.

## Limits

- Live USB radio devices, LoRa links, remote delivery, Raspberry Pi touch/USB behavior, and Wi-Fi HaLow network drivers were not verified here. Tests use fake manager states and a loopback server to check that the overview remains passive and truthful.
- The status panel does not verify a Meshtastic firmware role, RNode firmware or an RF path, cannot identify a person or transmitter, and will not bridge incompatible Meshtastic and Reticulum packets.
