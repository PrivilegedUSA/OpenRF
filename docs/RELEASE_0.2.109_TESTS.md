# OpenRF v0.2.109 — Main Where to? starting-point verification

## Changed UI

1. The compact main map **Where to?** form now has **From: Current location → Change** above Destination. The editor is collapsed until the operator opens it, leaving more map visible on the planned 800×480 landscape screen.
2. Change accepts a U.S. street address (with saved and opt-in configured geocoding suggestions), saved place or `latitude, longitude`. **Pick start on map** uses the same one-tap vector/raster coordinate conversion as the existing destination picker; the teal origin pin and red destination remain distinct. **Use current location** resets only the manual origin; no browser GPS request starts until the operator explicitly gets directions or requests a fresh position.
3. The **Destination selected** popup shown after tapping a map destination now includes **Change start**. Selecting it opens the main Where to? editor, without discarding the selected destination. Selecting a start from that quick editor returns to Where to? ready to Get directions.
4. **Plan a trip** still works. Its origin field mirrors the primary From input in both directions. Any actual change to a starting point invalidates an old plan and avoids displaying stale road directions.
5. **Check local road router** in the main form probes `/api/navigation/routing/status` only when pressed. Unavailable means OpenRF could not reach the loopback Valhalla service, not that the destination address is wrong. The UI suggests starting an existing container; no automatic container changes or network downloads are performed.

## WSL steps

1. Save the complete `OpenRF-v0.2.109.zip` in Windows Downloads. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'` from PowerShell (or append `-NoPush`). Stop OpenRF with Ctrl+C and restart in Ubuntu using `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
2. Open `http://localhost:8765` in Firefox. Open Where to?, confirm **From** defaults to current location, select **Change**, enter a valid saved address or coordinates and then a destination. Confirm the origin persists in Plan a trip and the red destination does not move.
3. Use **Choose destination on map** and tap a location, then select **Change start** in its popup. Choose **Pick start on map**, tap once, and confirm the main Where to? form returns with the manually chosen teal start and the same destination. Check Escape cancels a map pick without saving anything and map drag does not place a pin.
4. Press **Check local road router**. If unavailable, check Docker Desktop is running, then from Ubuntu run `docker ps -a --filter name=openrf-valhalla`. If an existing stopped `openrf-valhalla` container appears, use `docker start openrf-valhalla`, wait for its service to initialize and press the status button again. If no such container exists, review `docs/LOCAL_VALHALLA_WSL.md` before setting it up. **Do not mistake offline visual map tiles for a functioning road-routing graph.**
5. Keep **Use online vectors** selected through the right-side folded-map Map settings while investigating the separate offline regional vector rendering bug. This release does not modify that map code path.

## Automated and unverified checks

From `project/` run:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -q
node --test tests/*.js
```

The new quick-origin test verifies default, typed, mirrored, reset, destination preservation, and available UI/diagnostics wiring. Real Firefox 800×480 appearance, Docker/Valhalla readiness, installed road-graph coverage, offline vector tile drawing, GPS accuracy and Pi/radio hardware remain unverified until tested on the operator's system. No private local data is bundled.
