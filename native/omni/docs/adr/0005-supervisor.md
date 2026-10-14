# ADR-0005 — A supervisor process owns every managed child

Status: **ACCEPTED** (2026-10-02, tech lead). Validated by spike S5 (asserting tests on Linux, macOS, Windows 11
and Server 2022; Codex review *accept_with_changes*, `docs/research/supervisor-review.md`). Supersedes the in-host
parts of ADR-0001, ADR-0002 and ADR-0003.

## Context

Independent Codex reviews rejected ADR-0001/0002 and ADR-0003 as product baselines
(`docs/research/adr-reviews-s1-s2.md`). Their must-fix findings share one root cause: process lifecycle work
running **inside the host** (Node/Bun/Deno/Python) cannot be made safe:

- forking the multi-threaded host without exec (watchdog) has no async-signal-safety proof;
- a host that sets `SIGCHLD` to `SIG_IGN` or reaps with `waitpid(-1)` destroys the zombie that pins a
  process-group ID, so a later `killpg` can hit an unrelated group;
- the window between spawning a child and registering it with a watchdog loses trees when the host dies;
- `posix_spawn` cannot run the post-fork work we need (`TIOCSCTTY`, closing inherited host fds,
  resetting signal state) on every supported libc;
- Windows graceful stop and PTY Ctrl+C both require changing **process-global** console state of the host
  (`AttachConsole`/`FreeConsole`, `SetConsoleCtrlHandler(NULL, FALSE)`).

## Decision (normative)

1. **`hugr-omni-supervisor`** is a small executable shipped next to the native module for each target and started
   lazily, once per host process, by exec. On Linux it is a **static musl** binary, so its spawning capabilities do not
   depend on the host's libc.
2. **The supervisor creates every managed process; the host never forks.**
   - Unix pipe children: `posix_spawn` with `POSIX_SPAWN_SETSID`, explicit fd actions (only the stdio ends are
     inherited), default signal dispositions and an empty mask. Unix PTY roots: `fork` in the single-threaded
     supervisor, then `setsid`, `TIOCSCTTY`, `dup2`, close everything else, `exec`; the PTY root is held before exec
     until the host confirms its reader is running (`Go`), so a fast-exiting program loses no output on macOS.
     Exec failure is reported through a CLOEXEC pipe watched asynchronously.
   - Windows: `CreateProcessW` + `PROC_THREAD_ATTRIBUTE_JOB_LIST` (+ `PSEUDOCONSOLE`), std-equivalent argument
     quoting, the supervisor's own console with Ctrl+C not ignored, Job handles with `KILL_ON_JOB_CLOSE`;
     `ClosePseudoConsole` on a worker while an independent deadline enforces `graceMs`.
3. **The kill unit is the session** on Unix (pipe and PTY children alike): every root is a session leader; stopping
   signals the root's group and every member of its session. On Windows it is the Job.
4. **Identity safety:** the supervisor keeps a root unreaped until its session has **no live member** — `Release`
   never ends the pin while descendants live. A tree that is gone is never signalled again; membership checks use
   pidfd where available and report *unknown* (never *empty*) when the process inventory is incomplete.
5. **Protocol** (one page, `docs/protocol.md`, frozen in W00): length-prefixed frames on a socketpair (Unix) or a
   private named-pipe rendezvous (Windows); host → `Spawn`, `Go`, `Signal`, `Stop{grace}`, `Resize`, `Release`;
   supervisor → `Ready`, `Spawned`/`SpawnFailed`, `Exited`, `Stopped` (only once the tree is gone; every waiter gets
   it; the earliest deadline wins), `Ack{OK|GONE|UNKNOWN|ERROR|CLOSED}`. Tree IDs carry the supervisor generation.
6. **I/O stays in the host.** Pipe read ends and PTY master/output handles are passed to the host (SCM_RIGHTS /
   `DuplicateHandle`); the host pumps output under the bounded policy of `docs/api-contract.md` §4.
