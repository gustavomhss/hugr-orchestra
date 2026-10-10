# processkit fit study (WP P0)

> Question: can the hugr-omni TypeScript package (Node/Bun/Deno via napi-rs) be built on top of
> `processkit` 3.3.4 while keeping our contract (docs/acceptance.md, PLAN §3)?
> Date: 2026-10-01 · Subject: `processkit` **3.3.4** (tag `v3.3.4` = `ba1a6fe`, crates.io, MIT) ·
> Upstream `main` is 92 commits / +6.8k lines past that tag and has not been released.
>
> **Evidence tags.** **[M]** = measured by us on darwin-x64 (macOS 15.3.2, rustc 1.98.0) against the
> `v3.3.4` tag. **[D]** = upstream docs. **[S]** = upstream source read at `v3.3.4`. **[?]** = unknown or
> needs a spike. Links point to the `v3.3.4` tag unless they say `main`.
> `SRC` = `https://github.com/ZelAnton/ProcessKit-rs/blob/v3.3.4` and
> `DOCS` = `https://docs.rs/processkit/3.3.4/processkit`.

---

## G. Verdict

**Yes, we can build on it, with an adapter.** processkit gives us the hard OS layer we would
otherwise write ourselves: Job Objects, cgroup v2, process groups, ConPTY/openpty, a race-free
suspended spawn, the TERM→grace→KILL ladder and PATHEXT resolution. Its upstream integration suite
passes in full on our darwin-x64 target (**244/244, including 11 PTY tests, [M]**), even though
upstream CI never runs that target.

Its I/O and handle model is built for Rust ownership, not for our contract. The adapter therefore
takes over output capture, reasons, timers, host exit and GC safety.

**Adapter size: ~2,000 LOC Rust (range 1.6k–2.6k) + ~600 LOC TS.** Add ~250 LOC Rust plus one
extra shipped binary per target if we want a SIGKILL watchdog sidecar on Unix (optional, §C). If
upstream declines proposals F1 and F4, add ~500 LOC Rust: we would own the pipes ourselves via
`to_tokio_command` + `ProcessGroup::spawn`. That path loses the Windows CTRL_BREAK soft tier, and
PTY would still have to go through processkit.

**The 3 biggest gaps**

1. **Containment on macOS (and on Linux without cgroup delegation) is only a POSIX process group.**
   Measured on macOS [M]:
   - A `setsid` descendant survives drop.
   - The background jobs of `bash -i` / `zsh -i` under `use_pty()` survive both `ProcessGroup::stop`
     and drop. Job control moves them to their own process groups.
   - Abrupt host death leaves the whole tree running: `process::exit`, default SIGINT/SIGTERM,
     `abort`, SIGKILL, and SIGKILL with `kill_on_parent_death`.

   Windows Job Objects and Linux cgroups do not have this gap. Linux cleans up only the direct child
   on abrupt host death. Affects K1, C-KILL-03, C-PTY-04, C-HOST-01 and C-TS-01.
2. **Output after the root exits is governed by a fixed 5 s `PUMP_TEARDOWN`, not by our `graceMs`.**
   - `wait()` and `output_string()` take 5.0 s when a grandchild holds the pipe [M].
   - Worse, the same bound aborts a pump whose *attached consumer is merely slow*. Result: 24,576 of
     60,000 bytes delivered and `drain()` still returns `Ok(Exited(0))`. That is **silent output
     loss** [M].
   - Capture is line-oriented: a line longer than the byte cap is dropped whole [D]. So we must own
     byte capture through raw tees.

   Affects K5, C-IO-02, C-IO-04 and C-RUN-01.
3. **The handle model fights a binding.**
   - The finishers consume the handle: `wait(self)`, `finish(self)`, `shutdown(self, _)`.
   - `resize_pty` needs `&mut self`, so it cannot run while a wait is pending.
   - A cancellation error carries no outcome or output [M].
   - Precedence is "cancel wins", not our "first event wins" [D].
   - Drop is an immediate hard kill [D].
   - The Windows ConPTY path builds its own `CreateProcessW` command line and skips std's
     batch-file (BatBadBut) escaping [S].
   - Unix PTY echo is forced off [S][M].

   So the adapter has to run one actor per child, keep a shared `Arc<ProcessGroup>` for kill, use a
   liveness-probe workaround for resize, and own timers and reasons. Affects C-SPAWN-02, C-PTY-01,
   C-PTY-02, C-TMO-02 and C-EXIT-01.

**Recommendation.** Pin `processkit = "=3.3.4"` with features `pty` (plus the default
`process-control`). Build the adapter on `ProcessGroup::start` + raw tees (the "path P" in §D).
Declare the per-OS tiers honestly in GUARANTEES. Open upstream items F1–F4 before release.

---

## A. Fit table (24 items: C-SPAWN-01..C-PTY-04 and C-TS-01, minus C-RS-*)

Status counts: **Y 1 · A 18 · U 3 · X 2** (one primary status per row; other sub-cases are named in
the row).

