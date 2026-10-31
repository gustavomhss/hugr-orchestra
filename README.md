# HuGR Orchestra

HuGR Orchestra is a desktop app and command line for software work done by a team of AI agents. You talk to one lead agent, Maestro. Maestro turns your request into a plan, hands each piece to a specialist agent, tracks the work on a project board, checks the results, and brings decisions back to you. You stay the one who approves.

Orchestra runs on your machine, in your repository, with the model provider you choose: your Claude subscription through Claude Code, or any provider you connect with an API key.

**Status:** early release. Desktop 0.3.2 and command line 0.3.1, for macOS, Windows and Linux. Builds are not code signed yet. Some agents and features below are marked as not built yet; this README says so where it applies.

## How it works

1. **You ask Maestro.** Pick a project folder, connect a model, and describe the task in Chat.
2. **Maestro plans and delegates.** It splits the task into cards on the Project Board and sends each card to a specialist agent. Every agent runs in its own durable session that you can open and follow live, or steer while it runs.
3. **Agents work inside limits.** Specialists edit only the paths they were given. Publishing actions (pushing, opening or merging pull requests, releases) and reading `.env` files are denied to them. Your own permission rules decide what else needs a prompt.
4. **Results come back checked.** Maestro runs the project's checks, queues green work for merging, and reports what changed and what is still open.

The board moves on facts: a card advances when work is dispatched, a pull request opens, or a merge lands. Only you move cards out of Intake or archive a project.

## The agents

| Role | What it does | State |
| --- | --- | --- |
| Maestro (lead) | Plans, routes work, integrates results, owns the board | Built |
| Backend | Writes code in the repository, runs shell commands with a pinned toolkit, uses project memory | Built |
| Product and architecture | Specs, plans, work-package briefs and workflow drafts | Built |
| Research | Read-only discovery across the code and the web; writes research documents | Built |
| Meeting copilot | Listens to a live meeting on macOS, answers in an overlay, writes up decisions and commitments | Built |
| Frontend, code review, security review, documentation, process audit | Planned seats | Not built yet |

You can rename any agent, and edit its prompt, tools, skills and picture on the Agents screen. See [the agent screen](docs/guides/agent-screen.md).

## What you can do today

**Work with Maestro**
- Chat with Maestro in a project; watch delegated work as task rows and open any of them.
- Steer a running session or queue the next prompt; pick a reasoning level per model.
- Archive and restore sessions; sessions keep their history across branches and app restarts.

**Plan and track**
- Project Board: one board per project, written by Maestro, rebuilt from a committed record.
- Workflows: build step-by-step procedures (steps, checks, context, a skill per step) in a list or canvas editor, publish them, and let Maestro run them. Built-in templates cover fixing a bug with proof, safe refactoring, test-driven features, launching a feature end to end, and building one work package.
- Schedule one-off or recurring tasks for Maestro.

**Ship code**
- Checks and merge queue: the project declares its checks in `.orchestra/ci.json`; Maestro runs them, queues green work, and the app merges it as one pull request. Work in progress is pushed every 10 minutes after a secret scan, so a crash does not lose it.
- Hooks: rules that block, ask, remind or record when agents act, with an activity log.

**Control and trust**
- Permission prompts with Deny, Allow once, Always allow in this project, and Stop; saved rules can be reviewed and removed.
- Project trust: a folder's MCP servers, plugins, formatters and language servers start only after you trust that folder.
- Credentials for providers, integrations and MCP sign-ins are encrypted (AES-256-GCM) with a key held in the system credential store.
- The database is backed up before each migration; the three newest copies are kept.

**Tools for agents**
- MCP Dock: each open interface becomes an MCP server agents can use. Browser tabs and an isolated Linux desktop are read through the accessibility tree, without screenshots. The Linux desktop needs Docker.
- Skills: a catalog of skills from the project, your global folder and built-in modules; agents load them level by level.
- Atlas: a knowledge layer stored in git, checked for drift against the code it describes.
- Integrations (Slack, Discord), MCP servers, plugins, a `.env` editor and context savings for long shell output.

**Live meetings (macOS)**
- A meeting copilot with an overlay, hotkeys and a summary card after the call. Needs a Deepgram key and Screen Recording permission.

**Command line**
- `orchestra` runs the same agents in a terminal UI, as a one-shot `orchestra run`, or as a server (`orchestra serve`, with Basic Auth). It also manages sessions, models, providers, MCP servers, plugins and the database, and exports or imports transcripts.

## Not there yet

- Five of the planned agents are not built (see the table above).
- Workflow steps that wait for human approval cannot run yet; four of the templates are read-only.
- Hooks apply to the whole project only and cannot be imported.
- The meeting overlay's hiding from screen sharing has been checked with Google Meet in Chrome only.
- Builds are unsigned, so the system asks before the first launch.

## Install

