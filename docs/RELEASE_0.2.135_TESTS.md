# OpenRF v0.2.135 — offline walking path visibility and graph diagnostics

## WSL / browser checks

1. Update from the complete ZIP. Restart OpenRF. Hard refresh to load the v0.2.135 JavaScript/CSS.
2. Open Map → Where to? → **Walk**. The path/track explanation should appear under the travel-mode selector. **Drive** hides it; other navigation controls and the wide-screen sidebar are unchanged.
3. Zoom into the installed Amador/Calaveras regional vector map (around zoom 11 or closer). Dashed teal references should emphasize *existing* OSM mapped footpaths, with amber for mapped tracks; data coverage may be incomplete. Try light and dark basemap modes, toggling Drive/Walk after each style change. No new path lines should be fabricated in empty tiles.
4. Switch to offline raster/coordinate mode: Walk mode may still plan pedestrian routes if a local Valhalla graph exists, but vector path highlighting cannot appear without vector tiles. No crash, GPS request or unsolicited online transfer should occur when changing the selector.
5. In Ubuntu WSL, while Docker and the local Valhalla graph are available:

   ```bash
   cd /mnt/c/projects/OpenRF
   bash tools/setup-valhalla-wsl.sh --status
   bash tools/setup-valhalla-wsl.sh --doctor
   ```

   Doctor checks an example driving route and an **example pedestrian route near Sacramento Capitol** on `127.0.0.1:8002`. If missing, it should clearly report unavailable; these are fixed public coordinates and do not use GPS. A pass verifies only that sample, not your hike or any mountain trail.
6. Select your actual walking origin/destination in Map and request **Plan walking route**. Only a genuine returned pedestrian road graph route should show walking directions; a dashed direct line remains an unsafe-to-follow reference. Imported GPX references are still separate from routable trails.

## Automated checks

- `bash -n tools/setup-valhalla-wsl.sh`
- `bash tools/setup-valhalla-wsl.sh --plan --region norcal` (no downloads)
- `python3 -m unittest discover -s tests -q`
- Run every `tests/*.js` with Node.js.

## Boundaries

No new trail extract, graph build, tile download, elevation/closure data, offline POI search, GNSS-follow walking guidance, or verified trail access is added. This release is a walking-mode map and local graph visibility/diagnostic improvement. Hardware/browser rendering and physical Raspberry Pi use still require field tests.
