# Local Valhalla on Ubuntu / WSL2 — optional road-routing setup

OpenRF's road-routing adapter uses a separately installed Valhalla server listening only at `127.0.0.1:8002`. The ZIP **does not contain Valhalla, Docker, street address geocoding, or road graphs.** Without a real graph, a dashed preview is **not a drivable route**.

The existing Northern California setup remains supported. **OpenRF v0.2.56 adds optional larger coverage regions** using a new `--region` flag, without replacing or deleting your original NorCal graph.

For region requirements, data sizes, privacy, and installation details see **[Valhalla routing regions](VALHALLA_ROUTING_REGIONS.md)**. The West region includes California and Nevada, while the advanced US region supports a nationwide graph on sufficiently capable hardware. All downloads are opt-in, local to your private Ubuntu home directory, and separate from visible map tiles.

## Quick commands (Ubuntu, not PowerShell)

```bash
cd /mnt/c/projects/OpenRF
bash tools/setup-valhalla-wsl.sh --status
bash tools/setup-valhalla-wsl.sh --plan --region california
bash tools/setup-valhalla-wsl.sh --plan --region west
bash tools/setup-valhalla-wsl.sh --plan --region us
bash tools/setup-valhalla-wsl.sh --doctor
# Example when ready (downloads source and starts a Valhalla graph build):
bash tools/setup-valhalla-wsl.sh --install --region california
bash tools/setup-valhalla-wsl.sh --logs
bash tools/setup-valhalla-wsl.sh --status
```

Requires WSL2, Docker Desktop with Ubuntu integration enabled (or a working Linux daemon), `curl`, adequate disk/RAM, and internet for the initial graph source. To verify routes, select an origin and destination inside the selected coverage. Service status alone is not proof that all tiles are usable. `--stop` and `--start` stop/start the existing private container without deleting its files.

### Walking and hiking graph checks (v0.2.135)

The OSM-derived graph built by Valhalla normally contains pedestrian-accessible ways as well as roads; OpenRF does **not** need a second overlapping PBF just to try walking routes. The selected region still must contain the actual trail/footway tags and connected ways. Valhalla's official graph-building documentation covers pedestrian edges: https://valhalla.github.io/valhalla/mjolnir/getting_started_guide/.

`--doctor` performs two opt-in read-only requests to your **local** Valhalla server: its existing Sacramento–Auburn driving example and a short downtown Sacramento pedestrian example. Neither request uses your location, starts GPS, downloads a map or changes the graph. A successful pedestrian sample confirms only that one fixed city route, **not** that hiking trails in the Sierra are available, safe, or open to the public. In Map → Where to? select **Walk** and plan your actual route to verify that specific origin and destination. Direct-line references are not walkable paths. Local routing still needs Valhalla running at 127.0.0.1:8002.

At zoom 11 and above, Walk mode also highlights **existing** OSM mapped paths (dashed teal) and tracks (dashed amber) on available vector tiles. No new path geometry is generated; offline raster mode cannot supply this highlighting and the installed regional vector dataset covers only its source area. Highlighting is independent of pedestrian routability and does not prove legal access or trail conditions.

## Address suggestions are separate

Valhalla routes between coordinates. It doesn't turn typed street addresses into coordinates. Use a saved place, choose a destination on the map, or explicitly enable an online geocoder (MapTiler, Photon, Census) for address suggestions. Such services may fail or be throttled. The existing local street-name hints do not verify house numbers. No GPS track is silently uploaded by the routing installer.

Routing data and maps are derived from OpenStreetMap (© OSM contributors, ODbL); Valhalla uses its own open-source license. **No real-time traffic data or field-verified lane guidance is available.** Camera-aware route comparisons and cautious GPS rerouting are available from v0.2.58; opt-in browser speech and optional mapped turn-lane hints were added in v0.2.59. All depend on actual road data, precise GPS, and appropriate safety checks.
