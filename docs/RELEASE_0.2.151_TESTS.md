# OpenRF v0.2.151 — Browser tabs, Chromium shell, and Saved Trips & Maps

## Complete package and installation

`OpenRF-v0.2.151.zip` contains the root manifest:

```json
{"project":"OpenRF","formatVersion":1,"version":"0.2.151"}
```

All installable source stays below `project/`. Do **not** unpack the ZIP yourself or replace your existing updater. Save the ZIP to Windows Downloads, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Stop the prior Ubuntu server with Ctrl+C, then restart:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

The updater normally handles backups and local managed paths. A local test run does **not** prove the user has installed this ZIP, pushed to GitHub, or passed remote CI.

## Changed source

- `openrf/static/browser-workspace.js`, `index.html`, `app.css`: each open tab holds a separate live iframe, closed tabs release it, and restored addresses do not trigger external requests. Back/Forward/Refresh/Home use inline Font Awesome Free 6.7.2 SVGs (CC BY 4.0, Copyright Fonticons, Inc.), not Unicode symbols or an online font dependency.
- `tools/openrf-electron/{main.js,preload.js,security.js,package.json}`: optional Linux/Pi desktop shell using Chromium `WebContentsView`, isolated in-memory remote sessions, strict URL and loopback access checks, no Node privileges for websites, blocked device permissions/downloads/pop-ups and native tab open/switch/close/navigation. No Electron dependency is bundled or installed automatically. See `docs/NATIVE_BROWSER_PI.md`.
- `openrf/offline_maps.py`, `server.py`: local MBTiles catalog derives source/type/tile-count labels from the archive's declared metadata. `GET /api/maps/catalog` is loopback-only, read-only and includes installed maps, separate saved geographic area plans, file sizes and totals; it does not fetch tiles or inspect user data beyond the private map folder.
- `openrf/static/saved-trips.js`, `index.html`, `app.css`, `app.js`: **Trips & Maps** sidebar workspace, read-only refresh/filter/cards, map activation, saved area views, explicit individual removal guarded by exact-name prompt plus second confirmation, and an active-map removal guard. Reuses existing local protected DELETE routes and map selection.
- Version markers, README/changelog and release documentation updated. No new Python dependencies or SQLite migration.

## Tests and safety checks

- `python3 -m unittest discover -s tests -p 'test_*.py' -q`: **422 Python tests passed**.
- `node tests/*.js` run one test file at a time: **120 JavaScript test files passed** after the icon change.
- `node --check` on browser, saved-trips and Electron files: syntax passed.
- Focused tests cover server assets, Host guard, read-only catalog/no unverified coverage claim, package labels, source metadata, UI filter/map activation/removal, live tab retention and no network requests on restored sessions, URL and loopback guards, optional native IPC and sandbox contract, and Font Awesome accessible controls.

## Manual acceptance checklist

1. Open Web Browser on your 1280×800 desktop. Enter a HTTPS site, press Go, open a second tab/site, and switch back and forth. **The first page should still be present without Go.** Refresh should reload only the active tab. Closing should release that site; reopening OpenRF should restore the address but not silently connect.
2. Check the four browser navigation icons and button tooltips, compact drawer layout, bookmarks, offline/no-network status and links that refuse iframe embedding.
3. Open **Trips & Maps** from the sidebar. Confirm existing map files and area plans appear separately, with sizes, zooms and metadata-declared coverage. Change the package filter and use a raster pack on the Map page. Check the plan location display.
4. Try removing a non-selected disposable test map. Incorrect typed name or cancelled second confirmation must leave it installed. An active map's Remove control should be unavailable until a different basemap is selected. Do **not** remove real field maps just to test this.
5. For native Chromium browsing, follow `docs/NATIVE_BROWSER_PI.md` only after installing the optional Electron runtime on a **Linux graphical desktop / Raspberry Pi**. Test a site with iframe restrictions, native Back/Forward, switching tabs/pages, closing tabs and blocked remote access to localhost, device prompts, pop-ups and downloads.
6. Open Map, Emergency, Radio Receiver, Messages and Settings afterward to check navigation, data and touch layout regressions.

## Current limitations and next patch

- **Native Electron shell integration is source-tested but not GUI/hardware-tested.** It requires an optional internet download of Electron, a graphical Linux session, GPU/drivers and enough Pi RAM. Live site behavior and real touchscreen 1280×800 still need validation. Standard WSL use is unchanged and has no additional runtime requirement.
- Downloads, pop-ups and remote-site camera/microphone/location permissions are intentionally disabled inside native Chromium. These need a later explicit, consent-based implementation and a security review. Some websites require them. The normal system browser remains available separately.
- Offline map bounds/source/tile counts are *package-declared metadata*, not a survey of actual tiles on a planned route. A raster pack is not a Valhalla routing graph, GNSS quality guarantee, numerical HGT elevation or trail-access certification. The catalog does not store complete navigation trip routes; previously saved region plans remain separate from downloaded tiles.
- No Raspberry Pi, SDR, GPS, battery board, Docker Valhalla graph, live Wi-Fi or driving navigation tests were run. No GitHub CI success or user installation is claimed.

Suggested **v0.2.152**: practical 7-inch Raspberry Pi kiosk/performance and power checks when the hardware is available; otherwise add optional export/reimport of private Saved Trip metadata and strengthen offline route/graph completeness diagnostics without inventing GPS/signal readings.
