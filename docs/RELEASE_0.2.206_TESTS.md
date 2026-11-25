# v0.2.206 — Public MeshCore directory foundation

## Scope and data provenance

First public provider: official MeshCore Map, https://map.meshcore.io/ . Its official frontend repository documents the nodes endpoint (https://github.com/meshcore-dev/map.meshcore.io). OpenRF uses the standard JSON endpoint at https://map.meshcore.io/api/v1/nodes, not the compact binary endpoint. No upstream code copied. Hosted API usage terms and live schema still need direct confirmation before broad distribution. Do not enable automatic polling without provider agreement. No private network discovery or packet collection.

Public nodes are separate from local radio inventories, message history, topology, telemetry and emergency backups. The app downloads a current public snapshot only upon explicit button press; the provider receives an ordinary HTTPS request, not GPS fixes, radio IDs, messages or coordinates of the user's map viewport. Standard connection metadata such as IP address remains visible to the provider. Cache is `public-meshcore.json` beside the main local DB, excluded from source releases. No public location history is maintained. A successful download replaces the snapshot, including removal of nodes absent from the new response; failed downloads keep the previous file. Clear is explicit. Snapshots more than 30 days old are hidden on reload; date always shown. Five-minute in-process refresh cooldown, 64 MiB response/cache bound and 200,000 input row bound. Invalid geographic coordinates and duplicates are counted. No inferred coordinates or reachability. Public layer selection is independent of local layers. MeshCore nodes includes all eligible roles; MeshCore repeaters selects repeater records only. Map clusters represent screen-space groups, not network connections. Cluster details show up to 30 records; zoom in for smaller clusters. Node role and directory timestamp are provider-reported, not current radio observations.

Meshtastic and Reticulum public directory adapters are not included in this release. They require feed schema and hosted API usage review. Provider coverage cannot be measured against an unknown worldwide population.

## Manual acceptance

1. Stop the prior version. Download complete bundle to Downloads and run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.206.zip" -NoPush`.
2. WSL: `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
3. Map → Layers → Public mesh network → Download / refresh MeshCore (online). Verify status counts, provider source, timestamp, clusters and node details. No hardware required. If provider rejects the request or schema changes, status should explain failure; do not substitute fake nodes.
4. Enable/disable each public layer, zoom/pan and select clusters. Verify local layers, navigation, map menus and popup closing continue to work. Repeat in raster fallback and on a 1280×800 device.
5. Disconnect internet, restart OpenRF, enable cached layers. Verify nodes are available without contacting provider (basemap connectivity is separate). Clear snapshot; local mesh inventory is unaffected.

## Test limitations

Live feed request from development environment failed to connect. HTTP integration uses injected synthetic records, not actual MeshCore data. Hosted data-use terms, actual provider response, full browser rendering, Raspberry Pi performance, physical radios, Windows updater and GitHub CI remain unverified. No claims about actual live map coverage.

## Executed regression results

- Full Python discovery: 613 tests passed (Python 3.13.5); the new HTTP test was added after discovery and run separately. Focused public directory suite: 3 tests passed, including HTTP integration.
- All 166 JavaScript scripts passed (Node 22.16.0). Release asset consistency test rerun after adding the public asset assertion, passed.
- Python compilation, ZIP CRC, manifest, original-file preservation: passed.
- Existing SQLite ResourceWarnings remain. Actual provider feed and physical hardware not validated.
