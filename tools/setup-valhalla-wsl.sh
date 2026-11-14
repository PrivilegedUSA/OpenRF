#!/usr/bin/env bash
# OpenRF optional Valhalla routing-data profile manager (WSL / Linux / Raspberry Pi OS).
# Offline graph inputs live outside the managed source tree and are never auto-downloaded.
set -euo pipefail

ACTION='--status'
REGION='norcal'
DATA_DIR="${OPENRF_VALHALLA_DATA_DIR:-${HOME}/.local/share/openrf/valhalla}"
IMAGE='ghcr.io/valhalla/valhalla-scripted:latest'
NAME='openrf-valhalla'

usage() {
  cat <<'HELP'
OpenRF offline road ROUTING (Valhalla), not visible basemap tiles.
  bash tools/setup-valhalla-wsl.sh --status                 Local profiles and active service
  bash tools/setup-valhalla-wsl.sh --doctor                 Docker/graph/HTTP + Sacramento-to-Auburn reference route
  bash tools/setup-valhalla-wsl.sh --plan --region west     Sizes and disk/memory checks; no download
  bash tools/setup-valhalla-wsl.sh --install --region norcal       Small existing default
  bash tools/setup-valhalla-wsl.sh --install --region california   All California
  bash tools/setup-valhalla-wsl.sh --install --region west         US West incl. CA/NV
  bash tools/setup-valhalla-wsl.sh --install --region us           Entire United States; advanced
  bash tools/setup-valhalla-wsl.sh --start                  Start existing active profile
  bash tools/setup-valhalla-wsl.sh --stop                   Stop without deleting routing data
  bash tools/setup-valhalla-wsl.sh --logs                   Last 60 lines of Valhalla output
  bash tools/setup-valhalla-wsl.sh --help

All downloads require explicit --install. Region sources are mutually exclusive profiles:
selecting a new region never removes the prior region's source files/tiles. Only one
Valhalla service can listen on loopback 127.0.0.1:8002. Changing region needs a new
routing graph; the current region remains active until the new source is downloaded.
US-wide builds are substantial, not suitable for a small Raspberry Pi by default.
Docker must be running for --install / --start, but not for --plan.
HELP
}

while (($#)); do
  case "$1" in
    --install|--status|--start|--stop|--logs|--plan|--doctor)
      [[ "$ACTION" == --status ]] || { echo 'Choose one action.' >&2; exit 2; }
      ACTION="$1"; shift ;;
    --region)
      (($# >= 2)) || { echo 'Missing --region value' >&2; exit 2; }
      REGION="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$REGION" in
  norcal)
    PBF='norcal-latest.osm.pbf'; SOURCE='https://download.geofabrik.de/north-america/us/california/norcal-latest.osm.pbf'
    LABEL='Northern California'; APPROX='regional hundreds of MB'; MIN_FREE_GIB=8; MIN_MEMORY_GIB=3; MIN_PBF_BYTES=100000000; TARGET_DIR="$DATA_DIR" ;;
  california)
    PBF='california-latest.osm.pbf'; SOURCE='https://download.geofabrik.de/north-america/us/california-latest.osm.pbf'
    LABEL='California'; APPROX='about 1.2 GB'; MIN_FREE_GIB=16; MIN_MEMORY_GIB=6; MIN_PBF_BYTES=400000000; TARGET_DIR="$DATA_DIR/profiles/california" ;;
  west)
    PBF='us-west-latest.osm.pbf'; SOURCE='https://download.geofabrik.de/north-america/us-west-latest.osm.pbf'
    LABEL='US West (includes California and Nevada)'; APPROX='about 3.2 GB'; MIN_FREE_GIB=32; MIN_MEMORY_GIB=10; MIN_PBF_BYTES=1000000000; TARGET_DIR="$DATA_DIR/profiles/west" ;;
  us)
    PBF='us-latest.osm.pbf'; SOURCE='https://download.geofabrik.de/north-america/us-latest.osm.pbf'
    LABEL='Entire United States'; APPROX='about 11.4 GB'; MIN_FREE_GIB=100; MIN_MEMORY_GIB=24; MIN_PBF_BYTES=5000000000; TARGET_DIR="$DATA_DIR/profiles/us" ;;
  *) echo 'Choose --region norcal, california, west, or us.' >&2; exit 2 ;;
esac

