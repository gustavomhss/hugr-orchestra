# hugr-omni inside HuGR Orchestra — integration plan

Status: **v3** (2026-10-06, lead). §10 (round-2 amendments) overrides anything above it that it contradicts.
v2 history: v1 was reviewed by three independent reviewers (architecture, tests/CI,
packaging/OS with live probes); every BLOCKER and MAJOR is folded in below (§9 lists them and where each landed).

Owner decision (2026-10-06): omni lives in Orchestra at `packages/omni`. `github.com/gustavomhss/hugr-omni` is a
read-only mirror of that folder (`git subtree split --prefix=packages/omni` reproduces the mirror's `main` exactly,
verified: `415038b`).

**End state.**
- Every child process and terminal that Orchestra owns is started by omni, except the sites in §3, each listed with
  its reason. Cross-spawn, bun-pty and node-pty, the `taskkill` and `pgrep` walks, and `Shell.killTree` are gone
  from the omni paths.
- **Scope of the "no orphans" promise.** A crash or `kill -9` of the Orchestra server, the TUI or the desktop app
  leaves no process from an omni tree behind on any OS. The promise has the same tiers and holes as `GUARANTEES.md`:
  - A Unix `setsid` escapee survives (tmux, gpg-agent).
  - Docker containers are covered by `--rm` plus a label sweep (WP3), not by omni.

## 1. Facts the plan rests on (verified)

- **The Effect choke point.**
  - All Effect callers get the spawner through `CrossSpawnSpawner.node` (`packages/core/src/cross-spawn-spawner.ts:505`).
  - No Effect caller uses `inherit`, `additionalFds`, `killSignal` or `unref`.
  - The only PipedCommand producer is a pass-through at `tool-safety-sandbox.ts:51`.
- **The non-Effect paths.**
  - The legacy `Process` (`packages/opencode/src/util/process.ts`, 16 importers).
  - MCP's `StdioClientTransport`.
  - `maestro-arsenal` (`Bun.spawn`; no dependency on core).
  - The desktop main process.
- **Legacy pipes have OS backpressure; omni has none.**
  - omni drains every pipe and keeps up to 16 MiB per stream for an attached consumer, then drops data and reports
    `lostBefore`.
  - An Effect byte stream cannot carry `lostBefore`.
  - Real streams exceed 16 MiB: `git cat-file --batch` (`snapshot/index.ts:604`), and ripgrep with a slow `onItem`.
- **Legacy `exitCode` resolves on `close`** (`cross-spawn-spawner.ts:276-282`), so callers assume exit means the
  output is complete. `shell.ts:577-597` joins the reader with no timeout after exit.
- **PTY.**
  - `#pty` picks bun-pty under Bun and node-pty under Node.
  - 2 MB ring buffer; the cursor counts UTF-16 units (`packages/app/src/components/terminal.tsx:608`).
  - The win32 PTY tests are skipped (`core/test/pty/pty-session.test.ts:27`, `opencode/test/server/httpapi-pty.test.ts:15`).
- **Runtimes.**
  - The CLI is a `bun build --compile` binary, and the published file is `bin/opencode.exe` on every OS
    (`script/publish.ts:38,59`).
  - Global npm and Homebrew installs reach it through a symlink.
  - The TUI runs the server in a Bun `Worker` (`cli/cmd/tui.ts:210`, `terminate()` at `:227`).
  - The desktop runs the server under Electron's Node (a `utilityProcess` running the `build-node.ts` bundle), and
    the desktop main process spawns too.
- **Install.** `bun install` with unpublished `hugr-omni-*` optional dependencies only warns (404) and succeeds (tested).
- **Orchestra tests run on GitHub Actions only** (`script/test-guard.ts`).
  - Use `bun run test:ci <pkg> [files] --os linux|windows|both`, with one package per run.
  - It runs only on `ci-run-*` branches and uses `bun test` only.
  - The epic suite (`test.yml`) is label- and dispatch-gated, with about 16 jobs; the account cap is 20 concurrent jobs.
  - omni's own gate (`node packages/omni/scripts/ci.mjs`) is not under that guard.
- **Probe results** (§7) changed the delivery design: Bun copies a bunfs `.node` to `$TMPDIR`, and `process.env`
  writes under Bun do not reach native code.
- **omni bugs the integration exposed** (all must be fixed before Wave 2, WP-H):
  - **H1 Worker crash.** Bun aborts (rc=134, a napi-rs finalize panic) when a Worker that loaded omni is terminated
    (reproduced by the lead). Under Node, the terminated Worker's child lives until the host exits.
  - **H2 Supervisor hijack.** The supervisor is looked up next to the module first. With an addon extracted to
    `$TMPDIR`, a planted `/tmp/hugr-omni-supervisor` runs as the user.
  - **H3 Symlinks.** `current_exe()` is not canonicalized, so a symlinked install (npm global, Homebrew) misses the
    supervisor.
  - **H4 Env under Bun.** Under Bun, `process.env` writes reach neither Rust's `getenv` nor the environment that
    children inherit. Orchestra sets `AGENT`, `OPENCODE_PID` and the provider keys that way (`index.ts:52-62`,
    `provider.ts:326,585`).
  - **H5 Windows C runtime.** The Windows binaries are built without a static CRT and likely need `VCRUNTIME140.dll`.
  - **H6 Stale guarantees.** `GUARANTEES.md` marks C-PTY and C-TS-02 (Bun) as "planned".

## 2. Design decisions (lead)

