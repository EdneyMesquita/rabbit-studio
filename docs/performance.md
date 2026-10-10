# Performance and resource use

Measured on 2026-10-10 on Linux (WebKitGTK), against the dev clusters in
`docker-compose.dev.yml` (A: 2 nodes, RabbitMQ 4.2, perf-test traffic at
30 msg/s; B: RabbitMQ 3.13) and one more 4.2 broker with 18 queues.

## Size

| | Rabbit Studio | Postgres Studio (sibling) |
|---|---|---|
| Release binary (frontend embedded) | 15.8 MiB | 16.8 MiB |
| `.deb` bundle | 6.9 MiB | – |
| Main JS chunk | 462.9 kB (140.0 kB gzip) | 637.4 kB |
| Whole `dist/` | 1.5 MB | – |

Every view and dialog is a lazy chunk (largest: topology 28 kB, messages
25 kB). No Monaco, no chart library: charts draw on one canvas each.

## Memory (release build, idle on the welcome screen)

| Process | Rabbit Studio PSS | Postgres Studio PSS |
|---|---|---|
| App (Rust) | 96 MB | 95 MB |
| WebKit web process | 140 MB | 150 MB |
| WebKit network process | 18 MB | 18 MB |

Most of it is the WebKitGTK baseline every Tauri app on Linux pays.

## Live use: 3 clusters connected, global view + Explorer tree open, 69 s

- Requests: 135 (1.95/s, ~14 kB/s): every list asks only for the columns
  it shows; hidden tabs, a hidden window and a paused status bar poll
  nothing; data that didn't change keeps its identity, so rows don't
  re-render.
- Main thread: 0 long tasks (> 50 ms) in the 69 s.
- JS heap: 65 MB (dev build, unminified, with Vite's HMR runtime).
- Backend: 0.33 s of CPU in 60 s (0.55 % of one core), 62 MB RSS (debug build).

## Command latency (`scripts/bench.mjs`, dev bridge debug build, cluster A, median of 5)

| Call | ms |
|---|---|
| overview, 10 min of samples | 22.6 |
| nodes | 9.0 |
| queues page (500, columns) | 6.9 |
| queues, every field | 13.1 |
| queue detail, 10 min of samples | 9.0 |
| exchanges + bindings of a vhost | 7.0 |
| peek 50 messages | 14.6 |
| read 200 stream messages (AMQP) | 69.8 |

## Real IPC

`RABBIT_STUDIO_SMOKE=<file>` on a debug build runs `src-tauri/src/smoke.js`
in the native window: management bodies arrive as `ArrayBuffer` (no JSON
re-encoding between Rust and the page), the keyring password is used, and a
selective DLQ replay over AMQP reports progress through native events.