7. **Host death:** the supervisor notices the channel closing plus pidfd / kqueue / process handle on the host, stops
   every tree with one shared deadline and one shared process inventory, reaps, and exits.
8. **Supervisor death:** the host fails every pending call on that generation with `IO`, and the next spawn starts a
   new supervisor. Unix trees of a dead supervisor are declared unprotected; Windows trees die with its Jobs.
9. **The host installs no signal handlers, no exit hooks, and changes no console state.** A forked host child that
   inherited the client refuses to use it (creator pid check) instead of commanding the supervisor.

## What remains accepted from the spikes

- ADR-0001: Windows containment at creation (now via `JOB_LIST`, not `NtResumeProcess`); nested Jobs work;
  never use or allow breakaway; graceful stop on Windows is best effort, forced is guaranteed; Unix group
  signalling, setsid escapes declared; the spawn-latency baselines.
- ADR-0002: KILL_ON_JOB_CLOSE for Windows host death; no signal chaining in bindings.
- ADR-0003: own PTY layer; `/dev/ptmx` with `O_CLOEXEC`; `ptsname_r` (Linux) / `TIOCPTYGNAME` (macOS);
  ConPTY with flags 0, closed PTY-side ends, explicit null standard handles; PTY kill unit is the session.

## Consequences

- One more shipped file per target (342–581 KB in S5); the npm platform packages carry it.
- One IPC round trip per pipe spawn (~0.17 ms measured), two for Unix PTY spawns. K4 is `≤ 1.25× stdlib or ≤ +0.3 ms`
  (stakeholder decision, PLAN decision log).
- GUARANTEES tiers: Windows trees kernel-contained by Jobs; Unix trees contained per session while the supervisor
  lives; `setsid` escapes and supervisor death are declared.
- Every test asserts its outcome and fails CI on a bad result; a timeout or an incomplete observation is a failure,
  never a pass.

## Implementation requirements (binding on W04/W05/W06/W12/W12w; from the S5 review)

- **R1 Channel:** non-blocking control transport with bounded queues, admission limits and reserved capacity for
  cleanup; host-death and deadlines are processed before new requests; partial frames, floods and a stalled peer
  have defined outcomes.
- **R2 Linearization:** concurrent `Stop`/`Release`/`Go`/spawn from several host threads are linearized; every
  waiter receives a reply; overlapping `Stop`s keep the earliest deadline; supervisor replacement is generation-safe.
- **R3 Inventory:** process enumeration returns complete / partial / error and liveness alive / dead / unknown; no
  reap and no `Stopped` from an incomplete scan; one shared inventory and deadline for stop-all.
- **R4 pidfd:** host monitoring and member signalling are feature-detected separately; without pidfd a documented
  weaker fallback applies and is reported, never silently assumed.
- **R5 Resources:** RAII for every fd/handle/thread, rollback for partial spawns, bounded pending state, cleanup of
  released records and dead generations; injected exhaustion keeps fd/handle counts stable.
- **R6 Trust:** the channel is a capability of the original host; the creator-pid check refuses forked clients;
  messages, descriptor counts and transferred handles are validated; inherited-capability limits are documented.
- **R7 Windows bootstrap:** no inheritable host handles at any point — private named-pipe rendezvous with a random
  token, `bInheritHandles = FALSE`, non-inheritable `DuplicateHandle` transfers, host-death monitoring armed before
  the first spawn is accepted.
- **R8 libc:** the Linux supervisor is built and tested as static musl; optional spawn paths are gated by
  availability with a tested fallback.
- **R9 PTY Go:** `Go` is sent only after the host reader has demonstrably started; the held child closes unused
  pipe ends before waiting; host death before `Go` cleans up the held child.
- **R10 Tests:** host-death modes must happen as requested (a harness-forced kill is a failure); mid-spawn barriers
  are deterministic; release with resistant descendants in other process groups is covered with a group-only control;
  PID-reuse coverage is required on designated targets (NOT RUN fails there).

