# OpenRF v0.2.106 — Vector map source-switch recovery

## Upgrade

Stop the running OpenRF Ubuntu process with Ctrl+C, place the complete `OpenRF-v0.2.106.zip` in Windows Downloads, then run from PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Restart in Ubuntu:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Your updater's push and GitHub CI results are not verified by packaging tests.

## Browser checks

1. Confirm that https://get.webgl.org/webgl2/ still shows the spinning cube.
2. Open `http://localhost:8765` and hard-refresh. The zoomed-out U.S. map should appear when online tiles are available.
3. Allow browser location. Watch the zoom toward Amador/Calaveras. The map should stay in vector mode rather than flipping to the coordinate grid just because a tile fails. Local regional coverage is finite; missing tiles outside it are not a reason to destroy the renderer.
4. If the map stays dark or shows a **Map tiles not visible** notice, open Firefox F12 → Console and Network; share the first relevant error, including URL/status for `/api/vector/styles/`, `/api/vector/tiles/`, or `tiles.openfreemap.org`. Note whether the offline regional map displays any roads after zoom.
5. At 800×480 landscape, open the bottom-right settings gear. The panel should stay above the button, scroll internally and leave map controls reachable.

## Limits

Automated tests cover route changes and map error handling, but this build environment cannot certify Firefox GPU behavior, live geolocation, network access to OpenFreeMap, or on-screen vector rendering on the user's Windows PC. No change to stored GPS observations, licensed offline map files, database schema, or radio hardware behavior.
