# OpenRF v0.2.96 — Two USB RNodes and local Reticulum traffic counters

## Changed behavior

- **Messages → Reticulum → RNode / LoRa hardware & relay setup** now includes **Add a second, separate USB RNode**, initially unchecked and disabled until the first RNode is enabled. Choose a second visible Linux serial endpoint; use a radio with compatible RNode firmware and a suitable antenna.
- Each port has independent frequency, bandwidth, power, spreading factor, and coding rate controls. The backend accepts a new strictly validated `rnodes` array of one or two items, and retains the earlier `rnode` object for single-radio clients. It rejects duplicate ports, malformed paths and unsupported field values before any RNS startup or data-folder creation.
- For two radios, the private generated configuration has two separate `RNodeInterface` sections. This is **not** `RNodeMultiInterface` for a single multi-transceiver board; support for that remains later work. Neither original RNS config nor saved LXMF identity is overwritten.
- When Reticulum is manually enabled, its **Connection diagnostics** can show actual locally reported interface peer/client counters and TX/RX byte totals. Repeated Refresh details displays exact counter increases since the previous reading (if valid). It never infers RF signal quality, distance, path reachability, proof of peer reception or successful message delivery. Stopped/failed/missing/reset counters yield a fresh baseline.

## Automated tests

```bash
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || exit 1; done
```

## Hardware walkthrough (future physical validation)

1. Obtain two **separate** RNode-firmware LoRa transceivers and verify each one's hardware band, antenna and permitted transmission rules. A radio merely exposing `/dev/ttyUSB#` is not proven to be an RNode.
2. Connect both to the Raspberry Pi or pass through both USB devices into Ubuntu WSL. On the Reticulum page use **Check USB ports** and confirm you have **two different** Linux serial ports with usable permissions.
3. Leave Meshtastic disconnected from those ports. Enable the first USB RNode and select its actual port and appropriately agreed network/radio settings. Add a second only if you have another RNode. Choose its other port and radio settings.
4. Press **Enable LAN messaging**, review the warning and confirm only if you are ready for the selected radios to be configured and to transmit an LXMF announcement. The second-radio checkbox does not itself start radio activity.
5. If operating a deliberate transport node, select **Enable Reticulum transport forwarding / relay** before starting and confirm its separate warning. It can forward traffic on both radios and other configured interfaces; measure real results with cooperating peers and comply with frequency/airtime rules.
6. Open **Connection diagnostics**. Refresh twice to see local counter increases when the RNS backend reports them. Restart or disconnect a device and ensure stale/reset values are not shown as a link measurement. Check real LXMF messages on a separate peer; OpenRF cannot derive peer delivery from a TX counter.
7. Press **Stop Reticulum** to close the child process and its managed radio interfaces.

## Limits

- No two-RNode USB/over-the-air test was available here; the Python and JavaScript tests are synthetic and isolated. Raspberry Pi, firmware, regional legality, antennas and actual relay behavior are not verified.
- RNS `status: UP` only reports a local interface state; it does not mean an RF path to another person exists. Byte counts do not provide signal strength or bit-error rates.
- Wi-Fi HaLow and BATMAN-adv are still unimplemented; there is no bridge between Meshtastic and Reticulum, no automatic sharing of location or GPS data, and no new background network traffic.
