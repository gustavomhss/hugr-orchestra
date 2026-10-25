# HuGR Orchestra

HuGR Orchestra is a desktop app for software work. You talk to Maestro, the lead agent. Maestro scopes the work, delegates it to a team of specialist agents, and brings the plan and the results back to you for approval.

The app combines an Electron host (`apps/desktop`), a shared Solid UI (`packages/app-shell`), and local server/session services. `apps/web` owns the browser bootstrap and web distribution. The V2 CLI, Core, Protocol, and Server packages have separate responsibilities.

## Install

The first public release is pending. No version is tagged yet, so the downloads and package names below do not exist until it ships. The first releases may ship before code signing is set up; the notes of each release say whether it is signed.

### Desktop app

Download the installer for your system from the `desktop-v<version>` release on the [GitHub Releases](https://github.com/gustavomhss/hugr-orchestra/releases) page. Files are named `orchestra-desktop-<os>-<arch>.<ext>`:

| System  | File                                                                        |
| ------- | --------------------------------------------------------------------------- |
| macOS   | `orchestra-desktop-mac-arm64.dmg` (Apple silicon), `orchestra-desktop-mac-x64.dmg` (Intel) |
| Windows | `orchestra-desktop-win-x64.exe`                                             |
| Linux   | `orchestra-desktop-linux-x86_64.AppImage`, plus `.deb` and `.rpm` packages of the same build |

The `.deb` and `.rpm` follow each package format's own architecture name (`amd64` and `x86_64`), so their file names differ slightly from the AppImage.

An unsigned build makes the system ask before the first launch. On macOS, open System Settings > Privacy & Security and choose Open Anyway. On Windows, choose More info > Run anyway on the SmartScreen prompt. Linux installers carry no signature check.

### Command line

```bash
npm install -g @humanguardrail/cli
```

Each release also attaches per-platform `.tar.gz` archives, `SHA256SUMS` and `install.sh`. Download an archive and its digest from `SHA256SUMS`, then run:

```sh
sh install.sh \
  --prefix "$HOME/.local/orchestra" \
  --version <version> \
  --target <target> \
  --archive /absolute/path/to/orchestra.tar.gz \
  --sha256 <digest>
```

`install.sh` supports macOS and glibc Linux on x64 and arm64. It does not edit shell configuration. See the [distribution guide](apps/cli/distribution/README.md) for targets, updates and rollback.

npm and `install.sh` installs never show a Gatekeeper or SmartScreen prompt, signed or not. A binary downloaded from the release page in a browser can.

### First run

Orchestra needs a model to work with. Connect a provider with your API key in the provider dialog, or sign in to Claude Code first to use Claude mode.

### Upgrading

For npm installs, run `orchestra upgrade`. The desktop app checks for new versions itself. The Windows and AppImage builds install them in place, and so do signed macOS builds. Unsigned macOS builds and the `.deb` and `.rpm` packages link to the new release instead: download its installer and install it over the old one.

## Support

Report bugs and ask questions in [GitHub Issues](https://github.com/gustavomhss/hugr-orchestra/issues).

## Run from source

You need Bun 1.3.14, the version pinned in `package.json`.

```bash
bun install
```

### Desktop app

```bash
bun run dev:desktop
```

This runs Desktop's `predev` step, which installs Electron, copies channel icons, builds the legacy server bundle, stages Omni, and builds/stages CLI resources before starting `electron-vite dev`. See the [Desktop guide](apps/desktop/README.md) for package-local commands and packaging inputs.

A dev run uses configured user data. `ORCHESTRA_DB` selects the Core database; it does not isolate the entire Electron profile, settings, or draft store.

### Other entry points

- `bun dev` runs the terminal UI and server from `apps/cli/src/index.ts`. `bun dev <directory>` runs it against another directory.
- `bun run dev:web` runs the web UI from `apps/web`.
- From `apps/cli`, `bun run dev` runs the V2 preview CLI; see its [guide](apps/cli/README.md) for daemon/API commands and compiled resources.
- `./apps/cli/script/build.ts --single` compiles a standalone binary for your platform into `apps/cli/dist/cli-<platform>/bin/orchestra`.

### Checks

- Type check from a package directory: `bun typecheck`.
- `bun run test:ci <package> [test files...]` is the hosted test entrypoint. A local `bun test` is guarded; follow [AGENTS.md](AGENTS.md) for execution rules.
- `bun run check:godfile` flags source files that grow past the line limit.
- For the restructuring campaign, each small PR uses only checks for its changed area and reuses recorded passing results. CI runs once on the final composed bundle after all deliveries; intermediate PRs do not request heavy suites or repeated CI.

## Where things live

| Path                                                                                                                     | What it holds                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [`apps/desktop`](apps/desktop/README.md)                                                                                 | Electron main/preload/renderer, IPC, profile persistence, platform adapters, and packaging                              |
| [`packages/app-shell`](packages/app-shell/README.md)                                                                     | Shared Solid UI and public `@orchestra/app` exports consumed by Web and Desktop                                         |
| [`apps/web`](apps/web/README.md)                                                                                         | Browser bootstrap, development server and web distribution                                                              |
| [`apps/cli`](apps/cli/README.md)                                                                                         | Live V2 preview executable, command handlers, daemon, and compiled CLI artifacts                                        |
| [`packages/tui`](packages/tui/README.md)                                                                                 | Terminal UI (SolidJS/opentui) shared by the legacy and V2 CLIs; English-only for now                                    |
| [`packages/core`](packages/core/README.md)                                                                               | Reusable domain/platform services, Session execution/storage, configuration, providers, and plugin hosting              |
| [`packages/schema`](packages/schema/README.md)                                                                           | Portable contracts, canonical schema identity, and wire/storage datatypes                                               |
| [`packages/protocol`](packages/protocol/README.md)                                                                       | Public HTTP contract, route schemas, errors, and middleware requirements                                                |
| [`packages/server`](packages/server/README.md)                                                                           | HTTP handler/middleware implementation over Core and Protocol                                                           |
| [`packages/client`](packages/client/README.md)                                                                           | Generated Promise/Effect network clients; runtime depends on Schema/Protocol, not Core/Server                           |
| [`packages/sdk-next`](packages/sdk-next/README.md)                                                                       | Scoped embedded host composing Client, Core, and Server                                                                 |
| [`packages/plugin`](packages/plugin/README.md)                                                                           | Public legacy/TUI/V2 plugin authoring contracts; hosts own loading and authority                                        |
| [`modules/relay`](modules/relay/README.md)                                                                               | Relay workflow/gate runtime, profiles, fixtures, and retained Python oracle                                             |
| [`modules/capability-assets`](modules/capability-assets/README.md)                                                       | Data-only capability catalog, pinned source provenance, and license notices                                             |
| [`modules/maestro/arsenal`](modules/maestro/arsenal/README.md)                                                           | Maestro tool registry, MCP adapter, governance contracts, and host-authorized operations                                |
| [`modules/specialists/backend`](modules/specialists/backend/README.md), [`archie`](modules/specialists/archie/README.md) | Authored native-seat skills and complete UTF-8 companions; source and embedded lookup share the existing seat framework |
| [`assets/brand`](assets/brand/README.md)                                                                                 | Preserved PNG/SVG identity source assets; separate from app public logos and Desktop channel icons                      |
| [`tooling/httpapi-codegen`](tooling/httpapi-codegen/README.md)                                                           | Existing HttpApi compiler and Client generators, with unchanged package identity and generated bytes                    |
| [`tooling/http-recorder`](tooling/http-recorder/README.md)                                                               | Existing HTTP/WebSocket test recorder, replay cassettes and source/package adapters                                     |
| [`native/omni`](native/omni/README.md)                                                                                   | Native process infrastructure, addon/supervisor, conformance, and artifact producers                                    |
| [`script`](script/README.md)                                                                                             | Repository tooling and immutable manifest/asset/pin inventory                                                           |
| [`modules/atlas`](modules/atlas/README.md)                                                                               | Atlas npm workspace, corpus/Own and source domain; `boundary/` retains the host bundles                                 |
| `docs/specs/hugr-maestro`                                                                                                     | Maestro's contracts, roadmap and work packages                                                                          |
| `docs/specs/backend-specialist`                                                                                               | The backend specialist's architecture and tool contracts                                                                |
| `docs/specs/orchestra-visual`                                                                                                 | The visual design handoff documents; its evidence is retained outside Git (`docs/archives`)                             |
| `docs/specs/v2`                                                                                                               | V2 designs: API, sessions, configuration, providers, tools and the plugin lifecycle                                     |
| `CONTEXT.md`                                                                                                             | Vocabulary of the session runtime                                                                                       |
| `AGENTS.md`                                                                                                              | Rules for agents that work in this repository                                                                           |

Runtime direction is Schema → Core/Protocol → Server. Client runtime uses Schema/Protocol only; `sdk-next` is the permitted embedded composition. The table describes current paths; remaining planned `apps/`, `modules/`, `native/`, and `tooling/` moves remain separate deliveries.
