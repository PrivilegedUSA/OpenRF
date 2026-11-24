# v0.2.189 — Surveillance controls / USB capture handoff

## Implemented
- Camera wall: borderless vector overlay icons, centered primary capture/action controls, separate right-side digital zoom and user-requested V4L2 PTZ, compact multi-camera layout, no horizontal overlay scrollbar.
- Recordings: actions in bottom row, left motion review and right download/delete, with existing explicit delete confirmation. Media remains outside managed source in the existing local data directory.
- A user-requested USB capture pauses the in-browser live preview; the local server also closes its own active FFmpeg preview readers for that camera before starting another FFmpeg process. An active USB recording blocks a conflicting USB live preview/snapshot. Existing consent, session and storage safeguards remain.

## Tests and limitations
- **Python:** 582 tests passed in seven non-overlapping groups (including the three new v189 USB preview-release tests and prior Surveillance tests).
- **JavaScript:** 151 test files passed under Node.js (including new v189 overlay regression).
- **Chromium:** DEMO synthetic camera preview smoke tested at 1300×850, 1280×800 and 800×480: two-camera previews, digital zoom, centered Record control, no browser JS errors. The browser test uses fake camera inventory/responses, not physical cameras.
- Backend Python compilation, frontend JavaScript syntax, canonical release-version tests and local release-builder tests passed.
- Browser interaction using **DEMO synthetic** camera entries at 1300×850, 1280×800, and 800×480; no live webcams or internet.
- No NexiGo recording tested from this environment; improved USB read coordination does not guarantee all USB cameras can record, support motion clips, or provide independent image and video streams. The old FAILED history entries are preserved, not modified by source updates. FFmpeg recorder errors are still sanitized; the app does not diagnose a specific physical failure cause.
- No Raspberry Pi, Windows installer, Electron package installation, GitHub push/CI or real RTSP camera validation.
