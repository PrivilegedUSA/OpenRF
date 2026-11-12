# OpenRF v0.2.38 — Linux Wi-Fi metadata, Bluetooth readiness and map settings

## Install and restart

1. Download `OpenRF-v0.2.38.zip` to Windows Downloads. Stop old Python server with Ctrl+C; leave the Valhalla Docker container alone.
2. In Windows PowerShell from any directory:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`

   The updater performs backups, local tests, Git operations and pushes by default (unless user uses `-NoPush`); running it is the user's action, never claimed by the release.
3. In Ubuntu WSL run `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Browse to `http://127.0.0.1:8765/`, hard refresh with Ctrl+Shift+R.

## Map settings UX regression

1. On Survey Map verify the compact gear is in the **bottom-right cluster** beside plus and Layers and lower-left map attribution remains visible.
2. Tap gear. Verify the gear does not move or become the close button; popup opens upward and has an **X** in top-right.
3. Tap X; gear stays in place. Reopen and hit Escape; should close. Verify MapTiler key status, online address preference and native map functions are unchanged.
4. Check 5-inch (800×480 or ~458 CSS px) viewport. The popup must not obscure lower-left credits or remove map controls. These browser interactions require field validation in Firefox.

## Wireless discovery tests

1. In WSL without a Linux-visible Wi-Fi radio, the scan must report unavailable. Windows built-in Wi-Fi is not a Linux monitor/scan adapter in normal WSL. Never show DEMO as live.
2. With a compatible managed Wi-Fi adapter visible to Linux, run a user-triggered one-shot scan on Analysis. Scan list includes band (from actual MHz), mode and advertised AP rate if supplied by nmcli, quality **%** not calibrated dBm. Filter by band, SSID/BSSID; click Save only for a real scan receipt. No invented transmitter location.
3. Hardware inventory shows Linux Bluetooth controller count, BlueZ readiness, and BLE scanning **not implemented**; no `bluetoothctl scan`, pairing or addresses collected by readiness.
4. Run USB serial probe then immediate snapshot on an authorized OpenRF Serial v1 test device, if available; no erroneous overlapping-request 409 after receiving probe HTTP success.

## Tests and limits

`python3 -m compileall -q openrf`

`python3 -m unittest discover -s tests -q`

`for test_file in tests/*.js; do node "$test_file"; done`

`bash -n tools/setup-valhalla-wsl.sh`

- Hardware tests use mocked Linux adapter output; no physical Wi-Fi, BLE, SDR or Raspberry Pi was tested here. WSL may have no compatible RF adapter.
- No guarantee GitHub CI succeeds until the user checks a fresh GitHub Actions run. Serial lock release ordering is covered by existing local API tests.
- No additional required Python dependency, database migration, online API, account or automatic location collection.
- OpenRF is offline-first with local HTTP bound to loopback; do not expose the dev service to LAN/internet. No GPS, RF or credentials are committed into release ZIP.
