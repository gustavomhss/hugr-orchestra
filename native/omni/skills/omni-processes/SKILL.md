---
name: omni-processes
description: "How to start programs with hugr-omni from TypeScript (Node 22+, Bun, Deno) - choosing run or spawn, reading output through its single consumer, buffering and loss (droppedBytes, lostBefore), exit status as a result rather than an exception, env and inheritEnv (a clean environment has no PATH, so NOT_FOUND), stdin, ESM or CommonJS, and await using. Use when writing or reviewing code that imports hugr-omni to run a command, stream or collect its output, pass env, cwd or input, or handle OmniError; when a spawn throws NOT_FOUND, INVALID_ARGUMENT or INVALID_CWD; or when output seems lost or a second loop over the output throws."
---

# Running programs with hugr-omni

hugr-omni starts every program without a shell, resolves it the same way on every OS, and stops the whole process
tree on stop, timeout, cancellation or scope exit. This skill is the map for the everyday calls. The rules
themselves are in [the API contract](../../docs/api-contract.md), and tested, runnable examples are in
[the recipes](../../docs/guide/recipes.md). When this skill and those documents disagree, they win.

## When to use

- Writing code that imports `hugr-omni` to run a command, collect or stream its output, or write to its stdin.
- Reviewing such code for the usual mistakes: two loops over one output, an unread child, `try/catch` around a
  non-zero exit, a clean environment without PATH.
- A spawn failed with an `OmniError` and you need to know why.

## When not to use

- Timeouts, cancellation, `stop()` and what survives what: use the `omni-lifecycle` skill.
- Prompts, REPLs, shells, Ctrl-C and terminal size: use the `omni-terminals` skill.
- Porting code from child_process, cross-spawn, execa or node-pty: use the `omni-migrate` skill.
- Changing hugr-omni itself: use the `omni-core-change` skill.

## Pick the function

| You want | Call | You get |
|---|---|---|
| the program ends by itself, and you want all of its output | `run(command, args, options)` | a `Promise<RunResult>`: status plus complete `stdout` and `stderr` |
| it keeps running, or you read as it goes, write to it, or stop it | `spawn(command, args, options)` | a `PipeChild` at once (a `PtyChild` with `pty`) |

