# Optional full in-window browser on Raspberry Pi / Linux

This optional OpenRF shell uses **Electron's Chromium engine and isolated `WebContentsView` tabs** to render external websites inside the Web Browser workspace. It is *not* the standard OpenRF web app's restricted iframe. Since v0.2.152, opening the shell first checks the loopback API, and starts/stops its **own Python backend** if needed. In v0.2.155, inactive embedded browser tabs remain loaded but are explicitly hidden for Chromium background throttling. A second OpenRF shell launch focuses the first window. It does **not** ship an Electron executable in the source ZIP.

## Why use Electron if `localhost:8765` works in Firefox?

**You do not need Electron to run OpenRF.** The Python HTTP/SQLite backend and HTML/CSS/JavaScript application are the same either way. In ordinary development, running `python3 -m openrf` in WSL and opening `http://127.0.0.1:8765/` in Firefox is often simpler and has better integration with Windows browser geolocation. This remains a fully valid test workflow.

Electron is an **optional native Chromium host** that turns the existing local UI into a dedicated resizable/fullscreen desktop window, hosts independent Chromium `WebContentsView` tabs in OpenRF's own Browser workspace, and provides the foundation for a future installable Linux `.deb`. Electron currently exposes GPU/WebGL and OS location differences under Windows WSLg that do not occur in Firefox; testing those differences early matters before deploying to the Raspberry Pi kiosk. A `.deb` installer is still future validation work—not a reason to force Electron into every development/test session.

**Geolocation caveat:** Electron's built-in geolocation service requires an additional Google Geolocation API key and associated billing configuration; we do not bundle one or introduce a required paid service into offline-first OpenRF. Since v0.2.154, Electron does not silently request a browser position on startup. Tapping the map's crosshair explicitly requests a position. When no browser provider is configured, it checks an optional local `gpsd` GNSS receiver once without waiting for a browser timeout; if a provider is configured, it tries browser location first. Without either provider or actual connected GNSS hardware, the map remains manually navigable and reports why it could not recenter. Firefox's OS/browser location support is independent of Electron; GPS permission never proves accuracy.

## Installation (when you have the Raspberry Pi or Linux desktop)

1. Use **64-bit Raspberry Pi OS with a graphical desktop** or a supported Linux desktop. Install Python 3.11+ and Node.js/npm (Node 20+ for this launcher). Electron distributes Linux ARM64 binaries, but the exact Pi OS libraries, display server, GPU stack, memory and touch behavior must be tested on your board.
2. Optional: Launch OpenRF **on loopback only** yourself first:

   ```bash
   cd /path/to/OpenRF/project
   python3 -m openrf
   ```

   In the normal checkout on WSL, use `cd /mnt/c/projects/OpenRF && python3 -m openrf` instead.

3. With Wi-Fi/internet available **once**, install optional Electron dependencies (this downloads a Chromium-based binary):

   ```bash
   cd /path/to/OpenRF/project/tools/openrf-electron
   npm install --no-save electron
   ```

4. Start the shell, whether or not the Python server is already running:

   ```bash
   OPENRF_URL=http://127.0.0.1:8765/ npm start
   ```

   For fullscreen kiosk testing set `OPENRF_KIOSK=1` before `npm start`. The shell will attach to an existing **v0.2.154** OpenRF backend on that port, or start its own copy via `python3 -m openrf` with the packaged/source Python files. On exit it stops **only the process it owns**. If an older OpenRF server is still running on 8765, stop the old server with Ctrl+C before launching the newer shell. Use the actual loopback port reported by OpenRF if it differs from 8765. Never bind OpenRF to a public/LAN interface to make the shell connect.

5. Open **Web Browser** in the shell, enter a public website, press **Go**, then switch tabs. Pages run in their own Chromium surfaces within the OpenRF browser area. The side menu and emergency navigation remain part of OpenRF. **Closing a tab** closes its Chromium surface.

## Security boundaries and limitations