| ID | Our promise (short) | processkit API(s) that deliver it | Status | What exactly | Evidence |
|---|---|---|---|---|---|
| C-SPAWN-01 | Bare name resolves on the child's **final** PATH (PATHEXT: `npm`→`npm.cmd`); PATH removed → error says so | `Command::resolve_program`, `processkit::which`, `Command::env/env_remove/env_clear` | **A** | **What works:** a non-`.exe` PATHEXT hit is resolved on the effective child PATH and spawned by absolute path [S]. **Gap 1:** a `.exe` hit is left as a bare name. The OS search then wins, and std on Windows checks the app dir and System32 before the parent PATH [S]. **Gap 2 [M]:** with PATH removed, the spawn **succeeds** through libc's default path while `resolve_program` says NotFound. **Adapter:** always call `resolve_program()` and pass the absolute path. If the effective PATH is absent or empty, raise `NOT_FOUND` with "PATH is not set" before spawning. | [S] `SRC/src/command.rs#L3113-L3121`, `#L3856`, `#L4131-L4146`, `#L4332-L4363`; [D] `docs/commands.md#L44-L50`; [M] E4 |
| C-SPAWN-02 | Args byte-identical incl. `.cmd/.bat`; unsafe batch arg → `INVALID_ARGUMENT`, nothing runs; no metachar interpretation | `Command::arg/args` (no shell [D]). Pipes go through tokio→std, which escapes batch files (BatBadBut) and returns `InvalidInput` [S] | **U** | **Pipes:** OK. The adapter maps a `Spawn` error whose source is `InvalidInput` to `INVALID_ARGUMENT`. **PTY on Windows:** the ConPTY path calls raw `CreateProcessW(NULL, cmdline)` with its own MSVCRT quoting and has no batch handling. A resolved `npm.cmd` therefore runs through the implicit `cmd.exe` with **unescaped** `& \| % ^`. **Interim adapter step:** refuse `.cmd/.bat` + PTY on Windows when any arg contains a cmd metacharacter. That is conservative and refuses some valid input. **Upstream:** F3. Code reading only; not run on Windows. | [S] `SRC/src/sys/pty/windows.rs#L375-L428`, `#L878-L890`; [S] `SRC/src/command.rs#L3104-L3111` |
| C-SPAWN-03 | Relative program with separator resolves against `cwd`; relative `cwd` against host cwd; same on 3 OS | `Command::current_dir`, `Command::new` | **A** | Upstream hands the program to the OS verbatim and documents that Windows may resolve `./tool` against the parent's directory. **Adapter:** make `cwd` absolute against the host cwd, and make a separator-containing program absolute against `cwd`, before calling `Command::new`. | [D] `docs/commands.md#L44-L50`; [D] `docs/troubleshooting.md#L97-L99` |
| C-ERR-01 | `NOT_FOUND` / `NOT_EXECUTABLE` / `INVALID_CWD`, messages name the value and the fix, same text in all languages | `Error::kind()` → `ErrorKind::{NotFound, PermissionDenied, Spawn}`, `ErrorReason::NotFound{searched}` | **A** | Measured [M]: missing → `NotFound`; no exec bit → `PermissionDenied`; bad cwd → `Spawn` with only the text "working directory does not exist". **Adapter:** validate cwd itself (exists, is a directory) → `INVALID_CWD`; map the kinds; own the message catalog. | [D] `docs/errors.md#L133-L160`; [M] E4 |
| C-ERR-02 | Invalid durations, PTY size, limits or NUL bytes → `INVALID_ARGUMENT` naming the field, before any process | — (upstream rejects a zero PTY size as `Io(InvalidInput)`; std rejects NUL at spawn) | **A** | Pure adapter validation in the Rust convert layer. Also cap ConPTY axes at 32767 ourselves so the error names the field. | [D] `docs/troubleshooting.md#L186-L194` |
| C-ENV-01 | `env` merges, `null` removes, clean env (+ OS-required vars on Windows), `PATH`/`Path` case-insensitive, non-ASCII | `Command::env`, `env_remove`, `env_clear`, `inherit_env` | **A** | Merge, remove and case-insensitive keys work as-is [S]. `env_clear` gives a truly empty Windows block: there is no `SystemRoot` handling anywhere in the source [S]. **Adapter:** on `inheritEnv:false`, add the documented Windows-required set (`SystemRoot`, `windir`, …). | [S] `SRC/src/command.rs#L3999-L4007`; [D] `docs/commands.md#L190-L222` |
| C-IO-01 | Separate live stdout/stderr; UTF-8 split across chunks decodes; invalid → U+FFFD; bytes mode exact | `Command::stdout_raw_tee` / `stderr_raw_tee(impl AsyncWrite)` | **A** | Raw tees deliver exact chunks as soon as they are read. Measured: `[97,255]` at 7 ms, `[98]` at 1.01 s [M]. Upstream decoding is per line, so it cannot produce our chunk events. **Adapter:** our own `AsyncWrite` sink per stream plus a streaming UTF-8 decoder for `encoding:"utf8"`. | [D] `docs/streaming.md#L212-L261`; [M] E9 |
| C-IO-02 | Child never blocks on unread output; ≤1 MiB/stream, rest dropped and counted (`droppedBytes`); `wait()` with 50 MB unread completes; attached slow consumer gets backpressure **without loss** | Pumps always drain [D]; tee writes are awaited, so they backpressure [D] | **U** | The 1 MiB ring, `droppedBytes` and detach are our sink's job (A). **Blocker:** after the root exits, upstream aborts pumps after a fixed 5 s. A slow attached consumer then loses the tail silently: 24,576 of 60,000 bytes, and `drain()` returns `Ok(Exited(0))` [M]. **Upstream:** F1. | [S] `SRC/src/running/mod.rs#L45-L47`, `#L3807-L3820`; [D] `docs/commands.md#L466-L470`; [M] slow-sink |
| C-IO-03 | `write`/`end` exact bytes and EOF; write after exit or close → `CLOSED`; pending writes settle | `RunningProcess::take_stdin` → `ProcessStdin::{write, finish}`; `Command::keep_stdin_open` | **A** | Exact bytes and EOF work as-is. A write after exit returns an `io::Error`: `EIO` on a Unix PTY [M], `BrokenPipe` on pipes [D]. **Adapter:** map these to `CLOSED`. Settling of pending writes on ConPTY: **[?]**. | [DOCS/struct.ProcessStdin.html]; [M] E12 |
| C-IO-04 | Nothing written before exit is lost; root exits while a descendant holds the pipe → `wait()` resolves at root exit, `run()` returns within `graceMs` and kills the rest | `RunningProcess::wait/drain/output_*` + kill-on-drop | **U** | Upstream does not hang (good). But `wait()` and `output_string()` both take **5.0 s**, not `graceMs`, and exit cannot be observed apart from pump teardown [M]. The leftover tree is killed on drop [M]. **Upstream:** F1. **Fallback (A):** own the pipes via `to_tokio_command` + `ProcessGroup::spawn` (loses Windows CTRL_BREAK). | [S] `SRC/src/running/mod.rs#L1677-L1683`; [D] `docs/troubleshooting.md#L213-L216`; [M] E3 |
| C-RUN-01 | exitCode/stdout/stderr/success/reason; `input` fed then closed; stdin closed by default; non-zero never throws; > `maxOutputBytes` (16 MiB) → head kept, `truncated` | `Command::output_bytes/output_string` (non-zero = data), `Stdin::from_bytes`, default stdin closed | **A** | stdin and non-throwing behaviour work as-is [D]. `OutputBufferPolicy` is line-granular and defaults to unbounded: a 20 MiB single line would be dropped whole, not cut at the head [D][S]. **Adapter:** byte capture through raw tees with a head-keeping cap and a `truncated` flag; set `output_buffer(bounded(0))` so data is not stored twice. | [D] `docs/commands.md#L226-L228`, `#L412-L418`; [S] `SRC/src/buffer.rs#L433-L436` |
| C-KILL-01 | `kill()` ends child, grandchildren and great-grandchildren, also after the root has exited; no-op once the tree is gone | `ProcessGroup::stop(grace, true)`, `kill_all`, drop | **Y** | Measured [M]: root exited first, then `stop` killed the great-grandchild (`members_before=1`), and a second `stop` was a 14 µs no-op. Job Object and cgroup cover the whole tree [D]. Limit: descendants that call setpgid/setsid escape on macOS and the Linux pgroup fallback (see C-KILL-03, C-PTY-04). | [S] `SRC/src/sys/pgroup.rs#L668-L700`; [D] `docs/process-groups.md#L156-L161`; [M] rootgone |
| C-KILL-02 | Graceful first; a cooperative child cleans up; one that ignores it is forced after `graceMs` (per-OS tier) | `ProcessGroup::stop(grace, true)` → `ShutdownReport`; `Command::windows_graceful_ctrl_break` | **A** | Unix [M]: cooperative child drained in 20 ms (Signalled 15); one ignoring TERM escalated at 2.000 s (Signalled 9). **Windows:** only `WM_CLOSE` to windowed members, or `CTRL_BREAK` to the direct child if we opt in; otherwise an atomic Job kill [D]. **Adapter:** set `windows_graceful_ctrl_break()` on non-PTY spawns (it needs a shared console). **Do not** set it with PTY: `CREATE_NEW_PROCESS_GROUP` disables Ctrl+C. | [D] `docs/platform-support.md#L155`, `#L201-L216`; [S] `SRC/src/sys/pty/windows.rs#L850-L853`; [M] E5 |
| C-KILL-03 | A descendant that escapes (setsid / job breakaway) behaves as GUARANTEES declares per OS | Mechanism report: `ProcessGroup::mechanism()`, `host_containment()` | **X** | Windows: the Job has only `KILL_ON_JOB_CLOSE`, so breakaway is refused and the descendant stays contained [S][D]. Linux cgroup: contained [D]. **macOS and Linux pgroup fallback:** a setsid escapee survives drop [M macOS; D Linux]. Not containable there; declare it. | [D] `docs/platform-support.md#L151-L154`, `#L451-L460`; [S] `SRC/src/sys/windows.rs#L491`; [M] E8 |
| C-EXIT-01 | 0/1/42/255 and Windows >255 as the same non-negative integer; `reason` precedence (first event wins) | `Outcome::{Exited(i32), Signalled(Option<i32>), TimedOut, InactivityTimedOut}` | **A** | 0/1/42/255 work as-is [M]. On Windows `Exited` is a signed `i32` (`0xC000013A` → −1073741510) and a kill shows up as `Exited(1)` [D]. **Adapter:** cast to `u32`; own the `reason` latch (killed / timeout / aborted come from *our* actions). Upstream "cancel wins over timeout" conflicts with our rule [D]. | [D] `docs/platform-support.md#L413-L423`; [D] `docs/timeouts-and-cancellation.md#L384-L388`; [M] E7 |
| C-SCOPE-01 | Leaving scope kills the tree (TS `await using`) | Drop of `RunningProcess` / `ProcessGroup` = immediate hard kill | **A** | TS `[Symbol.asyncDispose]` calls our graceful `kill()`. The Rust drop stays as the hard safety net. | [D] `docs/process-groups.md#L156-L161`, `#L186-L188` |
| C-TMO-01 | timeout kills the whole tree, reason `timeout`, returns within timeout + grace + 1 s | `Command::timeout` + `timeout_grace` (own group) | **A** | Upstream timeout kills the whole tree only for an own-group handle. On a shared-group handle, which we need for concurrent kill, it reaches only the direct child [D]. **Adapter:** run the timer ourselves and call `group.stop(graceMs, true)`. Caveat [M]: if a macOS escapee holds the pipe, the extra 5 s drain breaks "+1 s". | [D] `docs/timeouts-and-cancellation.md#L23-L69`; [D] `docs/troubleshooting.md#L213-L216` |
| C-TMO-02 | AbortSignal kills the tree, reason `aborted`; already-aborted → nothing runs (`ABORTED`) | `Command::cancel_on(CancellationToken)`, `cancel_grace` | **A** | The pre-cancelled short-circuit (no spawn) works as-is [D]. Mid-run cancel returns `Err(Cancelled)` with no outcome and no captured output [M]. **Adapter:** check `signal.aborted` before spawning; on abort, latch `aborted` and call `group.stop(graceMs)`; return partial output from our tees. | [D] `docs/timeouts-and-cancellation.md#L263-L278`; [M] E5c |
| C-HOST-01 | Rust host: main return, `process::exit`, panic, SIGINT/SIGTERM, hard kill per GUARANTEES | Drop; `Command::kill_on_parent_death` + `kill_on_parent_death_scope()` | **X** | Measured on macOS [M]: return and unwinding panic → tree killed. `exit`, `abort`, default SIGINT/SIGTERM, SIGKILL and SIGKILL with pdeathsig → **child and grandchild both survive**. By design [D]: Windows `WholeTree`, Linux `DirectChildOnly` (PDEATHSIG, thread-scoped), macOS `Unsupported`. After the pivot this is processkit's guarantee, not ours. | [D] `docs/platform-support.md#L462-L480`; [D] `docs/troubleshooting.md#L72-L77`; [M] host-death |
| C-PTY-01 | Child sees the requested size; `resize` works; bad size / non-PTY → `INVALID_ARGUMENT`; resize after close → `CLOSED` | `Command::use_pty`, `pty_size`; `RunningProcess::resize_pty(&mut self)` | **A** | Size and `SIGWINCH` work (upstream tests pass [M]). Upstream returns `Unsupported` for both "non-PTY" and "exited" [M]. **Adapter:** validate size ourselves; map non-PTY → `INVALID_ARGUMENT` and exited → `CLOSED` from our own state. `resize_pty(&mut self)` cannot run while a consuming `wait` is pending. Workaround: an actor loop that selects on commands and on `wait_for(\|\| async{false}, …)`, which returns `NotReady` on exit with 50 ms polling [S]. Clean fix: F4. | [D] `docs/streaming.md#L508-L563`; [S] `SRC/src/running/probes.rs#L36`; [M] E12b |
| C-PTY-02 | Prompt → typed answer → reply works; `\x03` interrupts the foreground program on 3 OS | `use_pty` + `keep_stdin_open` + `ProcessStdin::write`; `wait_for_output` | **A** | Unix [M]: `\x03` → `Signalled(2)` in 0.4 ms. ISIG is kept and the controlling tty is set via setsid + TIOCSCTTY [S]. Unix echo is **forced off** while ConPTY echoes, which differs from a real terminal and between OSes (UX-E, F6). **Windows:** `\x03` is **[?]**. Adapter rule: never combine PTY with `windows_graceful_ctrl_break`. | [S] `SRC/src/sys/pty/unix.rs#L136`, `#L486`; [D] `docs/streaming.md#L483-L489`; [M] E12 |
| C-PTY-03 | PTY output UTF-8 safe, nothing printed before exit lost, stream ends when the child exits (incl. ConPTY) | Raw tee on the merged logical stdout; ConPTY closes after exit + 100 ms quiescence | **A** | ConPTY EOF is handled: wait, then quiesce, then `ClosePseudoConsole` [S]. Adapter decodes UTF-8. Two upstream limits remain. First, the 5 s pump bound applies when a background job holds the slave open (F1). Second, the ConPTY tail relies on a 100 ms quiescence heuristic (**[?]** under load). | [S] `SRC/src/sys/pty/windows.rs#L97-L103`, `#L212-L253` |
| C-PTY-04 | `kill()` on a PTY process ends its whole tree on 3 OS | Same group machinery (`use_pty` keeps containment [D]) | **A** | Windows Job and Linux cgroup cover it [D]. **macOS [M]:** background jobs of `bash -i` and `zsh -i` (own process groups under job control) **survive both `stop()` and drop**. They also survive host SIGKILL with a PTY child [M]. **Adapter:** on the pgroup backends, at kill time also sweep every process whose controlling tty or session is the PTY's: `proc_listpids(PROC_TTY_ONLY)` on macOS, `/proc/*/stat` session/tty on Linux. Feasible, not prototyped. **Upstream:** F2. | [D] `docs/platform-support.md#L343`, `#L351`; [M] ptyjobs, hostpty |
| C-TS-01 | TS idioms; a live Child keeps the event loop alive; GC never kills; normal end / `process.exit()` / uncaught / SIGINT / SIGTERM / hard kill per GUARANTEES on Node, Bun, Deno | Futures and handles are `Send + 'static` [M]; Drop works with no runtime [M] | **A** | processkit is opposite to "GC never kills": Drop kills [D]. **Adapter:** <br>1. Keep `RunningProcess` + `Arc<ProcessGroup>` in a Rust registry until exit; the JS object holds an id. <br>2. Keep a ref'd ThreadsafeFunction alive until exit. <br>3. A `process.on('exit')` hook calls a sync native `killAll()` (`ProcessGroup::kill_all` is sync [S]). <br>4. A signal-exit-style SIGINT/SIGTERM/SIGHUP hook kills, then re-raises. <br>5. On Linux, set `kill_on_parent_death`. <br>**Hard kill:** Windows is whole-tree; macOS/Linux are not without a watchdog sidecar (sub-case X). Plus the macOS SIGCHLD hazard (§D). | [S] `SRC/src/running/mod.rs#L3396`; [S] `SRC/src/group.rs#L682`; [M] E1, E2 |

