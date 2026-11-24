# OpenRF v0.2.192 test and release notes

## Implemented
- On-demand, cached JPEG video thumbnails from the first frame of completed private MP4 recordings. One inline accordion player, not a player at the end of all rows. Preview failures display a play glyph instead of invented footage. Snapshot thumbnails remain local.
- Click-to-sort table headings: date/time, camera, type, status and size; filter by Today / Last 7 days / Last 30 days / All time, independently of saved-camera selection. This does not delete or export any data.
- Per-camera opt-in audio preferences stored in local SQLite. Compatible RTSP audio mapped optionally. Linux USB video can be recorded with explicitly selected ALSA capture microphone where supported; enum listing via `arecord -l` without opening hardware. No microphone is automatically enabled when viewing previews. FFprobe checks the finalized MP4 for an actual audio stream, and browsers may play AAC with video.
- Thumbnails and original media are private and stay outside managed source files. Failed/active recordings do not receive video thumbnails. Strict numeric media IDs, same-origin protections, bounded FFmpeg processing and cached-thumbnail removal on deletion.

## Test steps on Windows WSL
1. Install ZIP with the existing PowerShell updater using `-NoPush`, then run `cd /mnt/c/projects/OpenRF && python3 -m openrf` in Ubuntu.
2. In Surveillance → Recordings, confirm completed videos have a still-image thumbnail; click a date or thumbnail. The player must open directly under that row. Click another row to switch; click selected row to collapse. Test sorting using table headers and date filters; verify none alters saved files.
3. In Surveillance → Cameras → Edit NexiGo, turn on Include audio. The separate microphone dropdown may be empty on WSL; if so, leave audio off rather than assume passthrough. `arecord -l` requires optional `alsa-utils`; audio is **not** part of `/dev/video0`.
4. If you have a working Linux ALSA capture device, choose it, save, record a short clip and Stop & save. Check the playback audio icon and whether the Media detail reports audio verified. If no mic is usable, existing video-only recording should continue to work.
5. Optionally test a compatible private RTSP camera with an audio track. The stream's credentials remain private and are never returned in inventory.

## Test status and limitations
- Unit tests validate camera/audio options, private thumbnail access, deletion and generation from synthetic FFmpeg video with an artificial sine-wave AAC track. UI tests and browser DOM checks use labeled demo data; no physical audio input or camera video was captured.
- Real NexiGo audio/WSL microphone, RTSP sound, camera hardware performance, Raspberry Pi and installers remain unverified. Some Linux USB microphones have no ALSA hardware capture node; in this case audio is unavailable and video-only remains supported. No live audio playback in preview, transcoding of historical clips or automatic audio capture is provided.
