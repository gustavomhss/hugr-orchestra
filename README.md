# HuGR Orchestra

HuGR Orchestra is a desktop app for software work. You talk to Maestro, the lead agent. Maestro scopes the work, delegates it to a team of specialist agents, and brings the plan and the results back to you for approval.

The app combines an Electron host (`packages/desktop`), a shared Solid UI (`packages/app`), and local server/session services. `packages/orchestra` remains the legacy product composition; the live V2 CLI, Core, Protocol, and Server packages have separate responsibilities.

## Install

The first public release is pending. No version is tagged yet, so the downloads and package names below do not exist until it ships. macOS installers and binaries are signed and notarized, and Windows binaries are signed.

### Desktop app

Download the installer for your system from the [GitHub Releases](https://github.com/gustavomhss/hugr-orchestra/releases) page. Files are named `orchestra-desktop-<os>-<arch>.<ext>`:

| System  | File                                                                        |
| ------- | --------------------------------------------------------------------------- |
| macOS   | `orchestra-desktop-mac-arm64.dmg` (Apple silicon), `orchestra-desktop-mac-x64.dmg` (Intel) |
| Windows | `orchestra-desktop-win-x64.exe`                                             |
| Linux   | `orchestra-desktop-linux-x86_64.AppImage`, plus `.deb` and `.rpm` packages of the same build |

The `.deb` and `.rpm` follow each package format's own architecture name (`amd64` and `x86_64`), so their file names differ slightly from the AppImage.

### Command line

```bash
npm install -g @hugr/cli
brew install gustavomhss/tap/orchestra
```

Arch Linux users can install the AUR package `orchestra-bin`.

Each release also attaches per-platform `.tar.gz` archives, `SHA256SUMS` and `install.sh`. Download an archive and its digest from `SHA256SUMS`, then run:

```sh
sh install.sh \
  --prefix "$HOME/.local/orchestra" \
  --version <version> \
  --target <target> \
  --archive /absolute/path/to/orchestra.tar.gz \
  --sha256 <digest>
```

`install.sh` supports macOS and glibc Linux on x64 and arm64. It does not edit shell configuration. See the [distribution guide](packages/cli/distribution/README.md) for targets, updates and rollback.

### First run

Orchestra needs a model to work with. Connect a provider with your API key in the provider dialog, or sign in to Claude Code first to use Claude mode.

### Upgrading

For npm and Homebrew installs, run `orchestra upgrade`. The desktop app does not update itself yet: download the new installer and install it over the old one.

## Run from source

You need Bun 1.3.14, the version pinned in `package.json`.

```bash
bun install
```

### Desktop app

```bash
bun run dev:desktop
```

This runs Desktop's `predev` step, which installs Electron, copies channel icons, builds the legacy server bundle, stages Omni, and builds/stages CLI resources before starting `electron-vite dev`. See the [Desktop guide](packages/desktop/README.md) for package-local commands and packaging inputs.

A dev run uses configured user data. `ORCHESTRA_DB` selects the Core database; it does not isolate the entire Electron profile, settings, or draft store.

### Other entry points

- `bun dev` runs the terminal UI and server from `packages/orchestra/src/index.ts`. `bun dev <directory>` runs it against another directory.
- `bun run dev:web` runs the web UI from `packages/app`.
- From `packages/cli`, `bun run dev` runs the V2 preview CLI; see its [guide](packages/cli/README.md) for daemon/API commands and compiled resources.
- `./packages/orchestra/script/build.ts --single` compiles a standalone binary for your platform into `packages/orchestra/dist/orchestra-<platform>/bin/orchestra`.

### Checks

- Type check from a package directory: `bun typecheck`.
- `bun run test:ci <package> [test files...]` is the hosted test entrypoint. A local `bun test` is guarded; follow [AGENTS.md](AGENTS.md) for execution rules.
- `bun run check:godfile` flags source files that grow past the line limit.
- For the restructuring campaign, each small PR uses only checks for its changed area and reuses recorded passing results. CI runs once on the final composed bundle after all deliveries; intermediate PRs do not request heavy suites or repeated CI.

## Where things live

| Path                       | What it holds                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| [`packages/desktop`](packages/desktop/README.md) | Electron main/preload/renderer, IPC, profile persistence, platform adapters, and packaging |
| [`packages/app`](packages/app/README.md) | Shared Solid UI and web bootstrap; Desktop consumes its public library exports |
| [`packages/cli`](packages/cli/README.md) | Live V2 preview executable, command handlers, daemon, and compiled CLI artifacts |
| `packages/orchestra`       | Legacy server/TUI and product composition; Maestro, Continuity, tools, and plugin integration |
| [`packages/core`](packages/core/README.md) | Reusable domain/platform services, Session execution/storage, configuration, providers, and plugin hosting |
| [`packages/schema`](packages/schema/README.md) | Portable contracts, canonical schema identity, and wire/storage datatypes |
| [`packages/protocol`](packages/protocol/README.md) | Public HTTP contract, route schemas, errors, and middleware requirements |
| [`packages/server`](packages/server/README.md) | HTTP handler/middleware implementation over Core and Protocol |
| [`packages/client`](packages/client/README.md) | Generated Promise/Effect network clients; runtime depends on Schema/Protocol, not Core/Server |
| [`packages/sdk-next`](packages/sdk-next/README.md) | Scoped embedded host composing Client, Core, and Server |
| [`packages/plugin`](packages/plugin/README.md) | Public legacy/TUI/V2 plugin authoring contracts; hosts own loading and authority |
| `packages/sdk/js`          | Existing generated SDK retained for its supported consumers |
| `packages/omni`            | Native process infrastructure, addon/supervisor, conformance, and artifact producers |
| [`script`](script/README.md) | Repository tooling and immutable manifest/asset/pin inventory |
| `foundation/atlas`         | Atlas, the grounded knowledge layer for a codebase; see its `README.md` and `docs/`             |
| `specs/hugr-maestro`       | Maestro's contracts, roadmap and work packages                                                  |
| `specs/backend-specialist` | The backend specialist's architecture and tool contracts                                        |
| `specs/orchestra-visual`   | The visual design handoff and its verification                                                  |
| `specs/v2`                 | V2 designs: API, sessions, configuration, providers, tools and the plugin lifecycle             |
| `CONTEXT.md`               | Vocabulary of the session runtime                                                               |
| `AGENTS.md`                | Rules for agents that work in this repository                                                   |

Runtime direction is Schema → Core/Protocol → Server. Client runtime uses Schema/Protocol only; `sdk-next` is the permitted embedded composition. The table describes current paths. Planned `apps/`, `modules/`, `native/`, and `tooling/` moves are separate deliveries, not completed renames.
