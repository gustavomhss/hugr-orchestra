# hugr-omni — API contract (v0.1: TypeScript)

Status: **FROZEN for v0.1** (2026-10-02, tech lead; Codex review: rework → rework → freeze_after_fixes, fixes applied;
amended in W00: `processes()`, Rust mapping aligned with the core crate) · Owner of this document: the tech lead · v0.2
adds Python and Rust with the same semantics (mapping at the end). Every rule below is a promise; the conformance scenarios and
`GUARANTEES.md` hold the per-OS evidence.

## 1. Surface

```ts
export function run(command: string, args?: readonly string[], options?: RunOptions): Promise<RunResult>;
export function spawn(command: string, args: readonly string[] | undefined, options: SpawnOptions & { pty: PtyOption }): PtyChild;
export function spawn(command: string, args?: readonly string[], options?: SpawnOptions & { pty?: undefined }): PipeChild;
export function spawn(command: string, args?: readonly string[], options?: SpawnOptions): PipeChild | PtyChild;

interface CommonOptions {
  cwd?: string;                                 // default: host cwd
  env?: Record<string, string | null>;          // merged over the inherited env; null removes a variable
  inheritEnv?: boolean;                         // default true; false = only `env` (+ OS-required vars on Windows)
  timeoutMs?: number;                           // whole-run deadline; on expiry the tree is stopped, reason "timeout"
  graceMs?: number;                             // default 2000; how long the tree gets to wind down (see §5)
  signal?: AbortSignal;                         // cancellation (see §8)
  text?: boolean;                               // default true: UTF-8 strings; false: Uint8Array, lossless
                                                // (index.d.ts types the output by it: string by default, Uint8Array for text: false)
  mergeStderr?: boolean;                        // pipe mode: stderr goes into the stdout pipe at the OS level
}
interface RunOptions extends CommonOptions {
  input?: string | Uint8Array;                  // pipe mode: fed to stdin, then stdin is closed
  maxOutputBytes?: number;                      // per stream, default 16 MiB; exceeding it is an error (see §6)
  pty?: PtyOption;                              // run inside a terminal (see §9)
}
interface SpawnOptions extends CommonOptions {
  stdin?: "closed" | "pipe";                    // pipe mode only; default "closed" (EOF at once)
  pty?: PtyOption;                              // returns a PtyChild (see §9)
}
type PtyOption = true | { cols?: number; rows?: number };   // default 80 x 24

interface Child extends AsyncDisposable {       // what pipe and PTY children share
  readonly pid: number;
  readonly output: AsyncIterable<Chunk>;        // single consumer (see §4)
  lines(): AsyncIterable<Line>;                 // line view of the same single consumer
  readonly droppedBytes: { stdout: number; stderr: number };   // pty output counts as stdout
  write(data: string | Uint8Array): Promise<void>;
  wait(): Promise<Exit>;                        // root process exited (see §5)
  stop(options?: { graceMs?: number }): Promise<Exit>;         // whole tree gone (see §5)
  processes(): Promise<ProcessInfo[]>;          // live processes stop() would end now (see §5)
}
interface PipeChild extends Child { closeStdin(): Promise<void>; }
interface PtyChild extends Child { resize(cols: number, rows: number): void; }

interface Chunk { stream: "stdout" | "stderr" | "pty"; data: string | Uint8Array; lostBefore?: number; }
interface Line  { stream: "stdout" | "stderr" | "pty"; text: string; lostBefore?: number; continues?: true; }
interface ProcessInfo { pid: number; parentPid: number | null; name: string | null; }
interface Exit {
  exitCode: number | null;                      // null only when a Unix process was ended by a signal
  signal: string | null;                        // Unix signal name; always null on Windows
  reason: "exit" | "signal" | "killed" | "timeout" | "aborted";
  success: boolean;                             // reason === "exit" && exitCode === 0
}
interface RunResult extends Exit {
  stdout: string | Uint8Array;                  // complete; pty output lands here
  stderr: string | Uint8Array;                  // complete; empty for pty and for mergeStderr
}
class OmniError extends Error {
  readonly code: "NOT_FOUND" | "NOT_EXECUTABLE" | "INVALID_CWD" | "INVALID_ARGUMENT"
               | "ABORTED" | "OUTPUT_LIMIT" | "CLOSED" | "IO";
  readonly result?: RunResult;                  // what was collected, on ABORTED / OUTPUT_LIMIT / IO from run()
}
```

