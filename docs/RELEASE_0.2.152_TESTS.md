# OpenRF v0.2.152 — Wi-Fi quick connect and desktop packaging groundwork

## Complete source bundle and installation

`OpenRF-v0.2.152.zip` contains only a top-level `openrf-bundle.json` and `project/`; the manifest is:

```json
{"project":"OpenRF","formatVersion":1,"version":"0.2.152"}
```

Save the whole ZIP in Windows Downloads and run the existing updater from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

For the ordinary browser version, stop an old Ubuntu process with Ctrl+C and start:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

For native Electron, if the existing server is stopped, v0.2.152 can now launch the Python service itself:

```bash
cd /mnt/c/projects/OpenRF/tools/openrf-electron
OPENRF_URL=http://127.0.0.1:8765/ npm start
```

This presumes that Electron was already installed in that folder. Do not leave an older server bound to 8765; the new shell intentionally refuses mismatched versions. The Windows updater, user data, Git metadata and signing credentials remain **outside** the managed `project/` source ZIP. These commands are instructions only; they do not prove installation, GitHub push or CI success.

## Implementation changes

- `openrf/wifi_connect.py`: honest `/sys/class/net` adapter + NetworkManager readiness; user-triggered bounded list; descriptive quality/security; explicitly requested connection with validated SSID and passphrase passed via `nmcli --ask` stdin, not an argument or OpenRF save. WSL built-in Windows Wi-Fi does not appear as managed Linux hardware. WEP, enterprise/EAP and hidden Wi-Fi are not supported by this first panel.
- `openrf/server.py`: guarded `GET /api/network/wifi/status`, `POST /api/network/wifi/scan`, `POST /api/network/wifi/connect`. Existing Host and Origin checks apply; POST requires `X-OpenRF-Wifi-Consent` and one-at-a-time lock. No GPS, RF history or scan receipt is saved. The static `wifi-quick.js` asset is explicitly allowlisted so its click handlers load after installation. Handles Electron-owned SIGTERM with graceful HTTP shutdown.
- `openrf/static/{index.html,app.css,wifi-quick.js}`: Wi-Fi icon next to Messages, responsive popover with real connection state, explicit scan/list and network selection, password field/clearance, clear unsupported states. The map, menu and emergency controls remain in their previous positions. A simple read-only readiness check runs at startup; the app never scans or connects without a click.
- `tools/openrf-electron/{backend.js,main.js,package.json}`: attach to a compatible existing loopback service, or start/stop an owned Python process. Debian build metadata includes icon, app resources and separate x64/ARM64 build scripts. This is only the **build preparation**, not a prebuilt tested installer. See `docs/NATIVE_BROWSER_PI.md`.
- `README.md`, `CHANGELOG.md`, release notes and version markers updated. No SQLite schema migration or new required Python package.

## Automated verification

- `python3 -m unittest discover -s tests -p 'test_*.py' -q`: **427 Python tests passed** (including five new quick-connect cases).
- All **122 JavaScript test files** ran successfully, including native backend spawn/attach/stop checks, Wi-Fi panel click flow, password clearance, browser tab persistence and map/emergency layout contracts.
- `node --check` validated modified JavaScript sources. Linux source ZIP root manifest and file layout are verified before delivery.
- New tests exercise no-visible-adapter WSL fallback, NetworkManager scan parsing, security labels, secret-free subprocess argv/errors, explicit user confirmation and Origin-safe HTTP operations. Hardware/GUI behavior is not represented by mocks.

## Manual acceptance at 1280×800

1. Confirm the Wi-Fi glyph appears between Emergency and Messages at the top-right, both on the Map overlay and on normal pages. Open/close it and confirm it does not push content or replace the page header.
2. In WSL without a Linux-visible Wi-Fi adapter, the icon should say Wi-Fi is unavailable and explain why. **This is expected**; Windows Wi-Fi connections remain managed by Windows.
3. On an actual compatible Linux/Raspberry Pi NetworkManager Wi-Fi adapter, tap the icon → **Find nearby networks** and inspect the real, potentially cached list. A network must be explicitly selected, then joined by the separate **Connect** action. Wrong passwords and unsupported security types should not claim success. Joining a network can briefly interrupt internet connectivity.
4. Click away, press Escape, or close the panel and confirm any typed password is cleared. Open it again; no password should be retained in OpenRF.
5. With the older OpenRF server stopped, start Electron only and confirm it launches the 0.2.152 Python backend. Quit Electron and ensure its owned child exits. If an already-running 0.2.152 backend is present, the shell should attach without stopping that external process when closed.
6. Test Map, Trips & Maps, Web Browser tabs, Emergency tabs, Radio Receiver, Saved, and Settings for unexpected layout or source regressions.

## Known limitations and next work

- Actual NetworkManager connectivity, authentication agent/polkit behavior, 7-inch touchscreen popover geometry and Wi-Fi loss/reconnection on Pi hardware have **not** been tested. Linux Wi-Fi survey records are still observations; quick-connect network names are connectivity metadata only.
- Electron startup/cleanup is source-tested, but the complete Linux `.deb` is **not built, installed or hardware-validated** in this release. Chromium/electron-builder still need a build-time download; final dependency metadata, upgrade/uninstall semantics, launcher icon and ARM64 graphics require real Linux verification. Python 3.11+ remains an operating-system dependency.
- A connection reported by NetworkManager is not a verified Internet link. Wi-Fi/BLE/SDR hardware coverage, GPS, power/battery hardware and local Valhalla graph completeness remain unverified until field testing.
- **Suggested v0.2.153:** validate/install a real `amd64` `.deb` in WSLg or Linux desktop, fix any launcher/desktop/menu issues, then prepare the native `arm64` package and a Pi touchscreen/hardware acceptance checklist. Longer-term work includes a supported system Wi-Fi settings fallback for enterprise/hidden networks and offline route/map coverage auditing.
