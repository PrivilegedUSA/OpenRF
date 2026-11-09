# Investigation sessions — v0.1.6

## Scope

- User starts a named session in **Sessions**. Only one session may be active.
- While the app remains in the foreground, the user switches to **Scanner** and explicitly initiates bounded BLE or Android-managed Wi-Fi scans. Completed scans are stored in the active session automatically. Failed, unavailable and interrupted Wi-Fi scans are never recorded as successful scans. BLE scan results are deduplicated by observed ID *within* each scan, not across time.
- Each completed scan has a timestamp, medium, count (including zero), and optional **receiver phone location** obtained via one foreground location request. If the fix is missing, coordinates stay NULL. A scan point does not establish the location of a transmitter or camera.
- Individual **Save survey point** buttons in Scanner remain separate and still write to the original `observations` table with map markers. Bulk session readings are **not** turned into infrastructure pins automatically.
- Switching away from Scanner stops any active scan. Leaving the app ends the session with `INTERRUPTED`. On process restart, unfinished sessions are marked `INTERRUPTED` rather than silently resumed. An unexpected process death leaves its actual end time unknown, rather than inventing a timestamp. No background/continuous scanning, location logging, route recorder, cloud upload, or device identification is implemented.
- Sessions/scan batches/readings persist in new Room tables. Deleting a session cascades to its scan batches/readings; saved Discoveries are independent and unaffected.

## Data upgrade

Room database name is unchanged: `openrf-observations.db`. Migration `1 -> 2` **only adds** `investigation_sessions`, `session_scans`, and `session_readings` plus foreign-key indices; it does not touch `observations`. Do not use `fallbackToDestructiveMigration`. Install new APK **over** v0.1.5 without uninstalling it.

## Export

On Sessions, open an investigation and tap **Export session CSV**. Each row contains metadata on the session and scan, optional receiver coordinates/accuracy, and one reading; empty successful scans get a row with blank reading columns. Dangerous leading spreadsheet formula characters in advertised names / IDs are escaped. Exports use Android's document picker; nothing is uploaded automatically. Treat Wi-Fi/BLE identifiers and receiver positions as private data.

## Device test matrix

1. Upgrade over v0.1.5. Verify saved manual Map pins and individual wireless Discoveries survive.
2. Start named session. Enter Scanner; manually run BLE scan for 12 seconds. On returning to Sessions, confirm one successful BLE scan with real readings and timestamps, including an explicit zero-result state when applicable.
3. Run Wi-Fi scan while session is active; check received SSIDs/BSSIDs, dBm, frequencies and one record per completed scan. Check throttled/failed scans are not counted as completed.
4. Re-run BLE and Wi-Fi (as allowed by Android) to verify readings are retained **across scan cycles** rather than overwritten. Confirm scanner continues to request permission normally.
5. With location disabled or unavailable, a session scan still persists, but receiver coordinates remain unavailable rather than fabricated.
6. Stop session manually; return to Scanner and confirm subsequent scans do not append to ended session. Then start a fresh session.
7. Open a saved session, review scan cycle timestamps and receiver positions and export CSV with Android document picker. Verify CSV counts and zero-result rows.
8. Start a session, put app in background, return and verify marked INTERRUPTED. Kill the app and reopen to ensure no session quietly resumes. Confirm deleting a session does not remove Map/Discoveries entries.
9. Test rotations and tab switches, including leaving Scanner during a BLE scan. Scanner shuts down rather than recording forever.

## Limitations

- Local, foreground-only capture. No GPS route or continuous RF monitoring.
- Per-scan BLE entries are bounded by the existing 150-result controller limit and Wi-Fi by 200.
- Distinct observed identifiers can represent the same physical device, or multiple identities can be ephemeral.
- Current Android/Room integration and actual v1->v2 migration must be confirmed in GitHub Actions and on a phone.
