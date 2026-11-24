# OpenRF v0.2.183 — Saved-video motion review and local event history

## Implemented

- `openrf/surveillance_motion.py` (new): opt-in, offline frame-change analysis of a locally saved **completed** Surveillance video. The first **300 seconds maximum** are decoded through installed FFmpeg at **2 frames/second**, 128×72 grayscale. Scanning is limited to one concurrent job and a 45-second FFmpeg timeout. Detection is based on differences greater than 36 grayscale levels, with sensitivity thresholds (low 12%, medium 6%, high 2.5%) and a 6-second candidate cooldown. No AI person detection, live stream, background monitoring or auto-recording.
- Private SQLite `surveillance_motion_scans` and `surveillance_motion_events` tables. A scan receipt is saved even if zero changes qualify; re-scanning an individual recording replaces that recording's prior events transactionally. Scan errors do not replace prior results. Data lives beside the existing private database and survives source ZIP upgrades. If original video is later deleted, the saved scan says **SOURCE VIDEO UNAVAILABLE**.
- `openrf/server.py`: POST `/api/surveillance/recordings/{id}/motion-scan` accepts only `{"sensitivity":"low|medium|high"}`, with the existing loopback host and cross-origin protections. GET `/api/surveillance` now includes read-only `motion` history with no camera URL or credentials. DELETE `/api/surveillance/motion-scans/{recording_id}` explicitly removes analysis history, **not** video. All new actions require user input.
- `openrf/static/index.html`, `surveillance.js`, `surveillance.css`: Scan for motion button on completed MP4 entries with bytes on disk; selectable sensitivity; event offsets, sampled-pixel change fractions (not confidence scores), no-candidate history, source availability, and explicit analysis deletion. No camera is contacted by the motion panel.
- Regression tests `tests/test_surveillance_v183.py` and `tests/test_surveillance_frontend_v183.js`: pure frame algorithm, cooldown, invalid frames and IDs, actual FFmpeg processing of a **locally synthesized test video**, persistence, rescan behavior, deleted-video provenance, missing tool and busy errors, origin rejection, and frontend controls.
- Version metadata, release format example, Electron wrapper, changelog and README updated to v0.2.183. The original camera inventory, live previews, manual recordings, screenshot library, retention controls, and unrelated map/mesh/weather features were preserved.

## Verification (2026-11-24)

- **562 Python tests passed** in non-overlapping groups: 327 with pattern `test_[a-r]*.py`; 141 with `test_[t-z]*.py`; 17 with `test_sdr*.py`; 54 selected sensor/serial/server/storage/survey tests; 23 with `test_surveillance_v*.py`. The complete single-process suite was attempted but exceeded the execution window; no claim is made that a single uninterrupted full-suite command passed.
- **145 JavaScript test files passed** (all `tests/*.js`). One first attempt caught a stale version in `BUNDLE_FORMAT.md`; it was updated and all files passed on rerun.
- Python compilation, JavaScript syntax, shell scripts, manifest, release ZIP CRC integrity and managed path checks performed locally. See the actual packaged ZIP for precise contents.
- The video footage used in tests was generated from synthetic grayscale frames and is **not** a physical camera observation or live feed. No physical RTSP, V4L2/USB camera, Raspberry Pi, ARM64 Debian install, Windows PowerShell updater or GitHub CI was exercised.

## Manual test on a WSL/Pi install

1. Make a backup of local data. Install `OpenRF-v0.2.183.zip` using the existing `Update-OpenRF.ps1 -NoPush` command, then start with `cd /mnt/c/projects/OpenRF && python3 -m openrf` (on Pi use the equivalent installation directory).
2. Ensure FFmpeg is available (`ffmpeg -version`). Open Surveillance; do not open any camera unless you intend to. The new motion panel should initially show no scans; no footage is synthesized.
3. If you already have a **completed** recorded video with media bytes, select **Scan for motion**. Wait for the local processing result. Confirm its history reports the saved recording, scanned time, sensitivity, offset and approximate sampled pixel-change fraction. High sensitivity may report noise, shadows or exposure shifts as motion candidates.
4. Re-scan a recording with another sensitivity; its previous candidates should be replaced, not duplicated. Restart OpenRF; scans should persist. Deleting motion analysis removes history only, leaving the video untouched.
5. If you intentionally remove/clean up a video, its motion event history remains but shows the source video as unavailable. You can remove that history separately.

## Deliberate limitations

- Saved-video review only: **not continuous, real-time or motion-triggered recording**. It does not alert, classify people/vehicles, confirm motion, or localize a subject. Frame differences are a heuristic and may include false positives and false negatives.
- Only the **first five minutes** of each selected video are sampled; long recordings are not fully scanned. Timestamp offsets are estimates derived from sampled frames, not absolute camera-origin timestamps. Review time depends on FFmpeg, CPU and video codec; analyses are bounded by a timeout. Browser request stays pending until completion/error; only one scan runs at a time.
- No automatic pruning of event history, ONVIF/PTZ, portable battery-camera provisioning, phone access, secure remote streaming or Raspberry Pi multi-camera performance verification.
- Camera RTSP credentials remain locally stored in SQLite without at-rest encryption and may be visible to the Linux process owner. Use dedicated least-privilege camera credentials, and keep local OpenRF data out of Git.
