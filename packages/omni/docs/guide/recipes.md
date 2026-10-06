# Recipes for agents

Four jobs an agent does all day, as code you can paste: run a dev server, run tests under a deadline, drive an
interactive terminal, and clean up when something is cancelled or ends. Then the options you look for next: the
environment and the working directory, writing to stdin, stderr apart or merged, reading a result, and a real shell
in a terminal. TypeScript first; the Rust option names are the same (see the end).

Every block here is run by CI (`scripts/readme-check`) on each OS, inside a small project with an `npm run dev` that
prints `ready` and an `npm test` that passes (the one Unix-only block, the shell, says so). To adapt one, change the
command. They are written as ES modules; from CommonJS, `require("hugr-omni")` gives the same `run`, `spawn` and
`OmniError`.

In a fresh Node project (`npm init -y` makes it CommonJS), run `npm pkg set type=module` (or name your files `.mts`)
before using top-level `await`, and add `npm i -D @types/node` when you type-check with TypeScript.

Which function: `run` when the program ends by itself and you want its whole output; `spawn` when it keeps running, or
you want to read as it goes, write to it, or stop it.

| I want to... | Option or call | Section |
|---|---|---|
| add, change or remove a variable; start from a clean environment | `env`, `inheritEnv` | 5 |
| run in another directory | `cwd` | 5 |
| send text to a program, and end its input | `input` (`run`); `stdin: "pipe"`, `write`, `closeStdin` (`spawn`) | 6 |
| tell stdout from stderr, or merge them | `stream`, `mergeStderr` | 7 |
| know why a program ended; get bytes instead of text | `exitCode`, `signal`, `reason`, `success`, `text` | 8 |
| drive a prompt, a REPL, a shell (Unix: bash) | `pty`, `output`, `write`, `resize` | 3, 9 |

## 1. A dev server: wait until it is ready, stop the whole tree

`npm run dev` is npm, a shell, node and often more processes behind it. Stopping only the first leaves the rest
holding the port. `stop()` ends all of them, and `await using` calls it when the scope ends, even if the code throws.

```ts
import { spawn } from "hugr-omni";

// timeoutMs is the budget of the whole session: when it is spent, the tree is stopped.
await using server = spawn("npm", ["run", "dev"], { timeoutMs: 10 * 60_000 });

let ready = false;
for await (const line of server.lines()) {
  if (line.text.includes("ready")) {
    ready = true;
    break; // leaving the loop detaches the output for good
  }
}
if (!ready) throw new Error(`the dev server ended before it was ready: ${JSON.stringify(await server.wait())}`);

// ... fetch pages, run the browser test ...
console.log(await server.processes()); // [{ pid, parentPid, name }, ...]: what stop() would end right now
// Leaving the scope stops npm, the shell and node.
```

- `lines()` and `output` are two views of one consumer. Claim it once; a second `for await` is `INVALID_ARGUMENT`.
- A server that stays alive without ever printing `ready` ends the loop only when the budget stops it, so say how long
  you can wait.
- `processes()` answers "why is the port busy?" with pids and parent links, never command-line arguments. It lists the
  root too, in no particular order, and it is `[]` once the tree is gone: take the pids before `stop()` if you want to
  check them with `ps` afterwards.

## 2. Tests with a deadline

A test run that hangs (a worker that never exits, a prompt nobody answers) must not hang the agent. With `timeoutMs`,
`run()` stops the whole tree, jest workers included, and still resolves, with `reason: "timeout"` and the output so
far.

```ts
import { run } from "hugr-omni";

const result = await run("npm", ["test"], { timeoutMs: 5 * 60_000, graceMs: 5_000 });

if (result.reason === "timeout") {
  throw new Error(`the tests hung; the whole tree was stopped. Output so far:\n${result.stdout}`);
}
if (!result.success) {
  throw new Error(`the tests failed (exit ${result.exitCode}):\n${result.stdout}${result.stderr}`);
}
console.log("tests passed");
```

What a hang looks like, with a deadline short enough to try:

```ts
import { run } from "hugr-omni";

const hung = await run("node", ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 1_000, graceMs: 500 });
console.log(hung.reason, hung.success); // timeout false
```

- A non-zero exit never throws. Timeouts do not throw either; both are results you read.
- `graceMs` is how long the tree gets to wind down (a cooperative program finishes its cleanup) before it is forced.
- Output above `maxOutputBytes` (16 MiB per stream by default) stops the tree and rejects with `OUTPUT_LIMIT`; the
  first bytes are in `error.result`. For more, use `spawn()` and read it as it comes.

## 3. An interactive terminal

