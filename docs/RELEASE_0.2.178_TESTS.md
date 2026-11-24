# OpenRF v0.2.178 — Surveillance Stage 1A

## Delivered

- Distinct Surveillance sidebar workspace; add, rename, edit RTSP endpoint and remove cameras with persistent SQLite saved under the user's existing OpenRF private application data directory.
- Actual **on-demand RTSP** live preview through optional installed `ffmpeg`: 960px wide maximum and 2 fps MJPEG, two streams maximum; no background video connection and no recording.
- Camera inventory explicitly **NOT CHECKED** until manually viewed; missing FFmpeg is shown as missing. Camera host is surfaced, credentials and full URL never included in API responses. No fabricated feeds.
- Private-network IPv4 source restriction, loopback HTTP server only, Origin protections for writes and same-origin-only camera view, and no shell command execution.

## Not yet delivered

Full camera-grid live video, real stream health history, USB cameras, ONVIF discovery, high performance native viewing, recording/snapshots/playback/retention, automatic camera discovery, portable radio pairing, PTZ and device telemetry. Mesh Network Dashboard Stage 1 follows this implementation. Nothing should be advertised as implemented until subsequently added and tested.

## Development testing

Local test groups passed: **544 Python tests** across four discovery groups and **141 Node.js suites**; compilation and syntax checks passed. They use simulated responses, not physical camera streams.

From Ubuntu at `C:\projects\OpenRF` mounted under `/mnt/c/projects/OpenRF`:

```bash
cd /mnt/c/projects/OpenRF
bash tools/test-openrf-linux.sh
```

This runs local Python, JavaScript and syntax checks; no GitHub push. Camera-specific tests:

```bash
python3 -m unittest discover -s tests -p test_surveillance_v178.py -v
node tests/test_surveillance_frontend_v178.js
```

Install FFmpeg, if required, with your distribution's package manager (e.g. `sudo apt install ffmpeg`). In Surveillance, add a known working **private LAN IPv4 RTSP URL** and select **View live**. Only that explicit action attempts the camera connection. Stop closes the requested preview; leaving the workspace also closes it. RTSP transport uses TCP. If a camera rejects the stream, check its RTSP stream path, account permissions, client RTSP support, firewall and whether Linux can reach it. A camera that supports only manufacturer cloud APIs may not work.

### Privacy and hardware limitations

- SQLite camera URLs containing passwords are local but **not encrypted at rest**. The spawned FFmpeg command line can expose the source URL to local OS processes with sufficient privileges. A camera-specific least-privilege login is recommended. The source ZIP includes no local credentials.
- Do not expose the development HTTP server outside loopback, and do not proxy camera streams to LAN without authentication.
- Simulated URLs used in automated tests **are not real camera tests**. No physical RTSP camera, USB video device, 7-inch Raspberry Pi screen, Pi OS ARM64 FFmpeg, Windows updater, or live hardware has been verified.
- No records are created or video saved in this stage. Do not mistake a loaded saved camera entry for proof it is online.

## Local updater and launch

Download `OpenRF-v0.2.178.zip` into Windows Downloads, then from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.178.zip" -NoPush
```

Run from Ubuntu WSL:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Never put a full RTSP URL with credentials in bug reports or a GitHub issue.
