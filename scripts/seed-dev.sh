#!/usr/bin/env bash
# Seeds a dev RabbitMQ server with an e-commerce topology, dead-lettered
# messages, federation and shovels, all through the management HTTP API.
#
#   scripts/seed-dev.sh                    seed cluster A (15673) and B (15675)
#   scripts/seed-dev.sh URL USER PASS      seed one server (plus its own links)
#
# Declarations are PUT/POST upserts, so re-running is safe. Messages are only
# published while the vhost's audit stream is empty, so a second run does not
# double the traffic. Federation and shovel URIs use the compose hostnames
# (rabbit-a1, rabbit-b1) because those plugins run inside the containers.
set -euo pipefail

if [ $# -eq 0 ]; then
  "$0" http://localhost:15673 admin admin
  "$0" http://localhost:15675 admin admin
  exit 0
fi
if [ $# -ne 3 ]; then
  echo "usage: $0 [MGMT_URL USER PASS]" >&2
  exit 2
fi

MGMT=$1
RUSER=$2
RPASS=$3
SEQ=0

# api METHOD PATH [JSON]: prints the response body, fails on non-2xx.
api() {
  local out code body
  local -a data=()
  [ -n "${3-}" ] && data=(-H 'content-type: application/json' -d "$3")
  out=$(curl -sS -u "$RUSER:$RPASS" -X "$1" -w '\n%{http_code}' "${data[@]}" "$MGMT$2")
  code=${out##*$'\n'}
  body=${out%$'\n'*}
  if [ "${code:0:1}" != 2 ]; then
    echo "HTTP $code: $1 $2: $body" >&2
    return 1
  fi
  printf '%s' "$body"
}

enc() { jq -rn --arg v "$1" '$v|@uri'; }

# Per-vhost state, set by seed_vhost.
VH=""
VHE=""
PFX=""
TENANT=""

declare_exchanges() {
  while read -r name type; do
    api PUT "/api/exchanges/$VHE/$PFX.$name" "{\"type\":\"$type\",\"durable\":true}" >/dev/null
  done <<'EOT'
events topic
commands direct
broadcast fanout
headers headers
dlx direct
EOT
}

# declare_queue NAME ARGUMENTS_JSON
declare_queue() {
  api PUT "/api/queues/$VHE/$PFX.$1" "$(jq -cn --argjson a "$2" '{durable:true, auto_delete:false, arguments:$a}')" >/dev/null
}

# bind SOURCE_EXCHANGE DEST_QUEUE ROUTING_KEY [ARGUMENTS_JSON]
bind() {
  local args=${4-'{}'}
  api POST "/api/bindings/$VHE/e/$PFX.$1/q/$PFX.$2" "$(jq -cn --arg rk "$3" --argjson a "$args" '{routing_key:$rk, arguments:$a}')" >/dev/null
}

# bind_exchange SOURCE_EXCHANGE DEST_EXCHANGE ROUTING_KEY
bind_exchange() {
  api POST "/api/bindings/$VHE/e/$PFX.$1/e/$PFX.$2" "$(jq -cn --arg rk "$3" '{routing_key:$rk, arguments:{}}')" >/dev/null
}

# send EXCHANGE ROUTING_KEY EVENT APP: one JSON order/payment event with
# properties, headers (x-trace-id, tenant) and a realistic payload.
send() {
  SEQ=$((SEQ + 1))
  local trace body res
  trace=$(printf '%04x%04x%04x%04x' $RANDOM $RANDOM $RANDOM $RANDOM)
  body=$(jq -cn --arg rk "$2" --arg kind "$3" --arg app "$4" --arg tenant "$TENANT" \
    --arg trace "$trace" --argjson seq "$SEQ" --argjson now "$(date +%s)" \
    --argjson amount "$((RANDOM % 50000 + 500))" --arg cust "cust-$((RANDOM % 900 + 100))" \
    --arg sku "SKU-$((RANDOM % 300 + 1000))" '
    {
      properties: {
        content_type: "application/json",
        message_id: ("msg-" + $trace),
        correlation_id: ("corr-" + ($seq | tostring)),
        timestamp: $now,
        app_id: $app,
        delivery_mode: 2,
        headers: {"x-trace-id": $trace, tenant: $tenant}
      },
      routing_key: $rk,
      payload_encoding: "string",
      payload: ({event: $kind, seq: $seq, customer_id: $cust, sku: $sku, amount_cents: $amount,
                 currency: "EUR", occurred_at: ($now | todate)} | tojson)
    }')
  res=$(api POST "/api/exchanges/$VHE/$PFX.$1/publish" "$body")
  case $res in
    *'"routed":true'*) ;;
    *) echo "not routed: $VH $PFX.$1 key=$2" >&2 ;;
  esac
}

# reject QUEUE COUNT: takes messages off a queue and rejects them without
# requeue, so the broker dead-letters them and fills x-death headers for real.
reject() {
  api POST "/api/queues/$VHE/$PFX.$1/get" \
    "$(jq -cn --argjson c "$2" '{count:$c, ackmode:"reject_requeue_false", encoding:"auto", truncate:50000}')" >/dev/null
}

seed_vhost() {
  VH=$1
  PFX=$2
  TENANT=$3
  local events=$4
  VHE=$(enc "$VH")

  api PUT "/api/vhosts/$VHE" '{}' >/dev/null
  api PUT "/api/permissions/$VHE/admin" '{"configure":".*","write":".*","read":".*"}' >/dev/null

  declare_exchanges

  # Classic queues. created has its dead-letter exchange set as a queue argument.
  declare_queue created '{"x-dead-letter-exchange":"'"$PFX"'.dlx"}'
  declare_queue inventory '{}'
  declare_queue ttl '{}'
  declare_queue capped '{"x-max-length":200}'
  declare_queue shovel-src '{}'
  declare_queue shovel-dst '{}'
  declare_queue dlq '{}'
  # Quorum queues.
  declare_queue fulfil '{"x-queue-type":"quorum"}'
  declare_queue notify '{"x-queue-type":"quorum"}'
  # Stream: the audit log, fed by every event.
  declare_queue audit '{"x-queue-type":"stream"}'

  bind events created 'order.#'
  bind events ttl 'payment.#'
  bind events audit '#'
  bind_exchange events broadcast 'order.#'
  bind commands fulfil 'fulfil'
  bind commands notify 'notify'
  bind commands shovel-src 'archive'
  bind broadcast inventory ''
  bind headers capped '' '{"x-match":"any","tenant":"'"$TENANT"'"}'
  bind dlx dlq 'order.created'
  bind dlx dlq 'order.updated'
  bind dlx dlq 'fulfil'
  bind dlx dlq 'notify'
  bind dlx dlq 'order.cancelled'

  # Policies: dead-lettering for fulfil and notify, a max-length policy, and an
  # operator policy that sets a TTL on the ttl queue.
  api PUT "/api/policies/$VHE/dlx-$PFX" "$(jq -cn --arg p "^$PFX\\.(fulfil|notify)\$" --arg dlx "$PFX.dlx" \
    '{pattern:$p, definition:{"dead-letter-exchange":$dlx}, "apply-to":"queues", priority:0}')" >/dev/null
  api PUT "/api/policies/$VHE/maxlen-$PFX" "$(jq -cn --arg p "^$PFX\\.(created|inventory)\$" \
    '{pattern:$p, definition:{"max-length":5000}, "apply-to":"queues", priority:0}')" >/dev/null
  api PUT "/api/operator-policies/$VHE/op-ttl-$PFX" "$(jq -cn --arg p "^$PFX\\.ttl\$" \
    '{pattern:$p, definition:{"message-ttl":3600000}, "apply-to":"queues", priority:10}')" >/dev/null

  # Messages: only when the audit stream is still empty.
  local existing
  existing=$(api GET "/api/queues/$VHE/$PFX.audit" | jq -r '.messages // 0')
  if [ "$existing" -eq 0 ]; then
    echo "  [$VH] publishing $events events and command traffic" >&2
    local i key kind
    for ((i = 1; i <= events; i++)); do
      case $((i % 10)) in
        0 | 1 | 2 | 3) key=order.created kind=order_created ;;
        4 | 5) key=order.updated kind=order_updated ;;
        6 | 7) key=payment.captured kind=payment_captured ;;
        8) key=payment.refunded kind=payment_refunded ;;
        *) key=order.cancelled kind=order_cancelled ;;
      esac
      send events "$key" "$kind" checkout-api
    done
    for ((i = 0; i < 60; i++)); do send commands fulfil fulfilment_requested fulfilment-worker; done
    for ((i = 0; i < 40; i++)); do send commands notify notification_requested notifier; done
    for ((i = 0; i < 100; i++)); do send commands archive archive_requested archiver; done
    for ((i = 0; i < 40; i++)); do send headers "" tenant_event tenant-router; done
    for ((i = 0; i < 30; i++)); do send broadcast "stock.refresh" stock_refreshed inventory-sync; done

    # Dead-lettered messages: rejected without requeue, so they land in the dlq.
    reject created 15
    reject fulfil 15
    reject notify 10
  else
    echo "  [$VH] audit stream already has $existing messages, skipping publish" >&2
  fi
}

