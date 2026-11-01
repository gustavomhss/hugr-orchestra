# HuGR Orchestra

**A team of AI agents for software work, led by one agent you talk to.**

You describe the task to Maestro. Maestro plans it, hands each piece to a specialist agent, checks what comes back and asks you before anything lands. It runs on your machine, in your repository, on your Claude subscription or any of about 30 model providers.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/home-dashboard.png">
  <img src="docs/images/readme/home-dashboard-light.jpg" alt="The desktop app's Home screen for a project: the sidebar with Home, Chat, Project Board, Agents and Actions, and the project's overview.">
</picture>

Early release: desktop 0.3.2 and command line 0.3.1 for macOS, Windows and Linux, under the MIT license. Builds are not code signed yet.

## Why Orchestra

- **One lead, real specialists.** Maestro sends research, plans and code to separate agents (seats). Each runs in its own session that you can open, follow live and steer. You talk to one agent, not five.
- **Done means proven.** A workflow step passes only when its checks pass, never on the agent's own report. Reviews are cold: the reviewer sees the request and the diff, not the author's reasoning. Every outcome goes into a ledger you can verify.
- **Limits the model cannot talk past.** Specialists run in an OS sandbox limited to the paths they were given. Push, commit, merge, release, deploy and `rm` are refused by the host, not by a prompt.
- **Long sessions stay sharp.** Old tool output folds into one-line stubs the agent can expand again, summaries start early, and noisy command output is shortened with the original one call away.
- **No orphan processes.** A native supervisor owns every process an agent starts. When the app dies, its test runners and dev servers die with it.

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/flow-dark.png">
  <img src="docs/images/readme/flow-light.png" alt="You talk to Maestro, which sends questions to the research seat, plans to the product and architecture seat, briefs to the backend seat and cold reviews to the code review seat; the backend seat's pull request and evidence go to the project board and merge queue, which moves cards from Intake through Building, Review, Queued and Bundle to Shipped.">
</picture>

Say customers are sometimes charged twice when they double-click "Pay":

1. You tell Maestro. It asks the research seat why, and the product and architecture seat for a plan.
2. The backend seat writes a test that clicks Pay twice and fails with two charges, then fixes the code until the test passes.
3. Maestro removes the fix's key line, sees the test go red, and restores it. A test that cannot fail proves nothing.
4. A cold review reads the diff. With your go-ahead, the pull request enters the merge queue, which runs the full suite once and merges.

The project board moves on facts: a card advances when work is dispatched, a pull request opens or a merge lands.

## Quick start

