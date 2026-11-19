# OpenRF emergency foundation and AM/FM broadcast radio roadmap

## Current emergency foundation

- v0.2.115: local emergency contacts, meeting points, checklists, and unsent SOS drafts.
- v0.2.116: user-supplied offline text-reference library with source labels and case-insensitive local search. No online retrieval or claim that uploaded material is verified.
- v0.2.117: data-only JSON knowledge-pack import, duplicate protection, and a downloadable CC0 project-authored preparation starter pack. Imported text remains unverified.
- v0.2.118: explicitly requested browser geolocation can be appended to a reviewable, locally saved SOS draft; no transmission or delivery is attempted.
- v0.2.119: explicit handoff from an SOS draft to existing Meshtastic or Reticulum sending, with opt-in confirmation, destination validation and persisted submission statuses. Human delivery remains unverified.
- v0.2.120: correlate Meshtastic routing receipts when packet metadata is actually available; show safe manual retry preparation without automatic resend. No human-read acknowledgment or Reticulum delivery claim.
- v0.2.121: durable local emergency outbox, one-at-a-time explicit send claims, crash-uncertain recovery, manual retry preparation, removal and transport-readiness display; no automatic store-and-forward transmission.
- v0.2.122: private family/team directory and all-or-nothing preparation of separate addressed outbox messages per team member. Every send still requires operator confirmation.
- v0.2.123: check-in status board, opt-in fresh browser location for self-reports, unsent draft preparation and explicit reported-location map overlay; does not automatically receive authenticated peer positions or transmit.
- Planned: offline import for portable documents, curated openly licensed reference packs with attribution and version dates, emergency message templates with opt-in GPS, and actual transport adapters with delivery evidence.

## AM/FM broadcast receiver — planned, not implemented

Provide radio controls directly in the OpenRF touchscreen UI:

1. Switch **AM / FM** bands without changing radio hardware manually.
2. Tune with up/down buttons and numeric frequency entry: US broadcast AM in 10 kHz steps and FM in 200 kHz channels (configurable for other regions).
3. Seek to next receivable station where the selected tuner supports it.
4. Save local frequency presets, adjust audio volume/mute, and show receiver connection/unsupported/error states.
5. Show station name/RDS only if decoded by the installed receiver; never invent a station or signal strength.
6. Keep broadcast radio reception separate from the existing amateur-radio programming and general SDR receiver features.

### Candidate hardware

- **Si4735-family broadcast tuner:** compact dedicated AM/FM receiver with hardware tuning support, potentially lower power than Pi-driven SDR demodulation. Needs antenna, audio path and microcontroller/I²C integration tested on chosen breakout.
- **RTL-SDR Blog V4:** compatible SDR can receive broadcast FM and medium-wave AM in its supported hardware range with suitable demodulation, antenna and signal levels. Needs Linux audio pipeline, tuner selection, gain/filter control and CPU/power measurements. Other RTL-SDR models may not cover medium-wave AM directly.

### Acceptance criteria

- No play/tune success indication without a connected, identified receiver and confirmed tuning operation.
- AM/FM switching, manual tune, presets, volume and mute work from 800×480 touchscreen without horizontal scrolling.
- Clear station status when RF signal is weak, antenna absent or device disconnected.
- Audio continues only while explicitly enabled; battery and thermal impacts measured.
- Entirely offline reception: no streaming service or account required.

This is a design plan. Current v0.2.116 does **not** include an AM/FM tuner driver or working audio.
# v0.2.124 implemented: radio inbox review

The Emergency page can explicitly snapshot already-received Meshtastic and Reticulum/LXMF text messages into a private, deduplicated local review inbox. A human must choose the claimed person and interpreted status before saving a `RADIO_MESSAGE_REVIEWED` check-in. Sender addresses and receiver-local timestamps are retained; signatures and transport-level sender addresses do **not** independently prove who typed a message. No coordinates or automated distress handling are inferred. This is not a live receiver test.

# v0.2.125 implemented: ORF1 compact emergency message framing

Structured check-ins use the text-only format `ORF1|C|<12 hex id>|<sender Unix time>|<S/H/E/C>|<base64url person>|<base64url note>`; a simple text acknowledgment claim is `ORF1|A|<id>`. Every full check-in is at most 180 UTF-8 bytes. Timestamps are from the composing device, not receiver-verified GNSS. Neither frames nor ACKs authenticate persons or guarantee delivery. Received frames are *previewed only*, never auto-accepted; a user must review them separately in the radio inbox. Operators can prepare a local draft and queue it to saved team members, but only existing manual send operations can transmit. Physical interop and adversarial-replay testing remain future work.

