#!/usr/bin/env bash
# Runs the isolation tests against a fresh local Worker (local D1, local Durable Objects). No Cloudflare account needed.
set -euo pipefail
node "$(dirname "$0")/build-assets.mjs"
cd "$(dirname "$0")/../apps/cloud"
rm -rf .wrangler/state
# Local-only settings. ENVIRONMENT=dev enables /auth/dev on localhost; never set it in production.
rnd() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
KIT_BUILD_TOKEN="$(rnd)"; export KIT_BUILD_TOKEN
printf 'ENVIRONMENT=dev\nSESSION_SECRET=%s\nPLATFORM_OWNERS=owner@platform.test\nKIT_BUILD_TOKEN=%s\n' "$(rnd)" "$KIT_BUILD_TOKEN" > .dev.vars
npx wrangler d1 migrations apply mediaport --local >/dev/null
PORT="${PORT:-8787}"
if curl -s "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then echo "Port $PORT is already in use. Stop the other server first." >&2; exit 1; fi
setsid npx wrangler dev --port "$PORT" --ip 127.0.0.1 --local-upstream "127.0.0.1:$PORT" >"${TMPDIR:-/tmp}/mediaport-dev.log" 2>&1 &
PID=$!
# Kill the whole process group: wrangler starts workerd as a child.
trap 'kill -- -$PID 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null && break; sleep 0.5; done
BASE="http://127.0.0.1:$PORT" node --test --test-concurrency=1 ../../tests/*.test.mjs
