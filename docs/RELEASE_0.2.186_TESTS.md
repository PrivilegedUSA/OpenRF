# OpenRF v0.2.186 — Surveillance overview wall and fullscreen controls

## Changes

- Surveillance **Overview** has one tile per saved camera, rather than duplicate management cards plus a separate viewer wall. The Camera **Cameras** tab retains inventory, add/edit/delete, RTSP diagnostics, and detected USB device selection.
- **Opening Surveillance → Overview** requests up to two camera previews automatically (first saved cameras) without a View live click. Other camera tiles stay available with a clear paused indicator and user-started View live option when a slot is free. **Opening the application's main Overview does not activate cameras**. The camera wall doesn't connect on background inventory refresh. User-paused previews stay paused until explicitly resumed or a new Surveillance visit; changing Surveillance tabs or leaving Surveillance cancels preview requests.
- Each tile retains **Full screen**, **Record / Stop recording**, **Screenshot**, **Motion clips**, and **View / Pause preview**. Individual tile fullscreen retains those controls. Fullscreen buttons dynamically say **Exit full screen** when active; using Escape also updates the labels. Entire-wall fullscreen remains available.
- Motion clips are not the same as starting a normal recording: this is a **separately user-confirmed** frame-change monitor with sensitivity in Motion & Events, short post-event recordings, session and concurrency limits. No person or intrusion detection claim. No recording starts simply because a camera tile was opened.
- V4L2 webcams show **Opening USB (V4L2) preview** instead of an erroneous RTSP loading status. Blank, failed and pending video streams are not represented as verified live video. Existing on-demand streams still use FFmpeg and the local loopback API.
- Introduced better touchscreen spacing and fullscreen video layout with controls remaining visible, including responsive cards for a 7-inch touchscreen. Local media and credentials remain private and outside source ZIP / Git.

## Test commands (source root `project/`)

```bash
node --check openrf/static/surveillance.js
node tests/test_surveillance_frontend_v186.js
node tests/test_surveillance_frontend_v185.js
node tests/test_surveillance_frontend_v179.js
PYTHONPATH=tests:. python3 -m unittest -q tests.test_surveillance_v185 tests.test_surveillance_v184
bash tools/test-openrf-linux.sh
```

The combined test script can exceed the current run limit on slower systems; run the tests in separate groups if needed. Node tests run as `for file in tests/*.js; do node "$file" || break; done`.

## Functional WSL/NexiGo check (requires **user's** device)

1. Ensure Windows USB passthrough to WSL is active and `v4l2-ctl --device=/dev/video0 --all` works for the actual `NexiGo N660`, with an Ubuntu account permitted to open the device (group `video`). Installing the release does **not** configure WSL USB passthrough.
2. Use PowerShell update command with `-NoPush`, run `cd /mnt/c/projects/OpenRF && python3 -m openrf`, and open the new main Overview. No camera should connect there.
3. Open **Surveillance → Overview**. The first saved webcam tile should request a real feed without an extra click. Its subtitle should identify the source as **USB**. If no frames appear, check the status message, existing FFmpeg capability, and Ubuntu `/dev/videoN` access. Do not interpret a blank tile as footage.
4. Use Full screen on that tile. Verify it changes to Exit full screen, and **Record**, **Screenshot**, **Motion clips**, and **Pause preview** stay available. Test Escape or Exit full screen. Confirm a completed video or snapshot through **Recordings**; process creation alone is not proof that media saved.
5. If three cameras are saved, check that all tiles are shown but at most two feeds request frames; pause one, then select View live on the third. Check a manually paused tile stays paused after Refresh and that switching to Cameras stops all preview HTTP requests.
6. Do not assume all cameras permit simultaneous preview, recording, and motion analysis. A V4L2/USB camera can reject an additional reader or a format; test concurrency separately.

## Local test results

- **JavaScript:** 148 standalone Node regression test files passed, including new v186 source integration assertions and the updated v179 fullscreen check.
- **Python:** 573 unittest cases passed in six non-overlapping groups (121, 91, 96, 143, 48, 74). Running the last 122 tests as one long group exceeded the execution window without reporting a failure; the two smaller final groups both passed.
- **Browser interaction:** Headless Chromium exercised the Surveillance DOM with a mocked local API, 3 mocked cameras and synthetic image responses. The test checked an auto-preview cap of 2, recording button state, pausing without reopening on refresh, live switching to a third camera, stop-on-tab-switch, relaunch on entering Overview, pause all, fullscreen label/controls, and no browser JavaScript exceptions. **No actual camera video was passed to this browser test.**
- **Static:** Python compileall, Surveillance JavaScript syntax and duplicate HTML ID check passed.
- **Hardware:** The user independently reported a working **NexiGo N660 FHD USB webcam preview on v0.2.185** in WSL. This v0.2.186 patch was **not** installed on the user's machine or tested against that physical webcam, Raspberry Pi OS, Electron desktop fullscreen, or GitHub CI. They remain unverified.

## Privacy and limitations

- The user-requested auto previews happen only on entry into Surveillance Overview, never as background recording. Remote/LAN access remains disabled; APIs use the existing loopback-only server. RTSP credentials aren't returned to the browser inventory. No automatic uploads or new permissions are required.
- Live preview remains restricted to **two simultaneous FFmpeg MJPEG previews at up to 2 fps**, not full frame-rate video surveillance. Multi-camera RTSP CPU load and concurrent V4L2 device reading need hardware testing.
- ONVIF discovery, native PTZ for compatible cameras, camera battery status, secure remote viewing, Bluetooth camera pairing and hotspot automation are not implemented here. The next top-level development priority, Mesh Dashboard Stage 1, is unchanged.
