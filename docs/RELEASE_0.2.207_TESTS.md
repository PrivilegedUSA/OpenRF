# v0.2.207 — Public directory download reliability

Builds on the complete v0.2.206 source. No new providers or automatic requests. Official MeshCore Map endpoint unchanged. User verified the endpoint with curl: HTTP 200, 57,692,384 bytes, 21.51 seconds. This does not establish the original Python client's failure cause or validate the live JSON schema.

The backend reads chunks, publishes byte counters through a small local status endpoint, and distinguishes connection, download, JSON parsing, record validation and cache saving. The browser polls status only during a manual refresh; it uses determinate progress only with Content-Length. The network read timeout is 90 seconds (previously 20); the five-minute transfer deadline is checked between reads. Input/cache cap 128 MiB, input row cap unchanged at 200,000. Existing cache replacement remains atomic. Ordinary failures allow retry after 30 seconds; successful refreshes retain the five-minute cooldown; HTTP 429/503 use at least five minutes and honor a numeric Retry-After if longer. No redirects are followed by the backend. No local radio data or viewport coordinates sent to provider.

## Verification
- Python 3.13.5 full discovery: 618 passed, 0 failures. Focused public directory tests: 7 passed, including concurrent status HTTP request, truncation, retry, and cache preservation.
- Node 22.16.0: all 166 prior scripts passed; new progress UI fixture passed separately (167 total). JS syntax, Python compilation, Valhalla shell syntax and release consistency checks passed.
- Synthetic 57,692,379-byte transfer successfully parsed and normalized (one test node with padding; not a real provider sample).
- Existing SQLite ResourceWarnings remain. Live upstream download through OpenRF, real browser UI, Raspberry Pi memory/performance, hosted usage terms, Windows updater, Python 3.11/3.14 CI remain unverified. The user mentioned a GitHub Actions error without supplying its text, so it could not be diagnosed.

## Install and test
Stop OpenRF. Save the ZIP to Downloads. PowerShell: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1' -ZipPath "$env:USERPROFILE\Downloads\OpenRF-v0.2.207.zip" -NoPush`.
WSL: `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
Open Map → Layers → Public mesh network → Download / refresh MeshCore. Watch byte counts and stage text; confirm mapped node count, then zoom and pan. If unsuccessful, capture the exact error; do not remove existing cache to troubleshoot.
