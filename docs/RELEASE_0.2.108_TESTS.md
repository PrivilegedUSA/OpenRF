# OpenRF v0.2.108 — UI and route-origin verification

## Updated behavior

1. The folded-map button on the **right-side map tool rail** still opens the original Map settings panel: online/offline vector preference, color style, demo switch, browser location and address setup remain intact.
2. The **bottom-right gear** now contains the collapsed **Offline navigation readiness** check near the camera and address-provider controls. Nothing about opening the gear starts a network request, GPS permission, routing service, RF scan or map download. Press its dedicated button to check local readiness.
3. Under **Plan a trip → Starting point**, the default browser position is used unless the operator deliberately enters an address/coordinates or selects **Pick starting point on map**. A one-tap map selection writes the latitude and longitude into the existing start fields and marks the origin teal. It never overwrites a selected red destination or saves an observation.
4. Full trip preview and quick Get directions use the manually selected starting address/coordinate. If a previous road route exists, changing the origin invalidates it; ask Valhalla to route again. This still requires real local road-graph coverage; a fallback line is never a driving route.

## WSL update and manual checks

1. Save the complete `OpenRF-v0.2.108.zip` to Windows Downloads. In PowerShell run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'` (or add `-NoPush` to skip the automatic GitHub push). Stop the previous Linux server with Ctrl+C and restart via `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
2. With Firefox at `http://localhost:8765`, open the folded-map button on the right rail. Confirm **Use online vectors** remains available when offline regional vectors are active. Keep online vectors selected if regional roads still disappear. This release does not solve that browser rendering issue.
3. Open the bottom-right gear. Confirm Offline navigation readiness appears there, is collapsed by default, and its details scroll inside the popup at **800×480 landscape**. There should be no separate readiness card below the map.
4. Click the route-shaped **Plan a trip** button, enter a custom starting address and select an actual suggestion if online address search is opted in. Then choose a destination. Confirm the start is respected by Get directions, which still requires local Valhalla for a road route.
5. Use Plan a trip → **Pick starting point on map**. Tap a map position once. Verify a teal origin marker, values in the Start latitude/longitude fields, and that a previously selected red destination is unchanged. Press Escape while picking to cancel; dragging the map should never place an origin. Reopen Plan a trip and use **Use fresh browser location** to restore the default.

## Automated tests

From `project/`:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -q
node --test tests/*.js
```

The browser-specific rendering bug, real GPS accuracy, local Valhalla availability, Pi touchscreen, physical radio hardware, Wi-Fi HaLow and Reticulum connectivity are not verified by unit tests. No automatic uploads are performed by OpenRF itself.