- The trusted OpenRF UI runs only from the configured loopback URL. External pages use other Chromium sessions with Node integration disabled, context isolation, renderer sandboxing and no preload/API bridge. Remote frames cannot directly use the OpenRF SQLite backend. Site permissions, automatic downloads and pop-ups are denied in this early shell. Do not use it to enter sensitive accounts until the Pi build is validated and security-reviewed.
- In-memory remote browsing sessions do not persist logins/cookies across shell restarts. Saved tab addresses and bookmarks still persist in browser-local storage; **remote sites never reload automatically at OpenRF startup**. Navigation history while a native view is open follows actual page visits; standard web-mode history tracks entered addresses only.
- Incoming remote URLs and network requests to local/numeric IP devices or private names are blocked. These checks help isolate the unauthenticated loopback service but are not a substitute for OS firewall rules or full Chromium security updates. A site can still contact other public web services as part of normal browsing.
- The shell's external download flow is blocked for now; use the separate system browser when saving files. Password managers, browser extensions, camera/mic, location, notifications and website pop-ups are not exposed. Native web content can be memory-intensive: eight simultaneous heavyweight pages may overwhelm a Pi; close unused tabs.
- **Resource checks:** In the Electron shell, open App Settings → Desktop shell resources → Refresh resource reading. It reports local Electron process count, the sum of process working sets, memory available according to the Linux kernel, live website-tab count and a sampled CPU rate. It makes no internet requests and saves no readings. Process working sets include shared pages multiple times, so this is a trend indicator rather than exact unique memory; the Python backend and rest of the OS are not included. Compare a fresh map, a loaded browser page and several inactive tabs on the real Pi before tuning the tab limit. In regular localhost Firefox this Electron-only card is hidden.
- WSL and an ordinary browser continue to use the safe HTTPS iframe preview. Some sites prohibit framing; **Full browser** opens a normal browser tab instead. Electron shell is optional and can be installed later without changing the original OpenRF update flow.
- The app's localhost API remains accessible to the local user/session by design. It is not authenticated or suitable for LAN exposure. Use OS-level browser isolation and keep Electron security updates current.

## Field validation still required

On Raspberry Pi OS verify installation, graphics acceleration, touch keyboard, 1280×800 layout, Wi-Fi loss/reconnect, memory use, thermal throttling, power draw, button targets, status of all OpenRF sections after switching away from Browser, and multi-tab load/close behavior. In particular, compare App Settings memory readings while tabs are visible vs hidden, then close them to observe reclamation. These are **not verified by the source tests**. The Raspberry Pi hardware purchase is still pending.

## Debian package build preparation (not yet a validated release installer)

The shell's `package.json` now includes local `electron-builder` configuration for a `.deb` package with the Python `openrf/` source and static assets as Electron extra resources, and the OpenRF icon/desktop launcher metadata. Builds are architecture-specific:

```bash
cd /path/to/OpenRF/project/tools/openrf-electron
npm install --no-save electron electron-builder
npm run build:deb:x64
# On native 64-bit Raspberry Pi OS or a configured Linux ARM64 build environment:
npm run build:deb:arm64
```

This requires build-time Node/npm downloads and a suitable Linux build environment. **No `.deb` is shipped with the source ZIP**; package dependencies, desktop menu, auto-start, Pi ARM64 executable, upgrade behavior and install/uninstall must be validated before distribution. Python 3.11+ is still needed at runtime, and the Debian package will need an explicit system dependency declaration after hardware validation. Do not redistribute this scaffold as an already verified one-click installer.

## Wi-Fi quick panel on the Pi

The icon next to Messages opens a local NetworkManager-only Wi-Fi panel. Status is a read-only check; **Find nearby networks** explicitly scans; choosing a compatible WPA personal/open network and tapping Connect explicitly changes the Linux network. Passwords are handed to `nmcli --ask` on standard input and are not saved by OpenRF. NetworkManager itself can remember a connection according to OS settings. WSL usually cannot manage the Windows built-in Wi-Fi radio from Ubuntu; use Windows network settings until compatible Linux-visible hardware is connected. Enterprise/EAP, WEP and hidden networks require system network settings. Live Pi connection tests are still pending.

### Official implementation references

- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Linux ARM64 installation](https://www.electronjs.org/docs/latest/tutorial/installation)
- [Electron geolocation provider requirement](https://www.electronjs.org/docs/latest/api/environment-variables#google_api_key)
