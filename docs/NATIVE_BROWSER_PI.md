# Optional full in-window browser on Raspberry Pi / Linux

This optional OpenRF shell uses **Electron's Chromium engine and isolated `WebContentsView` tabs** to render external websites inside the Web Browser workspace. It is *not* the standard OpenRF web app's restricted iframe, and it does not alter the Linux Python backend or require a Wi-Fi account. It does **not** ship an Electron executable.

## Installation (when you have the Raspberry Pi or Linux desktop)

1. Use **64-bit Raspberry Pi OS with a graphical desktop** or a supported Linux desktop. Install Python 3.11+ and Node.js/npm (Node 20+ for this launcher). Electron distributes Linux ARM64 binaries, but the exact Pi OS libraries, display server, GPU stack, memory and touch behavior must be tested on your board.
2. Launch OpenRF **on loopback only** in terminal 1:

   ```bash
   cd /path/to/OpenRF/project
   python3 -m openrf
   ```

   In the normal checkout on WSL, use `cd /mnt/c/projects/OpenRF && python3 -m openrf` instead.

3. With Wi-Fi/internet available **once**, install optional Electron dependencies in terminal 2 (this downloads a Chromium-based binary):

   ```bash
   cd /path/to/OpenRF/project/tools/openrf-electron
   npm install --no-save electron
   ```

4. Start the shell after OpenRF is already running:

   ```bash
   OPENRF_URL=http://127.0.0.1:8765/ npm start
   ```

   For fullscreen kiosk testing set `OPENRF_KIOSK=1` before `npm start`. Use the actual loopback port reported by OpenRF if it differs from 8765. Never bind OpenRF to a public/LAN interface to make the shell connect.

5. Open **Web Browser** in the shell, enter a public website, press **Go**, then switch tabs. Pages run in their own Chromium surfaces within the OpenRF browser area. The side menu and emergency navigation remain part of OpenRF. **Closing a tab** closes its Chromium surface.

## Security boundaries and limitations

- The trusted OpenRF UI runs only from the configured loopback URL. External pages use other Chromium sessions with Node integration disabled, context isolation, renderer sandboxing and no preload/API bridge. Remote frames cannot directly use the OpenRF SQLite backend. Site permissions, automatic downloads and pop-ups are denied in this early shell. Do not use it to enter sensitive accounts until the Pi build is validated and security-reviewed.
- In-memory remote browsing sessions do not persist logins/cookies across shell restarts. Saved tab addresses and bookmarks still persist in browser-local storage; **remote sites never reload automatically at OpenRF startup**. Navigation history while a native view is open follows actual page visits; standard web-mode history tracks entered addresses only.
- Incoming remote URLs and network requests to local/numeric IP devices or private names are blocked. These checks help isolate the unauthenticated loopback service but are not a substitute for OS firewall rules or full Chromium security updates. A site can still contact other public web services as part of normal browsing.
- The shell's external download flow is blocked for now; use the separate system browser when saving files. Password managers, browser extensions, camera/mic, location, notifications and website pop-ups are not exposed. Native web content can be memory-intensive: eight simultaneous heavyweight pages may overwhelm a Pi; close unused tabs.
- WSL and an ordinary browser continue to use the safe HTTPS iframe preview. Some sites prohibit framing; **Full browser** opens a normal browser tab instead. Electron shell is optional and can be installed later without changing the original OpenRF update flow.
- The app's localhost API remains accessible to the local user/session by design. It is not authenticated or suitable for LAN exposure. Use OS-level browser isolation and keep Electron security updates current.

## Field validation still required

On Raspberry Pi OS verify installation, graphics acceleration, touch keyboard, 1280×800 layout, Wi-Fi loss/reconnect, memory use, thermal throttling, power draw, button targets, status of all OpenRF sections after switching away from Browser, and multi-tab load/close behavior. These are **not verified by the source tests**. The Raspberry Pi hardware purchase is still pending.

### Official implementation references

- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Linux ARM64 installation](https://www.electronjs.org/docs/latest/tutorial/installation)
