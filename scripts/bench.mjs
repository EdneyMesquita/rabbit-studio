#!/usr/bin/env node
// Backend benchmark through the dev bridge (src-tauri/src/devbridge.rs):
// the same commands and the same IPC path the app uses, so before/after
// numbers of an optimization are comparable.
//
//   docker compose -f docker-compose.dev.yml up -d && scripts/seed-dev.sh
//   (cd src-tauri && cargo build --release --features devbridge --bin devbridge)
//   src-tauri/target/release/devbridge &
//   node scripts/bench.mjs <connection id> [--runs 5] [--json out.json]
//
// Point it at dev cluster A (its `orders` vhost and `orders.dlq` queue).

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BRIDGE = "http://127.0.0.1:1430";
const args = process.argv.slice(2);
const connectionId = args[0];
const runs = Number(args[args.indexOf("--runs") + 1]) || 5;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
if (!connectionId) {
  console.error("usage: node scripts/bench.mjs <connection id> [--runs 5] [--json out.json]");
  process.exit(2);
}

async function call(cmd, callArgs = {}) {
  const started = performance.now();
  const response = await fetch(BRIDGE, { method: "POST", body: JSON.stringify({ cmd, args: callArgs }) });
  const text = await response.text();
  const ms = performance.now() - started;
  const answer = JSON.parse(text);
  if ("err" in answer) throw new Error(`${cmd}: ${answer.err}`);
  return { value: answer.ok, ms, bytes: text.length };
}

function bridgeRss() {
  try {
    const pid = execSync("pgrep -x devbridge").toString().trim().split("\n")[0];
    return Number(execSync(`ps -o rss= -p ${pid}`).toString().trim()) * 1024;
  } catch {
    return null;
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const mb = (b) => (b / 1024 / 1024).toFixed(1);

const { value: session } = await call("connect", { id: connectionId });
const sessionId = session.sessionId;
const mgmt = (path) => () => call("mgmt", { sessionId, methodName: "GET", path });
const sampled = "lengths_age=600&lengths_incr=10&msg_rates_age=600&msg_rates_incr=10";

const cases = [
  ["overview, sampled", mgmt(`overview?${sampled}`)],
  ["nodes", mgmt("nodes")],
  ["queues page (500, columns)", mgmt("queues?page=1&page_size=500&columns=name,vhost,type,messages,messages_ready,messages_unacknowledged,consumers")],
  ["queues, everything", mgmt("queues")],
  ["queue detail, sampled", mgmt(`queues/orders/orders.created?${sampled}`)],
  ["exchanges + bindings (orders)", async () => {
    const a = await mgmt("exchanges/orders")();
    const b = await mgmt("bindings/orders")();
    return { value: null, ms: a.ms + b.ms, bytes: a.bytes + b.bytes };
  }],
  ["peek 50 messages", () => call("get_messages", { sessionId, vhost: "orders", queue: "orders.dlq", count: 50, requeue: true, truncate: null })],
  ["read stream, 200 from first", () => call("read_stream", {
    sessionId, executionId: "bench", vhost: "orders", queue: "orders.audit", offset: { kind: "first" }, count: 200, truncate: null,
  })],
];

const rssBefore = bridgeRss();
const results = [];
for (const [name, fn] of cases) {
  await fn(); // warm up: connections, the broker's caches
  const times = [];
  let bytes = 0;
  for (let i = 0; i < runs; i++) {
    const r = await fn();
    times.push(r.ms);
    bytes = r.bytes;
  }
  const row = { name, medianMs: Number(median(times).toFixed(1)), minMs: Number(Math.min(...times).toFixed(1)), bytes };
  results.push(row);
  console.log(`${name.padEnd(34)} ${String(row.medianMs).padStart(9)} ms  (min ${row.minMs})  ${mb(bytes).padStart(7)} MB`);
}
const rssAfter = bridgeRss();
if (rssBefore !== null) console.log(`devbridge RSS: ${mb(rssBefore)} MB before, ${mb(rssAfter)} MB after`);
await call("disconnect", { sessionId }).catch(() => {});
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ runs, results, rssBefore, rssAfter }, null, 2));
