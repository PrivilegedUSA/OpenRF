# OpenRF v0.2.180 — Opt-in RTSP camera diagnostics

## New functionality

- Each saved RTSP camera now has a **Test connection** action. Nothing runs until clicked.
- Uses local `ffprobe` with a nine-second process deadline to check for a video stream; shows codec and dimensions when returned.
- Errors never echo ffprobe output, camera credentials or the private RTSP URL.
- At most one diagnostics process runs at a time; concurrent requests return HTTP 429.
- Results remain UI-only for this session and are not proof of ongoing connection.
- Existing two-stream monitoring, inventory and other OpenRF features are preserved.

## Still pending

- ONVIF discovery/configuration, USB cameras, high-rate streaming, recordings, playback, snapshots, and all Mesh Network Dashboard work.
- ffprobe is optional; install with `sudo apt install ffmpeg`. Credentials are still stored unencrypted in local private SQLite and may be visible in local process arguments.
- No actual RTSP camera, Raspberry Pi, PowerShell updater, or external mesh radio tested. Camera testing uses mocked subprocess results only.

## Tests

```bash
python3 -m unittest discover -s tests -p 'test_surveillance_v180.py' -v
node tests/test_surveillance_frontend_v180.js
bash tools/test-openrf-linux.sh
```

## Installation

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.180.zip" -NoPush
```

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```
