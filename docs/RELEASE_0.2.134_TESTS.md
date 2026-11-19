# OpenRF v0.2.134 — startup and map legend placement

## WSL test

1. Update using the usual complete ZIP and updater, then restart `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
2. Hard refresh in your browser to load the new CSS.
3. At a wide landscape viewport (e.g. 1280×720), open Map. Confirm the full-screen map begins at the top of the workspace, with no duplicate Survey map headings, unexpected header strip, or blank map caused by stopped initialization. The left navigation sidebar should remain expanded.
4. Confirm **Survey location / DEMO (optional)** sits along the bottom-left, immediately to the right of the small map-credits icon.
5. Open the map credits icon. Confirm OpenStreetMap and data-provider attribution links are accessible and overlay the map legend correctly.
6. Resize to the narrow 800×480 compact layout. Confirm the map controls remain usable, the legend follows the compact visibility rule and no unwanted horizontal scrolling appears.
7. Check that the legend remains anchored to the bottom when resizing the window vertically; it must not float halfway up the map.
8. Open Where to?, check Drive/Walk controls, and request a route where Valhalla graph coverage exists. The Directions actions should appear without any startup error.

## Automated check

From the installed `project/` directory, run `node tests/test_map_startup_v134.js`, `node tests/test_map_legend_placement_v134.js` and the usual Python/JavaScript suite.

## Limits

The CSS positioning check does not prove appearance in a real Raspberry Pi browser or a particular 7-inch touchscreen. No physical receiver, GNSS, touchscreen, camera, emergency radio or route behavior was tested by this visual-only patch.