1. Install the [desktop app](#desktop-app) or the [command line](#command-line) (`npm install -g @humanguardrail/cli`).
2. Pick a project folder. Choosing it also trusts it, so pick only folders you wrote or reviewed.
3. Connect a model in Providers: sign in to Claude Code for your Claude subscription, or add an API key.
4. Press "Start a session" on Home and describe the task to Maestro.

The [getting started guide](docs/guides/getting-started.md) covers the first five minutes.

## What's inside

| Part | What it does | Read more |
| --- | --- | --- |
| Agents | Maestro plus product and architecture, backend, research and meeting copilot seats | [Agents](docs/guides/agents.md), [Maestro](docs/guides/maestro.md) |
| Workflows and Relay | Procedures you write once; each step opens only after its checks pass, and every outcome is ledgered | [Workflows and Relay](docs/guides/relay.md) |
| Coordination | Project board, checks and merge queue, Guardrails | [Coordination](docs/guides/coordination.md) |
| Context | Continuity (early summaries, masking, recall) and Lean (shorter tool output) | [Context](docs/guides/context.md) |
| Tools | Built-in tools, MCP Dock, toolkit, skills, plugins and hooks | [Tools](docs/guides/tools.md) |
| Atlas | Project knowledge versioned in git, and what each task cost | [Atlas](docs/guides/atlas.md) |
| Omni | Native layer that owns every child process tree | [Omni](docs/guides/omni.md) |
| Models | About 30 providers, or Claude Code on your subscription | [Models and engines](docs/guides/models.md) |
| Architecture and security | Layers, sessions, sandbox, interfaces (desktop, CLI, ACP, HTTP API) and the security model | [Architecture and security](docs/guides/architecture.md) |

## Maturity and limits

| Area | Limit |
| --- | --- |
| Seats | Frontend, code review, security review, documentation and process audit are not built. |
| Signing | Builds are unsigned: the system asks before the first launch, and unsigned macOS builds do not update in place. |
| Omni | Pre-release. Guarantees hold only where the conformance scenario is green in CI, and only in builds that include omni for their platform. |
| Providers | The session core routes three of six wire protocols. |
| Agent terminal | Opt-in, with shell integration; not on Windows. |
| Seat confinement | As described, on macOS and Linux. |
| Workflows | Steps that wait for human approval cannot run yet; four templates are read-only. |
| Hooks | Whole project only; cannot be imported. |
| Sessions | One process, no clustering; provider work is not retried automatically after a crash. |
| Atlas | Activity shows code rows; agent events are not served to it yet. |
| Meetings | Overlay hiding from screen sharing checked with Google Meet in Chrome only. |
| MCP Dock | The Linux desktop needs Docker. |

## Install

Releases are on [GitHub Releases](https://github.com/gustavomhss/hugr-orchestra/releases): desktop releases are tagged `desktop-v<version>`, command line releases `v<version>`. Each release note says whether the build is signed.

### Desktop app

Download the installer from the latest `desktop-v<version>` release. Files are named `orchestra-desktop-<os>-<arch>.<ext>`; each release attaches `SHA256SUMS`.

| System | File |
| --- | --- |
| macOS | `orchestra-desktop-mac-arm64.dmg` (Apple silicon), `orchestra-desktop-mac-x64.dmg` (Intel) |
| Windows | `orchestra-desktop-win-x64.exe` (Intel/AMD), `orchestra-desktop-win-arm64.exe` (Windows on ARM) |
| Linux | `orchestra-desktop-linux-x86_64.AppImage`, plus `.deb` (`amd64`) and `.rpm` (`x86_64`) of the same build |

First launch of an unsigned build:

| System | What to do |
| --- | --- |
| macOS | System Settings › Privacy & Security › Open Anyway. The first launch can take up to a minute while the system checks the app. |
| Windows | More info › Run anyway on the SmartScreen prompt. |
| Linux | No signature check. |

### Command line

```bash
npm install -g @humanguardrail/cli
```

Each release also attaches per-platform `.tar.gz` archives, `SHA256SUMS` and `install.sh` for macOS and Linux (x64 and arm64, glibc and musl). Take the archive's digest from `SHA256SUMS`, then:

```sh
sh install.sh \
  --prefix "$HOME/.local/orchestra" \
  --version <version> \
  --target <target> \
  --archive /absolute/path/to/orchestra.tar.gz \
  --sha256 <digest>
```

`install.sh` does not edit shell configuration. The [distribution guide](apps/cli/distribution/README.md) lists target names, updates and rollback.

### Upgrading

| Install | How |
| --- | --- |
| npm | `orchestra upgrade` |
| Windows, AppImage, signed macOS | The app updates in place |
| Unsigned macOS, `.deb`, `.rpm` | The app links to the new release; install it over the old one |

## Guides

User guides are in [`docs/guides`](docs/guides/README.md).

| Topic | Guides |
| --- | --- |
| Concepts | [Agents](docs/guides/agents.md), [Architecture and security](docs/guides/architecture.md), [Context](docs/guides/context.md), [Tools](docs/guides/tools.md), [Coordination](docs/guides/coordination.md), [Workflows and Relay](docs/guides/relay.md), [Atlas](docs/guides/atlas.md), [Omni](docs/guides/omni.md), [Models and engines](docs/guides/models.md) |
| Start | [Getting started](docs/guides/getting-started.md), [First run](docs/guides/first-run.md), [Settings](docs/guides/settings.md), [Environment](docs/guides/environment.md) |
| Agents | [Maestro](docs/guides/maestro.md), [The agent screen](docs/guides/agent-screen.md), [Agent pictures](docs/guides/agent-avatars.md), [Session requests](docs/guides/session-requests.md), [Live meetings](docs/guides/live-meetings.md) |
| Models | [Claude mode](docs/guides/claude-mode.md), [Credentials](docs/guides/credentials.md), [Composer](docs/guides/hugr-composer.md) |
| Work | [Workflows](docs/guides/workflows.md), [Hooks](docs/guides/hooks.md), [Skills](docs/guides/skills.md), [Instructions and the terminal UI](docs/guides/instructions-and-tui.md), [Checks and the merge queue](docs/guides/merge-queue.md), [Keep awake](docs/guides/keep-awake.md) |
| Tools and trust | [Permissions and saved rules](docs/guides/permissions.md), [Project trust](docs/guides/mcp-project-trust.md), [MCP Dock](docs/guides/mcp-dock-servers.md) |
| When something fails | [Desktop startup](docs/guides/desktop-startup.md), [App error messages](docs/guides/app-error-messages.md), [Config errors](docs/guides/config-errors.md), [MCP and CLI failures](docs/guides/mcp-and-cli-failures.md), [Database backups](docs/guides/database-backups.md) |

## Build from source

Needs Bun 1.3.14, the version pinned in `package.json`.

```bash
bun install
```

```bash
bun run dev:desktop
```

| Command | What it does |
| --- | --- |
| `bun dev` | Terminal UI and server in the current directory |
| `bun run dev:web` | Web UI |
| `./apps/cli/script/build.ts --single` | Standalone `orchestra` binary for your platform |
| `bun typecheck` (from a package directory) | Type check |
| `bun run test:ci <package> [test files...]` | Tests, on GitHub Actions ([AGENTS.md](AGENTS.md) has the rules) |

See the [desktop guide](apps/desktop/README.md) and [CLI guide](apps/cli/README.md) for package commands, and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

### Where things live

| Path | What it holds |
| --- | --- |
| [`apps/desktop`](apps/desktop/README.md) | Electron app, IPC, platform adapters and packaging |
| [`apps/cli`](apps/cli/README.md) | The `orchestra` executable, commands and daemon |
| [`apps/web`](apps/web/README.md) | Browser bootstrap and web distribution |
| [`packages/app-shell`](packages/app-shell/README.md) | Shared Solid UI used by desktop and web |
| [`packages/tui`](packages/tui/README.md) | Terminal UI |
| [`packages/core`](packages/core/README.md) | Session core, System Context, configuration, providers, tools, sandbox and plugin hosting |
| [`packages/schema`](packages/schema/README.md), [`protocol`](packages/protocol/README.md), [`server`](packages/server/README.md), [`client`](packages/client/README.md) | Data contracts, the public HTTP API, its server, and generated clients |
| [`packages/sdk-next`](packages/sdk-next/README.md), [`plugin`](packages/plugin/README.md) | Embedded host and plugin authoring contracts |
| `modules/maestro` | Maestro: seat roster, coordination, board, merge queue, arsenal and playbooks |
| `modules/continuity` | Context continuity: aliases, masking, archive and recall |
| [`modules/specialists`](modules/specialists/backend/README.md) | Specialist seats' skills |
| [`modules/relay`](modules/relay/README.md) | Gate runtime, ledger and workflows |
| [`modules/atlas`](modules/atlas/README.md) | Atlas knowledge layer |
| `modules/app-dock` | MCP Dock and the Linux workspace |
| [`native/omni`](native/omni/README.md) | Native process and terminal layer (Rust) |
| `script/guards` | Guardrails rules and engine |
| `docs/guides`, `docs/specs` | User guides and design specs |

## Support, security, license

- Bugs and questions: [GitHub Issues](https://github.com/gustavomhss/hugr-orchestra/issues).
- Security reports: [SECURITY.md](SECURITY.md).
- License: MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Some modules carry their own license files.
