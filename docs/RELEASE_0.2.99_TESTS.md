# OpenRF v0.2.99 — HaLow Reticulum AutoInterface selection

## What is implemented

- Read-only Linux candidate-driver detection from v0.2.98 plus kernel `/proc/net/if_inet6` inspection for an IPv6 link-local **presence** boolean (not the address itself).
- A candidate must be associated with a known HaLow driver name, Linux interface state `up`, no explicit carrier `0`, and link-local IPv6 present to become **eligible for manual Reticulum selection**. These criteria are conservative prerequisites, not a link test.
- Optional HaLow device picker and confirmation under **Messages → Reticulum**. When selected, the app passes a validated interface name (no arbitrary strings/paths) to the existing Reticulum start endpoint. A server-side one-shot readiness check rejects an ineligible device before any child process is launched.
- The generated Reticulum runtime config inserts `devices = <Linux interface>` into **only** OpenRF's managed AutoInterface block. The original private RNS configuration is not overwritten; when the option is off, default LAN AutoInterface behavior remains as before. TCP listening and RNode/forwarding remain separate options.

Reticulum's official [AutoInterface documentation](https://reticulum.network/manual/interfaces.html) describes IPv6 link-local discovery, UDP data transport and device filtering via `devices`. This version does **not** test remote peers, authorize or configure HaLow spectrum, install firmware, or create an IP mesh. A working HaLow link requires separate compatible hardware, vendor firmware and correct Raspberry Pi OS setup.

## Test commands

```sh
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || exit 1; done
```

Focused tests: `tests/test_reticulum_halow_v099.py` and `tests/test_reticulum_halow_v099.js`. They cover missing/valid IPv6, down/absent carrier, no network information leakage, invalid/injected names, immutable original private settings, constrained AutoInterface, untouched RNode/TCP defaults, forwarding consent and a refused 409 HTTP start with no hardware. Tests use fake Linux sysfs/loopback HTTP, not a physical HaLow RF device.

## Manual verification with future hardware

1. Install v0.2.99, restart OpenRF and open **Hardware → Wi-Fi HaLow**. With no genuine Linux-visible hardware, it should show no eligible interface, and **Messages → Reticulum → Wi-Fi HaLow IP link** should offer none. Nothing connects or transmits on opening either panel.
2. Configure a suitable 802.11ah module with its **exact** vendor kernel driver, firmware, calibrated board files and permitted regional channel settings *outside* OpenRF. Verify Linux sees a network interface and independently test lawful network connectivity using the vendor documentation.
3. Check that the interface appears with IPv6 link-local, OS up and eligible-for-opt-in indicators. A selected interface must still be marked **RF/peer unverified** until independently tested on actual radios.
4. Choose the HaLow interface under Reticulum, confirm the multicast/UDP warning, then manually start Reticulum. Check RNS interface diagnostics; do not equate an RNS `UP` indication with successful LXMF delivery. Repeat with two known, authorized peers before declaring this verified.
5. Stop Reticulum and ensure the worker closes and saved contacts/history remain. Confirm TCP remains off unless separately selected; do not expose OpenRF's local HTTP API to the LAN.

## Limits

- Vendor driver aliases can differ; no hardware is considered verified merely from its name or from a USB descriptor. The selected interface can disappear between preflight and actual RNS startup; Reticulum's own network diagnostics and real-device testing are still necessary.
- The optional TCP listener (if separately enabled) is **not** bound by the HaLow AutoInterface device selector. Do not choose TCP expecting a HaLow-only listener.
- This release does not configure firmware, join HaLow stations/APs, test UDP multicast, set firewall rules, perform scans, add BATMAN-adv or transfer messages between Meshtastic and Reticulum.
- No new mandatory Python package, database migration, account, cloud sync or automatic RF/network activity.