# v0.2.126 implemented: emergency operations dashboard

A read-only manual-refresh field console summarizes the latest saved check-in per person label, reported need for help, report age and provenance, pending radio reviews, outbox lifecycle states, saved team recipients and local radio interface readiness. Six-hour/24-hour age flags apply to *stored reports* only; the app never claims that they represent verified safety or live peer locations. No automatic forwarding, tracking, or distress-triggered transmission occurs. Physical off-grid evaluation remains future work.

# v0.2.127 implemented: conservative device survival checks

Linux sysfs-reported battery percentage and external power, free disk bytes and a read-only SQLite quick-check are displayed when available, otherwise UNKNOWN/UNAVAILABLE. These are host diagnostics, not calibrated battery runtime or validated UPS behavior. A six-item UTC-stamped manual pre-departure checklist persists in the local DB. Pi power-hat/UPS identification, safe shutdown GPIO/signals, sleep/display-only power profiles, runtime estimation and two-day battery field trials remain hardware-dependent future milestones; none is activated by the current release.

# v0.2.128 implemented: private encrypted database snapshot

An explicit one-click encrypted export of the primary SQLite database and a separate decrypt-and-preview check are available when the optional `cryptography` Python package is installed. AES-256-GCM with a fresh nonce and 600k-round PBKDF2-HMAC-SHA256 key derivation protects the downloaded file; the passphrase is not persisted. The backup includes everything stored in the main SQLite database, **including sensitive investigations**, not just emergency check-ins. No auto upload, scheduled backup, live database overwrite, restore, map-cache export, separately stored radio histories or large local data directories. Snapshots are capped at 16 MiB and verified read-only. Full transactional restore requires a later, separately reviewed safety design.

# v0.2.129 implemented: offline backup restoration and local clock/calendar

The recovery command `python3 -m openrf.restore --preview --backup /path/to/file.orfbak` verifies without restoring. When OpenRF is completely stopped, run `python3 -m openrf.restore --backup /path/to/file.orfbak` and supply the passphrase at the hidden prompt, then enter `RESTORE OPENRF` to authorize. Running servers hold the same exclusive restore lock; existing SQLite journal/WAL sidecars prevent replacement. The command retains a timestamped private safety copy, stages a verified database on the same filesystem and atomically replaces the primary database, attempting rollback on post-swap verification failures. This restores **only the primary database**. Carefully verify records before deleting any safety copy. An offline clock and browseable month calendar now appear in the header; time comes from the device clock, which may be wrong without GNSS/NTP/manual setup. No scheduled events, alerts or time synchronization are claimed.

# v0.2.130 implemented: emergency UI polish and walking route preview

The Emergency page receives consistent spacing and responsive action rows; the clock is centered on non-map headers. Map destination search adds an explicit pedestrian Valhalla route preview, visually distinct from driving routes, with GPS walking follow disabled until tracking/guidance is implemented. This only works where local Valhalla graph tiles include connected foot-accessible OpenStreetMap paths/trails. No live trail feed or dataset download is bundled. Future steps: reproducible OSM trail graph imports, hiking difficulty/access overlays, dedicated offline footpath map styling, opt-in breadcrumb recording/backtracking with durable local storage, and pedestrian-follow navigation with safety/accuracy safeguards.

# v0.2.131 implemented: opt-in walking breadcrumbs and Emergency header shortcut

Map → GPS and walking trails now contains browser-position breadcrumb recording, durable local SQLite tracks, browser accuracy and fix-age checks, historical trail/backtrack map overlays, and user-triggered GeoJSON/GPX export or deletion. Tracks never start without a Start click. A hidden tab stops the watch on a best-effort basis; any server-restarted recording session is marked INTERRUPTED and cannot silently resume. Users must stop any leftover session before starting another. This does **not** provide native/background GNSS, a trail download, off-path detection, reliable turn-by-turn return guidance, trail condition verification, automatic radio beaconing or SOS transmission. A persistent header Emergency shortcut navigates to the Emergency page in one tap from any app page, including the map; it performs no distress action itself.

Still needed for truly dependable offline walking: a dedicated OS-level GNSS recording service on supported Pi hardware (independent of browser visibility), explicit retention/battery budget and outage recovery, fully offline vector trail datasets with licenses/attribution, locally built foot-accessible Valhalla graphs, grade/accessibility warnings, verified route-follow/reacquisition and field trials. Browser position is not assumed to be GPS and no path geometry is represented as safe terrain.

