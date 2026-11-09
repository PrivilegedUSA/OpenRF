# OpenRF architecture v0.1.5

- **MainActivity:** Compose app shell, tab navigation; Scanner takes an explicit-save callback into `OpenRfViewModel`.
- **`data/`:** Room v1 `Observation` table/DAO/repository; retained schema protects existing installs. `MANUAL` records stay distinct from `BLE_SCAN`/`WIFI_SCAN` with `UNIDENTIFIED` verification.
- **`location/`:** one-shot foreground GPS/network location; no background location or route collection.
- **`feature/map/`:** MapLibre, OpenFreeMap street/dark styles, foreground auto-center, manual pin entry; radio survey markers always mean the phone's observation point (not emitter position).
- **`scanner/WirelessReading.kt`:** platform-independent record/status and timestamp freshness helpers with JVM tests.
- **`scanner/WirelessScanController.kt`:** Android BLE and Wi-Fi callback adapters. User-initiated and bounded to the visible Scanner screen/activity; stops on disposal / background, surfaces failures and throttling, rejects stale Wi-Fi cache.
- **`feature/scanner/`:** radio/permission UI, scan snapshots, one-shot user-selected saving at a current phone fix.
- **`feature/discoveries/`:** list/search/delete and source/verification details; both manual and explicit radio captures.
- **`feature/settings/`:** on-device CSV export and permission/privacy explanations.
- **`feature/investigations/`:** honest inactive session state.
- **`sensor/`, `alerts/`:** future hardware and alert contracts, no fake detections.

## Accuracy and privacy

Wi-Fi scans need `ACCESS_FINE_LOCATION`, `CHANGE_WIFI_STATE`, `ACCESS_WIFI_STATE` and device Location services enabled (Android 10+); BLE requires fine location and on Android 12+ runtime Nearby Devices permissions. This application does not assert `neverForLocation` because survey readings may be attached to coordinates. Scan results never establish transmitter coordinates, direction, identity, or distance. Only explicit Save persists radio metadata; leaving Scanner clears unsaved snapshots. Scan capture time and GPS save time can differ, and are labeled.

## Next

- Verify scanning and permission flows across Android versions and manufacturers; fix any build or runtime errors.
- Consider an opt-in local investigation session model and time-windowed history with well-defined provenance.
- Model deduplication over sessions and stronger stale-data rules before broader collection.
- Explore permitted passive ESP32 USB/BLE accessory communication and external SDR after phone scanning is proven.
- Explore true offline maps under compatible licensing; no unsupported navigation claims.
