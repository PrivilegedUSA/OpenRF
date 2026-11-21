# OpenRF v0.2.159 — Reticulum Resource file transfer (Phase 1B)

Date: 2026-11-20

## Changed files

- New `openrf/reticulum_resources.py`: 2 MiB validated outbound file, distinct `openrf.files` receiver destination, explicit announce, one-shot five-minute receive authorization, Reticulum Link/Resource progress and cancellation, sender-declared SHA-256 integrity check and 8 MiB bounded in-memory received file store.
- `openrf/reticulum_lan.py`: Resource session tied to the explicitly enabled Reticulum child, separate IPC commands for status, announce, arm/disarm, send, cancel and download. Does not alter the existing LXMF chat address or messaging behavior.
- `openrf/server.py`: validated, loopback-only `/api/reticulum/files/status`, `/announce`, `/arm`, `/send`, `/cancel`, `/download/<id>`; the larger Base64 JSON body cap applies only to file send. Served downloads always use `application/octet-stream` and attachment disposition to avoid executing received HTML.
- `openrf/static/index.html`, `reticulum-files.js` (new), `app.css`: collapsible Peer file transfer panel, manual destination/file selection, consent gate, status/progress, cancel and explicit download controls.
- `tests/test_reticulum_resources_v159.py`, `.js` (new) and backwards-compatible LXMF mock fixture update.
- `README.md`, `CHANGELOG.md`, root `openrf-bundle.json`, Python/desktop app versions and existing version tests updated to v0.2.159.

## Verification

| Test | Result |
| --- | --- |
| Python `python3 -m unittest discover -s tests -p 'test_*.py' -q` | **445 tests passed** |
| Every JavaScript file in `tests/*.js` executed with Node | **129 suites passed** |
| `node --check openrf/static/reticulum-files.js` | **Passed** |
| Fake Reticulum Resource send → progress → conclude, and receive → checksum → download | **Passed in simulation**, not over the air |
| Receiver-off, one-use arm, expiration, oversized file rejection, unsafe filenames | **Passed** |
| Loopback HTTP file GET and static script route | **Passed** |

## Device validation procedure (not done here)

1. Install v0.2.159 on **both** Linux OpenRF devices and install their optional `rns` and `lxmf` Python packages in the runtime environment. Bring up their explicitly configured Reticulum LAN, direct TCP or properly configured RNode transports. This is a separate action from simply opening Messages.
2. On **receiver**: Open **Messages → Reticulum → Peer file transfer**. Copy the **file address** (not LXMF chat address), press **Announce file address**, share it with the sender through a trusted channel, and press **Receive next file (5 min)**.
3. On **sender**: Enter that exact 32-character file address, choose an appropriate small file, and confirm **Send file to peer**. If status is `PATH_REQUESTED_NOT_SENT`, no file was sent: let path discovery finish, then press Send again. Confirm the sender reports a real Resource completion and the receiver offers an actual download.
4. Download on receiver and compare file hashes between the two devices. Try cancelling before completion, letting an unused arm window expire, and rejecting an oversized file. Note elapsed time and actual RNS transport and radio configuration. Verify no file is permanently stored without operator Download.

## Limits / assumptions

- The receiver must be a compatible OpenRF v0.2.159 or later instance exposing the `openrf.files` endpoint. `LXMF`/Sideband's ordinary messaging identity is **not** automatically a file endpoint, and no cross-app rncp negotiation is implemented.
- Up to **2 MiB** is an OpenRF application limit, not a tested RF throughput guarantee. Very slow RNode links can time out or consume excessive airtime. RNS `Resource` handles segmenting, coordination and checksums; the explicit application SHA-256 checks the received bytes against the sender-declared metadata, but does not prove the sender is a trusted person.
- Only **one** incoming file is authorized for up to five minutes; any reachable peer that knows the file address can submit an offer during that window. The file is **not saved automatically** by OpenRF; Reticulum may use implementation-managed temporary spool files before callback. A cancelled or interrupted transfer is **not automatically resumed**. Metadata is not merged into LXMF conversation history.
- Real `rns`/`lxmf` Link callbacks, Raspberry Pi ARM64 performance, WSL network reachability, radio hardware, peer confirmation and user interaction are **not verified** by simulated tests. No Bluetooth or Meshtastic transfer, real-time voice, automatic reception or public-network API is added.

## Next patch

Hardware-assisted two-device verification of this transfer path, then reliability improvements driven by measured link results: optional receiver-identity verification, transfer retry/queue controls, and larger streamed-to-disk files with user-chosen storage quotas. After that, move to **Phase 2: recorded voice notes** (short, compressed, explicitly captured and sent); keep live voice calling as a separate feasibility study.
