#!/usr/bin/env bash
# v0.2.103: two isolated, loopback-only OpenRF consoles for operator-led testing.
# NO Reticulum connection, Wi-Fi AP or RF transmission starts automatically.
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
lab_root="$(mktemp -d "${TMPDIR:-/tmp}/openrf-two-node.XXXXXXXX")"
mkdir -p "$lab_root/A" "$lab_root/B"
export PYTHONPATH="$project_root${PYTHONPATH:+:$PYTHONPATH}"
export OPENRF_VALHALLA_AUTOSTART=0

cleanup() {
  trap - EXIT INT TERM
  kill "$node_a_pid" "$node_b_pid" 2>/dev/null || true
  wait "$node_a_pid" "$node_b_pid" 2>/dev/null || true
  printf '\nLab stopped. Private node data was preserved at: %s\n' "$lab_root"
}

python3 -m openrf --port 8871 --db "$lab_root/A/openrf.sqlite3" >"$lab_root/A/server.log" 2>&1 &
node_a_pid=$!
python3 -m openrf --port 8872 --db "$lab_root/B/openrf.sqlite3" >"$lab_root/B/server.log" 2>&1 &
node_b_pid=$!
trap cleanup EXIT INT TERM

printf '%s\n' \
  'OpenRF two-node lab (no physical radios, automatic connections or shared databases)' \
  'Box A: http://localhost:8871' \
  'Box B: http://localhost:8872' \
  'Enable the optional rns and lxmf Python packages to test live Reticulum/LXMF.' \
  'On Box A: check Accept Reticulum TCP, listener port 4242; press Enable.' \
  'On Box B: check Connect to another Reticulum TCP listener, host 127.0.0.1, port 4242; press Enable and confirm.' \
  'Share the two displayed LXMF addresses, announce manually, send a message and inspect both inboxes and interface counters.' \
  'A configured TCP interface or queued message is NOT proof of delivery.' \
  "Private lab data: $lab_root" \
  'Press Ctrl+C to stop both local consoles. Data is preserved until you decide to remove it.'

wait "$node_a_pid" "$node_b_pid"