- **D-L1 Switch.**
  - The flag `OPENCODE_EXPERIMENTAL_OMNI_SPAWNER` has three states, read by a dedicated parser with a unit test, not
    `truthy()`:
    - unset or `0`: legacy;
    - `1`: omni, delegating unsupported options to legacy;
    - `strict`: no delegation; unsupported options fail with `BadArgument`.
  - **Positive control.** The loader counts omni spawns and delegations. The test preload fails a run whose flag is
    on but that had 0 omni spawns, and a `strict` run with more than 0 delegations.
  - The same flag drives the spawner, PTY, legacy `Process`, MCP and maestro-arsenal.
- **D-L2 Loader.**
  - `packages/core/src/omni.ts` is the only module that imports `hugr-omni`, and only dynamically.
  - When the flag is on and the addon or supervisor is missing, it fails loudly.
  - It exports a tiny `omni-env` helper used everywhere.
  - maestro-arsenal gets `@opencode-ai/core` as a dependency so it can use the same loader. This is allowed by the
    layering in `AGENTS.md:3`, which only governs schema/core/protocol/server/client.
- **D-L3 Environment.**
  - Every omni spawn passes `inheritEnv:false, env:{...process.env, ...opts.env}`, built after the merge, with
    `HUGR_OMNI_*` stripped from that final object.
  - This works around H4 on Bun, and WP-H also fixes it in the binding for every consumer.
- **D-L4 Shell.**
  - `shell: true | string` becomes an explicit `[shell, flag, joined]` via `Shell.invocation`, never `Shell.args`.
    Its signature is frozen in WP0.
  - cmd.exe delegates to legacy until WP8b. In `strict` mode on Windows, cmd.exe is the only allowed delegation, and
    the counter tracks it.
- **D-L5 Output: no silent loss.**
  - One pump per child reads omni's single consumer eagerly into host queues and never blocks.
  - Queues are created lazily, on first subscription, and replay from a spawn-time buffer. `all` follows the pump's
    own order.
  - Collect paths (`AppProcess.run`) are bounded only by their own caps.
  - **Any `lostBefore` on a pipe stream fails that stream with a PlatformError.** Effect callers never get gapped
    bytes.
  - PTY is different: a gap becomes a visible marker line counted in the cursor (D-L7).
- **D-L6 Completion.**
  - `exitCode` resolves at root exit **plus** (output end, or `DRAIN_GRACE` of 2 s). Legacy callers keep their
    guarantee that the output is complete after exit.
  - When the grace expires, the host streams are ended. Then the tree is either stopped, or adopted under O1, at
    scope close.
  - Kill and the finalizer are always bounded: `stop({graceMs: forceKillAfter ?? 2000})`.
- **D-L7 PTY.**
  - `pty/omni.ts` implements `Proc`. The consumer is claimed synchronously at spawn, and data and exit are queued
    until listeners attach.
  - A gap emits a marker counted in the cursor.
  - `onExit` waits for the end of output, capped at 1 s.
  - The exit code is `exitCode ?? 128+signo`.
  - Size is clamped to 1..32767 on create **and** on update.
- **D-L8 Delivery: files on disk, never embedded.** The addon and the supervisor are always real files side by side:
  - **CLI:** `bin/opencode[.exe]`, `bin/hugr_omni.node`, `bin/hugr-omni-supervisor[.exe]`.
  - **Desktop:** `Resources/omni/`.
  - **Dev:** `packages/omni/target/*`.
  - The path is handed to the binding by JS, through `hugr-omni`'s new `configure({addon, supervisor})` (WP-H). It
    never travels through environment variables.
  - The desktop main process and the utilityProcess each configure their own path, and each has its own supervisor.
  - The checkout fallback (`checkoutBuild`) is disabled when an explicit path is configured.
- **D-L9 Targets.**
  - 8 of the 12 Orchestra targets map onto omni's 5 builds.
  - musl ×3 and win32-arm64 build with `OMNI_ENABLED=false` until WP8a. `opencode debug omni` reports which path is
    active.
  - WP9 removes legacy only after WP8a.
- **D-L10 Unchanged layering.** `@opencode-ai/sdk`, published and client-light, stays on cross-spawn with its own
  `process.ts`.
- **D-L11 Skills.**
  - One source: `packages/omni/skills/<name>/SKILL.md`.
  - Orchestra loads it via `skills.paths`. The loader is fixed to resolve relative entries against the config
    file's directory (`skill/index.ts:272-273`).
  - Claude Code loads it via `packages/omni/.claude-plugin/plugin.json`.
- **D-L12 PipedCommand** delegates to legacy (`1`) or fails (`strict`). Its only producer is denied when the sandbox
  is on.

## 3. What stays outside omni

| Site | Why |
|---|---|
| CLI daemon `cli/src/services/daemon.ts:122`; desktop `background-cli.ts:90` (its CLI may start the daemon); `ipc.ts:229` open-path; `wsl/runtime.ts:329` detached terminal | Must outlive the host; omni's Job and session containment would kill them. |
| `utilityProcess.fork` (desktop `server.ts:84`) | Electron IPC, not a child process. |
| CLI pager `cli/cmd/session.ts:97`, `cli/cmd/pr.ts:104` (TUI), `cli/cmd/db.ts:39` (sqlite3), `cli/bin/lildax.cjs:11` launcher, `tui/src/editor.ts` (`$EDITOR`), desktop `linux-workspace-access.ts:252` `shell()` | Need the real terminal (stdio inherit). They move to `Process.interactive` (a small cross-spawn wrapper) where they are in opencode; the others stay as they are. |
| `cli/cmd/providers.ts:335` | Inherits stderr for auth prompts. Moves to `Process.interactive`. |
| `tui/src/clipboard.ts:11` (`xclip` / `wl-copy`) | They daemonize to own the selection; omni would kill them. |
| `cli/cmd/github.handler.ts:298` | Opens the browser (the launched app must outlive the host). Moves from `exec` with a shell string to `execFile`, or to the `open` package. |
| `shell-env.ts:37` (`spawnSync`) | omni has no synchronous API; this is a bounded probe. |
| `Bun.$` and `Bun.spawn` in plugins | Plugin API surface. |
| `@opencode-ai/sdk` server spawn | D-L10. |

