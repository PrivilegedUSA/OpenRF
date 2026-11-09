# OpenRF architecture v0.1

- **MainActivity**: Compose navigation shell; screens are explicit top-level modes.
- **`data/`**: Room `Observation` model, DAO, DB, repository contract, and independent validation logic.
- **`location/`**: one-shot Android location abstraction using allowed network/GPS providers, no background collection.
- **`feature/map/`**: MapLibre view, OpenFreeMap Liberty/Dark selectable styles, foreground auto-center with one-time permission prompt, manual annotation dialog, GPS point capture; **nothing presented as an actual radio reading**.
- **`feature/discoveries/`**: search, list, deletion and provenance details.
- **`feature/scanner/`**: real device capability checks and explicit inactive states.
- **`feature/investigations/`**: honest inactive session state.
- **`feature/settings/`**: local CSV export and privacy disclosure.
- **`sensor/`**, **`alerts/`**: capability interface placeholders without simulated detections.

## Observation trust model

All records v0.1 have `source=MANUAL`, `verification=UNVERIFIED`, and a timestamp when saved. Accuracy is either a platform-provided single fix accuracy or `null` when the user places a pin. Captured coordinates do not imply camera identification. No automated confidence percentages.

## Next steps

- Improve offline/failure UI states and optionally remember a deliberate map camera position; current styles are online only.
- Separate Gradle modules once compiling the initial foundation in CI.
- Add investigation sessions and controlled data export.
- Android permission-gated Wi-Fi/BLE scanning using only supported APIs; no fake spectrum scanning.
- Explore offline region download with an approved tile source.