## Validation

Spike S5: T1–T8 and T10 pass on Linux, macOS, Windows 11 (26100) and Windows Server 2022 (20348); T9 (latency)
fails the old 1.25× bound on Linux/macOS with plain `fork` and is resolved by `posix_spawn` + the K4 decision.
Codex review: *accept_with_changes*; its findings are R1–R10 above.

## Evidence (S5)

Spike S5 (2026-10-02), branch `spike/supervisor`, throwaway workspace `spikes/supervisor` (never published),
workflow `.github/workflows/spike-supervisor.yml` (push to `spike/supervisor` only; 4 jobs: ubuntu-latest,
macos-latest, windows-latest = Server 2025 24H2 build 26100.33438, windows-2022 = build 20348.5622).

**How results are produced.** `s5 <test>` (the harness) prints `RESULT T<n> os=… host=… case=… verdict=PASS|FAIL|NOTRUN …`
and exits 1 on any FAIL; each CI step is `set -euo pipefail; s5 tN`; no `continue-on-error`. Liveness is never taken
from the supervisor: every fixture process appends its own pid to a log at start, and the harness asks the OS
(`kill(pid,0)` + `/proc` / `sysctl(KERN_PROC)` zombie state, `OpenProcess`+`WaitForSingleObject`) and also counts every
live `s5fx` process by name. Each claim has a control that must come out the other way (listed per test).

**Runs.** Run 2 adds the clone-vfork arm, macOS pid cycling and the Windows handle probe; run 3 is the evidence-doc
commit (same code); run 4 adds the PTY hold (item 5 below) and its T8 rows.

