# Rabbit Studio

An open-source, cross-platform RabbitMQ client built with Tauri (Rust) and React: a fast, light desktop app for managing several clusters, inspecting queues and messages, and administering brokers without a browser tab per server.

> **Status: early release.** The core is in place; expect rough edges. See [PRODUCT.md](PRODUCT.md) for the scope and the roadmap.

## Features

- **Clusters grouped by environment** - any number of saved clusters, organised by environment, with a global overview across all of them.
- **Command palette** - Ctrl/Cmd+K opens it.
- **Message inspector** - peek, get, move and replay messages, including DLQ replay driven by the `x-death` headers.
- **Publish with route preview** - see which queues a message will reach before you send it.
- **Visual topology** - exchanges, bindings and queues drawn as a graph.
- **Full admin** - users, vhosts, permissions, policies, limits, feature flags, federation, shovels and definitions.
- **Production safety** - read-only connections, and typed confirmations for destructive actions.
- **Connections** - SSH tunnels (password or key, host keys pinned on first use), TLS, and credentials kept in the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service).

## Logs

Rabbit Studio keeps a log file, so a failed connection or a crash can be looked into after the fact. To find it, open the command palette (Ctrl/Cmd+K) and choose **Open logs folder**. The file is `rabbit-studio.log` in:

| OS | Folder |
| --- | --- |
| Windows | `%LOCALAPPDATA%\com.edneymesquita.rabbit-studio\logs` |
| macOS | `~/Library/Logs/com.edneymesquita.rabbit-studio` |
| Linux | `$XDG_DATA_HOME/com.edneymesquita.rabbit-studio/logs`, usually `~/.local/share/com.edneymesquita.rabbit-studio/logs` |

When the file reaches 5 MB it is renamed with a timestamp and a new one is started. The five most recent old files are kept.

**What's never logged:** passwords, passphrases or other secrets; connection strings (only the hosts, with no user or options); message contents.

## Development

Prerequisites:

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (via `rustup`)
- Tauri's platform prerequisites: see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
- Docker, for the local RabbitMQ servers

```sh
npm install
npm run tauri dev
```

Local RabbitMQ servers with sample data: a two-node cluster and a single node on other ports, all with user `admin` / `admin`. See the header of `docker-compose.dev.yml` for the ports.

```sh
docker compose -f docker-compose.dev.yml up -d
```

Seed the servers with an e-commerce topology, dead-lettered messages, federation and shovels, and start background traffic on cluster A:

```sh
scripts/seed-dev.sh
scripts/traffic.sh
```

Backend tests:

```sh
cd src-tauri
cargo test
```

### Browser dev bridge

To drive the UI from a browser instead of the desktop window, run the debug-only HTTP bridge to the real backend commands in one terminal, and the Vite dev server in another:

```sh
cd src-tauri
cargo run --features devbridge --bin devbridge
```

```sh
npm run dev
```

## Building

```sh
npm run tauri build
```

Produces a platform-native installer (`.dmg`/`.app` on macOS, `.msi`/`.exe` on Windows, `.deb`/`.rpm`/`.AppImage` on Linux) under `src-tauri/target/release/bundle/`.

### Regenerating the app icon

The source design is `icons/icon-source.svg`. After editing it, render it to a 1024x1024 PNG and regenerate every platform variant with:

```sh
npx tauri icon <path-to-1024.png>
```

## Releasing

Pushing a tag matching `vX.Y.Z` triggers `.github/workflows/release.yml`, which builds installers for macOS (universal binary), Windows, and Linux and attaches them to a **draft** GitHub release for review before publishing. Builds are unsigned, so first launches will trip Gatekeeper (macOS) or SmartScreen (Windows) warnings until code signing is set up separately.

The Microsoft Store package (MSIX) is built by `.github/workflows/microsoft-store.yml`; see [docs/microsoft-store.md](docs/microsoft-store.md).

## License

MIT - see [LICENSE](LICENSE).

RabbitMQ is a trademark of Broadcom, Inc.; Rabbit Studio is an independent project, not affiliated with or endorsed by it.