Some programs only talk to a terminal: prompts, REPLs, `git rebase -i`. With `pty`, the child sees a real terminal
(openpty on Unix, ConPTY on Windows) of the size you ask for.

```ts
import { spawn } from "hugr-omni";

const program = `process.stdout.write("name? "); process.stdin.once("data", (d) => { console.log("hello " + String(d).trim()); setInterval(() => {}, 1000); });`;
await using term = spawn("node", ["-e", program], { pty: { cols: 100, rows: 30 } });

let seen = "";
let answered = false;
for await (const chunk of term.output) { // one loop for the whole conversation: leaving it detaches for good
  seen += chunk.data;
  if (!answered && seen.includes("name?")) {
    answered = true;
    await term.write("alice\r"); // \r is Enter
  }
  if (seen.includes("hello alice")) break;
}
await term.write("\x03"); // Ctrl-C interrupts the foreground program
console.log((await term.wait()).reason);
```

- Read `output` (chunks), not `lines()`, to see a prompt: it has no newline yet.
- The terminal shows everything, including the echo of what you typed; chunks are labeled `pty`.
- There is no `closeStdin()` on a terminal: send the program's own end of input, for example `"\x04"`.
- `term.resize(cols, rows)` changes the size later, and the program sees it at once (section 9 reads it back with
  `stty size`). `run()` with `pty` takes no `input`: nobody types.
- For a conversation of several steps, take the iterator once instead of looping once (section 9).
- To Ctrl-C a command that prints nothing (a `sleep` in a shell), first wait until `term.processes()` lists it;
  otherwise the Ctrl-C may reach the shell before the command starts.

## 4. Cleanup: cancel, errors, and the end of your own process

Cancelling stops the whole tree first, and then tells you. For a `spawn()`, `wait()` resolves with
`reason: "aborted"`:

```ts
import { spawn } from "hugr-omni";

const controller = new AbortController();
const child = spawn("node", ["-e", "console.log('working'); setInterval(() => {}, 1000)"], { signal: controller.signal });

for await (const line of child.lines()) {
  if (line.text === "working") controller.abort(); // the user pressed cancel
} // the output ends once the tree is stopped
console.log((await child.wait()).reason); // aborted
```

For a `run()`, the promise rejects with `ABORTED`, and `error.result` holds what was collected:

```ts
import { OmniError, run } from "hugr-omni";

try {
  await run("node", ["-e", "console.log('partial'); setInterval(() => {}, 1000)"], { signal: AbortSignal.timeout(2_000) });
} catch (e) {
  if (!(e instanceof OmniError) || e.code !== "ABORTED") throw e;
  console.log("cancelled, the tree is stopped; output so far:", e.result?.stdout);
}
```

Without `await using` (plain Node), `finally` does the same:

```ts
import { spawn } from "hugr-omni";

const server = spawn("npm", ["run", "dev"]);
try {
  for await (const line of server.lines()) if (line.text.includes("ready")) break;
  console.log("the server is ready, doing the work");
} finally {
  await server.stop(); // the whole tree, also when the work above threw
}
```

- When your own process ends, by any means (a normal end, `process.exit()`, an uncaught exception, SIGINT, SIGTERM,
  even SIGKILL), the supervisor stops every tree it started, within its grace. hugr-omni installs no signal handler
  and no exit hook in your process, so there is nothing to register. What holds on each OS, and the one thing that
  escapes on purpose (`setsid`), is in [GUARANTEES.md](../../GUARANTEES.md).
- `stop()` after the tree is gone returns the same result again. It is always safe to call twice.

## 5. Environment and working directory

`env` is merged over your own environment, and a `null` value removes a variable. `inheritEnv: false` starts from
nothing: only `env` reaches the program (on Windows, plus `SystemRoot`, which most programs cannot start without).

```ts
import { run } from "hugr-omni";

const show = "console.log(process.env.GREETING ?? 'unset', Boolean(process.env.PATH))";

const added = await run("node", ["-e", show], { env: { GREETING: "hello" } });
console.log(added.stdout.trim()); // hello true: your environment, plus GREETING

// A clean environment has no PATH either, so the program is given by its full path...
const clean = await run(process.execPath, ["-e", show], { inheritEnv: false, env: { GREETING: "hello" } });
console.log(clean.stdout.trim()); // hello false: only GREETING

// ...or the PATH is passed on, and "node" is found by name again.
const withPath = await run("node", ["-e", show], { inheritEnv: false, env: { GREETING: "hello", PATH: process.env.PATH ?? "" } });
console.log(withPath.stdout.trim()); // hello true
```

- **PATH:** the program is looked up on the child's PATH, after `env` and `inheritEnv` are applied. With
  `inheritEnv: false` (or `env: { PATH: null }`) and no PATH of your own, `run("node", ...)` is `NOT_FOUND`, and the
  message says so: `the child's environment has no PATH`.
