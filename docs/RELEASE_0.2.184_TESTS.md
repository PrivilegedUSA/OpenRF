# OpenRF v0.2.184 — Test and release notes

## Features

- Explicit camera-specific live motion monitoring with FFmpeg 128×72 grayscale sampling at 2 fps, low/medium/high frame-change thresholds, startup warmup, and per-event 30-second cooldown.
- Motion-triggered H.264 local MP4 recording requests limited to 20 seconds per clip; one monitor, maximum 20 minutes per session. Clips are verified as saved only when a nonempty media file is recorded. No clip pre-roll. Recording/preview streams need independent access to the same camera and may conflict on some cameras, especially USB V4L2.
- A local SQLite live motion event log, including dates, percent pixels changed (not probability/confidence), recording-request/result state and recording identifiers; separate from saved-video manual scan history.
- Monitor stops on user request and backend shutdown; browser navigation tries to stop it, but unexpected browser crashes can leave monitoring active until the bounded 20-minute session ends. No restart/resume on backend launch.
- Surveillance Overview / Cameras / Recordings / Motion & Events tabs with card spacing and keyboard tabs. New app navigation begins at Overview; a genuine reload restores the current page.

## Testing and limitations

- `python3 -m unittest tests.test_surveillance_v184 -q` exercises synthetic raw-frame change detection, consent-controlled worker lifecycle, persistence, local API validation, and cross-origin rejection.
- `node tests/test_surveillance_frontend_v184.js` checks tabs, controls, spacing, and startup behavior.
- `bash tools/test-openrf-linux.sh` runs the complete Linux regression suite. See actual release results separately; never infer physical camera or ARM64 Pi verification from simulation.
- No physical camera, ONVIF, Wi-Fi pairing, PTZ, microphone, browser performance, or Raspberry Pi test was performed. Real camera video may be encrypted/unsupported, streams may not allow dual readers, and motion detection will produce false positives from shadows and light changes. No camera access or motion-triggered clip is active without explicit operator action.

## Local install

1. Back up local data, place `OpenRF-v0.2.184.zip` in Downloads, install using `Update-OpenRF.ps1 -NoPush` and start WSL with `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
2. Install the optional FFmpeg tools (`sudo apt install ffmpeg`) to enable camera decode and recording.
3. Add an authorized RTSP or USB camera in Surveillance > Cameras. From Overview, select **Start motion + clips**, confirm; view live events in Motion & Events. Press Stop when finished.

## Results in this development environment (2026-11-24)

- **Python:** 566 unittest cases passed across six non-overlapping grouped runs using `PYTHONPATH=tests:.`, after fixing a stale Weather Hub version comment. This was Python 3.13, not the GitHub Python 3.11/3.14 matrix. Focused Surveillance v184 tests independently passed.
- **JavaScript:** 146 Node.js test suites passed (Node 22), with earlier assertions updated to match the new Overview default and opt-in monitoring status polling.
- **Syntax:** Python `compileall`, JavaScript `node --check`, and Bash `bash -n` passed.
- Local HTTP tests use ephemeral loopback ports and synthetic fixtures. No GitHub push or CI run, no real camera, no Raspberry Pi hardware tests, and no production FFmpeg RTSP-to-recorded-clip test was carried out.