`apps.ts:34,42` (`which`/`where`), `tool-safety-sandbox-runtime.ts:142` (`execFile tar`) and
`linux-workspace-access.ts:49` are owned by WP4/WP1 below.

## 4. Work packages

Every WP:
- runs in its own worktree and branch, cut from `omni-native`;
- has a write-set disjoint from every WP running in parallel with it (§6 lists the shared files and their owner);
- is green before the lead takes it in.

Size limits: Orchestra TS/JS 500 lines (target) / 750 (hard); omni 400/600/650. Test oracles identify processes by
a **nonce in argv**, checked through the process table (`ps -eo args` on Unix, the CIM CommandLine on Windows), never
by a bare pid, and all of them use the shared `test/fixture/process-tree.ts`. Timing assertions prove a hang is
bounded (≤ 20 s against a 600 s hang). They are not latency budgets.

### Wave 1 (parallel)

**WP0 Foundation** (the lead or one agent; owns every shared file)

- **Tooling ignores.** `.oxlintrc.json` and `.prettierignore` ignore `packages/omni/**`.
- **Workspaces.**
  - The root `workspaces` gets `packages/omni/bindings/node`.
  - `"hugr-omni": "workspace:*"` goes into core, opencode, desktop and maestro-arsenal, all at once.
  - maestro-arsenal also gets `@opencode-ai/core`.
  - Add a root `omni:build` script and regenerate `bun.lock`.
- **omni gate from either root.** `packages/omni/scripts/file-size-guard.py` scans its own subtree.
- **Core surface.** Frozen signatures, with implementations stubbed where another WP owns them:
  - `core/src/omni.ts`: loader, counters, `omni-env`;
  - `core/src/flag/flag.ts`: the three-state parser;
  - `Shell.invocation` in `core/src/shell.ts`;
  - the shared `test/fixture/process-tree.ts` (nonce tree) and the preload positive-control hook.
- **CI plumbing.**
  - `script/test-ci.ts` gets `--env KEY=VALUE` (allow-listed keys, values `^[A-Za-z0-9_]+$`), `--os macos`, and a
    `runner: bun|node` field.
  - `test-ci.yml` exports allow-listed env via `$GITHUB_ENV`, adds a macOS leg and the node runner, and restores the
    **omni binary cache**: built addon and supervisor, keyed by `hashFiles('packages/omni/crates/**',
    'packages/omni/Cargo.lock', 'packages/omni/bindings/node/src/**')`. Cargo runs only on a cache miss.
  - `cache-warm.yml` saves that cache on `dev`.
- **Probe (d).** A Worker that loads omni is terminated, on Bun and Node. It is red today (H1) and becomes WP-H's
  acceptance test.
- **Validation.**
  - `bun install --frozen-lockfile`, `bun turbo typecheck`, `bun run check:godfile`.
  - `node packages/omni/scripts/ci.mjs` green inside Orchestra and in a clean clone of the split.
  - `test:ci core test/omni-loader.test.ts --os both` covers the parser, the counters and env stripping.

**WP-H omni hardening** (omni only; blocks Wave 2; includes contract scenarios where the contract changes)

- **H1 Worker and env teardown.**
  - Register a napi env cleanup hook that stops every tree the env owns, bounded, and drops native references
    without panicking.
  - No finalizer may panic (AGENTS: nothing panics across FFI).
  - Accepted when Worker terminate exits 0 on Bun and Node, the Worker's child is gone, and the probe (d) script
    becomes an omni test that runs in the fast gate.
- **H2 Supervisor lookup.**
  - The module-directory candidate is dropped when that directory is not owned by the user or is group- or
    other-writable. On Windows, apply the equivalent ACL check, or drop the candidate.
  - A configured path always wins.
- **H3 Symlinks.** Try both `current_exe()` and its canonicalized path.
- **H4 Configuration and env.**
  - New binding call `configure({addon?, supervisor?})`, which must run before the first spawn.
  - `inheritEnv:true` takes the JS-side `process.env` (the binding passes it), so Bun and Node behave the same.
  - This is an additive contract amendment, made by the lead in `api-contract.md`, with a scenario: a variable set
    via `process.env` reaches the child on both runtimes.
- **H5 Windows C runtime.**
  - Build the Windows targets with `+crt-static`.
  - `verify.mjs` asserts with `dumpbin /dependents` that there is no `VCRUNTIME`.
- **H6 Guarantees ledger.** Move C-PTY-01..04 and C-TS-02 to their tested tier, with CI evidence. The Bun contract
  step moves from `--release` into the fast gate.
- **Validation.** `node scripts/ci.mjs` green on all three OSes (the mirror CI or `omni.yml`), plus `--release` once.

**WP7 Skillkit** (`packages/omni/skills/**`, `scripts/skill-check/**`, `.claude-plugin/**`)

- **Skills.** Nine skills, each pointing to the canonical docs rather than copying them:
  - `omni-processes`
  - `omni-lifecycle`
  - `omni-terminals`
  - `omni-migrate`
  - `omni-gates`
  - `omni-core-change`
  - `omni-os-traps`
  - `omni-conformance`
  - `omni-release`, with references `mirror.md` and `new-target.md`
