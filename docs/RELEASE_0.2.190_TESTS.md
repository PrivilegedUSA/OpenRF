# OpenRF v0.2.190 test report — shared USB capture and recording UI

## Implemented
- User-requested manual USB capture starts exactly one FFmpeg V4L2 input, with separate H.264/MP4 file and 2 fps MJPEG stdout output. Python pump forwards complete frames to local same-origin preview clients and drains stdout even without a browser viewer. At most two live viewers and two recording sessions per existing limits. Recording is still **manual** and disabled on app startup.
- The old per-camera preview reader is stopped before the recorder accesses the USB device, then preview can reconnect against the recorder's shared output. Pausing a preview drops only that viewer, not the recording. A manual Stop & save stops capture and finalizes the MP4. No automatic external networking or cloud storage.
- Recording-history cards constrain video and buttons within the parent. Preview overlay order is Motion, Snapshot, Record, Pause, History.

## Tests
- Python local targeted synthetic FFmpeg checks verify live MJPEG output **and** finalized nonempty MP4 from a single generated video input, plus recording with no preview reader; not camera hardware.
- Browser offline DEMO-data geometry check: recording video and action row remain inside their parent at 1300×850, 1280×800 and 800×480.
- Full local regressions: **584 Python tests passed** in seven non-overlapping groups (`PYTHONPATH=tests:.`), and **152 JavaScript test files passed**. Python compileall and JS syntax passed. No on-device tests.

## Not verified / limitations
- Actual NexiGo N660 USB capture/FFmpeg dual output, other webcams, Raspberry Pi (thermal/CPU/performance), microphone/audio, RTSP/PTZ device tests, schedules and motion recording contention remain unverified. Two FFmpeg output encoders can demand more CPU than recording alone. USB snapshots and some motion/schedule flows still use separate FFmpeg captures, and may need further coordination. The 2 fps live preview is not full frame-rate monitoring; the MP4 recording uses the native input capture rate.
- No end-user Windows/WSL updater execution, Raspberry Pi installation, GitHub push or CI result verified.