- `env` keys and values are strings; a key cannot be empty or contain `=`.

`cwd` is where the program runs; a relative `cwd` is relative to your own working directory. A command written with a
path, such as `./tool`, is looked up inside `cwd`.

```ts
import { tmpdir } from "node:os";
import { run } from "hugr-omni";

const where = await run("node", ["-p", "process.cwd()"], { cwd: tmpdir() });
console.log(where.stdout.trim()); // the temporary directory, as the system names it
```

- A `cwd` that does not exist throws `INVALID_CWD` before anything runs.
- The program sees the real path: with `cwd: "/tmp"` on macOS it prints `/private/tmp`, because `/tmp` is a link there
  (`tmpdir()` is a link too, so the block above prints `/private/var/folders/...` on macOS).

## 6. Writing to stdin

`run()` takes its whole input at once: `input` is written, then stdin is closed.

```ts
import { run } from "hugr-omni";

const echoed = await run("node", ["-e", "process.stdin.pipe(process.stdout)"], { input: "hello\n" });
console.log(echoed.stdout); // hello
```

A `spawn()` child has its stdin closed from the start, unless you ask for `stdin: "pipe"`. Then `write()` sends text as
often as you like, and `closeStdin()` ends the input, which is how a program that reads until the end learns that it
may finish.

```ts
import { spawn } from "hugr-omni";

await using cat = spawn("node", ["-e", "process.stdin.pipe(process.stdout)"], { stdin: "pipe" });
await cat.write("hello\n");
await cat.write("again\n");
await cat.closeStdin(); // end of input: cat finishes by itself
for await (const line of cat.lines()) console.log(line.text); // hello, then again
console.log((await cat.wait()).reason); // exit
```

- Without `stdin: "pipe"`, `write()` rejects with `INVALID_ARGUMENT`, and the message names the option.
- Writing after `closeStdin()`, or after the program closed its end of the pipe or exited, rejects with `CLOSED`.
- Output that arrives before you start reading waits for you (up to 1 MiB per stream), so writing first and reading
  afterwards loses nothing.
- A terminal has no `closeStdin()`; send the program's own end of input (section 3).

## 7. stderr apart, and merged

`run()` keeps the two streams apart: `stdout` and `stderr` are separate. With `mergeStderr: true`, stderr goes into the
stdout pipe at the operating-system level: `stdout` holds both, in the order they were written, and `stderr` is empty.

```ts
import { run } from "hugr-omni";

const program = "console.log('out'); console.error('err')";

const apart = await run("node", ["-e", program]);
console.log(JSON.stringify(apart.stdout), JSON.stringify(apart.stderr)); // "out\n" "err\n"

const merged = await run("node", ["-e", program], { mergeStderr: true });
console.log(JSON.stringify(merged.stdout), JSON.stringify(merged.stderr)); // "out\nerr\n" ""
```

- With `spawn()`, every chunk and line says where it came from: `stream` is `"stdout"` or `"stderr"`, and with
  `mergeStderr` it is always `"stdout"`. In a terminal there is one channel, `"pty"`.
- Between two separate pipes the exact order is not guaranteed. Merge them when the order matters.

## 8. Reading the result

Every way a program can end is a result you read, not an exception. `reason` says why it ended, and `success` is true
only for `reason: "exit"` with `exitCode` 0.

```ts
import { run, spawn } from "hugr-omni";

const hang = "setInterval(() => {}, 1000)";

// It ended by itself, with its own code.
const failed = await run("node", ["-e", "process.exit(3)"]);
console.log(failed.reason, failed.exitCode, failed.success); // exit 3 false

// The deadline passed: the whole tree was stopped, and the output so far is in the result.
const slow = await run("node", ["-e", hang], { timeoutMs: 500 });
console.log(slow.reason, slow.success); // timeout false

// An AbortSignal fired: a spawn()'s wait() resolves with "aborted"; a run() rejects with ABORTED (section 4).
const controller = new AbortController();
const cancelled = spawn("node", ["-e", hang], { signal: controller.signal });
controller.abort();
console.log((await cancelled.wait()).reason); // aborted

// You called stop(), or left an `await using` scope: "killed", and success is false even if the program exited 0.
const stopped = spawn("node", ["-e", hang]);
console.log((await stopped.stop()).reason); // killed
```

