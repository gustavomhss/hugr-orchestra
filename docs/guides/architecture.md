# Architecture and security

How Orchestra is put together and what keeps it safe: its layers, durable sessions, process isolation and sandbox, the interfaces you can drive it from, and the security model. Read this to understand what an agent can and cannot reach.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/readme/architecture-dark.png">
  <img src="../images/readme/architecture-light.png" alt="Orchestra's layers from top to bottom: interfaces, seats, coordination, session core, tools, engines and the platform layer with omni, the OS sandbox, the SQLite store and the credential store.">
</picture>

- **Layers are enforced.** `script/module-architecture.json` assigns every package and module to one of 14 layers; a guard fails an import against that direction. Runtime dependencies point one way: Schema, then Core and Protocol, then Server.
- **Light client.** The root of `@orchestra/client` carries no Effect, core or server code, so editors and scripts can use the generated client without the runtime.
- **One door for processes.** Child processes start only through one module, which hands them to [omni](omni.md#omni). Sites that still spawn on their own are in an allowlist that only shrinks; a check fails on any new one.

## Sessions and context

### Durable sessions

Every conversation, Maestro's or a specialist's, is a durable session in the local database.

| Property | Behavior |
| --- | --- |
| Admission before execution | A prompt is written as a durable input row, then the session is woken. A crash between the two loses nothing. |
| Steer or queue | A prompt steers by default: it joins running work at the next safe boundary between model turns. A queued prompt waits until the session would go idle, then enters one at a time. |
| Exact retries | Resending the same prompt with the same id is reconciled, not duplicated. A conflicting reuse of an id fails. |
| One runner per session | A process-wide coordinator serializes each session's drains, joins wakes for the same session and runs different sessions in parallel. Each provider turn is one model call; history is reloaded from the store before the next. |
| Fork, archive, restore | History survives branches and app restarts. Archiving or deleting a running session stops its run (deleting also stops its child sessions). Child sessions (a seat's work, a delegated task) are real sessions you can open. |

### System Context and Context Epochs

- The system prompt (environment, date, project instructions such as `AGENTS.md`, skill list, module contributions) is built from registered Context Sources, each with a namespaced key, a codec and a renderer, in a fixed order.
- The rendered baseline is stored as a Context Epoch and reused byte for byte every turn, so the provider's prompt cache keeps hitting.
- A source that changes mid-session (new instruction file, new skill) does not rewrite the system prompt: one durable system message carries the change at the next safe boundary. Compaction starts a new epoch.

## Processes and isolation

### Sandbox and seat confinement

| System | Sandbox |
| --- | --- |
| macOS | Seatbelt |
| Linux | bubblewrap through sandbox-runtime (needs `bubblewrap` and `socat`) |
| Windows | AppContainer through omni |

- **Fails closed:** if the sandbox cannot be applied, the command does not run.
- Each command gets a fresh temporary folder and an environment scrubbed of tokens, secrets, passwords, API keys, the SSH agent socket and strings shaped like live keys.
- Loopback network access is granted per port, up to 32 grants.

| Who | Sandbox |
| --- | --- |
| You and Maestro | Opt-in |
| Specialist seats (macOS, Linux) | Always. Reads confined to their worktree, skills, write paths, a scratch folder and the toolchain; your home, `.ssh`, `.aws` and git credentials are invisible. No write paths means read-only. No sandbox means the command is refused, with no unconfined fallback. |

Refused to seats whatever the sandbox allows: git push, commit and merge, GitHub releases, package publishing, deploy CLIs, `rm`, and `--no-verify` or Husky bypasses.

### Agent terminal

Opt-in (`ORCHESTRA_AGENT_TERMINAL`, macOS and Linux).

- Each foreground shell command gets a real PTY inside the sandbox, shown as an `agent: <command>` terminal tab you can watch and type into.
- Output containing a secret ends the process.
- What the model reads is stripped of escape sequences (including clipboard writes) and treated as data, never instructions.
- Opt-in shell integration (`ORCHESTRA_SHELL_INTEGRATION`) adds command boundaries and exit codes, trusted only when they carry the session's private nonce.

## Interfaces

| Interface | What it offers |
| --- | --- |
| Desktop app | The main interface: Chat with Maestro, sessions with live task rows, project board, workflows, hooks, Actions (checks, queue, Guardrails), Context savings, Atlas, agents, providers, integrations, MCP servers, plugins, a `.env` editor, scheduled tasks, MCP Dock. Starts its own local server on 127.0.0.1 with a random password and restarts it with backoff if it dies. |
| Command line | `orchestra`: the same agents in a terminal UI, one-shot `orchestra run`, or a server (`orchestra serve` with Basic Auth; `orchestra web` adds the web UI). `orchestra attach` connects a terminal UI to a running server. |
| ACP | `orchestra acp` speaks the Agent Client Protocol on stdio for editors, with session replay, MCP, permissions and modes. |
| HTTP API | About 50 handler groups. Promise and Effect clients are generated from the API definition; a check fails when they drift. |
| Live meetings (macOS) | The meeting copilot listens to a call, answers in an overlay with hotkeys, can ask Maestro, and leaves a summary card. Needs a Deepgram key and Screen Recording permission. |
| Scheduling | One-off or recurring tasks for Maestro. |

The command line also manages sessions, agents, models, providers, MCP servers, plugins, the toolkit, the background service and the database; exports or imports transcripts; checks out a pull request into a session (`orchestra pr`); shows token and cost statistics (`orchestra stats`); and upgrades or uninstalls itself.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/readme/home-dashboard.png">
  <img src="../images/readme/home-dashboard-light.jpg" alt="The desktop app's Home screen for a project: the sidebar with Home, Chat, Project Board, Agents and Actions, and the project's overview.">
</picture>

## Security model

| Layer | Behavior |
| --- | --- |
| Sandbox | Specialist seats run in an OS sandbox with confined reads and a refused action list ([details](#sandbox-and-seat-confinement)). This is the isolation layer. |
| Permission prompts | Deny, Allow once, Always allow in this project, Stop. Saved rules can be reviewed and removed. A usability layer, not isolation; [SECURITY.md](../../SECURITY.md) states this boundary. |
| Project trust | A folder's MCP servers, plugins, formatters and language servers start only after you trust it. Choosing a folder as a project trusts it. |
| Credentials | Provider, integration and MCP sign-in credentials encrypted with AES-256-GCM under a key in the system credential store. |
| Untrusted text | Text from terminals, web pages, the Dock and recalled context is labelled as data for the model. |
| Database | Backed up before each migration; the three newest copies are kept. |