---

## B. Defaults ("Defaults seguros")

| Our default | processkit default | Same? | Can the adapter set it per call? |
|---|---|---|---|
| `run()` gives stdin closed (EOF, no hang) | Stdin closed at spawn [D `docs/commands.md#L226-L228`] | **Same** | — |
| `env` merges over the inherited env | Inherit, then `env`/`env_remove` on top [D `docs/commands.md#L190-L222`] | **Same** | `null` → `env_remove` |
| Program lookup uses the child's final PATH | Only partly. Non-`.exe` PATHEXT hits and `prefer_local` use the effective child PATH; a `.exe` is left to the OS search order [S]; a removed PATH falls back to libc's default path [M] | **No** | **Yes:** `resolve_program()` → absolute path; refuse an absent PATH ourselves |
| `kill()` always kills the tree, graceful first, forced after `graceMs` (2000) | `start_kill`/drop = hard kill. The graceful ladder is `RunningProcess::shutdown(grace)` / `ProcessGroup::stop(grace, true)`. Group grace defaults to **2 s** [S `SRC/src/group.rs#L56`]. Windows is atomic unless `WM_CLOSE` or `windows_graceful_ctrl_break` | Partly | **Yes:** `stop(graceMs, true)` + `windows_graceful_ctrl_break()` (non-PTY) |
| timeout / abort kill gracefully (same ladder) | Hard kill by default; `timeout_grace` / `cancel_grace` are opt-in [D `docs/timeouts-and-cancellation.md#L120-L127`, `#L331-L333`] | **No** | **Yes** (we run our own timers + `stop(graceMs)`) |
| Leaving scope kills the tree | Drop = immediate hard kill (no grace) | Partly | **Yes:** `asyncDispose` → graceful `kill()`; drop stays the hard backstop |
| GC never kills a live process | Dropping the handle or group kills it (by design) | **Opposite** | **Yes:** a Rust-side registry owns the handles, not the JS finalizer |
| Host exit kills leftovers, orphaned grandchildren included | Only through `Drop`. Abrupt death: Windows whole tree; Linux direct child (opt-in); macOS nothing [D][M] | **No** | Partly: exit and signal hooks plus `kill_on_parent_death`; SIGKILL on Unix needs a sidecar |
| A live Child keeps the TS event loop alive | n/a (Rust) | — | Adapter (napi ref) |
| Unread output ≤1 MiB/stream, rest dropped and counted, child never blocks | Child never blocks (pumps always drain) [D]; retention defaults to **unbounded** [S `SRC/src/buffer.rs#L433-L436`]; no dropped-byte counter | Partly | **Yes:** our raw-tee sink; `output_buffer(bounded(0))` |
| Root exits but a descendant holds the pipe → `run()` returns within `graceMs` and kills the rest | Fixed 5 s (`PUMP_TEARDOWN`), then kill-on-drop [S][M] | **No** | **No.** Hard-coded; needs F1 or the raw-spawn fallback |
| Never a shell | No shell [D `docs/commands.md#L39-L42`]. Batch files on pipes go through std's escaped `cmd.exe`. ConPTY + `.cmd` goes through an **unescaped** implicit `cmd.exe` [S] | Partly | Interim refusal in the adapter; real fix is F3 |

