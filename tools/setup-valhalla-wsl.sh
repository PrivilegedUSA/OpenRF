#!/usr/bin/env bash
# OpenRF optional local Valhalla routing data setup for WSL 2 / Linux.
# Nothing runs automatically from OpenRF. Private tiles and source data stay outside Git.
set -euo pipefail

ACTION="${1:---status}"
DATA_DIR="${OPENRF_VALHALLA_DATA_DIR:-${HOME}/.local/share/openrf/valhalla}"
IMAGE='ghcr.io/valhalla/valhalla-scripted:latest'
NAME='openrf-valhalla'
PBF='norcal-latest.osm.pbf'
SOURCE='https://download.geofabrik.de/north-america/us/california/norcal-latest.osm.pbf'

usage() {
  cat <<'HELP'
OpenRF local road routing (optional) — WSL/Linux with Docker
  bash tools/setup-valhalla-wsl.sh --status    Show container and loopback service status (default)
  bash tools/setup-valhalla-wsl.sh --install   Download Northern California OSM roads (large) and start build
  bash tools/setup-valhalla-wsl.sh --start     Start existing local data; no download
  bash tools/setup-valhalla-wsl.sh --stop      Stop the OpenRF Valhalla container
  bash tools/setup-valhalla-wsl.sh --logs      View build/service logs (last 60 lines)

Requires Docker Desktop WSL2 integration or a working Linux Docker daemon, curl and several GiB of free space.
The tile graph is built locally on first startup; WSL/Docker must remain running for road routing.
Download and generated files are stored under ~/.local/share/openrf/valhalla by default.
Only local localhost port 8002 is exposed. Does not modify investigations or commit map data.
OpenRF's existing local backend will then request routes via 127.0.0.1:8002.
HELP
}

if [[ "$ACTION" == --help || "$ACTION" == -h ]]; then usage; exit 0; fi
case "$ACTION" in --install|--start|--status|--stop|--logs) ;; *) usage >&2; exit 2 ;; esac
if ! command -v docker >/dev/null; then
  echo 'Docker is unavailable in Ubuntu. Install Docker Desktop with WSL integration (or Linux Docker), then retry.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker daemon is unavailable. Open Docker Desktop, enable Ubuntu WSL integration, then retry.' >&2
  exit 1
fi
exists() { docker container inspect "$NAME" >/dev/null 2>&1; }
case "$ACTION" in
--status)
  echo "Routing data directory: $DATA_DIR"
  if exists; then docker ps -a --filter "name=^/${NAME}$" --format 'Container: {{.Names}} — {{.Status}}'; else echo 'Container: not installed'; fi
  if command -v curl >/dev/null && curl -fsS --max-time 3 'http://127.0.0.1:8002/status' >/dev/null 2>&1; then
    echo 'Local Valhalla HTTP service responds on 127.0.0.1:8002. A route request is still needed to verify road tile coverage.'
  else
    echo 'Local Valhalla HTTP service is not yet reachable on 127.0.0.1:8002.'
  fi
  exit 0 ;;
--logs)
  if exists; then docker logs --tail 60 "$NAME"; else echo 'No OpenRF Valhalla container yet.'; fi
  exit 0 ;;
--stop)
  if exists; then docker stop "$NAME" >/dev/null; echo 'Stopped OpenRF Valhalla. Private routing data kept.'; else echo 'Container not installed.'; fi
  exit 0 ;;
esac

mkdir -p "$DATA_DIR"
if [[ "$ACTION" == --install && ! -s "$DATA_DIR/$PBF" ]]; then
  command -v curl >/dev/null || { echo 'curl is required for the explicit --install download.' >&2; exit 1; }
  free_kb=$(df -Pk "$DATA_DIR" | awk 'NR==2 {print $4}')
  if (( free_kb < 8*1024*1024 )); then
    echo 'At least 8 GiB available disk space is recommended for the Northern California download and Valhalla graph build.' >&2
    echo 'Clean free space or choose a different OPENRF_VALHALLA_DATA_DIR before downloading.' >&2
    exit 1
  fi
  echo "Downloading Northern California OSM data from Geofabrik to $DATA_DIR (hundreds of MB)."
  curl --fail --location --retry 2 --output "$DATA_DIR/$PBF.partial" "$SOURCE" || { rm -f "$DATA_DIR/$PBF.partial"; exit 1; }
  test -s "$DATA_DIR/$PBF.partial" || { rm -f "$DATA_DIR/$PBF.partial"; echo 'PBF download was empty.' >&2; exit 1; }
  mv -- "$DATA_DIR/$PBF.partial" "$DATA_DIR/$PBF"
fi
if [[ ! -s "$DATA_DIR/$PBF" && ! -s "$DATA_DIR/valhalla_tiles.tar" ]]; then
  echo 'No Northern California PBF or existing graph found. Run --install first.' >&2; exit 1
fi
if exists; then
  docker start "$NAME" >/dev/null
  echo 'Started existing OpenRF Valhalla container. Use --logs to inspect build progress.'
else
  docker run -d --name "$NAME" \
    -p '127.0.0.1:8002:8002' \
    -v "$DATA_DIR:/custom_files" \
    -e server_threads=2 \
    -e build_elevation=False \
    "$IMAGE" >/dev/null
  echo 'Created OpenRF Valhalla container. It builds local road tiles before routes can work.'
fi
printf 'Check service: bash tools/setup-valhalla-wsl.sh --status\n'
printf 'Check logs:    bash tools/setup-valhalla-wsl.sh --logs\n'
