# v0.2.208 — MeshCore provider compatibility and CI fixtures

Builds from v0.2.207. User's download reached 100%, then reported no valid geographic records. The previous parser expected `lat` / `lon`, while public MeshCore directory consumers use `adv_lat` / `adv_lon` (decimal degrees). References: https://gist.github.com/bdevel/8d9817575f83c4fe6d6ca9b52658f6d2 and https://github.com/radio-actief/RRY-Map-Bot . Live response from the user's machine has not been inspected; this is the likely explanation, not verified live compatibility. Strict validation remains, and explicitly missing advertised coordinates do not fall back to other position fields. No new providers, automatic requests, or radio activity.

The progress element is hidden and reset on failure, with the terminal error still visible; retry restores the indicator. Existing cache preservation and download limits are unchanged. Two surveillance unit fixtures now mock FFmpeg availability and process creation where appropriate, without runtime surveillance changes. CI log had one failure and one error when FFmpeg was missing. Real FFmpeg integration tests still skip when tools are absent.

## Verification
- Full Python regression suite: 621 tests passed, zero failures or skips (81.080 seconds).
- Ten public mesh Python tests passed, including provider-shaped synthetic download, normalization, cache reload and failure retention.
- All 167 JS scripts passed, including terminal failure and retry handling. Python compilation, JS syntax, shell syntax and release version consistency passed.
- Synthetic 53,994,400-byte payload with 50,000 distinct provider-shaped nodes normalized to 50,000 records without rejection. No actual provider data packaged.
- Both affected surveillance modules were run with PATH=/nonexistent: four tests passed, two real-media integration tests skipped.

## Installation and acceptance
Stop OpenRF. Save ZIP to Downloads. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.208.zip" -NoPush` in PowerShell. Start WSL with `cd /mnt/c/projects/OpenRF && python3 -m openrf`. Reload the browser and download/refresh MeshCore from Map Layers. A successful snapshot automatically selects public MeshCore nodes; inspect counts and pan/zoom. If validation fails, keep the cache and report the error. If the earlier curl file still exists, run `python3 -c 'import json; from openrf.public_mesh import normalize; d=normalize(json.load(open("/tmp/meshcore-nodes.json"))); print("received",d["received"],"mapped",len(d["nodes"]),"rejected",d["rejected"])'` from the project directory to check it without another provider request.

Live API compatibility, full browser rendering on the user's machine, Pi performance, Windows updater and GitHub CI remain unverified. Python tested locally on 3.13.5, Node on 22.16.0.