---

## C. KPI view: what processkit guarantees per OS

Mechanism, from `ProcessGroup::mechanism()`:
- **Windows** → JobObject.
- **Linux** → CgroupV2 only when this process can write its cgroup subtree. Upstream itself says
  "Dev boxes typically lack it → the pgroup fallback" [D `docs/platform-support.md#L425-L433`].
  Typical cases: an SSH session scope (root-owned) or a plain Docker container. Which one a given
  Linux user gets is **environment-dependent [?]**; we should report `host_containment()` in
  diagnostics.
- **macOS** → ProcessGroup. Measured `mechanism=ProcessGroup`, `parent_death_scope=Unsupported` [M].

### K1 — orphans

| Situation | Windows (Job) | Linux cgroup | Linux pgroup fallback | macOS (pgroup) |
|---|---|---|---|---|
| Host ends normally (Drop runs) | ✓ [D] | ✓ [D] | ✓ [D] | ✓ [M] |
| Host panics (unwind) | ✓ | ✓ | ✓ | ✓ [M] |
| `process::exit` / `abort` / crash (no Drop) | ✓ Job closes with the process [D] | direct child only, with `kill_on_parent_death` [D] | same | ✗ child and grandchild survive [M] |
| SIGINT / SIGTERM with default disposition | ✓ | direct child only | direct child only | ✗ [M] |
| SIGKILL | ✓ [D] | direct child only; PDEATHSIG is thread-scoped [D `#L462-L470`] | same | ✗ (also with pdeathsig, a no-op) [M] |
| Descendant calls `setsid` (escape) | ✓ contained [D] | ✓ contained [D] | ✗ escapes [D] | ✗ escapes [M] |
| Descendant changes process group (job-control shell under PTY) | ✓ (Job) [D] | ✓ (cgroup) [D] | ✗ by mechanism [?] | ✗ survives `stop` and drop [M] |
| PTY child, host SIGKILL | ✓ | direct child only | — | ✗ foreground and background jobs survive; no hang-up reached them [M] |
| Breakaway (`CREATE_BREAKAWAY_FROM_JOB`) | ✓ refused: no `BREAKAWAY_OK` [S] | n/a | n/a | n/a |

