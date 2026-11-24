# OpenRF v0.2.182 — Surveillance history cleanup

## Changes

- `openrf/surveillance_recording.py`: dry-run age preview and explicitly approved deletion of exactly reviewed eligible recording IDs. Ages are bounded (1–3650 days). Active/capturing files are excluded and eligibility is rechecked before deletion; there is no scheduled cleanup.
- `openrf/server.py`: loopback-only POST `/api/surveillance/cleanup/preview` and `/api/surveillance/cleanup/apply` using the existing origin/host restrictions. Explicit selections, not arbitrary file paths, are accepted.
- `openrf/static/index.html` / `surveillance.js`: touchscreen-friendly review and confirmation controls with live counts and bytes. Inventory refresh remains passive.
- `tests/test_surveillance_v182.py` / `test_surveillance_frontend_v182.js`: selection validation, protection for active/recent media, cross-origin denial and visible UI controls.
- Metadata, Electron wrapper version, changelog and README updated to v0.2.182.

## Manual checks

1. Install the full bundle using your existing PowerShell updater with `-NoPush`.
2. In Surveillance > Local recordings, enter an age in days and select **Review old media**. It must show the number/space eligible without removing files.
3. Confirm deletion only if those media items are expendable. Active and newer media are always excluded.
4. Reload the app; verify older media was deleted but recent media, saved cameras and recordings still exist.
5. Without an actual RTSP or V4L2 device, video playback/streaming/hardware-specific operation cannot be proven.

## Limitations

- Retention is **manual only**, not a scheduled policy, size quota or storage enforcement. The selected age is not a saved global default.
- ONVIF discovery/PTZ, motion events/automatic recording, wireless portable pairing, hotspot integration, battery telemetry and real Raspberry Pi performance are not implemented/verified in this release.
- Local Python/API tests are mocked and do not validate real physical cameras, live networking, FFmpeg codecs or driver compatibility.
- The PowerShell installer, actual WSL deployment, GitHub Actions and ARM64 installation have not been run here.
