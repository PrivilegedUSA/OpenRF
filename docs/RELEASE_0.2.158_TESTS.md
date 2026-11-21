# OpenRF v0.2.158 — Reticulum message attachments (Phase 1)

Date: 2026-11-20

## Delivered

- `openrf/reticulum_attachments.py` (new): one-file validation, 128 KiB transfer cap, PNG/JPEG/WebP signature detection, native LXMF image/file fields, and a 4 MiB / 100-entry ephemeral attachment buffer with random IDs.
- `openrf/reticulum_lan.py`: Reticulum worker accepts text plus one optional attachment (or attachment alone), queues a standard LXMF message, reads attachments from signature-validated incoming messages and serves their bytes only for the active worker session. Missing paths and unverified recipients retain their original **not sent** statuses; queue submission is **not** receipt confirmation.
- `openrf/reticulum_history.py`: additive, backwards-compatible message metadata columns. Opt-in SQLite history stores name, size and type, **not file content**. Expired attachment links are identified honestly after a restart.
- `openrf/server.py`: specifically bounded Reticulum send JSON body (to hold Base64), and a loopback-only binary attachment endpoint with validated random IDs, content disposition and no-content-sniffing protection.
- `openrf/static/index.html`, `openrf/static/reticulum.js`, `openrf/static/app.css`: one-file chooser, removable selection, local image preview, safe received-image thumbnails and explicit download links. Selecting a new recipient clears an unsent attachment.
- `tests/test_reticulum_attachments_v158.py`, `tests/test_reticulum_attachments_v158.js` (new): message bounds, file-name safety, opt-in metadata migration, HTTP download behavior, mocked LXMF send/receive and frontend contracts.
- Version metadata updated to `0.2.158` in the root release manifest, Python app, Electron shell package and version assertions; `README.md` and `CHANGELOG.md` updated.

## Checks performed

| Check | Result |
| --- | --- |
| `python3 -m unittest discover -s tests -p 'test_*.py' -q` | **439 tests passed** |
| Every suite in `tests/*.js` run with `node` | **128 JavaScript suites passed** |
| Targeted Python Reticulum attachment tests | **7 tests passed** |
| Targeted frontend and existing Reticulum thread tests | **Passed** |
| `node --check openrf/static/reticulum.js` | **Passed** |
| LXMF attachment delivery test | **Simulated** with in-process fake RNS/LXMF, including incoming bytes; no real RF peer |

## Intended operator test

1. Install this complete source release with `Update-OpenRF.ps1`, restart the local server, and open **Messages → Reticulum**.
2. With explicitly configured, authorized Reticulum peers and a known valid LXMF destination, choose one small PNG/JPEG/WebP image (or PDF), optionally enter text, and press **Send**. Verify that the status says **queued**, not **delivered**. Wait for an actual receiving peer to confirm reception.
3. On the receiving peer, verify that the attachment appears with a preview for supported image types and that Download saves a matching file. On disconnect/restart, verify that only any opted-in filename/size history remains and the download link is marked expired.
4. Try a file larger than 128 KiB, an empty file, and an invalid filename. They should be refused before radio submission. Clearing Reticulum messages also clears active in-memory file bytes.

## Limits and caution

- 128 KiB is a deliberately conservative **application cap**, not a guarantee that any particular low-bandwidth radio link can carry a message that size. Transfers may be slow, use substantial radio airtime, fail from link loss, or never find a Reticulum path. Actual RNode and Raspberry Pi tests are pending.
- This is normal LXMF field-based interoperability. **Large files** will need a dedicated Reticulum `RNS.Resource` or suitable transfer mechanism, explicit receiver consent, progress/resume/cancel and disk space limits. **Voice memos**, real-time calling, **Meshtastic** attachments and **Bluetooth** nearby file sharing are not implemented by this release.
- Attachments and previews remain local to the running worker unless the user explicitly downloads them. The optional history database stores unencrypted message text and filename/size metadata; operators who need secrecy should leave history disabled or secure their device.
- No automatic camera, microphone, Wi-Fi, location, GPS, cloud, background scan or Bluetooth permission is added. No required new Python dependency, map behavior change, or installed hardware reading is claimed.

## Next patch

**Phase 1B:** Design and prototype larger peer-to-peer transfers using Reticulum Resources (or equivalent supported transport) with explicit offer/accept, safe size/storage quotas, progress, cancellation, retry and integrity checks. Then consider short compressed voice messages and authorized Bluetooth proximity sharing as separate phases. Continue Raspberry Pi installer/first-boot verification when hardware is available.