Upstream's stance on abrupt owner death: there is no portable Unix primitive. A reattach-by-identity
feature was declined. The documented remedy is "keep an external owner (subreaper / systemd scope)"
[D `ROADMAP.md#L225-L234` on main].

**What the adapter can add:**
- An exit hook plus signal chaining (covers `process.exit`, uncaught exceptions, SIGINT/SIGTERM).
- A PTY tty/session sweep.
- An optional watchdog sidecar for SIGKILL: a helper holding a pipe that kills the recorded
  pgids/cgroup on EOF.

### K2 — hangs

What upstream guarantees:
- No hang from a leaked pipe; the 5 s bound applies [S][M].
- stdin is closed by default [D].
- If a teardown cannot be confirmed, you get an error (`ErrorReason::Teardown`, since 3.3.4) rather
  than a hang or a false success [D].

Risks we found:
- **macOS SIGCHLD ownership.** tokio reaps children on macOS through a SIGCHLD handler, chained by
  signal-hook-registry. On Linux it uses pidfd and is not affected [S, tokio 1.53.1
  `process/unix/mod.rs`]. If a **non-chaining** SIGCHLD handler is installed *after* our first
  spawn, the next processkit wait **hangs**. We simulated libuv-style registration and measured a
  5 s timeout; the control runs completed in 0.21 s [M]. libuv (Node) installs such a handler when
  `child_process` first spawns. Whether Node / Bun / Deno actually trigger this: **[?] — must be in
  spike S3.**
