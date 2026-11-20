# OpenRF v0.2.153 — desktop WebGL fallback and sidebar regression

`OpenRF-v0.2.153.zip` has ZIP-root `openrf-bundle.json` and `project/`, with the manifest:

```json
{"project":"OpenRF","formatVersion":1,"version":"0.2.153"}
```

## What changed

- `openrf/static/app.css` — compact 14px one-line workspace labels on desktop Electron (matching App Settings), while preserving icon sizing and touch targets; clickable raster source controls.
- `openrf/static/app.js` — retain the last selected base map across failed WebGL startup, explicitly opt into USGS Topo/Satellite image tiles without a WebGL context, preserve local offline raster package behavior, show tile failures and allow retries without restarting vectors.
- `tests/test_raster_fallback_v153.js` — default map never silently calls remote image sources, source URLs/zoom are correct, base-map switching stays in raster mode and labels remain single-line. Normal test suites cover the rest of the app.
- Build metadata, sidebar version, documentation and release manifest bumped to 0.2.153. No migrations or new runtime dependencies.

## Windows 11 / WSL installation

Download the entire ZIP into Windows Downloads, then run from **any** PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Stop a running older Electron window/backend first to avoid the port/version conflict. When the updater is finished, restart the native shell in WSL:

```bash
cd /mnt/c/projects/OpenRF/tools/openrf-electron
OPENRF_URL=http://127.0.0.1:8765/ npm start
```

The shell still requires the separately installed Linux Electron and its shared libraries; this source ZIP does not contain Linux binaries. The updater may commit/push to GitHub, but neither that push nor CI success can be inferred from creating this ZIP.

## Visual checks on the user's WSLg setup

1. At 1280×800, confirm **Signal Viewer** and **Radio Receiver** fit on one line and match the App Settings text scale. Confirm sidebar scrolling and mobile drawer still work.
2. If WebGL is available, confirm the regular OpenRF vector map remains unchanged. If WSLg still rejects WebGL, the fallback explains that local vectors cannot render but offers **Topo · online**, **Satellite · online** and **Offline/grid**.
3. With internet access, select **Topo · online**; verify the USGS map image displays, pans/zooms, and the attribution identifies USGS. Select Satellite and confirm imagery changes. Restart and confirm the last selected layer restores if the same WebGL failure persists. Choosing the selected layer a second time retries missing tiles.
4. With networking unavailable, choose **Offline/grid**. Confirm no remote raster request is made. If you have a *raster* MBTiles pack installed, select it in Map Settings and confirm its tiles display offline. Existing regional vector packs remain unavailable without WebGL.
5. Confirm locations and DEMO markers retain their source labels, map controls are reachable, and browser/SOS/radio settings are unaffected.

## Test limits and next work

JavaScript sources and backend suites are tested in the build environment; actual native WSLg OpenGL/WebGL behavior, connectivity to USGS from the user's machine, Raspberry Pi touch/GPU/NM, field GPS and RF peripherals remain unverified. This fallback uses public USGS tile endpoints already used by OpenRF and must not be mistaken for an offline map download.

Next: field-test on a 1280×800 Pi display, verify WebGL/GPU and raster performance, then build and validate Debian packages on x64 and ARM64 with explicit OS dependencies.
