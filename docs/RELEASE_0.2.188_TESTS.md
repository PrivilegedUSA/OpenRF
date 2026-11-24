# v0.2.188 — Surveillance overlay and recording status verification

## Scope

- Existing v0.2.187 source ZIP verified, no changes to reserved updater scripts, personal data or installation state.
- `openrf/static/surveillance.js`, `surveillance.css`, `index.html`: icon-based in-video controls; PTZ overlay is closed until requested, only for USB cameras, and reads device capability on request. Available camera count is a preview-request count, not verified stream availability.
- `openrf/surveillance_recording.py`: completed/failed recording state now requires nonempty output, and Stop returns its actual outcome and byte count. Finalized MP4 availability is never promised from process launch alone.
- Recordings can be filtered per camera; active recording entries now offer an explicit Stop & save action; finished playable media has Download and native playback.

## Validation and limits

- **Python:** 579 unit tests passed across 7 non-overlapping test-module groups (Python 3.13 in the build environment), including the 2 new v188 recording lifecycle tests. Group tests contain a real synthetic FFmpeg recording finalized and reopened without a camera. See local per-group logs.
- **JavaScript:** 150 test files passed using Node.js v22; scripts and Python compiled.
- **Chromium smoke:** off-network synthetic preview data, tested at 1300×850 and 800×480 with 3 DEMO camera entries: 3 tiles, only 2 preview requests, overlay zoom and video elements, and pause of second preview correctly enlarged single-camera layout and hid Expand grid. No live device connected in this test.
- **Not tested:** NexiGo on user machine with v188, real simultaneous preview and video capture, live USB recording/RTSP, physical Raspberry Pi, Electron installer or GitHub CI. Regression suite is a software-only validation, not evidence of field reliability.
- FFmpeg/USB: some cameras don't allow simultaneous preview, recording and snapshots; pause a preview to release USB capture access if recording repeatedly fails. A running recorder may report 0 file bytes until MP4 finalization. Output can fail if FFmpeg has an unsupported encoder or USB format.
- Cropping: `object-fit: cover` prevents exposing empty bars during drag but intentionally crops mismatched aspect ratios; this is a display choice, not a higher-resolution camera capture.
