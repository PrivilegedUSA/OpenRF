# Optional offline Valhalla routing profiles — OpenRF v0.2.56

**Road routing is not the visible map.** The familiar OpenRF map continues using its existing Amador/Calaveras regional basemap plus its selectable online maps. This feature expands *road graph coverage* for calculating a drivable path and planned maneuvers. **No live traffic, turn-by-turn reliability guarantee, or ALPR-avoidance routing is included.**

## Why a whole-U.S. graph is not automatically installed

Geofabrik distributes compressed raw OSM `.pbf` input, not a ready-to-route Valhalla graph. Approximate downloads as of November 2026:

| Profile | Coverage | Raw PBF | Suggested free disk **before build** | Suggested available build RAM |
|---|---|---:|---:|---:|
| `norcal` | Northern California | hundreds of MB | 8 GiB | 3 GiB |
| `california` | Entire California incl. Sacramento, El Dorado, Stockton, Modesto | 1.2 GB | 16 GiB | 6 GiB |
| `west` | U.S. West, including California and Nevada | 3.2 GB | 32 GiB | 10 GiB |
| `us` | Entire United States | 11.4 GB | **100 GiB** | **24 GiB** |

These disk/RAM figures are **guardrails and planning estimates**, not measured requirements or guarantees. The final routing tiles, temporary build data and PBF will all consume space; an entire-country graph could require many tens of GB. Large graph building can be memory- and CPU-intensive, and a small Raspberry Pi may need a graph prebuilt on a larger computer and transferred separately. Do not attempt the `us` build on a 32 GB SD card. For smaller portable installations, use the region in which you actually expect to travel.

Source: [Geofabrik US extracts](https://download.geofabrik.de/north-america/us.html), [US West extract](https://download.geofabrik.de/north-america/us-west.html) (© OpenStreetMap contributors, ODbL) and [official Valhalla scripted image guidance](https://github.com/valhalla/valhalla/blob/master/docker/README.md). The actual requirements change with source date, chosen regions, Valhalla version, and configured Docker memory.

## Commands — Ubuntu (WSL), after normal OpenRF patch installation

Make sure Docker Desktop is running with Ubuntu WSL integration and `docker info` works. **First inspect coverage without downloading anything:**

```bash
cd /mnt/c/projects/OpenRF
bash tools/setup-valhalla-wsl.sh --status
bash tools/setup-valhalla-wsl.sh --plan --region california
bash tools/setup-valhalla-wsl.sh --plan --region west
bash tools/setup-valhalla-wsl.sh --plan --region us
```

**Choose just one profile to install**. California is the conservative option to cover the user's requested Sacramento/Modesto region; West covers California + Nevada and many neighboring states; U.S. is an advanced large-storage option.

```bash
# Example: start with the whole western US (DO NOT run multiple installs concurrently)
bash tools/setup-valhalla-wsl.sh --install --region west
# Alternatively, choose --region california or --region us, not all three.
bash tools/setup-valhalla-wsl.sh --logs
bash tools/setup-valhalla-wsl.sh --status
```

The tool stores downloads under `~/.local/share/openrf/valhalla/` (or `OPENRF_VALHALLA_DATA_DIR`). Its legacy Northern California graph remains in the original root directory, while other regions are stored separately under `profiles/{california,west,us}`. **Changing regions never deletes an older graph or the user's saved observations.** One active Docker container called `openrf-valhalla` exposes `127.0.0.1:8002`; when the selected PBF exists, explicit `--install` switches to the chosen graph profile and starts/restarts its build. Interrupting a download preserves the `.partial` file for a later resume. The Docker image is pulled before replacing a working container. If creating the replacement container fails, the script makes a best-effort effort to restore the prior container. Do not manually rename/extract archives into the other profiles.

A successful PBF download and a responding Valhalla `/status` endpoint do **not** prove that a complete road graph was built. Wait until the Docker logs indicate processing is complete, then use Map → Plan a trip → Check local routing service and test a route between two points **inside the selected graph**. Routes outside the covered region may fail legitimately. Example: Sacramento to Modesto for California; Sacramento to Reno for West. Do not test an interstate journey until its graph exists.

To stop/restart the routing container without losing its data:

```bash
bash tools/setup-valhalla-wsl.sh --stop
bash tools/setup-valhalla-wsl.sh --start
```

Stopping Ubuntu/WSL also stops the Docker process and OpenRF Python server. After boot, start Docker Desktop, start Valhalla if needed, and then run `python3 -m openrf` from the project directory. On a portable Raspberry Pi, Valhalla must be running locally for offline road routing.

**Notes:** Do not place downloaded PBF, generated routing tiles, GPS tracks or private investigation data in `C:\projects\OpenRF` managed source paths or GitHub. This script uses a fixed Geofabrik source URL for each known profile and does not execute user-provided remote URLs. The Valhalla service stays bound to loopback. None of these optional large data downloads are in the OpenRF ZIP, run automatically, or verified on your computer. Street address search/geocoding still requires a separate offline/online solution; having routing graph tiles alone does not provide an address directory.