Releases are on the [GitHub Releases](https://github.com/gustavomhss/hugr-orchestra/releases) page: desktop releases are tagged `desktop-v<version>` and command line releases `v<version>`. Each release note says whether the build is signed.

### Desktop app

Download the installer for your system from the latest `desktop-v<version>` release. Files are named `orchestra-desktop-<os>-<arch>.<ext>`:

| System | File |
| --- | --- |
| macOS | `orchestra-desktop-mac-arm64.dmg` (Apple silicon), `orchestra-desktop-mac-x64.dmg` (Intel) |
| Windows | `orchestra-desktop-win-x64.exe` |
| Linux | `orchestra-desktop-linux-x86_64.AppImage`, plus `.deb` and `.rpm` packages of the same build |

The `.deb` and `.rpm` use each format's own architecture name (`amd64` and `x86_64`). Each release attaches `SHA256SUMS`.

An unsigned build makes the system ask before the first launch. On macOS, open System Settings > Privacy & Security and choose Open Anyway. On Windows, choose More info > Run anyway on the SmartScreen prompt. Linux installers carry no signature check. The first launch on macOS can take up to a minute while the system checks the new app.

### Command line

```bash
npm install -g @humanguardrail/cli
```

Each release also attaches per-platform `.tar.gz` archives, `SHA256SUMS` and `install.sh` for macOS and Linux (x64 and arm64, glibc and musl). Download an archive and take its digest from `SHA256SUMS`, then run:

```sh
sh install.sh \
  --prefix "$HOME/.local/orchestra" \
  --version <version> \
  --target <target> \
  --archive /absolute/path/to/orchestra.tar.gz \
  --sha256 <digest>
```

`install.sh` does not edit shell configuration. See the [distribution guide](apps/cli/distribution/README.md) for target names, updates and rollback.

### First run

1. Pick a project folder. Choosing it also trusts it, so trust only folders you wrote or reviewed.
2. Connect a model in Providers: sign in to Claude Code to use your Claude subscription ([Claude mode](docs/guides/claude-mode.md)), or add a provider's API key.
3. Press "Start a session" on Home and type a task.

The [getting started guide](docs/guides/getting-started.md) walks through the first five minutes.

### Upgrading

For npm installs, run `orchestra upgrade`. The desktop app checks for new versions itself. Windows and AppImage builds update in place, as do signed macOS builds. Unsigned macOS builds and the `.deb` and `.rpm` packages link to the new release: download its installer and install it over the old one.

## Guides

User guides are in [`docs/guides`](docs/guides/README.md). Start with:

- [Maestro: your lead agent](docs/guides/maestro.md)
- [Workflows](docs/guides/workflows.md) and [Hooks](docs/guides/hooks.md)
- [Checks and the merge queue](docs/guides/merge-queue.md)
- [Permissions and saved rules](docs/guides/permissions.md) and [Project trust](docs/guides/mcp-project-trust.md)
- [MCP Dock](docs/guides/mcp-dock-servers.md)
- [Live meetings](docs/guides/live-meetings.md)
- [Desktop startup errors](docs/guides/desktop-startup.md)

## Build from source

You need Bun 1.3.14, the version pinned in `package.json`.

```bash
bun install
```

```bash
bun run dev:desktop
```

- `bun dev` runs the terminal UI and server in the current directory.
- `bun run dev:web` runs the web UI.
- `./apps/cli/script/build.ts --single` builds a standalone `orchestra` binary for your platform.
- Type check from a package directory with `bun typecheck`. Tests run on GitHub Actions through `bun run test:ci <package> [test files...]`; [AGENTS.md](AGENTS.md) has the rules.

See the [desktop guide](apps/desktop/README.md) and [CLI guide](apps/cli/README.md) for package commands, and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

### Where things live

| Path | What it holds |
| --- | --- |
| [`apps/desktop`](apps/desktop/README.md) | Electron app, IPC, platform adapters and packaging |
| [`apps/cli`](apps/cli/README.md) | The `orchestra` executable, commands and daemon |
| [`apps/web`](apps/web/README.md) | Browser bootstrap and web distribution |
| [`packages/app-shell`](packages/app-shell/README.md) | Shared Solid UI used by desktop and web |
| [`packages/tui`](packages/tui/README.md) | Terminal UI |
| [`packages/core`](packages/core/README.md) | Sessions, configuration, providers, tools and plugin hosting |
| [`packages/schema`](packages/schema/README.md), [`protocol`](packages/protocol/README.md), [`server`](packages/server/README.md), [`client`](packages/client/README.md) | Data contracts, the public HTTP API, its server, and generated clients |
| [`packages/sdk-next`](packages/sdk-next/README.md), [`plugin`](packages/plugin/README.md) | Embedded host and plugin authoring contracts |
| `modules/maestro` | Maestro: agent roster, coordination, tools and playbooks |
| [`modules/specialists`](modules/specialists/backend/README.md) | Specialist agents' skills |
| [`modules/relay`](modules/relay/README.md) | Workflow and gate runtime |
| [`modules/atlas`](modules/atlas/README.md) | Atlas knowledge layer |
| `modules/app-dock` | MCP Dock and the Linux workspace |
| [`native/omni`](native/omni/README.md) | Native process and terminal layer (Rust) |
| `docs/guides`, `docs/specs` | User guides and design specs |

Runtime dependencies point from Schema to Core and Protocol, then to Server. Client code depends on Schema and Protocol only.

## Support, security, license

- Bugs and questions: [GitHub Issues](https://github.com/gustavomhss/hugr-orchestra/issues).
- Security reports: see [SECURITY.md](SECURITY.md).
- License: MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Some modules carry their own license files.