| | run 1 [36962609871](https://github.com/gmhelmold/hugr-omni/actions/runs/36962609871) (`8432282`) | run 2 [36963631006](https://github.com/gmhelmold/hugr-omni/actions/runs/36963631006) (`2a389e8`) | run 3 [36964138332](https://github.com/gmhelmold/hugr-omni/actions/runs/36964138332) (`6f1e37d`) | run 4 [36964977171](https://github.com/gmhelmold/hugr-omni/actions/runs/36964977171) (`be6ba5e`) | FAIL verdicts |
|---|---|---|---|---|---|
| ubuntu-latest (ubuntu24, glibc 2.39) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36962609871/job/110699364176) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36963631006/job/110702521140) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36964138332/job/110704072554) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36964977171/job/110706646368) | T9 in every run |
| macos-latest (macos26 arm64) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36962609871/job/110699364070) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36963631006/job/110702521177) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36964138332/job/110704072626) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36964977171/job/110706646433) | T9 in every run; run 3 also T1 node PTY (item 5) |
| windows-latest (26100) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36962609871/job/110699364135) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36963631006/job/110702521147) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36964138332/job/110704072679) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36964977171/job/110706646449) | none (6 NOTRUN) |
| windows-2022 (20348) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36962609871/job/110699363974) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36963631006/job/110702520993) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36964138332/job/110704072669) | [job](https://github.com/gmhelmold/hugr-omni/actions/runs/36964977171/job/110706646408) | none (6 NOTRUN) |

Run 4 totals: ubuntu 88 PASS / 1 FAIL, macOS 87 / 1, each Windows job 84 PASS / 0 FAIL / 6 NOTRUN. Every row below reproduced in all runs unless a value is quoted per run (ranges span the runs).

### Host ↔ supervisor protocol (as built)

Start: the host execs `hugr-omni-supervisor` lazily on its first spawn. Unix: `socketpair(AF_UNIX, SOCK_STREAM)`
(CLOEXEC; SO_NOSIGPIPE / MSG_NOSIGNAL), supervisor end on its fd 0, own process group (`process_group(0)`, so a
terminal Ctrl-C to the host's job does not reach it), args `--host-pid P --grace-ms G`. The supervisor closes every
inherited fd ≥ 3, ignores SIGPIPE/SIGINT/SIGHUP, installs its SIGCHLD handler (replacing an inherited SIG_IGN), arms
host-death detection (Linux `pidfd_open(P)`, macOS kqueue `NOTE_EXIT`, both + `getppid()` polling), checks
`getppid()==P`, then sends `Ready`. Windows: two anonymous pipes (supervisor stdin = requests, stdout = replies),
`CreateProcessW` with `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` = {2 pipe ends, an inheritable SYNCHRONIZE handle to the
host} and `CREATE_NO_WINDOW` (its **own** windowless console); it clears the ignore-Ctrl+C flag **for itself** and
installs a handler that ignores console events.

Frame: `u32 LE length` + `u8 kind` + payload (LE ints; `bytes` = u32 len + data; lists = u32 count + items); max
1 MiB; a malformed frame is treated as host death. Every request carries a `req` id echoed by its reply.

| host → supervisor | reply |
|---|---|
| `Spawn{req, argv[], env[(k,v)] (full, final), cwd, pty?(cols,rows), stdin/stdout/stderr slot ∈ {null, pipe, merge(stderr)}, handles[3]}` | `Spawned{req, id, pid, pty_ends}` or `SpawnFailed{req, code ∈ NOT_FOUND/NOT_EXECUTABLE/BAD_CWD/INVALID/IO, errno, msg}` |
| `Go{req, id}` — Unix PTY roots only: sent once the host's reader on the master runs (the root waits, set up, before `execve`) | `Ack{OK}` once exec succeeded, or `SpawnFailed{req, …}` (no `Exited` is ever sent for it); Windows: no-op `Ack` |
| `Signal{req, id, graceful\|forced}` | `Ack{req, id, OK\|GONE\|UNKNOWN\|ERROR\|CLOSED}` (GONE = tree confirmed gone, nothing sent) |
| `Stop{req, id, grace_ms}` — one deadline for the whole tree, owned by the supervisor | `Stopped{req, id, forced, elapsed_ms}` **only once the tree is confirmed gone** (immediately if already gone) |
| `Resize{req, id, cols, rows}` | `Ack` (CLOSED after root exit / ConPTY close) |
| `Release{req, id}` — host drops the handle; the supervisor keeps cleanup duty | `Ack` |
| unsolicited | `Ready{version, pid, info}` once; `Exited{id, code\|signal}` at root exit (Windows: 32-bit code) |

Descriptor passing: Unix — the host creates the pipes (`pipe2(O_CLOEXEC)`) and sends the child ends as SCM_RIGHTS on
the first byte of the `Spawn` frame, one per `pipe` slot in stdin/stdout/stderr order; the supervisor queues received
fds in order (MSG_CMSG_CLOEXEC on Linux). For a PTY the supervisor opens `/dev/ptmx` (O_CLOEXEC, `ptsname_r` /
`TIOCPTYGNAME`) and returns the master as SCM_RIGHTS on `Spawned` (it keeps a dup for `Resize`). Windows — the host
`DuplicateHandle`s its pipe ends **into** the supervisor (`DUPLICATE_CLOSE_SOURCE`) and puts the values in
`handles[]`; for a PTY the supervisor returns the ConPTY output-read / input-write values and the host pulls them out
with `DUPLICATE_CLOSE_SOURCE`. I/O never crosses the supervisor.

Child creation: Unix — fork (the supervisor is single-threaded) → child: empty mask, every signal SIG_DFL, `setsid`,
`TIOCSCTTY` (PTY), `dup2` ×3, `chdir`, everything ≥ 3 marked CLOEXEC (`close_range(…, CLOSE_RANGE_CLOEXEC)` /
`proc_pidinfo(PROC_PIDLISTFDS)` on a stack buffer), `execve` of the program resolved against the child's own PATH;
failures come back as (stage, errno) on a CLOEXEC pipe. A PTY root additionally blocks on a CLOEXEC "go" pipe after
its setup and before `execve` until the host's `Go` (EOF on that pipe = `_exit(127)`, e.g. at host death). Windows — `CreateProcessW` + one attribute list {`JOB_LIST`
(own Job, KILL_ON_JOB_CLOSE, no breakaway), `HANDLE_LIST` or `PSEUDOCONSOLE`}, `CREATE_NEW_PROCESS_GROUP` for pipe
roots only, std's argument quoting ported (batch files refused in the spike).

Stop / tree identity: Unix graceful = SIGTERM (+SIGHUP for PTY) + SIGCONT to `killpg(root)` **and every live member of
the root's session** (Linux: per-member pidfd, membership re-checked on that pidfd's process; macOS: `getsid()`
re-check then `kill`), forced = SIGKILL the same way, re-swept every 10 ms until the session is empty. The root is
observed with `waitid(WNOWAIT)` and **reaped only when its session has no live member** (scan every 100 ms, 10 ms
while stopping); from then on the tree is "gone" and no number of it is ever signalled again. Windows graceful =
`CTRL_BREAK` from the supervisor's console (pipe) / `ClosePseudoConsole` on a worker thread (PTY); forced =
`TerminateJobObject`; gone = Job `ActiveProcesses == 0` + root exited; the process handle is held (pid pinned) until
gone **and** released. Host death (channel EOF, pidfd/kqueue/process handle, `getppid`, protocol error): `Stop` every
live tree with the host-wide grace, then exit when all are gone (hard bound grace + 2 s; Windows: exiting closes the
Jobs). Supervisor death: the host reader sees EOF, every pending `wait`/`stop` fails with `IO`, the next spawn starts a
new supervisor.

