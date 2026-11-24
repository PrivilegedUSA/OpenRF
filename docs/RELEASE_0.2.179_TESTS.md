# OpenRF v0.2.179 — Surveillance Stage 1B (two-feed monitoring wall)

## Implemented

- Surveillance camera list persists in existing private SQLite data; no automatic network connections.
- A user can select **View live** for one or two saved RTSP cameras; each preview occupies its own tile with independently selectable **Stop** and **Full screen** controls.
- A third concurrent request from the same wall is blocked, matching the existing backend limit of two FFmpeg processes. **Stop all feeds** and full-wall fullscreen are also supported.
- Leaving Surveillance, navigating away from the page, removing a saved camera or changing its RTSP URL ends the associated browser request. Feed state is labeled requested until actual image frames arrive. No fabricated video.
- Camera inventory HTTP endpoints intentionally do not reveal stored RTSP URLs, user names or passwords.

## Not implemented / limitations

- Recording, snapshots, playback, ONVIF/USB discovery, motion detection, battery telemetry, higher-performance streaming, portable camera hotspot setup and mesh dashboard are not in this release.
- MJPEG previews are low frame-rate (up to 2 fps) and not a substitute for native high-performance multi-camera viewing. Browser stream cancellation and the server's concurrent-process limit still depend on socket disconnect propagation. FFmpeg is optional but required to see video.
- Existing RTSP camera credentials are stored locally in SQLite, unencrypted. FFmpeg command-line arguments can be visible to other privileged local processes. Keep the API loopback-only and use restricted camera accounts.
- No hardware camera, physical Raspberry Pi, ARM64/Linux installer, WSL RTSP networking, PowerShell updater or GitHub CI test is claimed. Automated tests use no real feeds.

## Testing

From Linux/WSL source folder:

```bash
bash tools/test-openrf-linux.sh
node --check openrf/static/surveillance.js
node tests/test_surveillance_frontend_v178.js
node tests/test_surveillance_frontend_v179.js
python3 -m unittest discover -s tests -p test_surveillance_v178.py -v
```

Manual hardware test (user device): install FFmpeg `sudo apt install ffmpeg`, add two valid private-LAN RTSP stream URLs, start each separately, verify frames, stop one while confirming the other remains. Test fullscreen per feed and Stop all. Reopen Surveillance and verify no streams auto-start.

## Install and start

Download `OpenRF-v0.2.179.zip` to Windows Downloads, then run in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.179.zip" -NoPush
```

Start from Ubuntu WSL:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Do not publish private RTSP camera URLs or credentials when reporting problems.
