# OpenRF v0.2.110 — Route distinctness and tradeoff checks

## Behavior

1. With an opt-in camera-aware comparison and a functioning local Valhalla graph, OpenRF requests an alternative using bounded road exclusions. A *second response* is not automatically a distinct route: backend geometry is sampled at equal path-distance intervals to reject identical or nearly identical roads. Different point densities do not create a false alternative. The normal route is preserved if no different path is available.
2. When both routes truly differ, the **Choose a route** sheet displays two vertically stacked cards for landscape screens. Each card shows miles, estimated minutes and the number of mapped nearby camera reports. The Alternate card additionally says how much longer/shorter, slower/faster and how many more/fewer *mapped reports* it contains. A partial catalog is flagged; no count establishes a live camera, enforcement direction or a guaranteed safer route.
3. The selected teal road and the other dashed amber road remain selectable only when their geometry differs. Where to? custom start and destination selection, Valhalla status controls and route preferences are unchanged.

## Update and manual checks

1. Download `OpenRF-v0.2.110.zip` into Windows Downloads. From PowerShell run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'` (or `-NoPush`). Stop the running OpenRF server with Ctrl+C, then in Ubuntu run `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
2. In Firefox at `http://localhost:8765`, open Where to? and choose a start/destination. Opt in to desired camera types under **Route preferences**, get directions, and allow the optional camera-aware comparison to finish. When Valhalla repeats the same road, **Choose a route** should not pop up with duplicate cards. The main road directions should remain available.
3. When the local graph actually supplies a different path, check both cards are stacked and the Alternate shows relative miles, minutes and mapped report differences. Verify the teal road and dashed amber road diverge and selecting a card changes the selected road. Try selecting a start on the map: no duplicate alternate should be created merely because the origin was manually chosen.
4. Use the right-hand folded-map Map settings to retain **Use online vectors** if your regional offline style still fails. This release does not repair the separate offline vector renderer; nor does visual tile readiness prove the local Valhalla road graph is running.

## Automated tests

From `project/` run:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -q
node --test tests/*.js
```

Tests cover backend same-path and differently sampled shapes, valid distinct roads even with matching numeric totals, and the main/alternate comparison summary. Full end-to-end Raspberry Pi touchscreen, live Valhalla Docker service, regional route graph, Firefox GPU/vector rendering, current camera catalogs and physical RF devices remain unverified in this build environment. No scan or GPS results are invented.
