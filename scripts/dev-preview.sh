#!/bin/sh
#
# Freebuff preview entrypoint: one process tree serving the whole app.
#
#   - Runs API migrations, then the API (REST + Yjs collab) on internal :5050.
#   - Runs the Vite dev server on :5173, which proxies /api and /collab to it.
#
# Only :5173 is exposed; the browser talks to the API same-origin through the
# proxy, so CORS never comes into play and cookies stay first-party.
set -eu

cd "$(dirname "$0")/.."

# The managed preview injects its own PORT into the environment; pin the API's
# explicitly so it never collides with the web dev server.
API_PORT="${CANVAS_API_PORT:-5050}"

echo "[preview] running migrations"
npm run migrate --workspace=apps/api

echo "[preview] starting API on :$API_PORT"
PORT="$API_PORT" npm run dev --workspace=apps/api &
API_PID=$!

cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Give the API a moment to compile and open its port so the first browser
# request doesn't hit a dead proxy. Bounded so a stuck API can't block startup.
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then
    echo "[preview] API healthy"
    break
  fi
  i=$((i + 1))
  sleep 0.5
done

echo "[preview] starting web on :5173"
npm run dev --workspace=apps/web -- --host 0.0.0.0 --strictPort