| `reason` | What happened | `exitCode`, `signal` |
|---|---|---|
| `exit` | the program ended by itself | its code, `null` |
| `signal` | Unix only: a signal that was not ours ended it (a crash, someone else's `kill`) | `null`, the signal's name |
| `timeout` | `timeoutMs` passed and the tree was stopped | what the program ended with |
| `aborted` | the `signal` fired and the tree was stopped | what the program ended with |
| `killed` | `stop()`, or the end of an `await using` scope | what the program ended with |

- After `timeout`, `aborted` or `killed` the program's own status is still reported. On Unix a program that dies of our
  SIGTERM has `exitCode: null` and `signal: "SIGTERM"`; one that handles SIGTERM and exits 0 has `exitCode: 0` and
  still `success: false`. On Windows `signal` is always `null`.
- `stdout` and `stderr` are strings. With `text: false` they are `Uint8Array`, byte for byte, and TypeScript knows it:
  `r.stdout.trim()` compiles by default, and is an error with `text: false` (the same goes for `chunk.data`).
- A failure to start is not a result: `spawn()` throws `OmniError` at once (`NOT_FOUND`, `INVALID_CWD`, ...), and
  `run()` rejects with it.

## 9. Unix: drive bash in a terminal

A shell is a program in a terminal (section 3), with three things to get right.

- **Know when it is ready.** Choose the prompt yourself (`PS1`) and wait for it, so that a banner, a slow startup or
  your own startup files cannot fool you.
- **Tell the echo from the output.** The terminal echoes what you type. A reply is the echo of your command, then
  its output, then the next prompt: cut the first line and the last.
- **Run several steps with one iterator.** Leaving a `for await` loop detaches the output for good, and a second claim
  throws `INVALID_ARGUMENT`. Take the iterator once, and call `next()` as often as you need.

The block below is for Unix (`bash`, `stty`) and ends at once on Windows: `cmd.exe` and `powershell.exe` have a prompt
and an echo of their own, so print a transcript of your shell before you pick its markers. It starts bash with
`--noediting` because, with line editing on, bash redraws the prompt when the terminal is resized, and the redraw looks
like the next prompt.

```ts
import { spawn } from "hugr-omni";

if (process.platform === "win32") process.exit(0); // bash and stty are Unix tools

// --norc and --noprofile keep your own startup files out, so PS1 is the prompt we chose.
await using term = spawn("bash", ["--noediting", "--norc", "--noprofile"], {
  pty: { cols: 100, rows: 30 },
  env: { PS1: "omni> " },
});

const output = term.output[Symbol.asyncIterator](); // the one claim; every step below reads from it
let seen = "";

/** Reads until `marker` has arrived; returns everything up to and including it, and keeps what came after. */
async function until(marker: string): Promise<string> {
  while (!seen.includes(marker)) {
    const next = await output.next();
    if (next.done) throw new Error(`the terminal ended before ${JSON.stringify(marker)}; seen: ${JSON.stringify(seen)}`);
    seen += next.value.data;
  }
  const end = seen.indexOf(marker) + marker.length;
  const upToMarker = seen.slice(0, end);
  seen = seen.slice(end);
  return upToMarker;
}

/** Types a command, waits for the next prompt, and returns what the command printed. */
async function enter(command: string): Promise<string> {
  await term.write(`${command}\r`); // \r is Enter
  const reply = await until("omni> "); // "echo hi\r\nhi\r\nomni> "
  return reply.split("\r\n").slice(1, -1).join("\n"); // without the echo of the command and the prompt
}

await until("omni> "); // the first prompt: bash is ready
console.log(await enter("echo hi")); // hi
console.log(await enter("stty size")); // 30 100: rows first, then columns

term.resize(120, 40); // the program sees the new size at once
console.log(await enter("stty size")); // 40 120

await term.write("exit\r");
console.log((await term.wait()).reason); // exit
```

- `resize(cols, rows)` takes columns first and returns nothing; `stty size` prints rows first. Both are the usual
  Unix orders, not the library's.
- Pick the marker so that the command cannot print it by accident, and add a `timeoutMs` to `spawn` when a reply
  could never come (a command that waits for input).

## Rust

The options have the same meaning and, in Rust style, the same names: `Command::new(..).args(..)`, `.timeout(..)`,
`.grace(..)`, `.cancel_on(token)`, `.pty(PtySize { cols, rows })`, `.cwd(..)`, `.env(..)`, `.env_remove(..)`, `.inherit_env(..)`,
`.input(..)`, `.stdin(..)`, `.merge_stderr(..)`, `.text(..)`, then `.run().await`
or `.spawn()` / `.spawn_pty()` for a child you stream from, write to and `stop(None).await`. Dropping a child kills its tree at
once without waiting; call `stop(None)` for a graceful end. The table that places every TypeScript and Rust name under its
concept is [scripts/surface-check/parity.txt](../../scripts/surface-check/parity.txt); Python joins it in v0.2.