- **skill-check.**
  - Checks frontmatter, the 500-line body limit, links and anchors, and that every backticked option or error code
    exists in `index.d.ts`.
  - Comes with teeth tests.
- **Code examples.** Usage-skill examples go through `readme-check`: `--static` per push, and run for real under
  `--release`.
- **Where the lead wires it in** (shared files):
  - `ci.mjs`: the lint step;
  - the mirror `ci.yml`: a `paths` allow-list;
  - Orchestra's `.opencode` `skills.paths` and the loader fix.
- **Validation.**
  - skill-check is green, and red on broken fixtures.
  - An Orchestra session lists the omni skills.
  - `claude --plugin-dir packages/omni` lists them too.

**WP8a omni targets** (omni only; after WP-H in the same files, so sequenced)
- **New builds:**
  - linux-musl x64 and arm64 addons, as a cdylib with `-crt-static`;
  - win32-arm64 on `windows-11-arm`.
- **Wiring:** platform ids in `index.js`, `pack.mjs` and `verify.mjs`; the `release.yml` matrix; the GUARANTEES
  columns.
- **Validation:** a release run proves 8 packages with node, bun and deno.

**WP8b Windows verbatim command line** (omni; after WP8a)
- An explicit option that lets a caller pass the full command line for a cmd.exe it names itself. omni still never
  adds a shell.
- The lead amends the contract first and adds a scenario.
- If this is rejected, WP9 keeps a cmd-only legacy path.

### Wave 2 (parallel, after WP0 and WP-H)

**WP1 Effect spawner** (`packages/core`: `omni-spawner.ts`, `child-process-common.ts`, `cross-spawn-spawner.ts`,
`shell.ts` body, tests)
- **Mapping.**
  - Error tags:
    - `NOT_FOUND` → NotFound
    - `INVALID_CWD` → NotFound (keeping the `fs.access` pre-check)
    - `NOT_EXECUTABLE` → PermissionDenied
    - `INVALID_ARGUMENT` → BadArgument
    - `CLOSED` → BadResource
    - `ABORTED` and `IO` → Unknown
  - `OUTPUT_LIMIT` never occurs, because `run()` is not used.
  - `exitCode` still fails on a signal (`cross-spawn-spawner.ts:417-425`).
  - `isRunning` means the root is alive or the drain is pending.
  - D-L5, D-L6 and D-L12 apply.
- **Adoption seam for O1.** `ChildProcessHandle` gains a core-internal `adopt()`. It hands the live `Child` to a
  registry instead of stopping it at scope close, and the registry is implemented in WP11.
- **New tests**, each checked against the nonce oracle:
  1. A grandchild holding stdout: bounded return, then the grandchild is stopped or adopted according to policy.
  2. A child that ignores SIGTERM with `forceKillAfter` **unset**: kill and scope close are bounded.
  3. Windows: after the root exits 0, the grandchild is gone at scope close (generic policy).
  4. `git cat-file --batch` with 200 objects plus one blob over 20 MiB is byte-identical.
  5. A slow consumer behind more than 16 MiB of output fails with a PlatformError and never yields gapped bytes.
  6. Abort and timeout leave nothing alive.
  7. `strict` with `inherit` gives BadArgument, and the counter shows 0 omni spawns for that call.
  8. Exit ordering: the shell-tool pattern (exit wins, then the reader is joined) completes with the full output.
  9. `AGENT=1`, set via `process.env`, reaches the child, and `HUGR_OMNI_*` does not.
- **Regression** (lean, see §8):
  - core: `cross-spawn-spawner`, `process`, `tool-bash`, `tool-safety-sandbox*`, `git`, `ripgrep`, `shell`,
    `filesystem/search`;
  - opencode: `tool/shell*`, `tool-safety-shell`, `session/prompt`, `git`, `snapshot`, `format`, `project/*`,
    `maestro/arsenal-*`.

**WP2 PTY** (`packages/core/src/pty*`, `packages/schema/src/pty.ts`, `packages/client` and SDK regeneration)
- **Adapter:** D-L7.
- **Stop and finalize.**
  - `kill()` becomes `stop(graceMs)`. Remove does not await it.
  - The layer finalizer awaits all stops with a **7 s** cap, above ConPTY's declared 6 s close.
  - Eviction also stops survivors.
- **Schema.** `CreateInput` gets optional `cols`/`rows`. Both create and `UpdateInput.size` are clamped. Then
  `bun run generate` in `packages/client` and an SDK rebuild.
- **Text splits.** `protocol.ts` chunking and the ring trim back off from a high surrogate.
- **Legacy and adoption.** Legacy stays behind the flag. Under O1, a PTY that is closed while background jobs
  (`nohup x &`) are alive hands them to the registry (WP11).
- **New tests** (`test/pty/omni.test.ts`), with **mandatory Windows variants** (cmd/pwsh):
  - a tree is killed on remove;
  - print and exit immediately, repeated 50 times, loses nothing;
  - resize at create and on update, checked with `stty size` or `mode con`;
  - replay after reconnect is exact, with the right cursor;
  - a gap marker appears, and the cursor stays consistent;
  - a Node-host smoke run (`runner: node`).
- **Regression:** `core/test/pty/*` and `opencode/test/server/httpapi{,-v2}-pty.test.ts` (Linux and macOS; they skip
  Windows).

**WP3 Legacy Process, LSP, MCP, maestro-arsenal** (`packages/opencode/src/{util,lsp,mcp,session/prompt.ts,cli}`,
`packages/maestro-arsenal`)

