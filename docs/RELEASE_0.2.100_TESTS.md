# OpenRF v0.2.100 — HaLow connection diagnostic

## What's new

**Hardware → Wi-Fi HaLow → Connection diagnostic** provides a deliberately requested local Linux snapshot for interfaces reported by a known HaLow-associated driver. It collects only kernel interface state and cumulative Linux traffic/error counters. If `iw` exists, it runs `iw dev <validated-interface> link` with a two-second deadline; that command reads the OS association state and does **not** scan or initiate a connection. Neither stdout nor stderr is retained or exposed, only one of the fixed statuses "OS reports associated," "not associated," "unavailable," "unsupported," "timeout" or "failed."

The OS may report association even if the wireless vendor driver does not support standard `iw` semantics. **No check here proves an 802.11ah RF connection, another reachable device, IP multicast connectivity, Reticulum forwarding or LXMF delivery.** Network names, BSSIDs/MACs, IPs, position and message contents are never returned. The Linux counters may reflect local protocol traffic, errors or other interfaces layered on the device, and are **not throughput, measured RF strength or message receipt**. No packet, scan, ping, radio configuration, firmware operation, Reticulum worker or privileged command is initiated by this screen.

## Install and test in WSL

1. Save `OpenRF-v0.2.100.zip` to Windows Downloads.
2. In PowerShell, run the existing updater from any directory:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

3. Restart the Python server in Ubuntu (Ctrl+C first if already running):

   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```

4. Open the local OpenRF UI → **Hardware**. With no Linux-visible HaLow adapter, the readiness panel should say no candidate and **Inspect local link** must remain disabled. Windows Wi-Fi appearing in WSL does not satisfy this check.
5. Only on a properly configured Raspberry Pi OS or passed-through compatible Linux adapter, use **Refresh HaLow readiness** and choose the recognized interface. **Inspect local link** shows a timestamp, driver, carrier, IPv6 link-local, optional `iw` association report and kernel totals. Inspect twice to show local **+N** counter changes; a reset/unavailable value must not be misrepresented as progress.
6. Switch to **Messages → Reticulum** only if you also want to manually select the eligible interface in the separate, default-off HaLow AutoInterface section. Do not treat its eligibility or startup as proof of delivery.

## Automated regression checks

```bash
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || break; done
```

Added `test_halow_diagnostics_v100.py` and `test_halow_diagnostics_v100.js` covering validated candidate-only requests, fake sysfs counters, exact unsigned 64-bit values, missing and malformed counter readings, mock associated/not-associated/failed/timeout `iw` results, privacy filtering, HTTP parameter handling, manual button invocation and UI deltas/resets. All older tests remain in the bundle.

## Files changed in this release

- `openrf/halow_diagnostics.py` — new bounded Linux-only diagnostic module
- `openrf/server.py` — one new loopback GET endpoint, `/api/wifi-halow/diagnostics?interface=<name>`
- `openrf/static/index.html`, `openrf/static/wifi_halow.js`, `openrf/static/app.css` — local link check and responsive, privacy-aware results
- `openrf/__init__.py`, root `openrf-bundle.json` — v0.2.100
- `README.md`, `CHANGELOG.md`, `docs/RELEASE_0.2.100_TESTS.md`, new and version-pinned Python/JS tests

## Still to verify

No physical Wi-Fi HaLow card or Pi OS driver was available for this build. Actual 802.11ah station/AP operation, vendor driver compatibility, IPv6 multicast, Reticulum AutoInterface peer discovery, and LXMF message delivery require operator-provided hardware and controlled tests. GitHub push and CI results are **not** implied by packaging or local tests.

References: Linux [iw link inspection](https://wireless.docs.kernel.org/en/latest/en/users/documentation/iw.html) and [kernel interface counters](https://docs.kernel.org/networking/statistics.html).
