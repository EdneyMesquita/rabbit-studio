#!/usr/bin/env bash
# Background traffic on cluster A (rabbit-a1, vhost orders) so the rates,
# consumers, connections and channels screens have live data. Runs the
# pivotalrabbitmq/perf-test image as a detached container on the compose network.
#
#   scripts/traffic.sh            start (no-op if already running)
#   scripts/traffic.sh status     show the container state
#   scripts/traffic.sh stop       remove the container
#
# 3 producers x 10 msg/s = 30 msg/s total, kept under 50 msg/s to keep CPU low.
set -euo pipefail

NAME=rabbit-studio-perf-a
NETWORK=rabbit-studio-dev_default
IMAGE=pivotalrabbitmq/perf-test:latest

case ${1-start} in
  start)
    if [ -n "$(docker ps -q -f "name=^${NAME}$")" ]; then
      echo "$NAME is already running"
      exit 0
    fi
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" --network "$NETWORK" --restart unless-stopped "$IMAGE" \
      --uri amqp://admin:admin@rabbit-a1:5672/orders \
      --queue-pattern 'perf-%d' --queue-pattern-from 1 --queue-pattern-to 3 \
      --producers 3 --consumers 3 --rate 10 \
      --flag persistent --auto-delete false \
      --id rabbit-studio-perf-a >/dev/null
    echo "started $NAME (3 producers x 10 msg/s on cluster A, vhost orders)"
    ;;
  status)
    docker ps -a -f "name=^${NAME}$" --format 'table {{.Names}}\t{{.Status}}'
    ;;
  stop)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    echo "stopped $NAME"
    ;;
  *)
    echo "usage: $0 [start|status|stop]" >&2
    exit 2
    ;;
esac
