#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

WATCH=""
if [ "${1:-}" = "--watch" ]; then
  WATCH="--watch=forever"
fi

exec esbuild \
  examples/movies/index.ts \
  examples/giraffic/giraffic.ts \
  examples/breweries/breweries.ts \
  --bundle \
  --format=esm \
  --target=es2022 \
  --outbase=examples \
  --outdir=examples \
  --entry-names=[dir]/dist/[name] \
  --sourcemap \
  $WATCH