- A full-duplex write while nothing reads (the adapter must always pump) [D
  `docs/troubleshooting.md#L206-L208`].
- A cgroup frozen by `suspend` (we do not use it).

### K3 — stop latency (target ≤ `graceMs` + 500 ms)

| Case | macOS, measured [M] | Windows | Linux |
|---|---|---|---|
| `stop(2s)`, child handles TERM | 20.6 ms | atomic kill unless soft tier [D] | [?] |
| `stop(2s)`, child ignores TERM | 2.000 s | atomic kill unless soft tier [D] | [?] |
| `stop(2s)`, root gone, descendant ignores TERM | 2.10 s | — | — |
| `shutdown(1s)`, child ignores TERM | 1.002 s | — | — |

All macOS measurements meet the target. Exception: if "stop" means "`wait()` resolved" and an
escapee holds the pipe, add the 5 s drain.

### K5 — output loss

What upstream guarantees:
- Raw tees are byte-exact and live [D][M].
- Pumps always drain [D].

Loss paths:
1. **A slow attached consumer, after the root exits, is cut at 5 s with no error or flag [M]** (F1).
2. A leaked pipe is cut at 5 s (documented) [D].
3. The ConPTY final frame relies on a 100 ms quiescence wait **[?]**.
4. Line-granular capture drops an oversized line whole [D]. Avoided by our byte capture.

---

## D. Binding fit (napi-rs; Node / Bun / Deno)

- **Send + 'static: OK [M].** A compile check passes for the futures of `Command::start`,
  `Command::output_bytes`, `RunningProcess::finish`, `RunningProcess::shutdown`,
  `ProcessGroup::stop` and `ProcessGroup::start`.
- **Marker traits [S `public-api.txt#L1624-L1625`, `#L1696-L1697`, `#L1496-L1497`]:**
  - `RunningProcess`, `ProcessGroup`, `Command` and `ProcessStdin` are `Send`; `RunningProcess` and
    `ProcessStdin` are also `Sync`.
  - `StdoutLines` and `ProcessEvents` are `Send` but **not `Sync`**. We do not need them.
- **Handle shape.** `wait`, `finish`, `drain`, `shutdown` and `output_*` take `self`. `resize_pty`
  and `start_kill` take `&mut self` [S `public-api.txt#L1583-L1607`]. So the adapter must use
  **path P**:
  - one actor task per child that owns `RunningProcess`, with raw tees as the I/O;
  - a per-child `Arc<ProcessGroup>`, so `stop()` can be called from another task while the actor
    awaits `drain()`;
  - for PTY resize, either the `wait_for` liveness loop or F4.

  A shared group + PTY works [M]. Note that on a shared-group handle, upstream's own timeout and
  cancel reach only the direct child [D], so we run our own timers.
- **tokio runtime ownership.**
  - processkit needs a current tokio runtime for `start()` and its internal tasks (pumps, stdin
    writer, watchdogs). It needs the `process`, `time`, `io-util`, `rt`, `sync`, `fs` and `net`
    features [S `Cargo.toml`]. napi-rs's `tokio_rt` multi-thread runtime with `enable_all` fits.
  - The precedent: processkit-py owns exactly one runtime via `pyo3-async-runtimes` and adds a
    fork guard.
  - At env teardown we must run `killAll()` *before* the runtime shuts down.
- **Drop semantics: OK [M].** Dropping a `RunningProcess` on a thread with no runtime does not panic
  and kills the tree. The no-runtime path is explicitly handled [S `SRC/src/running/mod.rs#L3396`].
  Drop is always a *hard* kill, which is why the registry owns the handles (GC safety).
- **Cancellation.** `CancellationToken` (`tokio-util`) is re-exported. We barely use it: only the
  "already aborted" fast path. Abort, kill and timeout go through `group.stop` so we keep control of
  precedence and outcome.
- **Feature flags we need.**
  - Need: `pty` and the default `process-control` (`stop`/`ShutdownReport` require it).
  - Avoid: `stats`/`limits`. `limits` has the open bug #39.
  - Not needed: `tracing`, `json`, `record`, `mock`, `metrics`.
  - Dependency set is lean: 30 crates on macOS — tokio, tokio-util, tokio-stream, encoding_rs,
    async-trait, thiserror, libc, windows-sys [M `cargo tree`].
- **MSRV:** `rust-version = "1.88"`, edition 2024 — identical to ours [S `Cargo.toml#L64`].
- **Bun/Deno.** Nothing in processkit is Node-specific; it is plain Node-API plus tokio inside the
  addon. Open questions, all **[?] for S3**:
  - which exit and cleanup hooks Bun and Deno honour;
  - Deno's permission flags for loading native addons;
  - SIGCHLD ownership in each runtime (see K2).
- **Linux PDEATHSIG.** It is thread-scoped. Spawns happen on tokio worker threads, which live for the
  whole runtime, not on retiring blocking threads [S]. Low risk; to be verified on Linux.