## 2. Glossary (15 concepts — the parity unit; changing it is a lead decision recorded in PLAN)

run · spawn · cwd · environment (`env`, `inheritEnv`) · terminal (`pty`, `resize`) · timeout · grace ·
cancellation · stdin (`input` for run; `stdin: "pipe"`, `write`, `closeStdin` for spawn) · output limit ·
text vs bytes · output (`output`, `lines`, `mergeStderr`, `droppedBytes`) · Child (`pid`, `wait`, `stop`, `processes`) ·
Exit / RunResult · OmniError.

## 3. Starting a process

- `command` is resolved against the **child's final PATH** (after `env`/`inheritEnv`), plus PATHEXT on Windows.
  A path containing a separator resolves against `cwd`. Missing PATH in a clean env → `NOT_FOUND` saying so.
- **No shell, ever, for your arguments.** On Windows a resolved `.cmd`/`.bat` (e.g. `npm.cmd`) is run through
  `cmd.exe` with batch-safe escaping identical to Rust std's rule; an argument that cannot be passed
  literally is rejected with `INVALID_ARGUMENT` before anything runs. Metacharacters (`& | % ^ $ ;` …) are
  never interpreted.
- Validation (`INVALID_ARGUMENT`, `INVALID_CWD`) happens before any process exists. Startup failures are
  thrown synchronously by `spawn()` and reject `run()`. The rules:
  - `timeoutMs`, `graceMs`: finite, ≥ 0, ≤ 4294967295; a fraction rounds up to the next millisecond; `0` means at
    once.
  - `maxOutputBytes`: an integer ≥ 0.
  - PTY `cols`/`rows`: integers from 1 to 32767.
  - Strings (`command`, `args`, `cwd`, `env` keys and values) must not contain NUL; an `env` key must not be empty
    or contain `=`.
- On Windows a drive-relative path (`C:dir`, relative to a per-drive current directory) is rejected:
  `INVALID_ARGUMENT` for `command`, `INVALID_CWD` for `cwd`, each saying to write the full path.
- `inheritEnv: false` on Windows still passes `SystemRoot` from the host unless `env` sets or removes it (many
  programs cannot start without it); nothing is added elsewhere.

## 4. Output

- **The child never blocks on output.** The library always drains the pipes.
- **Single consumer.** `output` and `lines()` are two views of one consumer; the first iteration claims it,
  any second claim throws `INVALID_ARGUMENT`. Leaving the loop (break/return/throw) **detaches for good**.
- **Buffering:** while a consumer is attached, up to 16 MiB per stream waits for it; with no consumer
  (never attached, or detached) up to 1 MiB per stream is kept for a later first consumer. Anything beyond is
  dropped and counted in `droppedBytes`. A consumer that keeps up never loses data; a paused consumer can
  never block `wait()` or `stop()`.
- **Loss is reported in order.** The first item after a gap carries `lostBefore` (bytes dropped right before
  it). If the stream ends after a gap, a final empty item with `lostBefore` is yielded before the end. Text
  decoding and line assembly restart at every gap, so no character or line is stitched across it; a partial
  line cut by a gap is yielded as it was.
- **Text mode** decodes UTF-8 incrementally across chunks; invalid bytes become U+FFFD. **Bytes mode** is
  lossless. `lines()` splits on `\n` (a trailing `\r` is removed) and yields a final unterminated line at EOF;
  a line longer than 1 MiB is yielded in pieces of at most 1 MiB, each the longest prefix that ends at a UTF-8
  character boundary, every piece but the last marked `continues: true`.
- **Order:** chunks come in the order the library observed them; exact chronology between two pipes is not
  guaranteed. `mergeStderr: true` sends stderr into the stdout pipe at the OS level for a single chronological
  stream (then `stream` is always `"stdout"`).

