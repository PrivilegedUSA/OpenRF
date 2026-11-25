# v0.2.200 acceptance

Network activity & health is collapsed by default. Expand on Mesh Network. Verify each protocol shows inventory age buckets, location and infrastructure counts, and telemetry ranges with sample counts. Unknown timestamps are not stale. Recent activity is limited to 20 reported source timestamps; click a node to inspect it. Interface counters remain in the overview. No new radio requests or history collection are introduced.

Install with the existing PowerShell updater using OpenRF-v0.2.200.zip; launch in WSL using `cd /mnt/c/projects/OpenRF && python3 -m openrf`.

Focused tests: 2 health, 10 dashboard, 1 release consistency Python tests; dashboard, history, health and release asset JavaScript scripts passed. JS syntax checked. Full suite, physical hardware, browser layout and CI not verified. Statistics are cached inventory summaries, not network uptime, link quality estimates or packet counts. The one-hour age threshold is inherited; recent activity is a snapshot, not a continuous event log.
