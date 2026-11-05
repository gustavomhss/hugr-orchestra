---
name: cli-acp-maintenance
description: Use when changing or debugging `orchestra acp` (the Agent Client Protocol server editors such as Zed connect to; apps/cli/src/acp agent.ts, config-option.ts, serve.ts), the shared turn driver turn.ts, mdns.ts (`web --mdns`), tui-config.ts (tui.json merge), omni-entry.ts and omni-preflight.ts (compiled CLI omni preflight), or when an editor session hangs, shows no updates, never gets permission prompts, or a compiled CLI exits with "hugr-omni CLI preflight failed"
---

# CLI and ACP maintenance

Related: `apps/cli/README.md` (entry points, packaging), `.orchestra/skills/desktop-startup-maintenance` (the desktop's own `serve` child), `docs/guides/omni.md` and `native/omni/docs/orchestra-integration.md` (omni), `docs/guides/instructions-and-tui.md` (`tui.json`). `apps/cli` has no AGENTS.md; the repository AGENTS.md applies.

## Ownership

| Piece | Owner file(s) | Rule |
|---|---|---|
| ACP agent (requests to Orchestra sessions) | `src/acp/agent.ts` | `OrchestraAgent`: one ACP session is one Orchestra session; talks to the server only through the `@orchestra/client` instance it is given |
| ACP model, effort and mode options | `src/acp/config-option.ts` | Pure builders and `parseModelSelection`; ids are `provider/model` (and `provider/model/variant`) |
| ACP transport | `src/acp/serve.ts`, `src/commands/handlers/acp.ts` | `serveAcp` wires an `AgentSideConnection` to ndJSON over two byte streams; the handler binds them to process stdin and stdout |
| Command definition | `acp` in `src/commands/commands.ts` | `hidden: true`, only flag `--cwd`; hidden from `--help` but runnable (`test/commands-help.test.ts`) |
| Prompt to completion | `src/turn.ts` (`runTurn`) | Shared by `orchestra run` and ACP: event stream, history flush, permission answering |
| Server connection | `src/services/daemon.ts` (`Daemon`) | Finds or starts the background server, owns `server.json` and the password file; `daemon.client()` is what handlers use |
| Command wiring | `src/index.ts`, `src/framework/{spec,runtime}.ts`, `src/commands/handlers/**` | Handlers load lazily by name; one folder per command group, tests beside them |
| TUI launch | `src/tui.ts`, `src/tui-config.ts` | `loadTuiConfig` reads `tui.json(c)` via Core's `TuiConfigFiles`: global first, then project folders, later wins per key; `keybinds` and `plugin_enabled` merge by name; an invalid file throws naming it |
| mDNS | `src/mdns.ts` | `MDNS.publish(port, domain?)` / `unpublish()` over `bonjour-service`; used only by `web --mdns` |
| Omni preflight | `src/omni-entry.ts`, `src/omni-preflight.ts` | `omni-entry.ts` is the compiled build's entrypoint (`script/build.ts`), loads omni, then imports `./index`; `needsOmni(argv)` decides if the invocation can spawn |
| Product server composition | `src/host.ts` (`ProductHost.contributions`) | Order of Maestro, continuity, engine-claude-code, then app-dock only with a channel; `serve.ts` passes it |
| Process helper, shared | `src/services/process.ts` (`Spawn.run`) | Goes through `ChildProcessSpawner`; used by `web` to open the browser |
| Other places | `src/commands/handlers/run.ts` (one-off prompts, TUI for `run` without a message), `serve.ts` (+ `serve-port`, `serve-shutdown`), `web.ts`, `attach.ts`, `providers/`, `mcp/`, `session/`, `service/` (wrap Daemon), `stats.ts`, `upgrade*.ts`, `uninstall.ts`; `bin/orchestra.cjs` (npm shim); `script/` (build, release, artifact and distribution packaging); `distribution/` (install scripts) | See `apps/cli/README.md` |

## Invariants

- Stdout is the ACP wire. Nothing else may write to process stdout or read stdin while `acp` runs; the daemon child is started with `stdio: "ignore"` for that reason. A stray `console.log` in this path corrupts the ndJSON stream and the editor drops the connection.
- `acp` is protocol surface that ships. `package.json` has `bin` (`orchestra` -> `bin/orchestra.cjs`) and `files: ["bin"]`; the shim runs the native executable with `stdio: "inherit"` and forwards argv and signals, which is how an editor's `orchestra acp` command reaches this code. Treat any change to `initialize` capabilities (`loadSession`, `mcpCapabilities`, `promptCapabilities`, `sessionCapabilities` close/fork/list/resume), `AuthMethodID`, session update shapes, config option ids (`model`, `effort`, `mode`) or `stopReason` values as a user-visible contract change; check the pinned `@agentclientprotocol/sdk` (exact `0.21.0`) before bumping it, because `unstable_forkSession` and `unstable_setSessionModel` are named after its unstable methods.
- Every permission request of the session and of its subagents must be answered, or the run blocks forever (`answerPermissions`). The ACP answer maps `once`/`always` through and everything else, including a cancelled or failed ask, to `reject`.
- `runTurn` delivers each event once, in sequence order, even when the live stream and the history carry it; events without `durable.seq` always pass. It starts from the last durable sequence before the prompt is submitted and returns only when the history shows the admitted message was promoted (`session.next.prompted`), because `sessions.wait` returning early means an idle session, not this turn. Keep these three together.
- ACP status mapping: a failed step (`session.next.step.failed`) becomes an `internalError` after the turn; abort becomes `stopReason: "cancelled"`; otherwise `end_turn`. A non-promoted prompt (40 wait attempts) is an `internalError`, not a silent success.
- ACP must stay on the client API: `src/acp` imports `@orchestra/client` and only Core's `installation/version`. The package rule (Client depends on Schema and Protocol, never Core or Server; `sdk-next` composes them) binds `packages/client`; this app composes Core, Server and the engines itself and does not use `sdk-next`.
- Spawning: Orchestra code spawns through `ChildProcessSpawner`, `Process` or `Process.interactive`, and only `packages/core/src/omni.ts` imports `hugr-omni`. `omni-entry.ts` therefore loads omni through `@orchestra/core/omni` (`Omni.load()`), never `hugr-omni`. The exempt files in this app are listed in `script/spawn-allowlist.json` (`apps/cli/bin/orchestra.cjs`, `apps/cli/script/runtime-proof.ts`, `apps/cli/src/services/daemon.ts`, all `child_process`); entries are only removed. Run `bun run check:spawn-imports` after touching any spawn site.
- The preflight must not block commands that cannot spawn: `--version`, `-v`, `--help`, `-h` anywhere in argv, `help`, and `db path` skip it, so a binary without its addon still answers them. Every other command needs the addon up front.
- Daemon failure messages are fixed reason codes and never carry server output or the password (`service start` prints the last one).

## Traps

- `omni-entry.ts` runs only when `OMNI_ENABLED` is injected true by the build and `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER` is unset, `1` or `strict`; `0`, any other value and a target built without omni stay lazy. `bun run dev` (`src/index.ts`) never runs the preflight. On failure it prints a reinstall hint (or `HUGR_OMNI_ADDON` / `HUGR_OMNI_SUPERVISOR`) and exits 1.
- `needsOmni` is argv-prefix based and tested; adding a command that never spawns means extending it and `test/omni-preflight.test.ts`, and the native proof fixtures probe with a command that may spawn (`test/fixture/distribution-native-proof.ts`, `distribution-musl/abi.ts`).
- Text and reasoning updates are sent once, at `session.next.text.ended` and `reasoning.ended`, not as deltas; tool calls are always `kind: "other"`. `loadSession` replays stored messages (`replay`), `resumeSession` does not.
- `prompt` keeps one `cancelled` controller per session: a second concurrent prompt on the same session overwrites it and `cancel` reaches only the latest. `cancel` also interrupts the server session, ignoring errors.
- Session updates are sent with `void connection.sessionUpdate(...)`, not awaited, inside `onEvent`.
- Not supported today, so do not assume it: the client's filesystem and terminal methods, audio, plan or usage updates, slash-command advertisement, `authenticate` for any method other than `orchestra-login` (it is a no-op that expects the user ran `orchestra auth login`), and any selection of the default mode beyond the first non-subagent, non-hidden agent the server lists.
- `closeSession` interrupts and forgets the in-memory state; it does not delete the Orchestra session. `listSessions` hides subagent (child) sessions and pages by the server cursor.
- MCP servers from the editor are added once per `cwd` and name per agent instance (`registeredMcp`), remote servers keep their headers; a second server with the same name in the same directory is ignored.
- `acp` sets `ORCHESTRA_CLIENT=acp` and `chdir`s to `--cwd` before the daemon starts; the first call can start the background server (up to a 20 s wait in `Daemon.start`).
- `mdns.ts` swallows publish errors on purpose and `web.ts` publishes but never calls `unpublish`; the process exit ends the advertisement. `--mdns` also moves the default host from `127.0.0.1` to `0.0.0.0`.
- `tui.ts` passes `terminalSuspend: false` through `TuiConfig.resolve`; do not change it without the TUI owner.

## Testing

Tests run on CI only: `bun run test:ci cli <files>` (the package alias is `cli`).

- `test/acp.test.ts`: a stub HTTP server plus an in-memory editor. Session create with default model and mode, streamed turn to updates, permission relay and `reject`, and `mcpConfig` / `promptContent` mapping. Not covered: `config-option.ts`, load/resume/fork/list/close, set-config-option, cancel, replay, step failure.
- `test/omni-preflight.test.ts`: `needsOmni`. `omni-entry.ts` itself has no unit test; the distribution tests exercise it through the built binary.
- `test/tui-config.test.ts`: merge per key, nearest folder wins, defaults, invalid file names the path.
- `test/commands-help.test.ts`: `acp` stays hidden but defined. `test/web.test.ts`: `accessLines` (mDNS line). `mdns.ts` has no test.
- `turn.ts` has no direct test; `src/commands/handlers/run.test.ts` and `test/acp.test.ts` exercise it. `daemon.ts` has only `test/daemon-port.test.ts` (`startOn` against an answering server); start, stop, registration and version mismatch are untested. `test/product-host.test.ts` covers `host.ts`.

## Changing it

- A new or changed ACP behavior: update `test/acp.test.ts`, and the ACP row in `docs/guides/architecture.md` if the user-visible surface changes.
- A new command: `commands.ts`, its lazy loader in `src/index.ts`, the handler, `apps/cli/README.md` command list, and `test/commands-help.test.ts` if it is hidden.
- Changing a server route the CLI calls: run `bun run generate` in `packages/client` first; do not edit `src/generated*`.
- Anything that spawns: re-run `bun run check:spawn-imports` and `bun run check:boundaries`.
- Before calling it done: `bun run check:guards --base origin/dev`.
