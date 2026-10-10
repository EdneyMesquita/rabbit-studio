#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
./setup.sh
docker compose up -d
if [[ -f token-server.pid ]] && kill -0 "$(cat token-server.pid)" 2>/dev/null; then
  echo "token server already running (pid $(cat token-server.pid))"
else
  nohup node token-server.mjs > token-server.log 2>&1 &
  echo $! > token-server.pid
  echo "token server started (pid $!)"
fi