Host API used by every test host (`sup/src/client.rs`, `facade.rs`; napi `node/`, PyO3 `py/`): `Supervisor::start /
global()` (lazy, restarted when dead) · `spawn(Spec) → Child{pid, stdin, stdout, stderr | pty_out, pty_in}` ·
`Child::wait(timeout) → Exit | Err(IO)` · `stop(grace_ms) → {forced, elapsed}` · `signal(forced)` · `resize(c, r)` ·
`release()`; output is pumped by host threads. The bindings install no signal handler and no exit hook.

### Results (verdicts are asserted; FAIL fails CI)

| | Linux | macOS | Windows 26100 | Windows 20348 |
|---|---|---|---|---|
| **T1** spawn via supervisor, pipe + PTY: argv (space, empty, quote, trailing backslash, UTF-8), env, cwd (space+UTF-8), stdin/stdout/stderr pipes arrive, merge_stderr, PTY master/ConPTY ends arrive (child sees tty on 0/1/2, 200×50, Unix: session leader + foreground); Unix: child fds = exactly {0,1,2}, all signals default, nothing blocked; host's deliberately leaked inheritable fd/handle absent in the child (checked by number and path). Hosts rust, node 22, CPython 3.12, Bun, Deno | PASS ×5 hosts | PASS ×5 | PASS ×5 | PASS ×5 |
| T1 note | | run 3: node host once got an **empty** PTY output (child exit 0) → item 5; PASS in runs 1, 2, 4 | | |
| T1 control: same child via in-host `std::process` | inherits the leak (`fds=[0,1,2,3,60,142,145]`) | inherits (`[0,1,2,3,60]`) | inherits | inherits |
| T1 supervisor holds no host fd/handle (OS inventory: `/proc/<sup>/fd`, `lsof`; Windows: `DuplicateHandle` out of the supervisor at the leaked value, with a planted positive control) | PASS ×5 | PASS ×5 | PASS rust from run 2 (`holds=false control_planted_seen=true`; run 1 NOTRUN, no probe yet); other hosts NOTRUN (probe needs the supervisor handle) | same |
| **T2** exit codes 0/1/42/255 (+0xC000013A) = std control; signals 15/9 = std control; 300 KB then exit 7: no byte lost; root exits while a grandchild holds stdout 1.5 s → `Exited` ≥ 1 s before EOF (`exited_ms=1 eof_ms=1501` Linux); PTY output + EOF after exit; typed SpawnFailed NOT_FOUND / BAD_CWD (Unix: via the exec-error pipe) / NOT_EXECUTABLE | PASS | PASS | PASS | PASS |
| **T3** `stop(1000)`, 3-level tree, SIGTERM/CTRL_BREAK-resistant leaf: all gone ≤ 1500 ms, `forced=1` (all runs, 3 hosts) | 1013–1024 ms | 1011–1031 ms | 1015–1032 ms | 1015–1031 ms |
| T3 controls: same tree without stop alive after 1.5 s (3/3); polite leaf → `forced=0` | 4–5 ms | 0–18 ms | 0–15 ms | 0–31 ms |
| T3 after the root already exited (Exit kept, same value after stop) | PASS | PASS | PASS | PASS |
| (all T3 rows for rust, node, python hosts) | | | | |
| **T4** host death × rust/node/python: return, exit(), abort, SIGINT, SIGTERM, SIGKILL (Windows: Ctrl+C, Ctrl+Break, TerminateProcess), death mid-spawn (full frame, half frame), Rust panic → **zero** survivors by pid log and by name, supervisor exits; pipe tree + PTY tree, both with a resistant leaf | 25/25 PASS per run, 1302–1326 ms to zero¹ | 25/25, 1266–1407 ms | 25/25, 1108–1327 ms | 25/25, 1107–1327 ms |
| T4 mid-spawn detail | in-flight tree **was created** after host death (9 procs logged) and still reached zero | 6 logged | 6 logged | 6 logged |
| T4 control: same tree spawned in-host, host SIGKILLed / TerminateProcess'd | 3/3 survive ×3 hosts | 3/3 | 3/3 | 3/3 |
| **T5** host `SIGCHLD=SIG_IGN` before / after supervisor start, and a `waitpid(-1)` reaper thread: exit 42 and 7 delivered, resistant tree stopped, unrelated sentinel alive | PASS ×3 | PASS ×3 | NOTRUN (no SIGCHLD) | NOTRUN |
| T5 control: host's own `std::process` children under the same condition | 5/5 statuses lost; reaper stole 5/5 | 5/5 lost (a blocking `waitpid` would hang: under SIG_IGN macOS waits for **all** children, the supervisor included) | – | – |
| **T6** gone tree's pid/pgid **recycled** into an unrelated group leader: `Signal`×2 → `GONE`, `Stop` → elapsed 0, sentinel alive | PASS (root in a private pid ns, `ns_last_pid`: `old_pgid=5 sentinel_pid=5`) | PASS runs 2–4 (pid cycling: `old_pgid=34467 sentinel_pid=34467`); run 1 NOTRUN (cycling budget) | handle pinned: 150 sentinels never got the old pid, signals `GONE`, all alive; after Release the id is `UNKNOWN` (run 1: reuse observed, recycled sentinel alive) | same (run 4: reuse observed, recycled sentinel alive) |
| T6 control: naive `killpg(old_pgid)` | hits and kills the sentinel | hits and kills | – | – |
| T6 pinned while descendants live: next pid skips the zombie root, `stop()` kills only the tree | PASS (`pinned_pid=6 next=7`) | PASS runs 2–4 (`34468 → 34471`) | – | – |
| **T7** supervisor SIGKILLed / TerminateProcess'd: host `wait()` fails with `IO` | 0 ms | 0 ms | 0 ms | 0 ms |
| T7 trees after 1 s (recorded) | 6/6 **alive** (declared unprotected) | 6/6 **alive** | 0/6 (Jobs closed) | 0/6 |
| T7 next spawn restarts a supervisor | PASS | PASS | PASS | PASS |
| **T8** PTY prompt→answer; `"\x03"` interrupts; resize 80×24 → 100×30 → 120×40 → 90×25 all seen, none spurious | PASS | PASS | PASS (host ignoring and processing Ctrl+C) | PASS (both) |
| T8 host untouched: Unix sigactions/mask/pgrp identical before/after; Windows `ConsoleFlags` ignore bit identical (reader validated: set/clear flips it) and the host's own handler still fires on a CTRL_BREAK | PASS | PASS | PASS | PASS |
| T8 control: protection disabled (Unix: no `TIOCSCTTY`; Windows: supervisor keeps the inherited ignore flag) → no interrupt | PASS (`got=false`) | PASS | PASS | PASS |
| T8 stubborn writer (ignores SIGHUP/SIGTERM; Windows: blocks 20 s in CTRL_CLOSE), `stop(1000)` after root exit: survives a graceful request 1.5 s, then stream ends and tree gone ≤ 1500 ms | 1012–1017 ms | 1024–1030 ms | 1017–1029 ms | 1003–1013 ms |
| T8 control: `ClosePseudoConsole` synchronously on the owner thread | – | – | not distinguishable (close returns at once on 24H2: 1013/1026 ms) | **misses the deadline: 5001–5005 ms** (every run) |
| T8 PTY child prints one line and exits at once, 300×: output kept (run 4, root held until the host reader runs) | 0/300 lost | 0/300 lost | 0/300 lost | 0/300 lost |
| T8 control: same without the hold (`HUGR_SUP_NO_HOLD`) | 0/1500 lost (recorded) | **lost** (1st try; locally 3/300) | 0/1500 (recorded) | 0/1500 (recorded) |
| **T9** K4: 50 warm-up + 500 trivial spawn-to-exit, interleaved, same job; p50 ratio vs `std::process` ≤ 1.25 (runs 1 · 2 · 3 · 4) | **FAIL** fork: 1028/725 µs = **1.42** · 1016/726 = **1.40** · 741/467 = **1.59** · 1015/726 = **1.40** | **FAIL** fork: 3776/2809 = **1.34** · 2198/1672 = **1.31** · 2967/2134 = **1.39** · 2465/1818 = **1.36** | PASS 5800/5211 = 1.11 · 5765/5164 = 1.12 · 6369/5685 = 1.12 · 5958/5350 = 1.11 | PASS 3568/3132 = 1.14 · 3775/3320 = 1.14 · 4788/4091 = 1.17 · 4231/3639 = 1.16 |
| T9 measured alternatives inside the supervisor (pipe mode) | `clone(CLONE_VM\|CLONE_VFORK)` + same child setup: 897 · 636 · 885 µs = **1.23 · 1.36 (FAIL) · 1.22**; `posix_spawn`+SETSID: 895 · 906 · 636 · 898 µs = **1.23 · 1.25 · 1.36 (FAIL) · 1.24** | `posix_spawn`+SETSID+CLOEXEC_DEFAULT 3141 · 1845 · 2437 · 2003 µs = **1.12 · 1.10 · 1.14 · 1.10** | – | – |
| T9 first spawn (fresh supervisor, p50 of 10): start→`Ready` / start→first `Exited` | 0.58–0.88 ms / 1.5–2.4 ms | 1.9–4.7 ms / 4.2–10.7 ms | 13.4–15.3 ms / 19.9–23.0 ms | 13.4–18.0 ms / 17.8–23.4 ms |
| supervisor binary (release, unstripped) | 580 640 B | 522 064 B | 342 016 B | 342 016 B |

