# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Mockup phase: a single self-contained interactive HTML file (user request). The intended app stack is the siblings' own: Tauri 2, React, Tailwind, shadcn/ui on Radix, Inter + JetBrains Mono embedded (see ~/development/postgres-studio).

## Users

Two equally weighted audiences:

- **Platform engineers / SREs** operating production brokers: investigating incidents (queues backing up, consumers gone, memory/disk alarms), doing maintenance across several clusters on different servers.
- **Application developers** working day to day: inspecting queues, publishing and peeking test messages, debugging exchange/binding routing, draining dead-letter queues.

## Product Purpose

Rabbit Studio is an administration console for RabbitMQ. It must cover everything the official RabbitMQ Management UI offers (overview, nodes, connections, channels, exchanges, queues and streams, virtual hosts, users and permissions, policies, limits, feature flags, definitions import/export) with a faster, clearer and more efficient interface. Success: an operator finds the problematic queue in any cluster in seconds and acts on it without fear of hitting the wrong environment.

## Positioning

One console for many RabbitMQ instances across different servers, instead of one browser tab per broker's built-in UI. Differentiators to demonstrate:

- Global multi-cluster view: aggregated health, alarms and problem queues across all instances.
- Command palette (⌘K) for keyboard navigation and actions across clusters, queues and exchanges.
- Message inspector: peek, publish, move, replay and purge, with formatted JSON payloads, including DLQ workflows.
- Visual topology: exchange → binding → queue routing graph.

## Operating Context

Delivered as a cross-platform desktop app (Tauri), like its siblings Mongo Studio and Postgres Studio; the UI is a web view inside a custom window frame. Instances are organised **by environment** (production / staging / development), with strong environment signalling so destructive actions are never taken against production by mistake. Used during incidents (time pressure, scanning) and during development (exploration, testing).

## Capabilities and Constraints

- Parity with the RabbitMQ Management UI is required.
- RabbitMQ terminology must be preserved verbatim (vhost, exchange, binding, routing key, ack, prefetch, quorum/classic/stream, policy, shovel, federation).
- Mockup uses fictional sample data; no real cluster names or metrics.
- Out of scope by the user's decision (2026-10-10): no AI assistant and no saved messages, unlike the siblings.

## Evidence on Hand

None. No real customers, benchmarks or testimonials exist; do not fabricate them.

## Product Principles

1. Environment is always unmistakable; production actions demand deliberate confirmation.
2. Problems surface first: what is unhealthy beats what is normal.
3. Keyboard-fast: every object reachable without hunting through tabs.
4. Parity without clutter: everything the official UI does, nothing hidden, nothing noisy.
5. Show routing, not just lists: make the message path legible.

## Brand Commitments

- Rabbit Studio is the third product of a family with Mongo Studio (~/development/mongo-studio) and Postgres Studio (~/development/postgres-studio). It inherits their visual world, "The Data IDE" (see postgres-studio/DESIGN.md): a desktop IDE frame, not a web dashboard. A first web-dashboard mockup was rejected by the user on 2026-10-10 as "too web".
- App mark in the family grammar (dark rounded square, one object in a vertical brand gradient): Mongo Studio a green cylinder, Postgres Studio a blue table, Rabbit Studio an orange rabbit head (icons/icon-source.svg).
- Two twin themes, dark default, light toggle.
- UI copy in English like the siblings (confirmed by the user on 2026-10-10); RabbitMQ terms verbatim.
