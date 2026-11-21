# OpenRF v0.2.161 — Nearby paired Bluetooth files

Date: 2026-11-20

## Changed files

- `openrf/bluetooth_files.py` **new:** authenticated/encrypted Linux Bluetooth Classic RFCOMM socket transport, exact paired/trusted MAC gating, opt-in five-minute/one-file receiver, sender progress, cancel, bounded header/raw bytes, SHA-256 integrity and explicit receipt, ephemeral download buffer and cleanup on server close. No mandatory Python module dependency.
- `openrf/server.py`: local-only `GET /api/bluetooth/status`, `GET /api/bluetooth/download/<token>`, consent-header guarded `POST /api/bluetooth/arm`, `/send`, `/cancel`, `/discard`; 2 MiB Base64 JSON send limit, safe binary download disposition and static asset allowlist.
- `openrf/static/index.html`, `app.css`, **new** `bluetooth-files.js`: compact panel above Reticulum controls; read-only adapter address, exact sender/receiver MAC fields, file selection, explicit confirmation, 5-minute receiver window, progress/cancel/Download/Discard; only read-only status on panel opening. No Bluetooth scan/pairing on load.
- `tests/test_bluetooth_files_v161.py` **new:** size/name/address, crypto-socket refusal, paired/trusted validation, synthetic two-party send/receipt, ignored foreign peer, checksum rejection, session-only storage, loopback download and consent header.
- `tests/test_bluetooth_files_v161.js` **new:** UI binding, no automatic action, read-only status, explicit send and receive confirmations, file encoding and request consent.
- `README.md`, `CHANGELOG.md`, `docs/BLUETOOTH_FILE_SHARING.md` **new**, root manifest, Python/Electron app versions and existing version test expectations bumped to 0.2.161.

## Verification

| Check | Result |
| --- | --- |
| Python `python3 -m unittest discover -s tests -p 'test_*.py' -q` | **457 tests passed** |
| All Node JavaScript tests `tests/*.js` | **131 suites passed** |
| `node --check` on native Electron and Bluetooth/Reticulum frontend JavaScript | **Passed** |
| Two manager instances sending over simulated paired RFCOMM sockets | **Acknowledged after receiver checksum verification** |
| Wrong-address sender, corrupt bytes, unsupported security, unpaired peer, malformed/oversized file | **Rejected in simulation** |
| Local-only HTTP download and explicit POST consent gate | **Passed** |

## Not hardware verified

- No actual Linux Bluetooth Classic adapter, BlueZ pairing process, kernel RFCOMM negotiation, encrypted link or physical Pi-to-Pi file transfer was available to the build environment. Runtime support is explicitly reported instead of invented. Most Windows WSL Python builds cannot open a Linux Bluetooth Classic socket even when Windows itself has Bluetooth.
- Real speed, power use, long sessions, adapter manufacturer quirks, Bluetooth pairing prompts, two-Pi user experience, pairing security and cancellation under OS driver failures must be tested on hardware. Only the private OpenRF RFCOMM protocol is implemented; neither OBEX phone interoperability nor Bluetooth LE packet transfer is part of this patch.
- The 2 MiB per-file bound preserves in-memory simplicity for this release. Larger files, automatic chunk retry, transfer resume, direct disk streaming, quotas and on-device pairing UI remain future work.
- OpenRF v0.2.160 voice-note microphone/speaker paths are unchanged. Browser MediaRecorder, actual Pi sound card output and microphone selection are untested on hardware; no auto-recording, livestream call or background audio service is introduced.

## Quick on-device validation (not run by this patch)

1. On two real Linux/Pi devices, confirm `bluetoothctl show` exposes a usable Classic controller and the OpenRF page reports its actual address. Pair **and trust** both ways in Linux Bluetooth settings; verify `Paired: yes` and `Trusted: yes` with `bluetoothctl info <address>`.
2. Open **Messages → Reticulum → Nearby Bluetooth file sharing** on both. On the receiver, arm a five-minute window restricted to the sender's exact MAC. On the sender, choose a small `.txt` and confirm Send to the receiver MAC.
3. Confirm receiver's **Download file** appears only after checksum verification. Save it, compare SHA-256 on the two devices and verify sender shows ACKNOWLEDGED only after receiver accepted. Test expired window, wrong MAC, cancel, missing BlueZ, missing RFCOMM and oversize file.
4. Repeat with a small photo and PDF, then test 2 MiB near the limit. Measure transfer times and battery use. Verify that closing OpenRF closes any listener and clears received bytes that were never downloaded.

## Next patch

After two physical devices are available: improve Bluetooth pairing/discovery UX, hardware readiness diagnostics and optional larger streaming transfers with storage quotas. For voice notes, add a Pi-facing **Audio input/output readiness and test** screen before considering realtime voice-call feasibility.