- **Windows host side effect.** In a *headless* host, a ConPTY spawn briefly sets the host's std
  handles to null via `SetStdHandle` under a global spawn lock [S
  `SRC/src/sys/pty/windows.rs#L866-L874`]. **[?]** whether that affects a GUI or service Node host.

---

## E. Health and risk

**Release cadence.**
- 55 versions on crates.io between 2026-05-31 and 2026-08-22, about 4.6 a week [crates.io API].
- 3 were yanked: 0.6.2 (0.7.0 published under a patch number), 1.3.0 (breaking changes under a
  minor), 2.0.0 (published by mistake) [D `docs/upgrading.md#L501-L502`; `CHANGELOG.md#L3106-L3115`].
- **14 SemVer-incompatible lines** (0.1–0.11, 1, 2, 3) in 12 weeks. The CHANGELOG has 42
  "**Breaking**" bullets across 10 releases, three of them in 0.x patch releases.
- Majors since 1.0: two (2.x on 07-06, 3.0 on 07-25). 3.x has been stable for about 10 weeks.
- 3.x still had behaviour changes the compiler cannot catch: 3.2.0, 3.3.1, and 3.3.4, where
  `ErrorReason::Teardown` replaced `Timeout`/`Cancelled` when teardown cannot be confirmed [D
  `docs/upgrading.md`, `CHANGELOG.md#L23-L65`].
- No release since 08-22 (40 days), while `main` gathered 92 commits.
- A **v4 "runtime-neutral" breaking redesign** is planned, estimated at roughly 15–27 weeks. Its
  delivery order for PTY/ConPTY is still undecided, i.e. PTY could land after 4.0 [D
  `docs/runtime-neutral-v4-roadmap.md#L509-L627`, `#L713-L716` on main].

**Maintainers.**
- One crates.io owner (ZelAnton).
- Git authors: Anton Zhelezniakou 959, `Test <test@test.com>` 201 (automation identity, July
  bursts), dependabot 28, Techcable 3 (2 merged PRs).
- Activity is bursty: 62 commits on 09-02, quiet since 09-08.
- 42 stars, 3 forks. 13 reverse dependencies: 11 of them are the maintainer's own `vcs-*` crates,
  plus processkit-cli and cargo-port.
- Issues: #39 (open 15 days) and #26 (since 07-24) have no maintainer reply. External PR #41 is
  awaiting CI approval.
