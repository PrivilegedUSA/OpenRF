# OpenRF v0.2.111 — Direction-aware route comparison

## Installation

1. Download the complete `OpenRF-v0.2.111.zip` into Windows Downloads.
2. In PowerShell, run:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`

3. Stop the prior OpenRF process with Ctrl+C. In WSL Ubuntu, run:

   `cd /mnt/c/projects/OpenRF && python3 -m openrf`

4. Open `http://localhost:8765/` and refresh with Ctrl+Shift+R if needed.

## Manual route verification

1. Keep a working local Valhalla container and choose a route with a camera report. Select camera-aware alternatives as before.
2. In **Choose a route**, compare the possible-encounter number with the separate *nearby* count. For an alternate road that approaches a camera from outside its stored viewing direction, the choice can show `0 possible encounters (1 nearby)` and an explanation that the nearby point was not direction-matched.
3. Select **Main route**, then **Alternate route**. Confirm the map draws two distinct paths and does not switch an active navigation session without an explicit choice.
4. Enable the appropriate ALPR map layer and click the camera marker. Inspect **Mapped lens heading**. If it says **not mapped**, the location remains a possible encounter in both routes: do not infer that it faces away solely from the screenshot.
5. Repeat with a camera lacking heading data and confirm it remains counted; repeat with incomplete snapshots and confirm comparison warnings are preserved.

## Meaning and limits

- Input is the locally saved camera catalog, not a live RF/optical detection. Camera lens direction is a map report; it can be absent, stale, inconsistent or incorrect. The 120 m search and ±80° coarse direction checks are intentionally uncertain approximations; road offset, lens field-of-view, license plate direction and actual coverage cannot be verified from this data. A `0` possible encounter estimate **does not guarantee a camera-free journey**.
- The user-provided screenshot cannot establish the true bearing of the particular camera. The package has synthetic fixtures, not a reproduced Valhalla trip or the user's private camera database.
- Regression checks: `python3 -m unittest discover -s tests -q` and `for test_file in tests/*.js; do node "$test_file" || exit 1; done` from inside `project/`.
- No Raspberry Pi touchscreen, Firefox camera-map click, live route data, current camera orientation or physical sensors were tested in this build environment. The existing offline regional vector map rendering issue is not fixed in this patch.