## 5. Completion

- **`wait()`** resolves when the **root** process exits, never requires reading output, and every call returns
  the same `Exit`. Descendants may still be alive at that point.
- **`output`** ends when every holder of the pipes closed them — so it stays open while a descendant holds a
  pipe after the root exited — or when the tree is stopped.
- **`stop()`** gives the **whole tree one deadline** of `graceMs`: a graceful request first (Unix: SIGTERM to
  the tree; Windows: CTRL_BREAK where the console allows it, per GUARANTEES tier), then forced termination of
  everything still alive. It also works after `wait()` resolved (it then ends the surviving descendants and
  keeps the root's recorded `Exit`). It resolves once the tree is confirmed gone (per tier), ends `output`,
  and returns the `Exit`; calling it again after that is a no-op returning the same `Exit`.
- **`processes()`** lists the live processes that `stop()` would end, by the same membership rule (Unix: the root's
  session; Windows: the Job), collected over one short scan. Processes can start or exit during and after the scan,
  so a later `stop()` may reach a different set; for a tree that is not changing, the list is exactly what `stop()`
  reaches, and it never includes a process outside the rule. Each entry has
  `pid`, `parentPid` (the parent's pid when the parent is in the list, otherwise `null` — e.g. the root, or an orphan)
  and `name` (the executable's file name without directory: `node` on Unix, `node.exe` on Windows; `null` when the
  OS does not tell). Command-line arguments are never included (they often carry secrets). Order is unspecified.
  Once the tree is gone it returns `[]`; if the OS inventory is incomplete it rejects with `IO` instead of returning
  a partial list.
- **Scope exit:** `await using` awaits `stop()`. (Python `with` calls `stop()`; Rust `drop` force-kills the
  tree immediately without blocking — use `stop().await` for a graceful end. See §10.)

## 6. `run()`

- Resolves after the root exits **and** the output ends. Once the root exits, descendants get `graceMs` to
  close the pipes; then the remaining tree is stopped at once (that window was its grace) and the output collected
  so far is the result. A timeout
  or cancellation during that window stops the tree at once. Long-lived background processes belong in
  `spawn()`.
- **`RunResult` describes the run, not only the root.** If the deadline expires at any point before `run()`
  completes — including the window after the root exited — the result has `reason: "timeout"` and
  `success: false`, while `exitCode`/`signal` keep the root's native status. Cancellation in that window rejects
  with `ABORTED` like any cancellation after launch.
- **A resolved `run()` always carries complete output.** If a stream exceeds `maxOutputBytes`, the tree is
  stopped and `run()` rejects with `OUTPUT_LIMIT`; `error.result` holds the first `maxOutputBytes` bytes of
  each stream and the message names the stream. Raise the limit or stream with `spawn()` for more.
- Pipe mode: `input` is written, then stdin is closed; without `input` stdin is closed from the start. A child
  that exits or closes stdin before reading all `input` is normal (the result is returned, like a shell pipe).
- A non-zero exit never throws.

## 7. Exit and termination cause

- Valid combinations: `exit` → exitCode number, signal null · `signal` → Unix only, exitCode null, signal
  name · `killed` / `timeout` / `aborted` → the native status is still reported in exitCode/signal.
- **The cause is committed when the library acts:** if the root's exit was observed before the library sent
  any termination, the reason is `exit` or `signal`; otherwise it is the first of `killed` (stop/dispose),
  `timeout` or `aborted` that the library acted on. A child that handles SIGTERM and exits 0 after `stop()`
  reports `reason: "killed"`, `exitCode: 0`, `success: false`. A `stop()` after the root exited only cleans up
  descendants and never changes the recorded `Exit`.
- Windows exit codes are reported as non-negative integers (e.g. `0xC000013A` = 3221225786).

## 8. Outcome table

| Situation | `spawn()` / `Child` | `run()` |
|---|---|---|
| Invalid input, not found, not executable, bad cwd | throws `OmniError` synchronously | rejects with `OmniError` |
| `signal` already aborted | throws `ABORTED`; nothing runs | rejects `ABORTED`; nothing runs |
| Cancelled after launch | tree stopped; `wait()` resolves `reason: "aborted"` — or, if the root had already exited, keeps the root's recorded `Exit` (only descendants are stopped) | tree stopped, then rejects `ABORTED` with `error.result` |
| Timeout | tree stopped; `wait()` resolves `reason: "timeout"` — or keeps the root's recorded `Exit` if it had already exited | resolves with `reason: "timeout"`, `success: false` and the output collected (root's native status kept, §6) |
| Output above the limit | n/a (streaming has no limit; see §4 buffering) | tree stopped, then rejects `OUTPUT_LIMIT` with `error.result` |
| Non-zero exit | `wait()` resolves, `success: false` | resolves, `success: false` |
| I/O failure while reading | `output` throws `IO` | tree stopped, then rejects `IO` with `error.result` |

`run()`, `stop()` and disposal return only after the tree is stopped. `wait()` reports the root only.

## 9. stdin

- `write()` resolves when the bytes were accepted by the OS pipe or terminal (backpressure: it waits for space).
  Writes are applied in call order, never interleaved.
- `closeStdin()` (pipe children) waits for queued writes, then closes; it is idempotent. Writing after it, or
  after the child closed its end or exited, rejects with `CLOSED`, as do writes still queued at that moment.
- A pipe child spawned with `stdin: "closed"` (the default) rejects `write()` with `INVALID_ARGUMENT`
  naming the option to change.

## 10. Terminal (`pty`)

- One channel, labeled `pty`, carrying everything the terminal shows; in `run()` it lands in `stdout`,
  `stderr` is empty, and `maxOutputBytes` applies to it. `mergeStderr` does not apply.
- Default size 80 x 24; `resize()` exists only on `PtyChild`. Invalid sizes → `INVALID_ARGUMENT`;
  resize after exit → `CLOSED`.
- `write()` types into the terminal; there is no `closeStdin()` (a terminal has no separate end-of-input —
  send the program's own, e.g. `"\x04"`). Echo and newline translation are terminal behavior and are
  documented, not normalized.
- `run()` with `pty` takes no `input` (`INVALID_ARGUMENT`): the terminal has no typist, so a program that waits
  for input waits until `timeoutMs`. Use `spawn()` with `pty` to interact.

## 11. Errors and other languages (v0.2)

- Codes: `NOT_FOUND · NOT_EXECUTABLE · INVALID_CWD · INVALID_ARGUMENT · ABORTED · OUTPUT_LIMIT · CLOSED · IO`
  (`SANDBOX_UNAVAILABLE` arrives with the sandbox). Messages say what failed, the value, and the fix.
- **Python:** `run([cmd, *args], ...)`, `spawn(...)`, `aio.run` / `aio.spawn`; `timeout`/`grace` in seconds;
  `text=True`; `stdin="pipe"`; `merge_stderr`; `with`/`async with` call `stop()`. Errors: `OmniError` with
  `.code`, plus `CommandNotFoundError(OmniError, FileNotFoundError)`. Cancellation propagates natively
  (`CancelledError` / `KeyboardInterrupt`) after the tree is stopped.
- **Rust:** `Command` builder with the same options (`text(bool)`, `pty(PtySize)`, durations as `Duration`);
  `spawn()` → `PipeChild`, `spawn_pty()` → `PtyChild` (both deref to `Child`), `run().await` → `Result<RunOutput, Error>`;
  `Error` with `code()` (`ErrorCode`, `#[non_exhaustive]`) and `result()`; cancellation via `cancel_on(token)` →
  `Err(e)` with `e.code() == ErrorCode::Aborted` and the partial output in `e.result()`; `output()` and `lines()` each
  claim the single consumer; `processes().await` → `Vec<ProcessInfo>`. Python: `processes()` → `list[ProcessInfo]`
  (`pid`, `parent_pid`, `name`).
  **`Drop` force-kills the tree immediately and does not block**; reaping runs on a dedicated thread, not on
  the tokio runtime, so it also works after the runtime shut down (INV-16).
