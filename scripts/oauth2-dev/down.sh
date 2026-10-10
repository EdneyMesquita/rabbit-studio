#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f token-server.pid ]]; then
  kill "$(cat token-server.pid)" 2>/dev/null || true
  rm -f token-server.pid
fi
docker compose down
