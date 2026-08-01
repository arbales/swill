#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
PIDFILE="tmp/dev.pid"
ESBUILD_PIDFILE="tmp/esbuild.pid"
PYTHON_PIDFILE="tmp/dev_server.pid"
mkdir -p tmp

# ---- Refuse to run if another dev.sh is already watching ----
check_pidfile() {
  local label="$1"
  local file="$2"
  if [ ! -f "$file" ]; then return 0; fi
  local pid
  pid=$(cat "$file" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "another $label is already running (pid $pid)" >&2
    echo "  Ctrl+C it (or run: kill $pid) and re-run this script." >&2
    exit 1
  fi
  echo "stale pidfile $file (pid $pid not alive); removing"
  rm -f "$file"
}

check_pidfile "dev coordinator" "$PIDFILE"
check_pidfile "esbuild watcher" "$ESBUILD_PIDFILE"
check_pidfile "python dev server" "$PYTHON_PIDFILE"
echo "$$" > "$PIDFILE"

# Safety net: kill orphan watchers that match our cmdline pattern, in case
# a previous run was killed with -9 and left no pidfile to clean up.
ORPHANS="$(pgrep -f 'esbuild .*examples/movies/index.ts examples/giraffic/giraffic.ts examples/breweries/breweries.ts.* --watch=forever' || true)"
if [ -n "$ORPHANS" ]; then
  echo "killing orphan esbuild watchers: $ORPHANS"
  echo "$ORPHANS" | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

PYTHON_ORPHANS="$(pgrep -f "python3 .*dev_server.py $PORT" || true)"
if [ -n "$PYTHON_ORPHANS" ]; then
  echo "killing orphan python dev servers on port $PORT: $PYTHON_ORPHANS"
  echo "$PYTHON_ORPHANS" | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

# Initial build so the first browser hit doesn't 404 if it beats --watch.
./build.sh
(cd opal && bundle exec rake build)

# Watch in the background; foreground the static/proxy server for visible logs.
./build.sh --watch &
ESBUILD_PID=$!
echo "$ESBUILD_PID" > "$ESBUILD_PIDFILE"

python3 dev_server.py "$PORT" &
PYTHON_PID=$!
echo "$PYTHON_PID" > "$PYTHON_PIDFILE"

cleanup() {
  trap - INT TERM EXIT
  kill "$ESBUILD_PID" 2>/dev/null || true
  kill "$PYTHON_PID" 2>/dev/null || true
  wait "$ESBUILD_PID" 2>/dev/null || true
  wait "$PYTHON_PID" 2>/dev/null || true
  rm -f "$PIDFILE" "$ESBUILD_PIDFILE" "$PYTHON_PIDFILE"
}
trap cleanup INT TERM EXIT

echo
echo "  http://localhost:$PORT/examples/movies/demo.html    (Movies)"
echo "  http://localhost:$PORT/examples/giraffic/giraffic.html    (Giraffic)"
echo "  http://localhost:$PORT/examples/breweries/breweries.html    (Breweries)"
echo "  http://localhost:$PORT/examples/static/static.html    (Static)"
echo "  http://localhost:$PORT/opal/examples/giraffic/index.html    (Giraffic, Opal)"
echo "  dev coordinator pid: $$  (recorded in $PIDFILE)"
echo "  esbuild --watch pid: $ESBUILD_PID  (recorded in $ESBUILD_PIDFILE)"
echo "  python dev server pid: $PYTHON_PID  (recorded in $PYTHON_PIDFILE)"
echo "  /giraffic-api/* proxies to ${GIRAFFIC_API_BASE:-http://localhost:5001}"
echo

while kill -0 "$ESBUILD_PID" 2>/dev/null && kill -0 "$PYTHON_PID" 2>/dev/null; do
  sleep 1
done