- **`util/process.ts`.** Uses an explicit mapping table that must be written before any code, covering:
  - `Stdio`: `inherit`, numeric descriptors and streams are rejected, and the callers that need them move to
    `Process.interactive`;
  - `spawn` never throws synchronously: startup failures reject `exited` with `code` set to `ENOENT`
    (`NOT_FOUND`/`INVALID_CWD`) or `EACCES`;
  - the exit code stays `code ?? (signal ? 1 : 0)`;
  - abort surfaces as `RunFailedError` or nothrow, never as `OmniError`;
  - streams are real `node:stream` `Readable`/`Writable` subclasses, as vscode-jsonrpc requires;
  - `maxOutputBytes` is effectively uncapped;
  - a new `deadline` option.

  `Process.interactive` takes the §3 callers inside opencode.
- **`!` template command** (`prompt.ts:1447`): it gets the Effect abort signal and a 120 s deadline (O3).
- **MCP.**
  - `mcp/stdio.ts` (`OmniStdioTransport`) surfaces stderr as debug logs, and the last 20 lines go into a connect
    failure.
  - `close` runs `closeStdin`, then waits up to 2 s, then always calls `stop`.
  - The `pgrep` walk is deleted.
  - Docker-based MCP servers get `--rm` plus an `orchestra.session` label, swept at boot.
- **maestro-arsenal:** `engine/process.ts` and `governance/process.ts` move to omni `run` through the core loader.
- **`opencode debug omni`** (in `cli/`): prints the active path (omni or legacy), the addon and supervisor paths,
  and runs a nonce tree.
- **New tests:**
  - LSP: the tree is killed when wrapped by node, and on Windows by a `.cmd`.
  - LSP: 20 crash/restart cycles keep the process count stable.
  - MCP:
    - no grandchild remains after close;
    - 200 KB of stderr before connect still connects, which fails on today's code;
    - a missing command rejects;
    - `onclose` fires exactly once;
    - an `npx` argument with metacharacters on Windows either works or fails with a clear error.
  - Process:
    - abort kills the grandchild;
    - a grandchild holding the pipe is bounded;
    - `shell` path;
    - `deadline`;
    - the Node-host adapters (`runner: node`).
- **Regression:**
  - `test/util/process.test.ts` (all 10);
  - `test/lsp/*` and `test/mcp/*`, including `lifecycle.test.ts:497`;
  - `plugin/azure`, `plugin/meta`, `tool/truncation`;
  - the `maestro-arsenal` tests.

**WP6 CI, mirror, artifacts** (`.github/workflows/omni*.yml`, `packages/omni/scripts/build-artifacts.mjs`)

- **`omni.yml`.**
  - Triggers: the epic label, dispatch, and pushes to `dev` that touch `packages/omni/**`.
  - Runs on 3 OSes, with `working-directory: packages/omni` and `node scripts/ci.mjs`.
- **`omni-mirror.yml`** runs on pushes to `dev` that touch `packages/omni/**`:
  1. split;
  2. run ci.mjs once on Linux, on the split checkout;
  3. fast-forward push using `OMNI_MIRROR_DEPLOY_KEY`. It never forces, and a non-fast-forward turns the job red.

  The mirror's own `ci.yml` keeps only tags and dispatch.
- **`omni-artifacts.yml`.**
  - `workflow_call` plus dispatch.
  - The build steps come from the mirror's `release.yml`, moved into `build-artifacts.mjs`, which both call. This
    runs after WP8a lands, so the matrix is 8 builds.
  - It also feeds the binary cache.
- **Validation:**
  - `omni.yml` is green on three OSes;
  - the mirror job is green against a scratch remote;
  - the artifacts dispatch is green.

### Wave 3 (after Wave 2)

**WP4 Desktop** (`packages/desktop/**`, plus `packages/opencode/script/build-node.ts`, owned here)

- **Packaging.**
  - `prebuild.ts` stages `resources/omni/`.
  - `extraResources` includes omni; the stale `native/` entry goes.
  - Both the utilityProcess and the main process call `configure()` with `Resources/omni/*` paths.
  - `build-node.ts` bundles `hugr-omni` and does not externalize it.
- **Signing.**
  - `mac.binaries` signs the supervisor and the addon with a **minimal entitlements plist**.
  - `win.signExts` includes `.node`.
- **Migrated to omni:**
  - `wsl/sidecar.ts`
  - `wsl/runtime.ts:55` (UTF-16LE decoder kept; a test is added **before** migrating)
  - `wsl/runtime.ts:118` (pty)
  - `app-dock-runtime.ts:152`
  - `linux-workspace-access.ts:33,49,57,150,294`
  - the exec wrapper in `app-dock-runtime-docker.ts`
  - `apps.ts:34,42`

  node-pty leaves desktop.
- **Tests.**
  - `app-dock-runtime.test.ts`, `wsl/*`, `linux-workspace.integration.test.ts`.
  - A `text:false` smoke under Electron.
  - **Packaged-app smoke**, a dispatched Linux job: `electron-builder --dir`, launch, open a terminal, run a tool
    with a grandchild, then `kill -9` the Electron main process. The nonce oracle must find 0.
  - macOS `codesign --verify --deep --strict` plus stapler (O5, owner run).

**WP5 CLI distribution** (`packages/opencode/script/{build,postinstall,publish}.*`)
- **Build.**
  - `build.ts` defines `OMNI_ENABLED` per target (D-L9).
  - It copies `hugr_omni.node` and the supervisor into `dist/<t>/bin/` from `OMNI_ARTIFACTS`. A missing artifact
    fails a release build.
  - The entry point calls `configure()` with paths next to `realpath(process.execPath)`.
