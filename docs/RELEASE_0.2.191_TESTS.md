# OpenRF v0.2.191 test and release notes

## Working changes
- Local recording list displays a compact, camera-filterable media table with one selected playback area. Clicking date or preview opens only that entry, so long histories do not load dozens of video players at once. Real snapshot JPEG thumbnails are served through existing local media endpoints; video rows use play symbols and show video only after selection (no generated thumbnails). The existing delete confirmation is preserved.
- During manual USB recording, only one V4L2 reader is used: the recorder supplies sampled live preview frames and writes MP4. The previous JS polling path that closed this shared preview was removed. Any USB FFmpeg/device errors still require hardware diagnosis.
- Selection persistence covers Surveillance, Emergency, Weather, Meshtastic, MeshCore, Reticulum and Hardware tabs. The state is stored in browser sessionStorage and read only if the browser reports an actual reload; it is validated against known tab names. Fresh navigations still use Overview as the default. Tab switching does not start radios/cameras or navigate the browser.

## Test steps
1. Install the complete ZIP via `Update-OpenRF.ps1` with `-NoPush`; start from Ubuntu WSL using `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
2. Open Surveillance → Recordings with saved files, choose one date, verify only one large video loads, check Download, Scan and confirmed Delete. Change camera filter and refresh the page; the Recordings tab should remain selected.
3. Go to Emergency → SOS & Check-ins, refresh, check that panel stays selected. Repeat for Hardware, Weather and communications tabs. Open app in a fresh window: main Overview should still be the default.
4. Start a manual NexiGo USB recording while watching its live preview. After preview transition it should keep updating; Stop & save finalizes MP4 for playback and download. If it fails or the preview stops, inspect FFmpeg logs and capture state.

## Test limitations
- JS/persistence behavior tested via browser and local test harness, not on user computer.
- Webcam physical capture, continuous MJPEG/MP4 stream reliability, FFmpeg codec compatibility, Raspberry Pi touchscreen/hardware, direct Linux `.deb` installation, Electron launch and GitHub CI remain unverified.
- Video row thumbnail is a play icon, **not a still frame**; snapshots have real thumbnails. There is no automatic deletion beyond previously implemented explicit cleanup.
