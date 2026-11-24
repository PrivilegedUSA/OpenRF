# OpenRF v0.2.185 — Release notes and test instructions

## Added

- Surveillance Cameras: a detected Linux V4L2 dropdown, readable sysfs camera labels, Refresh USB cameras, and Advanced `/dev/videoN` field. Detection never opens a camera; some V4L2 nodes are metadata interfaces rather than usable video streams.
- Surveillance Schedules: per-camera same-day weekday windows, saved locally in SQLite, disarmed every app restart. Explicit **Arm schedules this session** required before camera recording. Runs only while OpenRF is running, with a cap of two simultaneous recordings and one-hour segments. Schedule errors and waiting/recording states are visible; disarming stops only scheduler-owned recordings.
- Motion & Events: off-by-default in-app notices about newly observed live motion candidates, with optional permitted browser desktop notifications. No cloud, service worker, or background push; browser/window must remain open, and a separate user-started live monitor must be running to generate events.
- Surveillance sidebar uses a camera-outline SVG that follows the existing icon styling.

## Local test instructions

1. `cd /mnt/c/projects/OpenRF && python3 -m openrf` after updating from the complete source ZIP; install FFmpeg if the app reports it missing.
2. Open Surveillance → Cameras. Plug in an owned/authorized Linux-supported webcam; click Refresh USB cameras, pick its named device and save. With WSL the webcam may remain invisible if it belongs to Windows; Linux V4L2 access, permission and stream format are **not** verified by the picker. A USB path can change on reboot.
3. In Surveillance → Schedules, select a saved camera, weekday(s) and start/end times in your browser's IANA timezone; save. Verify state DISARMED and no camera contact, then explicitly arm. Disarm when finished. Use a short window for testing and remember the app must be running.
4. In Motion & Events, enable local alerts and optionally request desktop notification permission, then explicitly start live motion monitoring for a camera in Overview. Only **new** events may alert. Motion is image difference, not a person/intrusion classification.
5. Run `PYTHONPATH=.:tests python3 -m unittest -q tests.test_surveillance_v185` and `node tests/test_surveillance_frontend_v185.js` inside project root. For full regression use `bash tools/test-openrf-linux.sh` (may require splitting long-running suites).

## Limits / safety

- No actual NexiGo webcam, other USB/RTSP camera, ARM64 Raspberry Pi, Linux .deb installation or GitHub CI verification. Tests use temporary private SQLite files and fake recording instances, not an actual camera feed.
- No ONVIF automatic IP camera discovery, PTZ, 24/7 background notifications, automatic resume/arming after restart or remote viewing. Motion alerts are local UI/browser-only.
- Saved local recordings and source credentials remain private in user data outside the bundle. Loopback-bound unauthenticated API must not be exposed to the LAN. FFmpeg command lines can still expose URLs to local machine administrators; prefer dedicated camera accounts.
- No GitHub push, user installation, or hardware verification is claimed by a release ZIP build.

## Test results

- **Python:** 573 unittest cases passed in five non-overlapping groups using Python 3.13, `PYTHONPATH=tests:.`. Group sizes: 101, 147, 121, 107, 97. The targeted v185 seven Python tests passed independently as well.
- **JavaScript:** 147 Node.js regression test files passed locally; the new v185 frontend checks passed independently.
- **Syntax/static checks:** Python `compileall` and module compilation, `node --check` for Surveillance, Bash `bash -n` for existing launch/build scripts, duplicate HTML ID scan passed.
- **Hardware/CI:** No webcam, Raspberry Pi, WSL/Windows install, GitHub push or CI test was performed. Python 3.11/3.14 matrix remains unverified in this environment.