¹ host exit → zero survivors, including the 1000 ms host-death grace (the leaves resist) and a fixed 300 ms wait the
harness adds so a tree created mid-spawn can register. T10 = the T1/T3/T4 rows above run with every listed host
(rust, node 22, CPython 3.12; Bun and Deno ran T1).

### What the evidence contradicts or refines in this ADR

1. **K4 (≤ 1.25× std) does not hold on Unix** (Consequences: "K4 must still hold"). With plain `fork()` (Decision 2)
   the supervisor path costs 1.40–1.59× std on Linux and 1.31–1.39× on macOS, in every run. vfork-style creation
   removes the fork cost but not the round trip: Linux `clone(CLONE_VM|CLONE_VFORK)` running the *same* child-side
   setup (so `TIOCSCTTY` stays possible) and `posix_spawn` cost a near-constant **+170 µs** over std (run 2: 897 vs
   726 µs = 1.23×; run 3: 636 vs 467 µs = 1.36×), so the ratio passes or fails with the runner's speed. macOS
   `posix_spawn` 1.10–1.14× (but no `TIOCSCTTY` there: macOS PTY roots stay on fork, not measured). Windows meets K4
   (1.11–1.17×). A ratio target on a ~0.5 ms Linux spawn leaves ≤ ~120 µs for one IPC round trip + exit notification.
