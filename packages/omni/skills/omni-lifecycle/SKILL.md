---
name: omni-lifecycle
description: "How hugr-omni ends processes - timeoutMs, AbortSignal, stop() with graceMs, wait() (root only) versus stop() (whole tree), processes(), what happens when the host or the supervisor dies, the reason values, and the per-OS containment tiers (Unix session, setsid escapes; Windows Job). Use when code must bound how long a child runs, cancel it, clean up a process tree, find out why a port is still busy or a child survived, read reason (exit, signal, killed, timeout, aborted), or replace kill(pid), sleep-then-kill, taskkill or ps/pgrep polling."
---

# Ending processes with hugr-omni

Every child started by hugr-omni belongs to a tree that the library can stop as a whole, with one deadline. This
skill explains which call ends what, and what you can count on per OS. The rules are in
[contract §5 to §8](../../docs/api-contract.md#5-completion), and the per-OS tiers with their evidence are in
[GUARANTEES.md](../../GUARANTEES.md#containment-tiers-adr-0005).

## When to use

- A child must not run longer than a budget, or must stop when the user cancels.
- Something is still running after the code thought it was done: a port is busy, or a test runner left workers.
- You read `reason`, `exitCode` or `signal` and need to know which one to trust.
- You are replacing hand-made cleanup: `process.kill(pid)`, `taskkill /T`, a sleep before a kill, a `ps` loop.

## When not to use

- Starting programs, reading output, env and stdin: use the `omni-processes` skill.
- Interrupting a program in a terminal with Ctrl-C: use the `omni-terminals` skill.
- Processes that must outlive your program (a daemon you launch on purpose): hugr-omni contains every tree by
  design. Those stay outside it (integration plan §3).

## The calls

| Call or option | Ends | Resolves | Notes |
|---|---|---|---|
| `wait()` | nothing | when the **root** exits | descendants may still run; every call returns the same `Exit` |
| `stop({ graceMs })` | the **whole tree** | once the tree is gone (per tier) | graceful first, forced after `graceMs` (default 2000); safe to repeat |
| `await using` / `[Symbol.asyncDispose]` | the whole tree | when `stop()` resolves | the default way to own a child |
| `timeoutMs` | the whole tree, at the deadline | `run()`: resolves `reason: "timeout"`; `spawn()`: `wait()` gives `"timeout"` | a whole-run budget, not an idle timer |
| `signal` (an `AbortSignal`) | the whole tree, on abort | `run()`: rejects `ABORTED` with `error.result`; `spawn()`: `wait()` gives `"aborted"` | already aborted: nothing starts; `spawn()` throws and `run()` rejects `ABORTED` |
| `processes()` | nothing | the live members `stop()` would end now | `[]` once gone; no command-line arguments; rejects `IO` if the scan is incomplete |

- `stop()` after `wait()` resolved still ends surviving descendants, and keeps the root's recorded `Exit`.
- The cause is committed when the library acts. A child that handles SIGTERM and exits 0 after `stop()` reports
  `reason: "killed"`, `exitCode: 0`, `success: false`. If the root had already exited by itself, its `exit` or
  `signal` stays ([contract §7](../../docs/api-contract.md#7-exit-and-termination-cause)).
- `run()` resolves only after the root exits **and** the output ends. Descendants that keep the pipes open get
  `graceMs` after the root's exit, then they are stopped ([contract §6](../../docs/api-contract.md#6-run)).
- `run()`, `stop()` and disposal return only after the tree is stopped. `wait()` reports the root only.

```ts
import { spawn } from "hugr-omni";

// `npm run dev` is npm, often a shell, and node: one tree.
const server = spawn("npm", ["run", "dev"], { timeoutMs: 5 * 60_000 });
try {
  for await (const line of server.lines()) if (line.text.includes("ready")) break;
  console.log((await server.processes()).map((p) => p.name)); // e.g. [ 'node', 'node' ]: npm (itself node) and the server
} finally {
  const exit = await server.stop({ graceMs: 1_000 }); // graceful, then forced after 1 s
  console.log(exit.reason, await server.processes()); // killed []
}
```

The root can exit while its children live on. `wait()` tells you about the root, and `stop()` ends the rest:

```ts
import { spawn } from "hugr-omni";

const parent = "require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }).unref()";
const child = spawn("node", ["-e", parent]);
const exit = await child.wait(); // the root has exited...
console.log(exit.reason, (await child.processes()).length); // exit 1: ...and its own child still runs
await child.stop(); // ends the survivor; the root's Exit stays "exit"
console.log((await child.processes()).length); // 0
```

## Reason values

| `reason` | Means | `exitCode`, `signal` |
|---|---|---|
| `exit` | the root ended by itself | its code; `null` |
| `signal` | Unix only: a signal that was not ours ended it (a crash, someone else's kill) | `null`; the name |
| `killed` | `stop()` or scope exit | what the root ended with |
| `timeout` | `timeoutMs` passed | what the root ended with |
| `aborted` | the `AbortSignal` fired | what the root ended with |

More detail, with runnable code, is in [recipes §8](../../docs/guide/recipes.md#8-reading-the-result). On Windows,
`signal` is always `null`, and exit codes are unsigned (3221225786 is a console Ctrl-C/Ctrl-Break exit).

## What stops what, per OS

Read the [containment tiers](../../GUARANTEES.md#containment-tiers-adr-0005) before you promise anything to a user.
In short:

- **Kill unit.** Unix: the root's session (every root is a session leader). Windows: the Job, with no breakaway.
- **Graceful step.** Unix: SIGTERM (plus SIGHUP for a terminal) and SIGCONT to the session. Windows: CTRL_BREAK to
  console processes, which is best effort. A `.bat` script keeps going after it.
- **Forced step after `graceMs`.** SIGKILL until the session is empty, or `TerminateJobObject` until the Job is
  empty. It is guaranteed on every OS.
- **Declared escapes.** On Unix, a descendant that calls `setsid` (tmux, gpg-agent, some daemons) leaves the session
  and survives `stop()`. On Windows nothing leaves the Job.
- **Your process dies** (normal end, `process.exit()`, uncaught exception, SIGINT, SIGTERM, even SIGKILL). The
  supervisor notices and stops every tree within its grace. You register nothing: hugr-omni installs no signal
  handler and no exit hook ([recipes §4](../../docs/guide/recipes.md#4-cleanup-cancel-errors-and-the-end-of-your-own-process)).
- **The supervisor dies.** Unix trees keep running, unprotected (declared). Windows trees die with their Jobs. The
  next spawn starts a new supervisor ([ADR-0005](../../docs/adr/0005-supervisor.md)).
- **PID reuse.** A tree that is gone is never signalled again. This is one more reason to stop through the library
  and never by pid.

## Anti-patterns and their replacements

| Instead of | Write | Why |
|---|---|---|
| `process.kill(child.pid)` / `kill(pid)` | `await child.stop()` | a pid reaches only the root; its children keep the port and the pipes; the pid may already belong to another process |
| `taskkill /T /F /PID n`, a `pgrep -P` walk, `Shell.killTree` | `await child.stop()` | the Job or session is the tree; a walk races with forks and misses reparented orphans |
| `setTimeout(() => kill(pid), ms)` | `timeoutMs` (and `graceMs`) | the deadline covers the whole tree and is reported as `reason: "timeout"` |
| sleep, then kill, "to let it start" | wait for a marker in the output, or for `processes()` to list the child | sleeping is a race on a loaded machine |
| polling `ps` / `tasklist` to see whether it is done | `await child.wait()` (root), `await child.stop()` (tree) | the library observes exit; never poll |
| `child.stop()` without `await`, or no owner at all | `await using`, or `finally { await child.stop() }` | an un-awaited stop races with the next step |
| catching `timeout` as an exception | read `result.reason === "timeout"` | a timeout resolves `run()`; only abort rejects |

## Choosing `graceMs`

- The default of 2000 ms suits most programs. Raise it for programs with real cleanup to do (databases, test runners
  writing reports). Use `0` to force at once.
- `stop()` can resolve somewhat after `graceMs` when the OS tears down a large tree. The Windows teardown measured
  840 ms for 875 processes, as declared in GUARANTEES. Do not assert on tight timing.
