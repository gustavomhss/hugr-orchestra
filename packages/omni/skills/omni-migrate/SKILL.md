---
name: omni-migrate
description: "How to port process code to hugr-omni from node child_process (spawn, execFile, exec), cross-spawn, execa, node-pty and bun-pty - the option and event mapping, the semantic differences that bite (env merges instead of replacing, stdin closed by default, no backpressure but counted loss, synchronous startup errors, non-zero exit is not an error), and what has no equivalent on purpose (shell true, detached, kill with a signal, stdio inherit, unref). Use when replacing child_process, cross-spawn, execa, node-pty or bun-pty with hugr-omni, reviewing such a port, or migrating an Orchestra adapter (cross-spawn-spawner, pty.bun or pty.node, util/process, MCP stdio) under the integration plan."
---

# Migrating to hugr-omni

Most process code ports option by option. A few defaults differ on purpose, and three things have no equivalent
because hugr-omni promises "no shell, ever" and "the whole tree is stopped". The target surface is
[the API contract](../../docs/api-contract.md). This skill maps onto it and lists what to check.

## When to use

- Replacing `child_process`, `cross-spawn`, `execa`, `node-pty` or `bun-pty` calls with hugr-omni.
- Reviewing a port: the diff looks mechanical, but the semantics moved.
- Migrating an Orchestra adapter. Read [references/orchestra.md](references/orchestra.md) as well.

## When not to use

- New code with no legacy to match: use the `omni-processes`, `omni-lifecycle` and `omni-terminals` skills.
- Processes that must outlive the host (a daemon you start on purpose, a browser you open), or that need the user's
  real terminal (`stdio: "inherit"` for an editor or a pager). These stay outside hugr-omni.

## child_process, cross-spawn, execa

| Legacy | hugr-omni | Watch out |
|---|---|---|
| `execFile(cmd, args, cb)`, `execa(cmd, args)`, `spawnSync` | `await run(cmd, args, options)` | there is no synchronous API; a non-zero exit resolves (`success: false`), never rejects |
| `spawn(cmd, args, opts)`, `crossSpawn(cmd, args, opts)` | `spawn(cmd, args, options)` | Windows `.cmd` resolution (what cross-spawn is for) is built in |
| `exec(commandString)`, `shell: true`, execa `shell` | no equivalent | see "The shell" below |
| `cwd` | `cwd` | a missing directory throws `INVALID_CWD` synchronously |
| `env: {...}` (replaces the environment) | `env` (merged over the inherited one) plus `inheritEnv: false` to replace | `env: { X: null }` removes a variable; `inheritEnv: false` drops PATH too (`NOT_FOUND`) |
| `timeout` (signals the root only) | `timeoutMs` | stops the whole tree; `run()` resolves `reason: "timeout"` |
| `killSignal`, execa `forceKillAfterDelay` | `graceMs` | the graceful step and the forced step are fixed per OS; the delay is yours |
| `signal` (an `AbortSignal`) | `signal` | `run()` rejects `ABORTED` with `error.result`; `spawn()`'s `wait()` gives `reason: "aborted"` |
| `maxBuffer` | `maxOutputBytes` (per stream, 16 MiB default) | over the limit: tree stopped, `OUTPUT_LIMIT`, first bytes in `error.result` |
| `encoding` / execa `encoding: "buffer"` | `text` (default `true`; `false` gives `Uint8Array`) | invalid UTF-8 becomes U+FFFD in text mode |
| `input` (execa, execFileSync) | `input` (`run()` only) | stdin is closed after it |
| `stdio: ["pipe", ...]` default open stdin | `stdin: "pipe"` | hugr-omni's default is a closed stdin: the child reads end of input at once |
| `stdio: "inherit"`, fd numbers, streams | no equivalent | hugr-omni always captures; see "When not to use" |
| execa `all`, `2>&1` | `mergeStderr: true` | one chronological stream, labeled `stdout` |
| `child.stdout.on("data")`, `child.stderr.on("data")` | one `for await (const c of child.output)` | one consumer for both streams; `c.stream` says which; a second loop throws `INVALID_ARGUMENT` |
| `readline` over `child.stdout` | `child.lines()` | lines of more than 1 MiB come in pieces marked `continues` |
| `child.stdin.write`, `child.stdin.end` | `await child.write(data)`, `await child.closeStdin()` | `write` resolves when the OS took the bytes |
| `child.on("exit", (code, sig))` | `await child.wait()` | `exitCode`, `signal` (a name, not a number) and `reason` |
| `child.on("close")` (after stdio ended) | `wait()` plus the end of the `output` loop | `run()` already waits for both |
| `child.on("error")` for ENOENT and EACCES | a synchronous `throw` from `spawn()` | `NOT_FOUND`, `NOT_EXECUTABLE`, `INVALID_CWD`, `INVALID_ARGUMENT` |
| `child.kill()`, `child.kill(signal)`, tree-kill, `taskkill /T` | `await child.stop({ graceMs })` | the whole tree; no arbitrary signal |
| `detached: true`, `child.unref()` | no equivalent | every tree is contained and owned |
| `windowsVerbatimArguments` | no equivalent yet | planned as an explicit option (WP8b) |

A typical port, with the two defaults that changed spelled out:

```ts
import { run, spawn } from "hugr-omni";

// was: execFile("node", ["--version"], { env: { PATH: process.env.PATH }, timeout: 10_000 }, cb)
// child_process replaced the environment with `env`; hugr-omni merges, so ask for a clean one explicitly.
const r = await run("node", ["--version"], { inheritEnv: false, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 10_000 });
if (!r.success) throw new Error(`node --version failed (${r.reason}, exit ${r.exitCode}):\n${r.stderr}`);
console.log(r.stdout.trim()); // v22.x.y

// was: const c = spawn("node", [...]); c.stdin.write(...); c.stdin.end(); c.stdout.on("data", ...); c.on("exit", ...)
await using c = spawn("node", ["-e", "process.stdin.pipe(process.stdout)"], { stdin: "pipe" }); // stdin is closed unless asked
await c.write("hello\n");
await c.closeStdin();
for await (const chunk of c.output) process.stdout.write(chunk.data); // one loop for stdout and stderr
console.log((await c.wait()).reason); // exit
```

## The semantic differences that bite

1. **No backpressure, counted loss.** Legacy pipes stop a child that writes faster than you read. hugr-omni never
   blocks the child. It buffers up to 16 MiB per stream for an attached consumer (1 MiB with none) and drops the
   rest, which is reported as `lostBefore` and `droppedBytes`. A port that must not lose bytes (`git cat-file
   --batch`, a protocol over stdout) has to read eagerly and fail on any `lostBefore`
   ([contract §4](../../docs/api-contract.md#4-output)).
2. **Exit is not "output complete".** `wait()` resolves at root exit. Output ends when every holder of the pipes
   closed them, and that holder can be a descendant. Legacy `close` waited for both. Wait for both, or use `run()`.
3. **Startup errors are synchronous.** `spawn()` throws. It never emits a later `error` event. Wrap the call, not a
   listener.
4. **The environment merges.** `env: { FOO: "1" }` keeps the rest of the inherited environment. To pass exactly a
   set, use `inheritEnv: false` and build the object yourself: `{ ...process.env, ...extra }`.
5. **stdin is closed by default.** A port of code that writes later needs `stdin: "pipe"`.
6. **One consumer.** Legacy code often attaches several `data` listeners. Fan out from one loop instead.
7. **Signals are names.** `exit.signal` is `"SIGTERM"`, not 15, and always `null` on Windows. If the legacy API
   reported `128 + signo` or a number, convert it at the boundary.

## The shell

hugr-omni never adds a shell.

- **The call site does not need one** (the usual case: `exec("git status")`). Split it into a program and an
  argument array: `run("git", ["status"])`. Never split a user-provided string on spaces.
- **The caller truly needs shell syntax** (a user-typed pipeline, `&&`, globbing, a shell builtin). Name the shell
  explicitly, so a reviewer sees it: `spawn("sh", ["-c", script])` on Unix, with the script as one argument. On
  Windows, `cmd.exe` parses its command line by its own rules. An explicit verbatim option is planned (WP8b). Until
  then, review each cmd.exe site by hand. In Orchestra, cmd.exe call sites go to the legacy path (D-L4).
- **A `.cmd` or `.bat` file is not a reason for a shell.** hugr-omni runs it through cmd.exe with safe quoting, or
  refuses it (see the `omni-processes` skill, references/windows.md).

## node-pty and bun-pty

| Legacy | hugr-omni | Watch out |
|---|---|---|
| `pty.spawn(file, args, { cols, rows, cwd, env })` | `spawn(file, args, { pty: { cols, rows }, cwd, env })` | sizes are integers from 1 to 32767; clamp before calling |
| `name: "xterm-256color"` (sets TERM) | `env: { TERM: "xterm-256color" }` | set TERM yourself if the program needs it |
| `onData(cb)` | one `for await (const c of term.output)` | every chunk is labeled `pty`; check `lostBefore` and show a gap marker |
| `write(data)` | `await term.write(data)` | Enter is `\r`, Ctrl-C is `\x03` |
| `resize(cols, rows)` | `term.resize(cols, rows)` | after exit it throws `CLOSED` |
| `kill(signal?)` | `await term.stop({ graceMs })` | the whole session or Job, not one process |
| `onExit(({ exitCode, signal }))` | `await term.wait()` | `signal` is a name; legacy numeric signals map to `128 + signo` where callers expect a code |
| `pause()`, `resume()` | no equivalent | reading is the flow control; unread output is buffered, then dropped and counted |
| `pid`, `process` | `pid`, `processes()` | `processes()` lists the whole tree with parents, never argv |

## Porting checklist

- Each call site is classified: run, spawn, pty, or out of scope (it must outlive the host, or needs the real
  terminal), with the reason written down.
- No `shell: true` was translated silently. An explicit shell is named, and is reviewed as a decision.
- `env` replacement semantics are kept where the legacy code replaced the environment.
- `stdin: "pipe"` is passed where the legacy code wrote later.
- Every byte-exact stream fails on `lostBefore`. Every display stream shows the gap.
- Kill paths became `stop()`, awaited and bounded. tree-kill, `taskkill` and `pgrep` walks are deleted.
- Error mapping is explicit: `NOT_FOUND` and `INVALID_CWD` to the legacy ENOENT, `NOT_EXECUTABLE` to EACCES, and so on.
- A test proves that the tree is gone after the port. Check by a nonce in argv, never by a bare pid.