2. **"Kept unreaped until the group has no other members *or the host released the handle*" is unsafe as written.**
   Reaping at Release while descendants live either drops them from host-death cleanup or leaves a number the
   supervisor would later signal after it can be recycled. Built and tested (T6 pinned): the zombie root is kept until
   its **session** has no live member, Release notwithstanding.
3. **The kill/containment unit is the session for pipe children too**, not only for PTYs: every root is a session
   leader, and the sweep by session is what makes "confirmed gone" decidable (group-only would miss job-control groups
   and could not tell when the pinned number is free).
4. The message set needs `Stop{grace}`→`Stopped` (supervisor-owned single deadline + confirmation; `Signal` alone
   cannot implement §5 `stop()` or the host-death deadline), plus `Ready` and `Ack` (incl. `GONE`/`UNKNOWN`).
5. **"I/O stays in the host" loses PTY output on macOS unless the root waits for the host's reader.** Run 3: a child
   that prints one line and exits at once lost its whole output once (node host, `seen=""`); locally 3/300 and
   1/480. Cause: the session leader's exit revokes the tty and drops unread output, and the host only gets the master
   after the `Spawned` round trip. Fix built and asserted (run 4, T8 rows above): the PTY root is held after setup,
   before `execve`, until the host's reader runs (`Go`) — one extra round trip per PTY spawn (Unix).