- **Install.** `postinstall.mjs` `installPackage()` copies all three files and runs `opencode debug omni` once, to
  warm the first Gatekeeper/Defender scan.
- **Packaging (O6).** The AUR and Homebrew formulas install all three.
- **Validation.**
  - `--single` build on the host; `debug omni` prints `ok`.
  - **Compiled-CLI crash smoke** on Linux, Windows and macOS (the macOS leg of `test-ci`): start the binary, run a
    nonce tree through bash, `kill -9` the CLI, then the oracle must find 0.
  - An npm-style install through a symlink; `debug omni` works.

### Wave 3b

**WP11 Background process registry (O1)** (`packages/core/src/background/**`, server route, app UI; after WP1 and
WP2)
- **Registry.** A per-session registry receives adopted `Child`s (WP1 `adopt()`, WP2 PTY close). For each one it
  keeps the last 1 MiB of output, whatever omni keeps after detach, plus `processes()`.
- **Stopping.** Adopted children are stopped on session end, on server stop, and by omni when the host dies.
- **Adoption policy.**
  - A bash or shell tool tree still alive at scope close is adopted.
  - Generic spawner users (git, ripgrep, format) are never adopted.
  - Windows GUI launches from bash (`start`, `code .`) are adopted too; they die with the session, which is documented.
- **Interface.** The route `/session/:id/processes` (list, stop) and a small panel in the session UI.
- **Tests.**
  - `npm run dev &`-style: adopted, listed, and stopped at session end (nonce oracle);
  - survives the tool call;
  - gone after `kill -9` of the server.

### Wave 4

**WP10 Validation campaign** (the gate before default-on; macOS on the owner's Mac with `ORCHESTRA_LOCAL_TESTS=1`
for this campaign only; Linux and Windows on CI)

| # | Scenario | KPI |
|---|---|---|
| V1 | Agent bash `npm run dev &`-style, then the tool returns. | Returns within the grace; the child is adopted, listed, stopped at session end. |
| V2 | `kill -9` of the **compiled** CLI, of the TUI, of the desktop utilityProcess **and** of the Electron main process, while bash, an LSP, an MCP stdio server and 2 terminals are live. | 0 omni-tree processes after 8 s (ConPTY tier), on 3 OSes. |
| V3 | `kill -9` of the omni supervisor itself. | Matches GUARANTEES (Windows: Job closes; Unix: documented hole). The server recovers on the next spawn. |
| V4 | Stop an LSP wrapped by npx or node; 20 crash/restart cycles. | 0 leftover tsserver; stable process count. |
| V5 | MCP server writing 1 MB to stderr. | Connects; the last line is visible. |
| V6 | Terminal: `vim`/`htop`, resize, reconnect, `yes \| head -c 50M`; TUI quit with live terminals. | Correct size; replay matches; no freeze; no crash on quit. |
| V7 | Overhead: 1000× `git rev-parse`, interleaved A/B after warmup, on a quiet machine. | p50 ≤ max(+10 %, +2 ms). |
| V8 | Windows: `.cmd` tools, PowerShell bash, ConPTY close, metacharacter `npx` arguments. | Works or a clear error; close ≤ 6 s. |
| V9 | A shipped binary with the addon missing or corrupt. | Fails loudly within 2 s; never hangs. |
| V10 | `serve` and desktop with LSP and MCP active, then quit. | The process exits; nothing holds the event loop. |

- **Report:** written to `docs/ux/` (like Q2), signed by the owner.

**WP9 Flip and cleanup** (after WP10 is signed and WP8a has landed)
- **Default on.**
  - `test.yml` gets an omni-artifact job that feeds every shard.
  - The Rust inputs move into the `turbo.json` test hashes only now.
  - A legacy `=0` cell stays on Windows until WP8b.
- **Remove legacy:** the cross-spawn path in core, bun-pty, node-pty, `fix-node-pty.ts`, `#pty`, `Shell.killTree`,
  and `trustedDependencies: node-pty`.
- **Docs.** omni's `AGENTS.md`, `README.md`, `PLAN.md` and `HANDOFF.md` name Orchestra as the source of truth, and
  the root `AGENTS.md` points to it.
- **Validation.**
  - The epic suite is green.
  - The compiled-CLI and packaged-desktop crash smokes pass.
  - V2 and V7 are re-run on the owner's Mac.

## 5. Owner decisions

Decided 2026-10-06: the owner follows every recommendation ("sigo suas recomendações").

- **O1 Background processes:** (b), a per-session registry visible in the UI, built in WP11.
- **O2:** macOS in Orchestra CI.
- **O3:** a 120 s deadline for the `!` template.
- **O4 Mirror:**
  - read-only `main`, with the deploy key as the only bypass (the owner applies the ruleset);
  - the push is automatic;
  - the mirror CI runs on tags and dispatch.
- **O5:** macOS signing and notarization proof is an owner run.
- **O6:** the AUR and Homebrew formulas install the supervisor and the addon.
- **O7:** a macOS leg in `test-ci`; WP10 on the owner's Mac with `ORCHESTRA_LOCAL_TESTS=1` for the campaign only.
- **O8:** npm publish later. WP-H fixes H2-H5, which would otherwise have shipped in 0.1.0, so publish only after
  WP-H.

## 6. Order, parallelism, shared files

```
Wave 1:  WP0 ─┐   WP-H (omni) → WP8a → WP8b      WP7 (skills)
Wave 2:       └→ WP1  WP2  WP3  WP6   (after WP0 + WP-H)
Wave 3:          WP4  WP5             (after Wave 2)   WP11 (after WP1, WP2)
Wave 4:          WP10 → WP9           (WP9 also after WP8a)
```