seed_vhost_users() {
  api PUT /api/users/monitoring-bot '{"password":"monitoring-bot","tags":"monitoring"}' >/dev/null
  api PUT /api/users/orders-svc '{"password":"orders-svc","tags":"management"}' >/dev/null
  api PUT /api/users/payments-svc '{"password":"payments-svc","tags":""}' >/dev/null

  api PUT "/api/permissions/orders/orders-svc" \
    '{"configure":"^orders\\..*","write":"^orders\\..*","read":"^orders\\..*"}' >/dev/null
  api PUT "/api/permissions/payments/payments-svc" '{"configure":".*","write":".*","read":".*"}' >/dev/null
  api PUT "/api/topic-permissions/orders/orders-svc" \
    '{"exchange":"orders.events","write":"^order\\.","read":"^order\\."}' >/dev/null

  api PUT "/api/user-limits/payments-svc/max-connections" '{"value":20}' >/dev/null
  api PUT "/api/vhost-limits/notifications/max-queues" '{"value":50}' >/dev/null
}

# Federation and shovels. Cluster A federates from B and runs a local shovel,
# cluster B runs a shovel into A. Each side only needs the other's vhost to
# exist, and the links retry until it does.
seed_links() {
  local name=$1
  if [ "$name" = studio-dev-a ]; then
    api PUT /api/parameters/federation-upstream/orders/studio-dev-b \
      '{"value":{"uri":"amqp://admin:admin@rabbit-b1:5672/orders","ack-mode":"on-confirm"}}' >/dev/null
    api PUT /api/policies/orders/fed-broadcast \
      '{"pattern":"^orders\\.broadcast$","definition":{"federation-upstream":"studio-dev-b"},"apply-to":"exchanges","priority":0}' >/dev/null
    api PUT /api/parameters/shovel/orders/orders-archive \
      '{"value":{"src-protocol":"amqp091","src-uri":"amqp://admin:admin@rabbit-a1:5672/orders","src-queue":"orders.shovel-src","dest-protocol":"amqp091","dest-uri":"amqp://admin:admin@rabbit-a1:5672/orders","dest-queue":"orders.shovel-dst","ack-mode":"on-confirm"}}' >/dev/null
  elif [ "$name" = studio-dev-b ]; then
    api PUT /api/parameters/shovel/payments/payments-replica \
      '{"value":{"src-protocol":"amqp091","src-uri":"amqp://admin:admin@rabbit-b1:5672/payments","src-queue":"payments.shovel-src","dest-protocol":"amqp091","dest-uri":"amqp://admin:admin@rabbit-a1:5672/payments","dest-queue":"payments.shovel-dst","ack-mode":"on-confirm"}}' >/dev/null
  else
    echo "unknown cluster_name '$name', skipping links" >&2
  fi
}

CLUSTER=$(api GET /api/overview | jq -r '.cluster_name')
echo "seeding $CLUSTER at $MGMT" >&2

seed_vhost orders orders acme 500
seed_vhost payments payments acme 500
seed_vhost notifications notifications globex 300
seed_vhost / shop shop 100
seed_vhost_users
seed_links "$CLUSTER"

echo "done: $CLUSTER" >&2