Everything else in Decisions 1–6 held: host never forks, exec'd helper, own console and CTRL_BREAK on Windows with the
host untouched, ConPTY close on a worker with an independent deadline (load-bearing on 20348), I/O in the host (with
the PTY hold of item 5), host
death in every listed way including mid-spawn, Unix supervisor death leaves trees running while Windows Jobs kill them.

### Risks and gaps (not covered by these runs)

- Untested failure injection: fd exhaustion, a full channel in either direction (writes are blocking), a SIGSTOPped
  supervisor, concurrent spawns from several host threads, thousands of live trees (each 10/100 ms tick scans every
  process: `/proc` on Linux, `proc_listallpids` + `getsid` on macOS), kernels without pidfd (falls back to
  `getppid` polling, 500 ms), musl, Windows builds other than 20348/26100.
- macOS signals session members with `getsid()` + `kill()` (no pidfd): a microsecond window remains; macOS has no
  `MSG_CMSG_CLOEXEC` / atomic CLOEXEC socketpair, so a concurrent fork in the host can inherit a received fd.
- Windows: the inheritable ends exist briefly while the supervisor is created (HANDLE_LIST limits *our* child, not a
  concurrent `CreateProcess(bInheritHandles=TRUE)` elsewhere in the host). First spawn costs ≈ 14 ms (new hidden console).
- Unix supervisor death leaves trees unprotected (T7); the channel is unauthenticated, so any process that inherits
  the host end (fork without exec) can command the supervisor.
- `setsid`/`setpgid` escapes outside the root's session remain out of reach (by design).
- PTY spawns now cost two round trips on Unix (`Spawned` → reader → `Go`); PTY spawn latency was not measured, and on
  macOS PTY roots cannot use `posix_spawn` (no `TIOCSCTTY`), so they stay on the slower fork path.
