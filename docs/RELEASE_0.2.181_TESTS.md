# OpenRF v0.2.181 — Surveillance manual recording and USB camera support

## Implemented

- Camera inventory migrated in place to support explicit `/dev/videoN` Linux V4L2 video devices alongside private LAN RTSP streams; no device opened on refresh.
- Existing two simultaneous low-rate live views, fullscreen and manual RTSP probes retained; USB presence check reports only device existence, **not** camera function.
- New **Start recording**, **Stop recording** and **Screenshot** buttons; user-triggered FFmpeg H.264 MP4 video or JPEG stills saved beside the private SQLite database under `surveillance-recordings/`.
- Recording history survives camera inventory edits, application restarts and source upgrades; file download, local playback, byte-range seeking and confirmation-gated deletion.
- Disk free and stored-media byte counts shown. Limits: two recording processes, 1 hour maximum per video, 2,000 total saved media entries, 512 MiB free needed to start; videos don't automatically resume after restart. An interrupted session is marked INTERRUPTED and may be incomplete.
- No automatic camera discovery, connection, recording or remote access. No credentials sent to the browser; RTSP login information remains in the local database **without encryption at rest**. Linux loopback-only API, origin checks for actions and same-origin media access remain in place.

## Not implemented or not verified

- ONVIF network discovery and PTZ, motion event detection, automatic/scheduled recording, configurable storage retention rules, battery telemetry, Bluetooth live camera video, hotspot-based pairing and authenticated remote viewing are **not** implemented.
- No real RTSP/USB video camera, Raspberry Pi 7-inch display, USB passthrough in WSL, recording codec combinations or power endurance were physically tested. FFmpeg must be installed; even when `ffmpeg` is present, support depends on its encoder/devices. Saved MP4 files may not be playable if capture is interrupted or FFmpeg fails.
- The full Python `unittest discover -s tests -q` command exceeded the available execution window; this is **not a full-suite pass**. Focused Surveillance Python tests passed (14). All 143 JavaScript suites passed.

## How to test on WSL/Linux

```bash
sudo apt install ffmpeg
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Open Surveillance and explicitly add a real private RTSP URL, or a connected `/dev/videoN` device. Use Test connection, then View live. Start/stop a short recording; check history and download, browser playback and deletion. Camera previews show up to 2 frames/sec; recording uses native frame rate when supported. If USB cameras are not visible inside WSL, check that a Linux video4linux2 device exists on the machine; Windows webcam access is not implicit.

## Update (PowerShell)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.181.zip" -NoPush
```

Installation and GitHub push have not been performed or verified.
