# OpenRF v0.2.104 — Map rendering and message icon repair

## What changed

- Preflight `/api/vector/status` before initial map startup. The bundled OSM-derived regional vector archive should report 5,703 tiles and its local fonts, provided the managed files are intact.
- **Auto** source selection keeps the initial USA overview online, switches to local Amador/Calaveras vectors only when a *real browser-provided* position falls within the installed map bounds, and returns to worldwide online style after a later position outside the region.
- **Manual** source selection through Map settings persists across refresh in this browser. No GPS coordinate is stored as part of this preference.
- An online style failing before it loads gets exactly one attempt with the installed local vector style. A WebGL/MapLibre constructor failure instead shows the browser's short failure detail, because neither offline nor online vector tiles can render without the underlying graphics context.
- The built-in raster fallback explains that an installed vector MBTiles archive does not constitute a raster package. Local survey markers and coordinate fallback still work.
- The header envelope uses a 20px icon with an unread badge anchored to its upper-right corner, inside a 42px tap target.

## Install

Download `OpenRF-v0.2.104.zip` into your Windows Downloads folder, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Stop the previous Ubuntu app with Ctrl+C; restart:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Neither Windows installation nor a GitHub push is verified by creating this bundle.

## In-browser checks

1. Open Map and, once the local status loads, open **Map settings**. Confirm the local vector status shows **5,703 installed tiles** (or inspect `/api/vector/status` directly).
2. The app initially presents the full-US overview. If you give permission for a real browser location inside Amador/Calaveras coverage, the status should say `AUTO · using installed regional OpenRF vector tiles` and show map roads locally. Permission denied never fabricates a position.
3. Without relying on geolocation, use **Map settings → Use offline regional vectors**. The choice should survive Ctrl+Shift+R. Outside the local regional coverage you may see blank land because only Amador/Calaveras road tiles are bundled. The button can switch back to online vectors, also persisted.
4. If the app shows **Vector renderer could not start**, note the exact parenthesized error. Offline map tiles are **not missing** merely because a browser cannot create a WebGL context. Check Firefox's graphics/WebGL status (`about:support`) and hardware acceleration; try another supported browser if needed, then use **Map settings → Offline / raster** to retry vectors. This release cannot restore WebGL blocked by an OS/driver/browser.
5. Receive a genuine new mesh/Reticulum message; confirm the unread number overlaps the envelope's upper-right corner and that opening the dropdown preserves its mesh/Reticulum choice. Do not assume receiving is verified by a synthetic badge/test fixture.

## Automated checks (in the project directory)

```bash
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file"; done
node --check openrf/static/app.js
```

The new `tests/test_map_recovery_v104.js` tests validated location-in-bounds selection, user override, bounded recovery (including duplicate errors), browser startup notice and nested message badge structure without invented GPS or notification events. No live WebGL was available in the packaging environment to confirm the user's computer can render the custom vector map. The prior map/Reticulum/hotspot code and data remain present. No external maps are downloaded automatically.