exists() { command -v docker >/dev/null 2>&1 && docker container inspect "$NAME" >/dev/null 2>&1; }
active_source() {
  if exists; then
    docker inspect --format '{{range .Mounts}}{{if eq .Destination "/custom_files"}}{{.Source}}{{end}}{{end}}' "$NAME" 2>/dev/null || true
  fi
}
show_profiles() {
  echo 'Offline routing sources (source PBF is not a built graph):'
  for item in "$DATA_DIR" "$DATA_DIR/profiles/california" "$DATA_DIR/profiles/west" "$DATA_DIR/profiles/us"; do
    [[ -d "$item" ]] || continue
    for f in "$item"/*.osm.pbf; do
      [[ -s "$f" ]] || continue
      printf '  %s — %s bytes\n' "$f" "$(stat -c %s "$f")"
    done
    if [[ -s "$item/valhalla_tiles.tar" ]]; then
      printf '  %s — built graph archive present (not proof of route coverage)\n' "$item/valhalla_tiles.tar"
    fi
  done
}

case "$ACTION" in
  --status)
    echo "Routing data root: $DATA_DIR"
    show_profiles
    if exists; then
      echo "Active Valhalla data directory: $(active_source)"
      docker ps -a --filter "name=^/${NAME}$" --format 'Container: {{.Names}} — {{.Status}}'
    else
      echo 'Container: not installed or Docker is unavailable'
    fi
    if command -v curl >/dev/null 2>&1 && curl --fail --silent --max-time 3 'http://127.0.0.1:8002/status' >/dev/null 2>&1; then
      echo 'Valhalla HTTP responds at 127.0.0.1:8002; route tile coverage still requires a route test.'
    else
      echo 'Valhalla HTTP not responding at 127.0.0.1:8002.'
    fi
    exit 0 ;;
  --doctor)
    echo 'OpenRF Valhalla read-only diagnosis (no download, build, or GPS use)'
    echo "Private routing files: $DATA_DIR"
    show_profiles
    if ! command -v docker >/dev/null 2>&1; then
      echo 'Docker CLI: unavailable in Ubuntu. Install/enable Docker Desktop WSL integration.'
    elif ! docker info >/dev/null 2>&1; then
      echo 'Docker daemon: unavailable. Start Docker Desktop and enable integration for Ubuntu.'
    elif ! exists; then
      echo 'OpenRF Valhalla container: missing. Install a region (e.g. --install --region norcal).'
    else
      echo "Active graph directory: $(active_source)"
      docker ps -a --filter "name=^/${NAME}$" --format 'Container: {{.Names}} — {{.Status}}'
      echo 'Container logs (latest 12 lines; errors may indicate a graph build still underway):'
      docker logs --tail 12 "$NAME" 2>&1 || true
    fi
    if ! command -v curl >/dev/null 2>&1 || ! curl --fail --silent --max-time 4 'http://127.0.0.1:8002/status' >/dev/null 2>&1; then
      echo 'Local Valhalla HTTP: NOT READY at 127.0.0.1:8002.'
      echo 'Check Docker/container status and the graph build logs; --plan alone does not install routing.'
      exit 0
    fi
    echo 'Local Valhalla HTTP: responding. Testing an example Sacramento-to-Auburn route (not your location).'
    body=$(curl --silent --show-error --max-time 12 \
      -H 'Content-Type: application/json' -X POST \
      --data '{"locations":[{"lat":38.5816,"lon":-121.4944},{"lat":38.8966,"lon":-121.0769}],"costing":"auto"}' \
      'http://127.0.0.1:8002/route' 2>/dev/null) || body=''
    if [[ -z "$body" ]]; then
      echo 'Test route: no response; Valhalla may be building, stalled, or lacking matching graph tiles.'
    elif command -v python3 >/dev/null 2>&1; then
      printf '%s' "$body" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    trip = data.get("trip") or {}
    summary = trip.get("summary") or {}
    if trip.get("legs") and "length" in summary:
        print("Test route: OK; Sacramento-to-Auburn drivable graph is available.")
    else:
        print("Test route: unavailable; Valhalla reports:", str(data.get("error") or data.get("status_message") or data.get("error_code") or "unknown route error")[:240])
except (ValueError, TypeError, AttributeError):
    print("Test route: unexpected HTTP response; inspect --logs.")
'
    else
      echo 'Test route response was received but Python was unavailable for validation.'
    fi
    exit 0 ;;
  --plan)
    echo "Routing area: $LABEL"
    echo "Geofabrik PBF input: $APPROX ($SOURCE)"
    echo "Private graph/input location: $TARGET_DIR"
    echo "Recommended free build disk: at least ${MIN_FREE_GIB} GiB (estimate, not a guarantee)"
    echo "Recommended total RAM for graph build: at least ${MIN_MEMORY_GIB} GiB (estimate, not a guarantee)"
    echo 'After building, source PBF and generated Valhalla graph both consume storage.'
    echo 'First build can require hours and may fail if WSL/Docker memory is limited.'
    echo "Existing source: $([[ -s "$TARGET_DIR/$PBF" ]] && echo yes || echo no)"
    echo "Existing graph archive: $([[ -s "$TARGET_DIR/valhalla_tiles.tar" ]] && echo yes || echo no)"
    if [[ -d "$TARGET_DIR" ]]; then
      df -h "$TARGET_DIR" | tail -1
    elif [[ -d "$HOME" ]]; then
      df -h "$HOME" | tail -1
    fi
    exit 0 ;;
  --logs)
    if exists; then docker logs --tail 60 "$NAME"; else echo 'No OpenRF Valhalla container available.'; fi
    exit 0 ;;
  --stop)
    if exists; then docker stop "$NAME" >/dev/null; echo 'Valhalla stopped; no local road files were removed.'; else echo 'No OpenRF Valhalla container available.'; fi
    exit 0 ;;
esac

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo 'Docker is unavailable from Ubuntu. Start Docker Desktop, enable WSL integration, and retry.' >&2
  exit 1
fi
if [[ "$ACTION" == --start ]]; then
  if exists; then
    docker start "$NAME" >/dev/null
    echo 'Started the existing Valhalla routing profile; check --status and --logs.'
  else
    echo 'No existing Valhalla container. Install a region with --install --region norcal|california|west|us.' >&2
    exit 1
  fi
  exit 0
fi

# --install (explicit, deliberate region selection). A region's files are kept
# separate to avoid accidentally rebuilding a graph with overlapping OSM extracts.
mkdir -p "$TARGET_DIR"
if [[ ! -s "$TARGET_DIR/$PBF" ]]; then
  command -v curl >/dev/null 2>&1 || { echo 'curl is required to download the selected region.' >&2; exit 1; }
  free_kb=$(df -Pk "$TARGET_DIR" | awk 'NR==2 {print $4}')
  required_kb=$((MIN_FREE_GIB*1024*1024))
  if (( free_kb < required_kb )); then
    echo "$LABEL requires at least ${MIN_FREE_GIB} GiB free for the initial build (conservative minimum; actual use varies)." >&2
    echo 'No download started and your current routing container was not changed.' >&2
    exit 1
  fi
  memory_kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
  if (( memory_kb < MIN_MEMORY_GIB*1024*1024 )); then
    echo "$LABEL requires a build host with approximately ${MIN_MEMORY_GIB} GiB or more RAM." >&2
    echo 'Consider using a smaller profile or building a graph on a larger computer.' >&2
    echo 'No download started and your current routing container was not changed.' >&2
    exit 1
  fi
  echo "Downloading $LABEL routing source ($APPROX) to $TARGET_DIR"
  echo 'This is a one-time explicit network download; it does not contain any GPS trace.'
  # Resume a previously interrupted partial download, without corrupting a completed PBF.
  curl --fail --location --retry 2 --continue-at - --output "$TARGET_DIR/$PBF.partial" "$SOURCE"
  size=$(stat -c %s "$TARGET_DIR/$PBF.partial")
  if (( size < MIN_PBF_BYTES )); then
    echo 'Downloaded routing source was unexpectedly small. Keeping partial for diagnosis; active routing is unchanged.' >&2
    exit 1
  fi
  if ! head -c 4096 "$TARGET_DIR/$PBF.partial" | LC_ALL=C grep -aq OSMHeader; then
    echo "Downloaded file is not a recognizable OSM PBF (keeping .partial); current routing remains unchanged." >&2
    exit 1
  fi
  mv -- "$TARGET_DIR/$PBF.partial" "$TARGET_DIR/$PBF"
fi
if [[ -s "$TARGET_DIR/$PBF" ]]; then
  size=$(stat -c %s "$TARGET_DIR/$PBF")
  if (( size < MIN_PBF_BYTES )) || ! head -c 4096 "$TARGET_DIR/$PBF" | LC_ALL=C grep -aq OSMHeader; then
    echo "Routing source is incomplete or has no recognizable OSM PBF header: $TARGET_DIR/$PBF" >&2
    echo "Existing routing container was not changed. Repair or redownload this file manually." >&2
    exit 1
  fi
fi
if [[ ! -s "$TARGET_DIR/$PBF" && ! -s "$TARGET_DIR/valhalla_tiles.tar" ]]; then
  echo 'No valid source or existing graph in requested profile.' >&2; exit 1
fi

requested_dir=$(cd "$TARGET_DIR" && pwd -P)
# Pull the image BEFORE stopping the existing profile so network failure is safe.
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker pull "$IMAGE" >/dev/null
fi
previous_dir=""
if exists; then
  current_dir=$(active_source)
  if [[ "$current_dir" == "$requested_dir" ]]; then
    docker restart "$NAME" >/dev/null
    echo "Restarted Valhalla using existing $LABEL routing data. Check --logs for tile build progress."
    exit 0
  fi
  previous_dir="$current_dir"
  echo "Switching Valhalla from ${current_dir:-unknown} to $requested_dir"
  echo 'The old region files and graph remain on disk. Only the named Docker container is replaced.'
  docker stop "$NAME" >/dev/null || true
  docker rm "$NAME" >/dev/null
fi

if ! docker run -d --name "$NAME" \
  -p '127.0.0.1:8002:8002' \
  -v "$requested_dir:/custom_files" \
  -e server_threads=2 \
  -e build_elevation=False \
  "$IMAGE" >/dev/null; then
  echo "Failed to start the new region. Your old region files were not deleted." >&2
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if [[ -n "$previous_dir" && -d "$previous_dir" ]]; then
    echo "Attempting to restore previous Valhalla container from $previous_dir" >&2
    docker run -d --name "$NAME" -p '127.0.0.1:8002:8002' \
      -v "$previous_dir:/custom_files" -e server_threads=2 -e build_elevation=False "$IMAGE" >/dev/null || true
  fi
  exit 1
fi
echo "Valhalla container created with $LABEL. Graph build is not necessarily complete."
echo 'Run --logs to watch progress, then --status and try a real origin/destination route.'
