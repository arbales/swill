#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

WATCH=""
if [ "${1:-}" = "--watch" ]; then
  WATCH="--watch=forever"
fi

VERSION="$(tr -d '[:space:]' < VERSION)"
BANNER="// Swill ${VERSION}"

build_framework() {
  esbuild \
    src/index.ts \
    --bundle \
    --format=esm \
    --target=es2022 \
    --banner:js="$BANNER" \
    --outfile=dist/swill.js \
    --sourcemap \
    $WATCH

  esbuild \
    src/index.ts \
    --bundle \
    --format=iife \
    --global-name=Swill \
    --target=es2022 \
    --banner:js="$BANNER" \
    --outfile=dist/swill.global.js \
    --sourcemap \
    $WATCH
}

build_examples() {
  esbuild \
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
}

if [ -n "$WATCH" ]; then
  build_framework &
  FRAMEWORK_PID=$!
  build_examples &
  EXAMPLES_PID=$!

  cleanup() {
    trap - INT TERM EXIT
    kill "$FRAMEWORK_PID" 2>/dev/null || true
    kill "$EXAMPLES_PID" 2>/dev/null || true
    wait "$FRAMEWORK_PID" 2>/dev/null || true
    wait "$EXAMPLES_PID" 2>/dev/null || true
  }
  trap cleanup INT TERM EXIT

  wait "$FRAMEWORK_PID" "$EXAMPLES_PID"
else
  build_framework
  build_examples
fi
