# OpenRF portable Raspberry Pi hardware shopping plan (November 2026)

OpenRF is currently a Linux app that runs in WSL. **You do not need any physical parts to continue developing or testing its mapping, database, exports, UI and analysis code.** An actual RF receiver is required for live data from its corresponding band, and software integration for each receiver is not yet implemented. Buy in stages and test each component on the bench before enclosing it.

## Stage 1 — Minimum viable touchscreen computer (buy first)

| Part | Proposed item | Planning cost (USD) | Notes |
|---|---|---:|---|
| Computer | Raspberry Pi 5, 4 GB RAM | $110 list | Quad-core A76, 2× USB 3, 2× USB 2, GPIO, built-in Wi-Fi/BLE. 4GB is a sensible baseline; the 2GB version may also work but has less headroom. |
| Display | Official Raspberry Pi Touch Display 2, **5-inch** | $40 list | 720×1280 touch; includes cables and mounting hardware. Check screen orientation before building a case. |
| Reliable desk power | Official Raspberry Pi 27W USB-C supply (5.1 V/5 A) | ~$12–18 estimated | Adequate Pi power under load; not a battery. Avoid generic low-current phone chargers. |
| Cooling | Official Raspberry Pi 5 Active Cooler | ~$5–12 estimated | Recommended for extended work. |
| Boot storage | Quality 64–128 GB microSD, A2 preferred | ~$12–25 estimated | Raspberry Pi OS and local maps/records; use reputable brands, back up local data. |
| Housing for prototyping | Stand-offs or suitable display mount / protective frame | ~$0–20 estimated | A custom 3D-print enclosure can wait until sensors and battery dimensions are known. |

**Stage 1 planning budget:** approximately **$180–225 before tax/shipping**, subject to actual reseller stock. The first two values are Raspberry Pi's published list prices; others are illustrative allowances, not checked shop prices. You can initially connect a keyboard/mouse for setup if needed; Raspberry Pi OS supports an on-screen keyboard.

**Useful official references:**
- Raspberry Pi 5 specs and prices: https://pip-assets.raspberrypi.com/categories/892-raspberry-pi-5/documents/RP-008348-DS-10-raspberry-pi-5-product-brief.pdf
- 5-inch Touch Display 2 connection and supplied cables: https://www.raspberrypi.com/documentation/accessories/touch-display-2.html
- 27W power supply: https://www.raspberrypi.com/products/27w-power-supply/

## Stage 2 — First genuinely useful RF field sensors (buy after first Pi bench test)

| Part | Candidate | Planning cost | Why / caveat |
|---|---|---:|---|
| Dual-band Linux Wi-Fi | **ALFA AWUS036ACM**, MT7612U chipset | ~$40–65 | Manufacturer documents in-kernel Linux `mt76` support for this adapter; suitable for permitted discovery/monitoring experiments. USB 3; not Wi-Fi 6/6E. Verify actual unit/chipset and current Pi OS support. |
| General SDR receive | Genuine **RTL-SDR Blog V3** or verified **V4L Lite** kit with antennas | ~$35–60 | Broad sub-2GHz reception, but **not** a 2.4/5GHz or police-radar receiver. V4 is discontinued, so do not buy a supposed cheap V4 from an unknown marketplace seller. Read V4L driver notes before choosing. |
| USB GPS/GNSS | Linux-compatible USB GNSS receiver exposing serial/NMEA | ~$20–45 | Real field coordinates; verify chipset, Linux serial/NMEA behavior, fix age and accuracy availability. Outdoors matters. |
| Powered USB hub | Reputable USB 3 hub with its **own power supply** | ~$25–50 | Keeps SDR / Wi-Fi / GNSS peripherals from overloading Pi USB power. Check hub current supply and cables. |

**Stage 2 planning budget:** about **$120–220 additional**, not essential for launching OpenRF. Start with **one** receiver, verify Linux detection and useful data, then expand.

Manufacturer references:
- ALFA MT7612U compatibility: https://docs.alfa.com.tw/Support/Linux/MT7612U/
- RTL-SDR genuine sellers and V4 end-of-line: https://www.rtl-sdr.com/GENUINE/
- RTL-SDR V4L release: https://www.rtl-sdr.com/rtl-sdr-blog-v4l-lite-now-available-for-purchase/

## Stage 3 — Portable build and advanced expansions (wait)

| Part | Why postpone |
|---|---|
| 5V/5A-capable battery/UPS power solution and power measurement | Pi 5 + display + several USB receivers can have substantial draw; not all USB-C PD power banks provide the Pi's required 5V/5A profile. Design based on measured power, safe shutdown, and verified electrical compatibility. |
| 3D-printed case, antenna mounts, short cables, vents and thermal design | Enclosure sizing depends on chosen hub, antennas, sensor locations and battery. |
| ESP32-S3 module | Later supplementary 2.4GHz Wi-Fi/BLE sensor firmware and USB/UART bridging; built-in Pi BLE can be the first BLE test path. |
| CC1101 + suitable band-specific antenna | Optional sub-GHz passive work; authorized operation only if transmit functions are ever added. Not a universal RF or garage-door solution. |
| NFC/IR hardware | Later specific interface and sensor modules, not required for RF mapping. |
| Compatible 4G/5G modem with documented measurement APIs | Optional and often costly. Generic modem connectivity is not advanced radio diagnostics; 5G signal power does not reveal a precise tower distance. |
| HackRF / microwave radar or optical modules | More expensive/specialized; evaluate only when a defined measurement goal needs the capability. |

## Buy-order recommendation

1. **Keep developing on WSL** until we have sensor drivers to use.
2. Buy **Pi 5 + 5-inch display + PSU + cooler + microSD** for bench testing.
3. Bring up OpenRF on real Raspberry Pi OS; verify touchscreen, power and data persistence.
4. Add **one** compatible Wi-Fi adapter, then a genuine SDR, then GNSS as drivers arrive.
5. Design and power-test the portable battery case last.

No purchases or compatibility tests have been carried out by OpenRF yet. This document is a provisional bill of materials and should be re-priced against official sellers when ready to order. No hardware can receive *every* RF band; the Pi alone cannot measure specialized microwave radar or full cellular air-interface data.


## Must-have future module: long-range police radar receiver (not purchased)

OpenRF must eventually integrate a lawful **receive-only** radar detector subsystem for X/K/Ka, with separately supported laser/LIDAR optical receiving as feasible. This requires **specialized microwave/optical hardware**; no existing ESP32/RTL-SDR/HackRF accessory in this plan can directly cover all police radar bands. Evaluate a tested high-sensitivity commercial detector with an accessible documented output before building custom RF front ends. No range, cost, accuracy or availability is verified yet. See [radar receiver roadmap](RADAR_RECEIVER_ROADMAP.md). This remains an unimplemented future feature, not a promised capability of this release.