- The maintainer also ships sibling ports (py, Go, Kotlin, F#). An npm binding is **not** on the
  "What's next" list [D `docs/whats-next.md`].

**Tests and CI.**
- CI test matrix: ubuntu x64, ubuntu arm64, windows x64, windows arm64, macos-latest (arm64), musl
  Alpine container, FreeBSD 14.4 VM. Also MSRV 1.88, loom, fuzz, coverage, public-api diff,
  semver-checks (informational) [S `.github/workflows/ci.yml#L43`, `#L105`].
- **darwin-x64 is not tested upstream.** We ran it: 244/244 integration tests pass [M].
- The last three dependabot PRs fail only on the `public-api diff` job [gh].

**Open bugs touching our promises.**
- None filed upstream. #39 is about `limits` only, so it does not affect us.
- We found six, all unfiled: silent tail loss (F1), PTY job-control orphans on pgroup backends (F2),
  unescaped ConPTY batch files (F3), PATH-absent divergence (F5), forced Unix PTY echo-off (F6),
  macOS SIGCHLD fragility (F8).

**License.** MIT. Compatible with our MIT OR Apache-2.0. Our `.node` binaries statically link it,
so we must ship its notice in the third-party notices.

| Risk | Mitigation |
|---|---|
| R1 Bus factor 1 (single owner, bursty, unanswered issues) | Pin `=3.3.4` and commit the lockfile. Keep a ready mirror (MIT, forkable). Contribute F1–F6 as PRs. Ask for co-ownership of the npm package as part of the binding proposal. Last resort, fork only `src/sys/**` plus `running/`: about 20k of 86k src lines. |
| R2 Churn and the v4 redesign | Exact pin. Upgrade deliberately by diffing `public-api.txt` between versions (processkit-py's documented practice). Our contract suite gates every bump. Engage early in the v4 decision "post-v4 delivery order for PTY" so PTY stays in the baseline. |
| R3 macOS / pgroup containment gaps (gap 1) | Adapter PTY tty sweep, exit and signal hooks, optional sidecar. Declare the per-OS tiers honestly in GUARANTEES. Upstream F2 and F7. |
| R4 Fixed 5 s drain and silent loss (gap 2) | Upstream F1 first. Fallback: raw-spawn path for pipes on Unix. |
| R5 Binding hazards: macOS SIGCHLD, runtime teardown order, Windows headless ConPTY handles | Put each one in spike S3 with a reproducer. F8 upstream, or a documented install-order workaround. |
| R6 darwin-x64 not covered upstream | Run upstream's suite plus our contract suite on an Intel macOS runner in our CI. |

---

## F. Upstream list (ordered by importance)

1. **F1 — Progress-aware post-exit drain.** Make the post-exit pump bound (`PUMP_TEARDOWN`, 5 s)
   configurable per command and based on inactivity, not absolute time. Report a cut-off in the
   result (`truncated`/`Teardown`) instead of returning `Ok` after silently dropping a slow
   consumer's tail.
2. **F2 — Session-aware PTY teardown on pgroup backends.** On the process-group backends, tear down a
   `use_pty` child by session or controlling tty, not only by pgid. Otherwise the jobs of an
   interactive shell orphan on macOS and the Linux fallback. Until then, document that
   "containment unchanged" does not hold there.
3. **F3 — Batch-file escaping in the ConPTY path.** Route `.cmd`/`.bat` through `cmd.exe` with
   std-equivalent (BatBadBut) escaping, or refuse with `InvalidInput`, in the Windows ConPTY
   `CreateProcessW` path, matching the pipe path's safety.
4. **F4 — A control surface for bindings.** Add a non-consuming control handle on `RunningProcess`:
   an `exited()`/`wait(&mut self)` future plus a cloneable control (`pid`, `resize_pty`,
   `start_kill`, `shutdown(grace)`) usable while another task awaits exit. Also let
   `ErrorReason::Cancelled` carry the observed `Outcome` and captured prefix.
5. **F5 — Fail closed when the child PATH is absent.** When the effective child PATH is absent, fail
   `NotFound` at spawn, as `resolve_program` already reports, instead of falling back to libc's
   default path. Optionally offer strict resolution of `.exe` against the child PATH.
6. **F6 — PTY echo opt-in.** Make Unix PTY echo-off opt-in (e.g. `pty_echo(bool)`), so the default
   behaves like a real terminal and matches ConPTY.
7. **F7 — Hook for abrupt owner death.** Expose a read-only teardown identity (pgids / cgroup path)
   or an opt-in owner-death watchdog, so a binding can make abrupt host death whole-tree on Unix.
   Framed as opt-in, given the earlier reattach decision.
8. **F8 — Exit observation without SIGCHLD on macOS.** Observe exit on macOS/BSD via kqueue
   `EVFILT_PROC` instead of relying on a process-wide SIGCHLD handler (fragile inside Node), or
   document the install-order hazard.
9. **F9 — Official npm binding** (draft below).

**Draft first message to the maintainer (not sent):**

> Hi Anton — thanks for processkit; the Job Object / cgroup / ConPTY work is exactly the layer we
> didn't want to rewrite. We're building hugr-omni, an idiomatic TypeScript process/terminal library
> for Node, Bun and Deno, and we'd like to build it on processkit through napi-rs, in the same spirit
> as processkit-py, ideally as an *official* npm binding: either `bindings/node` in ProcessKit-rs
> or a sibling `processkit-node` repo, whichever you prefer, MIT, with us doing the build and
> release plumbing for the five prebuilt targets and maintaining it alongside you. While mapping our
> contract onto 3.3.4 we ran your suite on darwin-x64 (all 244 integration tests pass, a target
> your CI doesn't cover) and found a handful of things we'd like to send as small, separate PRs with
> reproducers:
> - a configurable, progress-aware post-exit drain instead of the fixed 5 s;
> - session-aware teardown for PTY children on the process-group backends;
> - batch-file escaping in the ConPTY spawn path;
> - a non-consuming control handle that would make any binding simpler.
>
> Would you be open to that, and is there anything about scope, naming or repo layout you'd want
> settled before we start?

---

## Appendix — what we ran ([M] items)

All runs: darwin-x64 (macOS 15.3.2), rustc 1.98.0, processkit at tag `v3.3.4`, features `pty`,
`process-control`. Throwaway probe code lived in the session scratchpad; none is in this repo.

- **Upstream suite.** `cargo test --features pty,process-control --test integration --
  --include-ignored` → **244 passed, 0 failed, 0 ignored** (11 `pty::` tests, 2 `parent_death::`).
- **E1.** Compile-time `Send + 'static` asserts on the futures listed in §D → OK.
- **E2.** Drop of a `RunningProcess` on a thread with no runtime → no panic; child dead.
- **E3.** `sh -c 'sleep 30 & echo $!; …'` → `output_string` 5.012 s, `wait` 5.008 s; grandchild dead
  after drop.
- **E4.** Program resolution:
  - `env_remove(PATH)` + `ls` → **ran (Exited 0)**, while `resolve_program` → NotFound.
  - `env("PATH","")` → NotFound "`ls` not found on PATH".
  - File without exec bit → PermissionDenied.
  - Bad cwd → Spawn "working directory does not exist".
- **E5 / E5b / E5c.** Kill and cancel:
  - Shared-group `stop(2s)`: cooperative child 20.6 ms → Signalled 15; TERM-ignorer 2.000 s →
    Signalled 9.
  - `shutdown(1s)` on a TERM-ignorer 1.002 s.
  - `cancel_on` + `cancel_grace` → `Err(Cancelled)` with no outcome or output.
- **E7.** Exit 0/1/42/255 → `Exited(n)`.
- **E8.** A setsid escapee (fork, setsid, exec sleep; drop after 500 ms) is **alive** after an
  own-group drop.
- **E9.** Raw tee chunks `[(7.5 ms,[97,255]), (1.01 s,[98])]`.
- **E12 / E12b.** PTY `sleep 30` + `\x03` → `Signalled(2)` in 0.4 ms; write after exit → `EIO`;
  `resize_pty` after exit → `Unsupported`.
- **host-death.** Host starts `sh -c 'sleep 300 & …; exec sleep 300'` then:
  - return or panic → both dead;
  - exit, sigint, sigterm, abort, sigkill, sigkill+pdeath → **both alive**.
- **rootgone.** Root exits; a TERM-ignoring great-grandchild is killed by `stop(2s)` in 2.10 s; a
  second `stop` takes 14 µs.
- **slow-sink.** 60,000 B, child exits at once, sink takes 1 KiB per 200 ms → `drain()` =
  `Ok(Exited(0))` after 5.03 s with **24,576 / 60,000 B delivered**.
- **ptyjobs.** `bash -i` / `zsh -i` under PTY in a shared group, `sleep 301 &` → bg job alive after
  `stop(500ms)` (escalated) and after drop.
- **hostpty.** Host with PTY child `sh -c 'sleep 302 & …; exec sleep 303'` is SIGKILLed → both
  alive.
- **sigchld.** Install a non-chaining SIGCHLD handler after tokio's: next `output_string` **hangs**
  (5 s timeout). Installed before tokio, or not at all: completes in 0.21 s.
