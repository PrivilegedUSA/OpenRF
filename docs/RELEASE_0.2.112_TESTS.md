# OpenRF v0.2.112 — Camera-count repair and maximum avoidance

## Install

1. Download `OpenRF-v0.2.112.zip` into Windows Downloads.
2. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'` from PowerShell.
3. Stop old OpenRF with Ctrl+C and restart in Ubuntu: `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
4. Refresh `http://localhost:8765/` using Ctrl+Shift+R.

## Manual checks (with local Valhalla running)

1. Recalculate the same Pioneer/Pine Grove-area route that previously showed **0 possible camera encounters** despite passing a mapped camera. It should now count the nearby report regardless of lens direction, and the camera comparison should request an alternate again when usable exclusion points exist.
2. Open **Where to? → Route preferences → Camera routing priority** and select **Balanced** or **Maximum avoidance**. Select at least one category (e.g. ALPR) for an automatic camera-aware comparison after Get directions. Balanced is the default.
3. Under Maximum, verify OpenRF may spend longer evaluating up to four local Valhalla exclusion paths. It should recommend the route with the **fewest nearby mapped camera reports**, even if miles and minutes are substantially greater. The alternative is **not automatically selected** or started; tap its card only after reviewing.
4. If Valhalla cannot find a detour, or the destination is too close to a mapped camera to exclude safely, verify the normal route is still shown and a clear reason is provided. Missing camera reports do not mean the trip is camera-free.
5. Switch the priority back to Balanced, refresh the page, and confirm the saved preference and existing camera categories persist. Test at 800×480 landscape for horizontal overflow.

## Automated tests and limits

- Run `python3 -m unittest discover -s tests -q` from inside `project/`.
- Run `for test_file in tests/*.js; do node "$test_file" || exit 1; done` from inside `project/`.
- The patch uses synthetic/stubbed route inputs and local endpoints. It does **not** verify the camera's actual orientation, living location, operator-installed road graph, Firefox rendering, Pi touchscreen, Docker service or physical camera/sensor behavior.
- The Valhalla exclusion API avoids map-matched roads near supplied points. It is bounded by the road graph and can return no valid route; extra distance cannot create roads where none exist. Maximum mode evaluates a limited set of candidates and cannot prove that a road is free of unreported or active cameras. Follow road signs and access rules, and do not interact with navigation controls while driving.
- v0.2.111's lens-bearing elimination was overconfident. It is explicitly reverted; mapped orientations are reported as uncertain annotations only.
