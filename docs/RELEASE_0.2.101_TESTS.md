# OpenRF v0.2.101 — Field networking and offline navigation foundations

This release progresses two workstreams without requiring new hardware or opening the development API to nearby devices.

## Network foundation

1. Go to **Hardware → Field network · gateway foundation**.
2. Select a proposed role, such as **Two-radio gateway** or **Local Wi-Fi hotspot**.
3. Choose **Inspect Linux network capability**. Ordinary Wi-Fi and recognized HaLow driver interfaces are listed separately. When available, a bounded read-only `iw phy PHY info` query exposes only summarized Linux AP/station capability flags; it does not connect or scan. If no compatible Linux-visible wireless hardware is present, all modes remain unconfirmed.
4. Changing the planned mode changes only explanatory text. There is **no Start hotspot/Enable bridge** action in this release. The existing HaLow diagnostics and Reticulum opt-in remain independent.

Supported Linux driver mode reporting is evidence of a *possible* network role, not proof that WPA encryption, simultaneous AP/station operation, a usable 802.11ah RF link, DHCP, routing, multicast, peer reachability or actual bridging works. Off-grid phones require ordinary Wi-Fi on the OpenRF box; they cannot directly join HaLow with a conventional handset radio. Do not expose the current unauthenticated loopback-only API to a LAN while prototyping a hotspot.

## Offline GPS/navigation readiness

1. Open **Map**, expand **Offline navigation readiness** beneath Map settings.
2. Click **Check offline readiness**. The report is user-triggered, uses a **loopback-only Valhalla status request**, and reads local vector and imported raster map metadata. It does not request browser location or open gpsd.
3. Check that the report distinguishes **Valhalla reachable** from **local vector visual tiles available** and **raster tile packages installed**. A map being visible offline cannot establish the separate Valhalla graph's road coverage; plan a real route to verify your specific origin and destination.
4. If Valhalla is not running, refer to `docs/LOCAL_VALHALLA_WSL.md` and `docs/VALHALLA_ROUTING_REGIONS.md`. Neither guide changes the current data automatically.

## Installation

Save the full `OpenRF-v0.2.101.zip` to Windows Downloads and invoke the existing updater in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

In Ubuntu, stop the existing server with Ctrl+C and restart:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Tests:

```bash
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || break; done
```

## Modified and added files

- `openrf/field_network.py`: passive Linux dual-radio/capability evidence
- `openrf/offline_navigation_readiness.py`: truthful routing-versus-map preflight
- `openrf/server.py`: two new loopback GET endpoints and local static resources
- `openrf/static/index.html`, `openrf/static/app.css`, `openrf/static/field_network.js`, `openrf/static/offline_readiness.js`: compact 5-inch-compatible UI
- `openrf/__init__.py`, root manifest, `README.md`, `CHANGELOG.md`, deterministic tests and this document

## Hardware and security limits

This release was tested using simulated Linux PHY and HaLow driver observations, not a physical HaLow adapter, Raspberry Pi AP firmware, real point-to-point network or working GNSS. Actual gateway activation, authentication, WPA settings, interface isolation, DHCP/IPv4 and IPv6 routing, Reticulum transport forwarding, radio region compliance, dual-radio power budgeting and field link tests remain planned work. GitHub CI and end-user installation are not claimed complete from local tests.

Relevant primary documentation: [Linux cfg80211 wireless interface modes](https://docs.kernel.org/driver-api/80211/cfg80211.html), [Reticulum AutoInterface](https://reticulum.network/manual/interfaces.html), [local Valhalla setup](LOCAL_VALHALLA_WSL.md).