- **Caps:** at most 4 Claude agents at once, and at most 2 heavy Rust builds at once (WP-H and WP8a are sequential).
- **Shared files are owned by WP0 or the lead, never by a parallel WP:**
  - the root and every package's `package.json`, `bun.lock` and `turbo.json`;
  - `core/src/omni.ts`, `core/src/flag/flag.ts`, the `Shell.invocation` signature, `test/fixture/process-tree.ts`;
  - omni's `ci.mjs`, `GUARANTEES.md` (WP-H edits it; WP8a follows sequentially) and `api-contract.md` (the lead).
- **Wave 2 merge order:** WP1, then WP2, then WP3, then WP6.

## 7. Probe results

Probes were run by reviewer 3 on macOS x64 with Bun 1.3.14 and Node 22.17.1. P6 was reproduced by the lead.

- **P1 bunfs dlopen.** A `.node` embedded with `type:"file"` is copied by Bun to `$TMPDIR` and loaded from there.
  The "next to the module" lookup then means `$TMPDIR`, and a planted supervisor there wins (H2). Decision: no
  embedding (D-L8).
- **P1c symlinks.** A symlinked binary misses the supervisor (H3).
- **P2 event loop.**
  - Idle exits at once; a child that was awaited or has unread output does not hold the loop.
  - A live child that is never awaited holds the loop until it exits.
  - The CLI is safe (`index.ts:281` calls `process.exit`); `serve` and desktop are covered by V10.
- **P3 env.** Under Bun, `process.env` writes reach neither Rust nor the children's inherited environment (H4). Node
  is fine.
- **P4 dev mode.** A `type:"file"` import of `.node` fails under `bun run`. This no longer matters, since there is no
  embedding.
- **P5 node bundle.** Bun bakes `__dirname` into the bundle, so a dev checkout can be picked up. Fixed by
  `configure()` disabling `checkoutBuild`.
- **P6 Worker terminate.**
  - Bun aborts with rc=134 on a napi-rs finalize panic (H1).
  - Under Node, the terminated Worker's child lives until the host exits.

## 8. Lean test matrix

| When | What |
|---|---|
| Per `test:ci` push inside a WP | Only the WP's new test file plus the files it touched; `strict` on Linux and `=1` on Windows; binary cache; positive control on. |
| Per WP merge into `omni-native` | Regression set once per OS: Linux and macOS `strict`, Windows `=1` (cmd.exe the only delegation). Node-runner smoke once on Linux. `omni.yml` only if `packages/omni` changed. About 4 jobs. The "unset" cell comes from the epic suite. |
| Epic label before the flip | `test.yml` unchanged, plus one Linux `strict` opencode shard set fed by the binary cache. |
| Flip (WP9) | `test.yml` with omni artifacts and default-on; Windows `=0` cell until WP8b; compiled-CLI and packaged-desktop crash smokes; V2 and V7 on the owner's Mac. |
| Release | omni `--release` (Bun, Deno, K9) and the artifacts workflow. |

Estimated CI time with a warm binary cache: 3-5 min per Linux job, 8-25 min per Windows opencode job. A cold cache
adds 3-8 min of cargo.

## 9. Review round 1: findings and where they landed

- **Correctness.**
  - BLOCKER silent pipe loss → D-L5.
  - Queue fan-out → D-L5.
  - Exit ordering → D-L6 and WP1 test 8.
  - O1 under-scoped → WP11, the `adopt()` seam, and WP2 adoption.
  - Missing spawn sites → §3 and WP4.
  - Undefined Process mapping → WP3 mapping table.
  - Desktop main env → D-L8 `configure()`.
  - Write-set collisions → §6.
  - maestro-arsenal loader → D-L2.
  - Error map → WP1.
  - Update clamp → D-L7.
  - ConPTY cap → WP2 7 s.
  - V2 scope → End state.
  - PipedCommand → D-L12.
  - Env strip order → D-L3.
  - Facts → §1 and §3.
- **Tests and CI.**
  - BLOCKER `strict` parser plus positive control → D-L1.
  - BLOCKER flip breaks the epic suite → WP9 and the WP0 binary cache.
  - Cold rust-cache → binary cache.
  - Heavy matrix → §8.
  - Empty Windows PTY regression → WP2 mandatory variants.
  - Node host never tested → `runner: node`.
  - Bare pids → nonce oracle.
  - Teeth gaps → WP1 tests 2/4/5/7/9 and WP2 ×50.
  - Timing flakes → bounded-only assertions and V7.
  - Campaign gaps → V2/V3/V4/V9.
  - Shipped artifacts → crash smokes in WP4/WP5.
  - turbo inputs → WP9.
  - CI duplication → WP6.
  - `--env` injection → WP0 allow-list.
  - Thin desktop tests → WP4.
- **Packaging and OS.**
  - BLOCKER Worker abort → H1 and probe (d).
  - BLOCKER `$TMPDIR` hijack → H2 and D-L8.
  - BLOCKER symlinks / `opencode.exe` layout → H3 and WP5.
  - Env under Bun → H4 and D-L3.
  - Docker and unlisted sites → End state, §3 and WP3.
  - Static CRT → H5.
  - Event loop → §7 and V10.
  - Dev-mode import → D-L8.
  - Target count → D-L9.
  - `__dirname` → D-L8.
  - Signing entitlements and warm-up → WP4 and WP5.
  - Electron notes → WP4.

## 10. Review round 2: amendments (binding; they override §1–§9 where the two differ)

