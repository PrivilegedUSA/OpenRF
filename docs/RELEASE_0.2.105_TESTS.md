# OpenRF v0.2.105 — Map recovery and settings popover

## Upgrade

Download the complete `OpenRF-v0.2.105.zip` into Windows Downloads. Stop the current OpenRF Python process in Ubuntu (Ctrl+C); then run in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Start again in Ubuntu:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

The backend stays on loopback and the updater's actual GitHub push/CI result must be read from its own output.

## Operator checks

1. In Firefox, confirm https://get.webgl.org/webgl2/ shows the spinning cube. Then open `http://localhost:8765` and hard-refresh once.
2. With a working online tile connection and **Auto** preference, the initial map should show the wider United States. Streets and geography, not just a blank dark canvas, must eventually appear.
3. If the online tile source is unavailable, wait up to nine seconds. If installed regional vector tiles and fonts are healthy, the map should try the Amador/Calaveras source and frame that region. Otherwise a small **Map tiles not visible** notice should explain the limitation without blocking navigation buttons.
4. From Map, tap the lower-right gear at 800×480 landscape. Its panel should appear **above** the gear, stay inside the viewport, and scroll internally; the map-layer and add-observation popups should still work.
5. Under the map, in Map settings, manually switch between online and regional vector sources. A manual Online preference should not be silently overridden by Auto recovery.
6. If there is still no geography, open Firefox Developer Tools (F12) → Console and Network; copy any red `openmaptiles`, `tiles.openfreemap.org`, `/api/vector/tiles/`, or WebGL messages. Also note whether Map settings reports `REGIONAL VECTOR READY`.

## Test limits

- Python and JavaScript tests validate endpoint and source logic only. No Firefox graphics driver, actual GPU recovery, external OpenFreeMap connection or Raspberry Pi touchscreen was available to certify on this build machine.
- An offline regional vector archive cannot render a whole-U.S. map; national coverage still needs online tiles or an appropriately licensed offline national map.
- No change to radio hardware operations, hotspot behavior, local-only API binding, personal map/GPS data or Reticulum links.
