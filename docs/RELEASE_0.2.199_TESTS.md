# v0.2.199 verification and manual acceptance

Focused Python dashboard/history tests: 12 passed. Dashboard JavaScript regression scripts and history series test passed. Python compilation and dashboard JS syntax passed. Full regression, physical hardware, browser layout and GitHub CI not verified.

Install complete ZIP with Update-OpenRF.ps1; launch `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
Open Mesh Network; verify history disabled by default. Enable and apply settings, connect an authorized radio using existing controls, refresh inventory and select a node. Load history; unchanged snapshots should not duplicate. Disable recording before clearing history. Restart to verify persistence. Check both map renderers and existing messaging and surveillance.

Only changed cached records are sampled during dashboard/map refresh, not continuous background logging. Telemetry timestamp may be unknown or older than capture time. First/last saved is retention-window history, not first/last radio contact. Default retention 30 days, configurable 1–365; maximum 100,000 snapshots globally, newest 200 per node displayed. Expiration applied during refresh or settings changes; expired rows hidden on reads. Clearing logical rows is not secure erasure or deletion from backups. History includes private identifiers and coordinates in the existing local database. No new radio commands or uploads.