- **R2-1 Output loss with a fast consumer (BLOCKER).** omni hands out one item of at most 64 KiB per pull, so any stall
  in the event loop can push past 16 MiB. Three fixes:
  - **H7 (WP-H):** batched `next()`, plus an opt-in `backpressure: true` for pipe children. A full queue stops the
    native reader, the OS pipe fills and the child blocks, so nothing is lost. `wait()` and `stop()` are never
    blocked.
  - **Under the flag, the WP1 spawner always spawns with `backpressure: true`**, which restores legacy semantics.
  - **`AppProcess.run`** uses omni's own collection path, which never drops below its limit.
  - **WP1 test 5 is replaced:** a 200 ms event-loop block during a 64 MiB `cat-file` loses 0 bytes.
- **R2-2 Shell tool.** Gaps can no longer happen (R2-1). The shell tool still gets a `marker` gap policy as a second
  line of defence, because it shows only the tail of the output.
- **R2-3 Adoption seam.** WP0 freezes an Effect service `OmniAdoption` (`{sessionID, policy}`), read at spawn time.
  - The release adopts only when `Exit.isSuccess` and the service is present. Interrupt or cancel stops the tree.
  - The registry interface is frozen in WP0, with a stub that stops the tree.
  - There is no `adopt()` method on Effect's handle.
- **R2-4 Adopted output.** While adoption is possible, the pump never detaches. After the grace period it writes into
  the registry's 1 MiB ring; otherwise it discards. The text "whatever omni keeps after detach" is dropped.
- **R2-5 WP11 builds on `packages/core/src/background-job.ts`.** Adopted children become `BackgroundJob`s with
  `type: "process"`.
  - "Session end" means `Session.remove` or server stop.
  - User cancel (Esc) stops the run, **not** adopted jobs. Recommendation, following O1(b): an adopted dev server
    outlives the turn, and the UI panel stops it.
  - `core/src/background/**` is dropped.
- **R2-6 Lazy loading (WP-H H4).** The dlopen is lazy and `configure` is plain JS. Frozen resolution order:
  1. `configure()`;
  2. the `HUGR_OMNI_*` env vars (read in JS);
  3. the platform package;
  4. the checkout, only when nothing explicit was given.

  The core loader (WP0) has its own order: an injected path, then next to `realpath(execPath)` or
  `resourcesPath/omni`, then the dev checkout. WP4 and WP5 only place the files.
- **R2-7 GUARANTEES.** H6 promotes every row the plan cites (C-HOST-01, C-KILL-01/02, C-IO-01..04, C-SCOPE-01,
  C-ENV-01, C-PTY-01..04, C-TS-02), each backed by a real run, and adds a ConPTY close-bound row. The KPIs cite only
  promoted rows.
- **R2-8 Wave graph.**
  - `omni.yml` moves into WP0.
  - WP8a comes before WP6's `omni-artifacts`.
  - `release.yml` is edited by WP-H (H5), then WP8a, then WP6, in that order.
- **R2-9 Node smoke tests.** `runner: node` runs `*.node-smoke.mjs` `node:test` scripts against the `build-node.ts`
  bundle. It never runs `bun:test` files.
- **R2-10 test-ci.**
  - A macOS branch prefix, with `startsWith` ordering.
  - A rust toolchain step on a cache miss, on every OS.
  - The preload is registered in each consuming package's `bunfig.toml`; WP0 owns those files.
  - Hosted macOS is capped at 5 concurrent jobs.
- **R2-11 Oracle.**
  - Fixtures write `{pid, startTime, nonce}`.
  - Polling uses `kill(pid, 0)` plus a start-time check.
  - On Windows, one final CIM sweep: JSON output filtered in JS, the query's own pid excluded, one retry.
  - On macOS, `ps -axww`.
- **R2-12 Windows env.** `childEnv()` merges case-insensitively on win32, and H8 does the same in the binding.
- **R2-13 Skill loader.** The skill-loader fix is dropped: `skills.paths` already resolves against the project.
- **R2-14 Daemons.** Gradle, Kotlin and Windows git fsmonitor daemons die under the generic policy. This is
  documented. Nobody dogfoods with the flag on before WP11.
- **R2-15 Rollback.** WP9 splits in two:
  - **WP9a** flips the default and ships one release with `=0` still working;
  - **WP9b** deletes legacy after a clean release.
- **R2-16 Upstream merges.** WP0 adds `script/check-spawn-imports.ts` with `script/spawn-allowlist.json`, and a
  root `AGENTS.md` rule.
  - The check fails on imports of `cross-spawn`, `bun-pty`, `@lydell/node-pty`, `child_process` or
    `StdioClientTransport` outside the allow-list.
  - WP9b adds `docs/upstream-merge.md`, with a resolution per seam: `ChildProcessSpawner`, `Process`, `Pty` `Proc`,
    MCP transport.
- **R2-17 Telemetry.**
  - Structured log events for spawn, delegation, gap, adoption, supervisor restart and fallback.
  - The counters appear in `opencode debug omni`.
  - Owner: WP1, with the WP0 counters.
- **R2-18 Changelog.** WP9a writes the user-facing entries: adopted background processes and their panel, the
  120 s `!` deadline, Windows GUI launches closing with the session, and musl/arm64 Windows on legacy until WP8a.

Wave graph (v3):

```
Wave 1:  WP0 (+omni.yml, guard, adoption seam)   WP-H (H1–H8) → WP8a → WP8b     WP7
Wave 2:  WP1  WP2  WP3        (after WP0 + WP-H)      WP6 (after WP8a)
Wave 3:  WP4  WP5             WP11 (after WP1, WP2)
Wave 4:  WP10 → WP9a → (one clean release) → WP9b
```
