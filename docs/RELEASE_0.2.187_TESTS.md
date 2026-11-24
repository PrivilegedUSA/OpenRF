# OpenRF v0.2.187 — Surveillance video-first UX, per-camera history and local USB PTZ

## Implemented

- **Compact responsive camera wall.** One saved camera uses a wide preview. Two or more saved cameras use a two-column compact wall at normal desktop/tablet widths (one column on narrow screens). The FFmpeg preview cap remains **two** concurrent feeds at **up to 2 fps**, with all additional cameras shown as paused tiles. This is a layout change, not higher-bandwidth streaming.
- **Simpler video-first controls.** Recording is the visually prominent red action; fullscreen, pause/resume and per-camera History remain one tap away. Screenshot, opt-in motion clips, digital zoom and hardware controls are in a collapsed Camera tools section. A red badge marks recording **requested**, not verified saved media; successful saved recordings appear in the local media library. Fullscreen retains the controls and changes its button to Exit full screen.
- **Per-camera local history.** Each camera tile's History action opens the Recordings tab already filtered to that camera. Recordings and Motion & Events have independent camera filters; no previous recordings or motion candidates are removed or altered.
- **Digital preview zoom/pan.** +/- and Reset support 1.0x to 3.0x preview enlargement, with drag-to-pan when zoomed. The on-screen crop is display-only and does not increase resolution or affect recorded source files. The pixel interpolation is CSS, not optical zoom. No assumptions about hardware PTZ.
- **Optional USB V4L2 PTZ steps.** An expanded panel runs a user-requested `v4l2-ctl --list-ctrls` on the selected saved USB device and lists only advertised `pan_absolute`, `tilt_absolute`, and `zoom_absolute` integer controls. Clicking a direction requests **one** clamped hardware control step using `--set-ctrl`. Commands use an argument list (no shell), a fixed timeout, strict validated `/dev/videoN` paths and axis/step allowlist, and never return RTSP credentials. Hardware may implement *electronic* pan/tilt/zoom; setting a V4L2 value does not prove physical camera movement. No control command runs when the app or Surveillance page opens, nor for RTSP cameras.
- No new third-party Python dependency. Optional `v4l2-ctl` is provided by `v4l-utils`. Existing local-only/private data and upgraded managed paths are unchanged.

## Software tests performed in the build environment

- **Python:** 577 tests passed in six non-overlapping groups (135, 100, 89, 94, 67, 92). Full `unittest discover` as a single job was not completed within the tool's execution window; grouped coverage passed. Includes new mocked V4L2 command-argument/range/timeout/allowlist checks and same-origin HTTP tests.
- **JavaScript:** 149 standalone test files passed, including `test_surveillance_frontend_v187.js`.
- **Browser interaction:** Headless Chromium rendered the actual Surveillance markup/script/styles with **three mocked cameras**. Confirmed two-column computed layout, digital zoom button, lazy USB control request, a per-camera recording-request badge and History selecting the right filter without uncaught JavaScript exceptions. The browser test did not stream video from real hardware.
- **Syntax:** Python compilation and JavaScript syntax checks passed. The release ZIP undergoes archive path/manifest/CRC/private-file checks before delivery.

## Manual WSL / Raspberry Pi tests to perform

1. On Windows, attach the NexiGo to WSL using USB passthrough as already configured. In Ubuntu, verify `id -nG` includes `video`, then `v4l2-ctl --device=/dev/video0 --all` shows the expected webcam capabilities. Be aware the USB device may detach from WSL when rebooted.
2. Update using `-NoPush`, start with `cd /mnt/c/projects/OpenRF && python3 -m openrf`, and open Surveillance → Overview. The main OpenRF Overview must not start video. The NexiGo preview should appear only on Surveillance Overview.
3. Check Record/Stop and History for the NexiGo. Verify actual MP4 playback and disk bytes **after** stopping; FFmpeg starting alone does not establish a saved video. Test snapshot separately.
4. In Camera tools, try digital zoom/drag/reset. Then expand Device pan/tilt/zoom. The NexiGo N660 reported `pan_absolute`, `tilt_absolute`, and `zoom_absolute` via V4L2 on the user's WSL setup; try a single control press, and report if it changes the image or the physical camera. Use device control steps cautiously; the reported control might be digital.
5. If more cameras are saved, confirm the preview wall uses a smaller grid, never opens more than two feeds automatically, and pauses requested streams when you leave Surveillance Overview.
6. Verify camera filters in Recordings and Motion & Events; attempt no remote access or insecure LAN exposure.

## Still planned or not verified

- **RTSP/ONVIF** discovery, network-camera PTZ, presets, speed-controlled pan/tilt, optical zoom, auto-tracking, and vendor-specific mobile camera pairing are not implemented in this release.
- **Portable wireless** cameras can work through existing RTSP only if they expose a reachable, compatible private-LAN RTSP stream and stay awake. Battery camera cloud-only apps, Bluetooth-only pairing and sleep/wake control are not generally supported. No hotspot driver configuration or pairing workflow is added.
- Digital zoom does not provide higher detail, touchscreen pinch gestures are not added, and snapshot/recording output is not cropped to match digital preview.
- **Real hardware:** The user previously confirmed NexiGo N660 live preview in their WSL setup on v0.2.185. This v0.2.187 patch was not installed or exercised against that camera, USB PTZ behavior or Raspberry Pi hardware by the build environment. Electron fullscreen, actual simultaneous camera readers, and GitHub Actions were not verified.
- RTSP credentials remain in the private local SQLite file without at-rest encryption. Loopback-only server, no automatic cloud upload, and opt-in recording/motion behavior remain unchanged.