- `command` is never parsed by a shell. Pass every argument as its own array element. Metacharacters such as `&`, `|`,
  `$` and `;` reach the program literally ([contract §3](../../docs/api-contract.md#3-starting-a-process)).
- `command` is looked up on the child's PATH, after `env` and `inheritEnv` are applied (plus PATHEXT on Windows).
  A command written with a path separator resolves against `cwd`.
- Startup failures are thrown synchronously by `spawn()`, and reject `run()`: `NOT_FOUND`, `NOT_EXECUTABLE`,
  `INVALID_CWD` and `INVALID_ARGUMENT`. Each message names the value and the fix.

```ts
import { OmniError, run, spawn } from "hugr-omni";

// run: the program ends by itself. A non-zero exit is a result, not an exception.
const r = await run("node", ["-e", "console.log('hi'); process.exit(3)"], { timeoutMs: 30_000 });
console.log(r.reason, r.exitCode, r.success, r.stdout.trim()); // exit 3 false hi

// spawn: read as it goes, from the one consumer, and look for loss.
await using child = spawn("node", ["-e", "for (let i = 1; i <= 3; i++) console.log('line ' + i)"]);
for await (const line of child.lines()) {
  if (line.lostBefore) console.warn(`${line.lostBefore} bytes were dropped before this line`);
  console.log(line.stream, line.text); // stdout line 1, ...
}
console.log((await child.wait()).success, child.droppedBytes); // true { stdout: 0, stderr: 0 }

// A clean environment has no PATH, so a bare name is not found.
try {
  await run("node", ["--version"], { inheritEnv: false });
} catch (e) {
  if (!(e instanceof OmniError) || e.code !== "NOT_FOUND") throw e;
  console.log("NOT_FOUND, as expected:", e.message);
}
```

## Results, not exceptions

- A finished `run()` resolves whatever the exit code. Check `success`, `reason`, `exitCode` and `signal`, and never
  wrap a failing command in `try/catch` to detect it. `success` is `reason === "exit" && exitCode === 0`.
- A timeout is a result too: `run()` resolves with `reason: "timeout"` and the output collected so far.
- Once the program has started, `run()` rejects only with `ABORTED` (your `signal` fired), `OUTPUT_LIMIT` (a stream went over `maxOutputBytes`,
  16 MiB by default) or `IO`. In each case `error.result` holds what was collected.
- The meaning of every `reason` value, and where each comes from:
  [recipes §8](../../docs/guide/recipes.md#8-reading-the-result) and
  [contract §7](../../docs/api-contract.md#7-exit-and-termination-cause).

## Output: one consumer, bounded buffers, counted loss

Read [contract §4](../../docs/api-contract.md#4-output) once. In practice it means the following.

- **One consumer.** `output` (chunks) and `lines()` are two views of a single consumer. The first `for await`
  claims it. A second claim throws `INVALID_ARGUMENT`, and leaving the loop (`break`, `return` or `throw`)
  detaches for good. For several reads, take the iterator once with `child.output[Symbol.asyncIterator]()` and call
  `next()` as often as you need ([recipes §9](../../docs/guide/recipes.md#9-unix-drive-bash-in-a-terminal)).
- **The child never blocks on output.** The library always drains the pipes. While a consumer is attached, up to
  16 MiB per stream waits for it. With no consumer (never attached, or detached), up to 1 MiB per stream is kept for
  a later first consumer. Anything beyond that is dropped, never blocked on.
- **Loss is counted and reported in order.** `droppedBytes` holds the totals. The first chunk or line after a gap
  carries `lostBefore`. Code that must not miss bytes checks `lostBefore` on every item. Code that only scans for a
  marker can ignore it.
- **Order across pipes is not guaranteed.** Each item says its `stream`. Use `mergeStderr: true` for one
  chronological stream ([recipes §7](../../docs/guide/recipes.md#7-stderr-apart-and-merged)).
- **Text or bytes.** By default, text is UTF-8, decoded across chunks, and invalid bytes become U+FFFD. With
  `text: false` you get `Uint8Array`, losslessly, and TypeScript types the result by it.
- **`wait()` never needs the output read.** An unread child still exits. Its output just goes to the buffers above.

## Environment, working directory, stdin

- `env` is merged over the inherited environment, and a `null` value removes a variable.
- `inheritEnv: false` starts from nothing but `env`. On Windows, `SystemRoot` is still passed, unless `env` sets or
  removes it. **That removes PATH too**, so a bare name such as `"node"` is `NOT_FOUND`. The message says the child's
  environment has no PATH. Either pass the program's full path (`process.execPath` for Node itself) or put PATH back
  in `env` ([recipes §5](../../docs/guide/recipes.md#5-environment-and-working-directory)).
- `cwd` must exist (`INVALID_CWD` otherwise), and a relative `cwd` is relative to your own working directory.
- stdin: `run()` takes `input`, which is written and then stdin is closed. `spawn()` children have stdin closed
  unless you pass `stdin: "pipe"`. Then `write()` resolves when the OS has taken the bytes, and `closeStdin()` ends the
  input. Writing without `stdin: "pipe"` is `INVALID_ARGUMENT`. Writing after the end of input is `CLOSED`
  ([recipes §6](../../docs/guide/recipes.md#6-writing-to-stdin)).

## Module formats and scope exit

- ESM: `import { run, spawn, OmniError } from "hugr-omni"`.
  CommonJS: `const { run, spawn, OmniError } = require("hugr-omni")`.
  Both give the same API ([the package page](../../bindings/node/README.md)).
- Top-level `await` needs an ES module: `npm pkg set type=module`, or `.mts` files.
- `await using child = spawn(...)` awaits `child.stop()` when the scope ends, even on a throw. It needs Node 24+,
  Bun, Deno, or TypeScript 5.2+ compiling for Node 22. Elsewhere, write `try { ... } finally { await child.stop(); }`
  ([recipes §4](../../docs/guide/recipes.md#4-cleanup-cancel-errors-and-the-end-of-your-own-process)).
- hugr-omni installs no signal handler and no exit hook in your process. You have nothing to register for cleanup.

## Windows

`.cmd` and `.bat` files, the absence of `shell: true`, drive-relative paths, `SystemRoot`, and exit codes such as
3221225786 are covered in [references/windows.md](references/windows.md). Read it before you write code that runs
`npm`, `npx` or a script on Windows, or that reads exit codes there.

## Review checklist

- One `for await` per child, or one iterator taken once. Never a second loop over `output` or `lines()`.
- Long-running children are read, or their loss is acceptable. Code that needs every byte checks `lostBefore`.
- No `try/catch` used to detect a non-zero exit; no exit code compared without looking at `reason`.
- `inheritEnv: false` comes with a full program path or with PATH in `env`.
- Every `spawn()` has an owner that ends it: `await using`, `finally { await child.stop() }`, or a `timeoutMs`.
- No `shell: true` workaround, no command string split on spaces: pass an array.
