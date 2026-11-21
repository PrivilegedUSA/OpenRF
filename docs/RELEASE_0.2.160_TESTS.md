# OpenRF v0.2.160 — Short voice notes in Reticulum (Phase 2)

Date: 2026-11-20

## Changed files

- `openrf/static/index.html`, `reticulum.js`, `app.css`: explicit Record / Stop / Discard controls, microphone status and 20-second timer in the existing Reticulum LXMF composer. Recording requires a user click and browser permission. Stop stages a local audio preview, while the existing separate **Send** click submits the attachment. Navigation away or cancellation stops the microphone without sending.
- `openrf/reticulum_attachments.py`: recognize WebM, Ogg and MP4 container signatures for in-session, byte-backed received audio attachments; serve them as the corresponding audio MIME type for manual playback. Unknown bytes remain a forced-download generic attachment. Existing validated LXMF `FIELD_FILE_ATTACHMENTS`, filename and 128 KiB limits stay in force.
- `tools/openrf-electron/main.js`, `preload.js`: user-armed, 30-second permission window for an **audio-only** microphone request from the trusted localhost OpenRF UI, with a separate permission check handler. The embedded external Chromium website views retain permission denial. The web UI also works in compatible ordinary browsers without Electron.
- `tests/test_reticulum_voice_v160.py`, `.js`: microphone lifecycle, explicit consent/preview, file byte signatures, size/filename/HTTP safeguards and native permission isolation contracts. Updated one older mock frontend fixture for the new capture cleanup, and updated version tests / release metadata.
- `README.md`, `CHANGELOG.md`, `openrf-bundle.json`, Python/Electron versions and static asset version keys updated to v0.2.160.

## Verification

| Test | Result |
| --- | --- |
| Python `python3 -m unittest discover -s tests -p 'test_*.py' -q` | **449 tests passed** |
| Every JavaScript script in `tests/*.js` executed with Node | **130 suites passed** |
| `node --check` for Reticulum frontend and Electron entry/preload | **Passed** |
| Mock `MediaRecorder`: no initial capture, one explicit microphone request, Stop releases tracks, preview before Send | Passed in controlled simulation |
| Ogg/WebM/MP4 recognition and existing LXMF file-field compatibility | Passed in unit tests |
| Bounded, loopback-only audio download with byte-sniffed content type | Passed in HTTP unit test |

## Manual test on Linux / Raspberry Pi (not done here)

1. Update two compatible OpenRF devices to v0.2.160. Enable Reticulum, configure a **real** peer path, and verify microphone input is present and authorized by the OS. On the sender, select an LXMF conversation and tap **Record voice note**; the browser or Electron shell should request microphone access only then.
2. Speak for a few seconds, tap **Stop**, preview the local clip, optionally type a short message, and press **Send**. Verify a receiver with a codec-compatible browser can deliberately press Play, and can explicitly download the original file if playback is unsupported. Inspect the actual LXMF route/receipt; queued or accepted does not mean received.
3. Repeat with **Discard**, thread switch, app hidden during capture, denied microphone permission, a missing microphone device, a 20-second automatic stop and a large recording. Confirm no accidental transmission and that capture releases the hardware each time.
4. Test ordinary Linux browser and Electron separately. Confirm the browser's native permission UI and Pi/WSLg audio stack; external browser tabs in Electron must not acquire microphone permissions via OpenRF. Check radio airtime before using voice clips on slow RNode links.

## Limits and safety

- **20 seconds**, requested **24 kb/s**, and **128 KiB** are application constraints, not a guaranteed size or codec; the browser chooses actual sample rate and encoder. This release does **not** transcode or compress an oversized capture again, and peer playback is dependent on codec/container support. Unsupported browsers or missing permission show an error; nothing is captured or sent automatically.
- Voice messages reuse standard small LXMF file attachments; they are **not** realtime calls or a streaming radio channel. No voice detection, transcription, always-on microphone, voice broadcast, automatic retransmission, Meshtastic audio, Bluetooth file exchange or cloud upload was added.
- Recorded bytes and received audio remain ephemeral in the current Reticulum worker/session, except if the operator explicitly downloads a copy. Optional chat history retains attachment metadata, not audio. Sender queue acceptance cannot certify that an actual recipient received/heard the recording.
- Browser tests and synthetic bytes are **not** real Raspberry Pi sound hardware or over-the-air peer testing. Battery impact, RF throughput, codec interoperability and Electron microphone behavior must be verified on the target hardware before operational use.

## Next patch

Phase 3 groundwork for consent-based nearby **Bluetooth file exchange between OpenRF devices**: investigate Linux BlueZ capabilities, pairing/trust and secure transfers, file quotas and cancel behavior. Keep BLE discovery separated from file payload transport; hardware-specific verification and two-device Reticulum voice testing remain on the checklist.
