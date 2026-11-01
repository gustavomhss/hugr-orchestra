# HuGR Orchestra

[![Desktop release](https://img.shields.io/github/v/release/gustavomhss/hugr-orchestra?filter=desktop-v*&label=desktop)](https://github.com/gustavomhss/hugr-orchestra/releases)
[![CLI on npm](https://img.shields.io/npm/v/@humanguardrail/cli?label=cli)](https://www.npmjs.com/package/@humanguardrail/cli)
![macOS, Windows, Linux](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-informational)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**A team of AI agents for software work, led by one agent you talk to.**

You describe the task to Maestro. Maestro plans it, hands each piece to a specialist agent, checks what comes back and asks you before anything lands. It runs on your machine, in your repository, on your Claude subscription or any of about 30 model providers.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/flow-dark.png">
  <img src="docs/images/readme/flow-light.png" alt="You talk to Maestro, which sends questions to the research seat, plans to the product and architecture seat, briefs to the backend seat and cold reviews to the code review seat; the backend seat's pull request and evidence go to the project board and merge queue, which moves cards from Intake through Building, Review, Queued and Bundle to Shipped.">
</picture>

Early release, builds not code signed yet. [Maturity and limits](docs/guides/limits.md) says what is not built.

## Why Orchestra

| | A single coding agent | Orchestra |
| --- | --- | --- |
| Who does the work | One agent researches, plans, codes and judges its own result | Separate seats for research, planning and code; the reviewer is never the author and never sees the author's reasoning |
| When it is done | When the agent says so | When the step's checks pass; the agent's report does not count |
| What proves it | The chat transcript | A hash-chained ledger sealed with HMAC that `relay verify` replays |
| What stops a bad action | Rules in the prompt and permission prompts | An OS sandbox per seat; push, commit, merge, release, deploy and `rm` are refused by the host |
| Long sessions | Compaction drops the detail that mattered | Summaries start early; old tool output becomes stubs the agent can recall word for word |
| A crash mid-test | Orphan dev servers and test runners holding ports | A native supervisor stops every process tree the agent started |

## How it works

Say customers are sometimes charged twice when they double-click "Pay":

1. You tell Maestro. It asks the research seat why, and the product and architecture seat for a plan.
2. The backend seat writes a test that clicks Pay twice and fails with two charges, then fixes the code until the test passes.
3. Maestro removes the fix's key line, sees the test go red, and restores it. A test that cannot fail proves nothing.
4. A cold review reads the diff. With your go-ahead, the pull request enters the merge queue, which runs the full suite once and merges.

The project board moves on facts: a card advances when work is dispatched, a pull request opens or a merge lands.

## Quick start

1. Install the [desktop app](#install) or the command line: `npm install -g @humanguardrail/cli`.
2. Pick a project folder. Choosing it also trusts it, so pick only folders you wrote or reviewed.
3. Connect a model in Providers: sign in to Claude Code for your Claude subscription, or add an API key.
4. Press "Start a session" on Home and describe the task to Maestro.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/home-dashboard.png">
  <img src="docs/images/readme/home-dashboard-light.jpg" alt="The desktop app's Home screen for a project: the sidebar with Home, Chat, Project Board, Agents and Actions, and the project's overview.">
</picture>

The [getting started guide](docs/guides/getting-started.md) covers the first five minutes.

## What's inside

| Part | What it does | Read more |
| --- | --- | --- |
| Agents | Maestro plus product and architecture, backend, research and meeting copilot seats | [Agents](docs/guides/agents.md), [Maestro](docs/guides/maestro.md) |
| Workflows and Relay | Procedures you write once; each step opens only after its checks pass, and every outcome is ledgered | [Workflows and Relay](docs/guides/relay.md), [running workflows](docs/guides/workflows.md) |
| Coordination | Project board, checks and merge queue, Guardrails | [Coordination](docs/guides/coordination.md), [merge queue](docs/guides/merge-queue.md) |
| Context | Continuity (early summaries, masking, recall) and Lean (shorter tool output) | [Context](docs/guides/context.md) |
| Tools | Built-in tools, MCP Dock, toolkit, skills, plugins and hooks | [Tools](docs/guides/tools.md), [skills](docs/guides/skills.md), [hooks](docs/guides/hooks.md) |
| Atlas | Project knowledge versioned in git, and what each task cost | [Atlas](docs/guides/atlas.md) |
| Omni | Native layer that owns every child process tree | [Omni](docs/guides/omni.md) |
| Models | About 30 providers, or Claude Code on your subscription | [Models and engines](docs/guides/models.md), [Claude mode](docs/guides/claude-mode.md) |
| Architecture and security | Layers, sessions, sandbox, interfaces (desktop, CLI, ACP, HTTP API) and the security model | [Architecture and security](docs/guides/architecture.md), [permissions](docs/guides/permissions.md) |

When something fails: [desktop startup](docs/guides/desktop-startup.md), [app error messages](docs/guides/app-error-messages.md), [config errors](docs/guides/config-errors.md), [MCP and CLI failures](docs/guides/mcp-and-cli-failures.md). Every guide is listed in [`docs/guides`](docs/guides/README.md).

## Limits today

- Five seats (frontend, code review, security review, documentation, process audit) have a prompt but no skill tree yet.
- Builds are unsigned: the system asks before the first launch, and unsigned macOS builds do not update in place.
- Workflows are linear, and steps that wait for a human cannot run yet.

The full list is in [Maturity and limits](docs/guides/limits.md).

## Install

Get the installer from the latest `desktop-v<version>` release on [GitHub Releases](https://github.com/gustavomhss/hugr-orchestra/releases), or the command line from npm:

```bash
npm install -g @humanguardrail/cli
```

Upgrade the command line with `orchestra upgrade`. The desktop app updates in place on Windows, AppImage and signed macOS builds; elsewhere it links to the new release.

<details>
<summary>Desktop files and the first launch of an unsigned build</summary>

| System | File | First launch |
| --- | --- | --- |
| macOS | `orchestra-desktop-mac-arm64.dmg` (Apple silicon), `orchestra-desktop-mac-x64.dmg` (Intel) | System Settings › Privacy & Security › Open Anyway. It can take up to a minute while the system checks the app. |
| Windows | `orchestra-desktop-win-x64.exe` (Intel/AMD), `orchestra-desktop-win-arm64.exe` (Windows on ARM) | More info › Run anyway on the SmartScreen prompt. |
| Linux | `orchestra-desktop-linux-x86_64.AppImage`, plus `.deb` (`amd64`) and `.rpm` (`x86_64`) | No signature check. |

Each release attaches `SHA256SUMS`. Unsigned macOS, `.deb` and `.rpm` installs upgrade by installing the new release over the old one.

</details>

<details>
<summary>Command line without npm</summary>

Each release also attaches per-platform `.tar.gz` archives and `install.sh` for macOS and Linux (x64 and arm64, glibc and musl). Take the archive's digest from `SHA256SUMS`, then:

```sh
sh install.sh \
  --prefix "$HOME/.local/orchestra" \
  --version <version> \
  --target <target> \
  --archive /absolute/path/to/orchestra.tar.gz \
  --sha256 <digest>
```

`install.sh` does not edit shell configuration. The [distribution guide](apps/cli/distribution/README.md) lists target names, updates and rollback.

</details>

## Build from source

Needs Bun 1.3.14, the version pinned in `package.json`.

```bash
bun install
```

```bash
bun run dev:desktop
```

`bun dev` starts the terminal UI and server, and `bun run dev:web` the web UI. [CONTRIBUTING.md](CONTRIBUTING.md) maps the repository and covers pull requests; [AGENTS.md](AGENTS.md) holds the repository rules, including how tests run on GitHub Actions.

## Support, security, license

- Bugs and questions: [GitHub Issues](https://github.com/gustavomhss/hugr-orchestra/issues).
- Security reports: [SECURITY.md](SECURITY.md).
- License: MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Some modules carry their own license files.
