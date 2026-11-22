#!/usr/bin/env bash
# OpenRF local release preflight. Tests may open loopback HTTP endpoints and
# use mocked hardware; this launcher never executes Git push/commit/add.
set -Eeuo pipefail

if [[ $# -gt 1 || ! "${1:-python3}" =~ ^python3(\.[0-9]+)?$ ]]; then
  printf 'Usage: bash tools/test-openrf-linux.sh [python3|python3.11|python3.14]\n' >&2
  exit 2
fi

python_bin="${1:-python3}"
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$project_root"

if ! command -v "$python_bin" >/dev/null 2>&1; then
  printf 'Missing %s in this Linux/WSL environment.\n' "$python_bin" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  printf 'Node.js is required for local JavaScript regression tests.\n' >&2
  exit 2
fi

printf 'OpenRF local tests (%s, %s). Local fixtures; no GitHub push.\n' \
  "$("$python_bin" --version)" "$(node --version)"

printf '\n[1/4] Compile Python sources\n'
"$python_bin" -m compileall -q openrf

printf '\n[2/4] Run Python unit tests\n'
"$python_bin" -m unittest discover -s tests -q

printf '\n[3/4] Check shell and application JavaScript syntax\n'
bash -n tools/setup-valhalla-wsl.sh
for source in \
  openrf/static/app.js \
  openrf/static/meshcore.js \
  openrf/static/messaging-tabs.js \
  openrf/static/weather.js \
  openrf/static/hardware-tabs.js \
  openrf/static/field-breadcrumbs.js \
  openrf/static/offline-trails.js \
  openrf/static/history-analysis.js \
  openrf/static/navigation.js \
  openrf/static/route_guidance.js \
  openrf/static/survey_map.js; do
  node --check "$source"
done

printf '\n[4/4] Run all JavaScript regression suites\n'
for test_file in tests/*.js; do
  node "$test_file"
done

printf '\nPASS: local preflight completed. GitHub still tests Python 3.11 and 3.14 separately.\n'
