# OpenRF v0.2.98 — Wi-Fi HaLow driver readiness

## Scope

This is **preparation for physical 802.11ah networking**, not an implemented HaLow station, AP, sniffer, packet bridge or Mesh/Reticulum transport. `GET /api/wifi-halow/status` reads Linux sysfs/USB descriptors and looks for known driver-name hints (`morse`, `nrc`) and vendor-specific USB product descriptions. The app neither invokes `iw`/vendor utilities nor opens a USB network interface to determine status; presence of those utilities is informational only. The Hardware UI refreshes this GET when opened or when the user chooses Refresh.

Possible results: `candidate_interface_visible`, `candidate_usb_visible`, `driver_module_only`, `not_visible_in_wsl`, `no_halow_evidence`. **None means linked, connected, transmitting, mesh-ready, location-verified or internet-capable.** A driver may expose an interface without association, and Linux carrier/UP is not an 802.11ah proof. The UI does not reveal SSIDs, peer MACs, USB serial numbers, locations or message contents. Hardware-specific support is left to the vendor.

## Automated tests

```sh
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || exit 1; done
```

Additional deterministic coverage in `tests/test_wifi_halow_v098.py` and `.js`:

1. A generic `wlan0` or Ethernet adapter is not treated as a HaLow radio.
2. An interface with Morse Micro sysfs driver, OS UP and carrier remains **unverified** for radio, IP and Reticulum.
3. Loaded Newracom `nrc` module without an interface is a driver-only hint.
4. Matching USB product descriptors do not leak serials or imply firmware/operational state.
5. Empty WSL Linux sysfs provides a USB-passthrough/Pi guidance state.
6. Local HTTP API/static JS work; Hardware open/explicit Refresh issues only a GET and no connection/POST.

## Manual checks on the user's WSL/Pi installation

1. Update using the complete v0.2.98 ZIP, restart Ubuntu OpenRF, open **Hardware → Wi-Fi HaLow · 802.11ah**. With no adapter passed through, it must report no evidence (or WSL limitation), not a connected radio.
2. Expand **Hardware bring-up checklist**: steps should be legible on a 5-inch touchscreen, with no horizontal scroll.
3. Click Refresh. Verify no popup, radio connect, AP join, server port change or automatic Reticulum worker startup. Existing Meshtastic/Reticulum connections and unread badges should be unchanged.
4. On an actual compatible Raspberry Pi vendor-driver installation **only when available**, verify a candidate interface and verify OS state remains clearly labeled as unverified. Avoid connecting to unauthorized networks. Use vendor instructions for matching board data, kernel, firmware, antenna and legal region.
5. On a manually configured authorized HaLow IP link in the future, verify IP reachability independently before evaluating Reticulum transport. This release **does not** test or initiate that link.

## Known limits

- The Linux kernel may expose a different module/driver alias for a real HaLow device, so candidates may be missed. Explicitly prefer honest unknown states to guessing based on network band or a generic wireless interface.
- No Raspberry Pi 802.11ah radio, licensed/regulatory compatibility, firmware, throughput, peer reachability, power draw, mesh forwarding or LXMF messaging has been physically validated in this development environment.
- Links to optional vendor documentation need an internet connection. The OpenRF UI and readiness check run offline.
- Reuse existing Python standard library and frontend JS; no SQLite migrations, automatic RF scans, privileged access or new required packages.
