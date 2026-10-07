# Orchestra: the adapters being migrated

hugr-omni lives in HuGR Orchestra at `packages/omni`. The plan that moves Orchestra's processes and terminals onto
it is [the integration plan](../../../docs/orchestra-integration.md). Its design decisions (D-L1 to D-L12) bind every
port listed below. This page is the index; the plan holds the detail and wins over it.

## Switch and loader

- `OPENCODE_EXPERIMENTAL_OMNI_SPAWNER` has three states. Unset or `0` means legacy. `1` means omni, delegating
  unsupported options to legacy. `strict` means no delegation: unsupported options fail with `BadArgument` (D-L1).
- `packages/core/src/omni.ts` is the only module that imports `hugr-omni`, and only dynamically. It counts omni
  spawns and delegations. A test run with the flag on and zero omni spawns fails (D-L2).
- Every omni spawn passes `inheritEnv: false` with `env: {...process.env, ...opts.env}`, minus `HUGR_OMNI_*`. Under
  Bun, `process.env` writes do not reach native code otherwise (D-L3, H4).

## The adapters

| Adapter | Today | Moves to | Work package |
|---|---|---|---|
| Effect spawner, `packages/core/src/cross-spawn-spawner.ts` (`CrossSpawnSpawner.node`) | cross-spawn | `omni-spawner.ts` behind the flag | WP1 |
| `Shell.invocation` in `packages/core/src/shell.ts` | `shell: true` | an explicit shell, a flag and the joined string | WP0 (signature), WP1 |
| PTY, `packages/core/src/pty/pty.bun.ts` and `pty.node.ts` | bun-pty / node-pty | `pty/omni.ts` implementing `Proc` | WP2 |
| Legacy `Process`, `packages/opencode/src/util/process.ts` (16 importers) | `child_process` | omni, with an explicit mapping table written first | WP3 |
| MCP stdio, `packages/opencode/src/mcp/` (`StdioClientTransport`) | the SDK's transport plus a `pgrep` walk | `OmniStdioTransport` in `mcp/stdio.ts` | WP3 |
| maestro-arsenal, `engine/process.ts` and `governance/process.ts` | `Bun.spawn` | omni `run` through the core loader | WP3 |
| Desktop main process and its utility process | `child_process` | omni, each with its own configured paths | WP4 |

## Decisions a port must keep

- **Output (D-L5).** One pump per child reads eagerly. Any `lostBefore` on a pipe stream fails that stream with a
  PlatformError, so Effect callers never get gapped bytes. In a PTY, a gap becomes a visible marker line.
- **Completion (D-L6).** `exitCode` resolves at root exit **plus** the end of the output, or a 2 s drain grace.
  Kill and finalizers are bounded: `stop({ graceMs: forceKillAfter ?? 2000 })`.
- **PTY (D-L7).** The consumer is claimed synchronously at spawn. The exit code is `exitCode ?? 128 + signo`. Sizes
  are clamped to 1..32767 on create and on update.
- **Shell (D-L4).** `shell: true | string` becomes `[shell, flag, joined]` through `Shell.invocation`. cmd.exe
  delegated to legacy until WP8b; with it, cmd.exe can run through omni with `windowsVerbatimArgs`.
- **Delivery (D-L8).** The addon and the supervisor are real files side by side. The path is given to the binding
  by JS through `configure({ addon, supervisor })`, never through environment variables.

## What stays outside omni

Daemons and launched apps that must outlive the host, `utilityProcess.fork`, the TUI pager and `$EDITOR` (they need
the real terminal), clipboard helpers that daemonize, the synchronous `shell-env` probe, plugin-facing `Bun.$` and
`Bun.spawn`, and the published SDK's server spawn. Each is listed with its reason in §3 of the plan.
