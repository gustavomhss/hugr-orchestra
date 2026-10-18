# processkit 3.3.4 — hands-on evaluation (WP E1)

> Branch `spike/processkit-eval` · baseline `a4da02e` · harness `spikes/pk-eval` ·
> crate `processkit = "=3.3.4"` (features `pty` + default `process-control`).
> Rule followed: nothing here trusts processkit's README. Every number comes from
> running it, and processes are counted by the OS.

**Verdict: build on it, with fixes, but only after the Windows run.** Containment
during a task, graceful stop, PTY and output fidelity held up on macOS and Linux. Three
things failed, and our wrapper has to handle them: stdout streams hang, a fixed 5 s
stall, and orphans when the host dies. Windows was not measured at all (§0). See §7.

## 0. Read first: what could and could not be measured

| | Status |
|---|---|
| **GitHub Actions (the planned evidence source)** | **Blocked.** No job in either run started. Each one was rejected with *"The job was not started because your account is locked due to a billing issue."* The same lock hit the sibling `spike/packaging` run. Runs: [36941339911](https://github.com/HuGR-Labs/hugr-omni/actions/runs/36941339911) and [36943227404](https://github.com/HuGR-Labs/hugr-omni/actions/runs/36943227404). The workflow `.github/workflows/spike-pk-eval.yml` is committed. Once billing is restored, any push to the branch re-runs Part 1 and Part 2 on ubuntu/macos/windows-latest. |
| **macOS** | Run **natively** and complete. macOS 15.3.2, x86_64 (i7-9750H), backend `Mechanism::ProcessGroup`. Evidence: `spikes/pk-eval/evidence/part2-macos-run{1,2,3}*.txt`. |
| **Linux** | Run in **Docker Desktop's Linux VM**, not on an `ubuntu-latest` runner. Kernel 6.10.14-linuxkit, cgroup v2, image `rust:1` (Debian), `--init` (tini as subreaper). **Unprivileged container → `ProcessGroup` backend:** W0–W3 done at full iteration counts; the run died partway through W3 when the Docker VM went down (host disk full, §9), so W4–W10 were never reached. **`--privileged --cgroupns=private` → `CgroupV2` backend:** smoke level only (n=3 per case, W0/W1/W2/W8; results in the agent transcript, not saved as a file). |
| **Windows** | **Not measured.** There is no local Windows host and CI was locked. Every Windows-specific claim below (Job Object, ConPTY, CTRL_BREAK, `.cmd` quoting) is **untested**. |
| **Part 1 (upstream suite)** | **Not run.** See §2. |

Two caveats limit the latency numbers (K3, K4). They do not affect the survivor, hang
or loss counts:
* The host was a shared laptop under heavy load: load average above 300 from other
  agents' builds during the runs.
* Its disk ran full twice (§9).

K4 is an interleaved ratio, so the load mostly cancels out. The K3 numbers are
conservative.

## 1. KPI table

Definitions are as implemented (§3). A "teardown" is one tree that was started and then stopped.

| KPI (target) | macOS — ProcessGroup | Linux container — ProcessGroup | Linux container — CgroupV2 | Windows |
|---|---|---|---|---|
| **K1** survivors after a task (0) | **0** in ≈2,500 teardowns (W1, W3–W7) | **0** in 1,300 teardowns (W1, W3 ×4) | 0 (smoke, 9 trees) | not measured |
| **K1-host**: owner dies abruptly (0) | **868 of 868** tree processes survive (217/217 trees, 100%) | not measured | 100% with own/group; 3 of 4 per tree with `kill_on_parent_death` (smoke) | not measured (docs claim WholeTree) |
| K1-host: owner catches the signal and drops (0) | 0 of 160 | – | 0 (smoke) | – |
| W2 escapees (see §4) | 200/200 escape | 200/200 escape | 0/6 (contained) | not measured |
| **K2** hangs (0) | **5** (W5.stream: 5 of 5) | 0 (W1–W3 only) | – | – |
| **K3** p95 minus grace (≤ +500 ms) | **+3,068 ms** (W5.with_timeout). Every other kill/drop/timeout/cancel/graceful case: ≤ +18 ms | ≤ +35 ms (W1–W3) | – | – |
| **K4** p50 ratio vs `std::process` (≤ 1.25) | **1.002** | not reached | – | – |
| **K5** bytes/lines lost (0) | **0 / 0** | 0 (W3) | – | – |
| **K7** host crashes (0) | **0** caused by processkit (13 harness case aborts came from the harness's own `mkdir` hitting ENOSPC; reran) | 0 (run cut short by the Docker VM dying) | – | – |

`SUMMARY` lines: `evidence/part2-macos-run2.txt` (W1.group_shutdown→W10),
`evidence/part2-macos-run1-diskfull.txt` (W0, W1.kill/drop/timeout/cancel/group_drop
valid; later cases aborted by ENOSPC) and `evidence/part2-macos-run3-w8.txt` (W8,
re-run after a harness race fix, see W8).

## 2. Part 1 — upstream's own suite

**Not run on any OS.** The CI job `part1` is written and committed. It clones
`ZelAnton/ProcessKit-rs` at tag v3.3.4 (sha `ba1a6fe77ced…`) read-only, builds with
`--all-targets --all-features`, then runs
`cargo nextest run --profile ci-all --all-features --run-ignored all --retries 0`
three times. `scripts/junit_summary.py` turns the three junit files into
pass/fail/flaky. It uses `--retries 0` on purpose: upstream's `ci` profile retries
every test twice, which hides flakiness.

The job never started because of the billing lock. Locally, `cargo-nextest` was built,
but the host disk then hit 100% (§9). Upstream's all-targets/all-features build needs
several GB (criterion, proptest, mockall, …), so it was not attempted. Result: no
pass/fail/flaky data on any OS.

## 3. How it was measured

* **Harness.** `pkeval all` runs each case in its own subprocess, so a crash counts
  toward K7 and every case starts W4 from a clean RSS baseline. It prints
  `KPI <os> <workload> <metric>=<value>` lines and folds them into a `SUMMARY` line.
  * Children are one multi-mode `helper` binary.
  * The W8 owner is a separate `host` binary.
  * The W9 child is `noop` (`fn main(){}`).
* **Survivors are counted by the OS, never by processkit.** Every helper carries
  `--tag=<unique>` in argv and passes it on to its descendants. A survivor is a live,
  non-zombie process found by both of these checks:
  1. a native liveness probe: Linux `/proc/<pid>/stat`, macOS `sysctl(KERN_PROC_PID)`
     `p_stat`, Windows `GetExitCodeProcess`;
  2. a full process-table scan (`sysinfo`) for the tag.
* **Instrument calibration (W0).** Each run starts a 4-level tree with plain
  `std::process`, kills only the root, and requires the scan to find exactly 4 and then
  3 processes, with the root reported dead. It passed in every run (`instrument_ok=true`).
  * It caught a real instrument bug during development: macOS `proc_pidinfo` reported
    zombies as alive. Fixed by switching to `sysctl`.
  * W2 on the ProcessGroup backend is a second positive control: the scan does find
    escapees.
* **Hang guard.** Every awaited processkit call runs under `tokio::time::timeout`
  (30 s unless stated). If the guard expires on an operation that should have
  finished, that is one K2 hang.
* **K3** is the p95 of "stop requested → API returned **and** every tree pid gone (OS
  view)", minus the configured grace. For `timeout` cases the clock starts at the
  deadline.
* **K4** compares `Command::output_bytes` with `std::process::Command::output`. Runs
  are interleaved round-robin: 50 warm-up and 500 measured.
* **K5** compares what arrived with what the child provably wrote: numbered 100-byte
  lines plus an `END <n>` trailer.
* **Iterations.** 100 per case, except:
  * W4 200 MB variants: 2–3 runs each.
  * W5: 20 runs (5 for the hanging stream case).
  * W6 blocking variants: 3.
  * W7.hello200: 200.
  * W8: 20 per cell.

## 4. Part 2 — results per workload (public API used → result)

### W1 tree kill: root → child → grandchild → great-grandchild
APIs: `Command::start`, `RunningProcess::{start_kill, wait}`, `Drop`, `Command::timeout`,
`Command::cancel_on`, `ProcessGroup::{new, start, shutdown}`, `Drop for ProcessGroup`.

| variant | macOS survivors | macOS stop p50 / p95 | Linux-pgroup survivors | Linux stop p50 / p95 |
|---|---|---|---|---|
| start_kill + wait | 0/400 | 3.9 / 4.1 ms | 0/400 | 6.3 / 35.5 ms |
| drop handle | 0/400 | 3.6 / 4.3 ms | 0/400 | 4.7 / 7.3 ms |
| `timeout(800ms)` (from deadline) | 0/400 | 2.2 / 8.5 ms | 0/400 | 4.0 / 14.0 ms |
| `cancel_on(token)` | 0/400 | 1.1 / 6.7 ms | 0/400 | 3.2 / 28.0 ms |
| drop `ProcessGroup` | 0/400 | 3.6 / 5.2 ms | 0/400 | 4.9 / 24.8 ms |
| `ProcessGroup::shutdown()` | 0/400 | **2,001.5 / 2,002.4 ms** | 0/400 | 2,003 / 2,017 ms |
| root already exited → drop | 0/300 | 3.5 / 3.7 ms | 0/300 | 5.0 / 12.2 ms |
| root already exited → `wait()` | 0/300 | 3.7 / 4.0 ms | 0/300 | 5.8 / 13.4 ms |
| root already exited → start_kill | 0/300 | 3.7 / 4.2 ms | 0/300 | 5.6 / 11.2 ms |

* **Holds.** The timeout outcome is `TimedOut`. A cancel returns an error ("was
  cancelled").
* When only descendants remain, `wait()` returns `Exited(0)` and the orphaned
  descendants are killed with it.
* `group.shutdown()` always takes the full default grace (2 s), even though every
  member dies on SIGTERM within milliseconds. The un-awaited root is a zombie, and the
  ProcessGroup backend probes zombies as alive. processkit documents this
  ("Reap your children, or the grace is wasted").

### W2 escape: a descendant runs `setsid()` (Unix) / `CREATE_BREAKAWAY_FROM_JOB` (Windows)
APIs: `Command::start`, `start_kill`, `Drop`.

| backend | escapees after teardown |
|---|---|
| macOS ProcessGroup | **200/200** (grandchild + great-grandchild in every one of 100+100 runs) |
| Linux ProcessGroup | **200/200** |
| Linux CgroupV2 | 0/6 (smoke) |
| Windows Job Object | not measured. Code reading: the job is created **without** `JOB_OBJECT_LIMIT_BREAKAWAY_OK`, so a breakaway spawn should be refused. |

This is an OS limitation of process groups, and processkit documents it
(`Mechanism` is reported). No library can do better on macOS.

### W3 graceful stop: child handles SIGTERM/CTRL_BREAK and prints "cleanup", or ignores it
APIs: `RunningProcess::shutdown(grace)`, `Command::{timeout, timeout_grace,
windows_graceful_ctrl_break, on_stdout_line}`, `ProcessGroup::stop(grace, true)`.
The grace is 500 ms.

| variant | macOS stop p50 / p95 | cleanup ran / line delivered | Linux p50 / p95 | Linux cleanup |
|---|---|---|---|---|
| `shutdown`, child handles | 22 / 79 ms | 100/100 · 100/100 | 23 / 73 ms | 100/100 · 100/100 |
| `shutdown`, child ignores | **502 / 516 ms** (forced, `Signalled(9)`) | 0 · 0 | 505 / 525 ms | 0 · 0 |
| `shutdown` without the Windows opt-in | 22 / 64 ms | 100/100 | 23 / 87 ms | 100/100 |
| `timeout_grace`, handles | 24 / 32 ms after the deadline | 100/100 | 57 / 200 ms | 100/100 |
| `timeout_grace`, ignores | 504 / 507 ms after the deadline | 0 | (run died here) | |
| `group.stop`, handles (handle awaited) | 22 / 43 ms | 100/100 | – | – |
| `group.stop`, ignores | 502 / 506 ms | 0 | – | – |

The worst K3 excess is +25 ms. Every "cleanup" line was delivered (K5 = 0).

* **Footgun.** If the `RunningProcess` is not being awaited when `group.stop()` runs,
  the stop burns the whole grace, and the `ShutdownReport` says
  `escalated: true, drained_within_grace: false, members_after: Some(1)`. That is
  wrong: the child exited cleanly on SIGTERM.
* In the same case, the "cleanup" line written by the handler is lost when the handle
  is dropped instead of consumed: 3 of 3 in a dev run. Awaiting the handle fixes both
  problems.

### W4 output flood: 200 MB of numbered 100-byte lines
APIs: `Command::{output_bytes, output_string}`, `RunningProcess::{stdout_lines, finish,
output_bytes, wait}`. macOS only (the Linux run never reached W4).

| variant | lost | host RSS growth | notes |
|---|---|---|---|
| 1 MB × 100, `output_bytes`: exact byte count | **0 B** | +6 MB | output at exit is never lost |
| 1 MB × 100, `stdout_lines` sequence check | **0 lines** | +7 MB | |
| 200 MB, slow `stdout_lines` consumer (1 ms per 1,000 lines) | 0 | **+244 MB** | the queue is unbounded, so the consumer's lag turns into host memory |
| 200 MB, `start()`, 10 s of nobody reading, then `output_bytes` | 0 | +197 MB | the child **blocks** (backpressure) until a consuming verb runs, then finishes. No hang. |
| 200 MB, `stdout_lines()` taken but never polled | 0 | **+345 MB** | the child is **not** blocked: processkit drains into memory |
| 200 MB, `stdout_lines()` polled only after 10 s | 0 | **+304 MB** | nothing lost, everything buffered |
| 200 MB, `wait()` only | – | +1 MB | returns in about 1.3 s; output discarded, as documented |
| 200 MB, `output_string()` (default policy) | 0 | **+573 MB (2.9× the output)** | `truncated=false` |

None of the variants lost data or hung. The cost is memory: the default
`OutputBufferPolicy` is unbounded, and `stdout_lines()` has no backpressure mode. The
only option is unbounded memory or a drop policy, and a drop policy loses lines.

### W5 inherited pipe: the root prints BYE and exits; a grandchild inherits stdout and sleeps 600 s
APIs: `Command::output_string`, `start`+`wait`, `start`+`stdout_lines`+`finish`,
`Command::timeout`. macOS only.

| variant | returns after (p50 / p95) | BYE captured | grandchild left |
|---|---|---|---|
| `output_string()` | **5.0 / 5.07 s** | 20/20 | 0 |
| `start().wait()` | 5.0 / 5.03 s | n/a | 0 |
| `stdout_lines()` until the end | **never: 5/5 hangs** (30 s guard; the stream would wait for the grandchild) | yes | 0 after drop |
| `timeout(2s).output_string()` | **5.0 / 5.07 s**, `timed_out=false` | 20/20 | 0 |
| `timeout(2s)` + `stdout_lines()` | 2.0 / 2.02 s | 20/20 | 0 |

The 5 s is a hard-coded constant (`running/mod.rs: PUMP_TEARDOWN = 5s`) and is not
configurable. `Command::timeout` does not bound it. `stdout_lines()` does not apply it
at all.

### W6 stdin: child prompts "Continue? [y/N]" and reads stdin
APIs: `Command::output_string` (default stdin), `keep_stdin_open`+`wait`,
`use_pty`+`output_string`.

* **Default stdin:** returns with EOF in 100/100 runs, p95 22 ms. The child sees EOF
  immediately.
* **`keep_stdin_open()` without writing, then `wait()`:** returns, with the child at
  `Exited(3)` and EOF. `wait()` drops the writer.
* **PTY without writing:** returns with EOF in 3/3 runs.

No hangs.

### W7 PTY (openpty on macOS)
APIs: `use_pty`, `pty_size`, `keep_stdin_open`, `wait_for_output`, `take_stdin().write_line`,
`stdout_lines`, `resize_pty`, `output_string`.

| variant | result (macOS) |
|---|---|
| prompt → answer (`Name?` → `Hello bob`); the child saw `isatty` on both in and out | **100/100**, p95 27 ms |
| `"\x03"` written to the master → the child's SIGINT handler runs | **100/100**, p95 2.6 ms |
| `pty_size(80,24)`, then `resize_pty(120,40)` → the child reads 120x40 after SIGWINCH | **100/100**, p95 12.5 ms |
| "print hello and exit", 200 runs | **200/200** with output, 0 hangs, p95 11 ms |

The 200× ConPTY run on **Windows**, which was this workload's main point, is **not
measured**.

### W8 host death: a `host` process owns a live 4-level tree
APIs: `Command::start`, `ProcessGroup::start`, `Command::kill_on_parent_death`. Results
are OS-counted survivors per cell (20 trials × 4 processes). macOS uses run 3.

| owner mode | SIGKILL | SIGTERM (default disposition) | SIGINT (default) | `std::process::exit(0)` while holding the handle | SIGTERM/SIGINT caught → drop |
|---|---|---|---|---|---|
| `Command::start` | **80/80** | **80/80** | **80/80** | **80/80** | 0/80 · 0/80 |
| `ProcessGroup::start` | **80/80** | **80/80** | **68/68** | **80/80** | – |
| `kill_on_parent_death()` | **80/80** | **80/80** | **80/80** | – | – |
| Linux CgroupV2 (smoke) | own/group 12/12; pdeath 9/12 (only the direct child dies) | same | same | – | 0/12 |

* An abrupt owner death leaves the whole tree behind on macOS and on Linux, even with
  the cgroup backend. Nothing tears the cgroup down when its owner dies. processkit
  documents this (`kill_on_parent_death_scope()`: Unsupported on macOS,
  DirectChildOnly on Linux).
* "Default-disposition SIGTERM/SIGINT" and `process.exit()` behave the same as
  SIGKILL here, because Rust `Drop` never runs. A Node host is in exactly this
  situation: by default Node exits on these signals and on `process.exit()` without
  running napi destructors.
* The first macOS run had 4 survivors with "caught → drop". The cause was a harness
  race (the signal arrived before the handler was registered). It was fixed and
  re-run: 0.

### W9 spawn overhead: 50 warm-up + 500 measured, interleaved (macOS)

| contender | p50 | p95 |
|---|---|---|
| `std::process::Command::output` (baseline) | 6.85 ms | 11.74 ms |
| `std::process::Command::status` | 6.82 | 11.34 |
| `tokio::process::Command::output` | 6.78 | 11.49 |
| **processkit `Command::output_bytes`** | **6.87 (1.002×)** | 11.92 (1.016×) |
| processkit `start().wait()` | 6.89 (1.006×) | 11.72 |
| processkit shared `ProcessGroup` `output_bytes` | 6.86 (1.001×) | 11.29 |

K4 = 1.002 on macOS. Not measured on Linux or Windows. On Windows, upstream's own
bench claims +3.7%, and +330% if `NtGetNextThread` is unavailable.

### W10 program resolution
APIs: `Command::new(bare).run()`, `Command::resolve_program`, `Command::prefer_local`.

* macOS: `git` and `npm` by bare name resolve the same as with `std` (both OK).
* The Windows `npm` → `npm.cmd` PATHEXT resolution and the `.cmd` tricky-argument
  safety test are written into the harness (14 arguments, including `&`, `%PATH%`,
  quotes, `^`, `!`, compared against `std` byte-for-byte, with an injection probe)
  but have **not been run**.

## 5. Failures, each with a minimal repro

1. **W5: `stdout_lines()` never ends while a descendant holds stdout (K2).** 5/5 runs
   hung past 30 s. `output_string()` and `wait()` on the same child return after 5 s.
   ```rust
   let mut run = processkit::Command::new("sh").args(["-c", "sleep 600 & echo BYE"]).start().await?;
   let mut lines = run.stdout_lines()?;
   while let Some(l) = lines.next().await { println!("{l}"); } // prints BYE, then blocks ~600 s
   ```
2. **W5: a fixed 5 s stall that `Command::timeout` does not bound (K3).**
   `Command::new("sh").args(["-c","sleep 600 & echo BYE"]).timeout(Duration::from_secs(2)).output_string()`
   returns after about 5.07 s with `timed_out=false`. Every run whose tool leaves a
   daemon or helper holding stdout pays 5 s.
3. **W8: the owner's abrupt death orphans the whole tree on macOS and Linux (K1-host).**
   Run a host that holds `Command::new("sh").args(["-c","sleep 600 & sleep 600"]).start()`,
   then `kill -9 <host>` (or `kill -TERM` with no handler, or `std::process::exit`).
   `pgrep sleep` shows both sleeps still alive (217/217 trees on macOS). With
   `kill_on_parent_death()`, only the direct child dies, and only on Linux.
4. **W2: a `setsid()` descendant escapes on macOS and on Linux without cgroups.**
   `sh -c 'setsid sleep 600 &'` under `start()`, then drop: the sleep survives
   (200/200). This is documented; under cgroup v2 it is contained.
5. **W4: unbounded host memory with a lagging stream consumer.** `start()` a `yes`,
   take `stdout_lines()`, don't poll. RSS grows without limit (+345 MB per 200 MB of
   output). `output_string()` holds 2.9× the output size.
6. **W1/W3: on the ProcessGroup backend, `ProcessGroup::shutdown()`/`stop()` with
   un-awaited handles always burns the full grace and misreports escalation.**
   `group.start(&cmd)` (not awaited), then `group.stop(500ms, true)` on a child that
   exits on SIGTERM: elapsed 500 ms, `escalated: true`, and the child's last stdout
   line is lost when the handle is dropped. This is documented.

## 6. Promises: held / failed / untested

| Promise (README/docs) | Verdict | Evidence |
|---|---|---|
| "no descendant ever outlives your program" (README headline) | **FAILS** on macOS/Linux for abrupt exit (SIGKILL, unhandled SIGTERM/SIGINT, `process::exit`). It holds for Drop-based exit. The caveat appears only deep in the docs. | W8 |
| Dropping the handle or group reaps every descendant, grandchildren included | **HOLDS**: 0 survivors in about 3,800 teardowns, including root-already-exited | W1, W3–W7 |
| The containment weakness is reported, never silent (`Mechanism`) | **HOLDS**: `process_group`/`cgroup_v2` reported correctly; setsid escapes exactly where documented | W2 |
| Timeout is captured, cancellation is an error | **HOLDS** | W1 |
| Graceful TERM → grace → KILL (Unix) | **HOLDS**, within +25 ms of the grace | W3 |
| Windows atomic kill / CTRL_BREAK opt-in / Job Object kill-on-close on owner death | **UNTESTED** | – |
| "the pipe is always fully drained, so the child never blocks" | **HOLDS once a consuming verb runs**. Before that, the child blocks (backpressure). | W4 |
| `stdout_lines`: "no full-output buffering" | **MISLEADING**: a lagging consumer buffers everything (+304–345 MB for 200 MB) | W4 |
| A leaked pipe is "cut off after a bounded teardown grace" | **PARTLY**: true for `output_*`/`wait` (5 s); false for `stdout_lines` (hangs); not bounded by `timeout` | W5 |
| Stdin is closed by default, so the child sees EOF | **HOLDS** | W6 |
| PTY prompt/answer, `\x03`, resize via SIGWINCH (Unix) | **HOLDS** on macOS | W7 |
| ConPTY on Windows | **UNTESTED** | – |
| `kill_on_parent_death` scope: WholeTree on Windows / DirectChildOnly on Linux / Unsupported on macOS | **HOLDS** for Linux and macOS, as documented; Windows untested | W8 |
| Low overhead vs `std` | **HOLDS** on macOS (1.002×) | W9 |
| PATHEXT `.cmd` resolution with BatBadBut-safe quoting | **UNTESTED** | W10 |
| Its own CI suite is green on every OS | **UNTESTED** (Part 1 not run) | §2 |

## 7. Verdict: build on it, with fixes

1. **The core promise holds where we could measure it.** Teardown during a task
   (kill / drop / timeout / cancel / group, including root-already-exited) left 0
   orphans in about 3,800 OS-counted teardowns on macOS and Linux. p95 was ≤ 35 ms,
   graceful stops landed within +25 ms of the grace, nothing was lost, and spawn
   overhead was 1.00× `std`. Building this ourselves would cost months.
2. **Required fixes, all in our wrapper (no fork):**
   * Never expose an unbounded `stdout_lines()`: always set `timeout` or
     `inactivity_timeout` (W5 hang).
   * Account for the fixed 5 s pipe-drain stall in our latency budget, or report it
     upstream (W5).
   * Always set an `OutputBufferPolicy` byte cap (W4 memory).
   * Always await `RunningProcess` handles before `group.stop()` (zombie footgun).
3. **Host-death orphans need our own architecture, whichever library we use.** On
   macOS and Linux nothing kills a tree when a Node host is SIGKILLed, gets an
   unhandled signal, or calls `process.exit()`. The napi package needs signal and exit
   hooks that drop handles, plus an out-of-process watchdog/reaper for SIGKILL. On
   Linux that could use cgroup and `PR_SET_CHILD_SUBREAPER`.
4. **setsid escape on macOS and Linux without cgroups is an OS limit, not a defect.**
   Surface `mechanism()` and document it. On Linux, prefer the cgroup backend where
   delegation exists: it contained 6/6 escapees.
5. **The verdict is conditional on the Windows run and Part 1, neither of which
   exists.** Windows is where processkit has the most code: Job Object, ConPTY, and (code
   reading) a process-global `SetStdHandle` swap during headless ConPTY spawns, which is risky
   inside a multi-threaded Node host. Re-run the committed CI on windows-latest before
   committing. If ConPTY hangs or loses output, or W10 shows injection, downgrade to
   "do not build on it" for Windows.

## 8. Upstream bugs to report (drafted, **not** posted)

1. `RunningProcess::stdout_lines()` does not apply the `PUMP_TEARDOWN` cut-off after
   the direct child exits. A grandchild holding stdout makes the stream hang until the
   grandchild exits, which is inconsistent with `output_string()`/`wait()` (5 s).
   Repro: §5.1.
2. The `PUMP_TEARDOWN` constant (5 s) is not configurable and is not bounded by
   `Command::timeout`. A `timeout(2s)` run returns after 5 s with `timed_out=false`.
   Repro: §5.2.
3. The README headline "no descendant ever outlives your program" contradicts the
   documented abrupt-death scope (`kill_on_parent_death_scope`: Unsupported on macOS,
   DirectChildOnly on Linux). The headline should carry the caveat. Repro: §5.3.
4. On the ProcessGroup backend, `ShutdownReport` says `escalated: true`,
   `drained_within_grace: false` when the member actually exited on the soft signal
   and is only an unreaped zombie. The group owns that child's handle and could
   reap it or check for a zombie before probing. Repro: §5.6.
5. Docs: `stdout_lines()` is described as "no full-output buffering", but with the
   default `OutputBufferPolicy::unbounded()` a lagging consumer buffers the entire
   output. There is no backpressure mode for streaming consumers. Repro: §5.5.

## 9. Incidents during the run

* **CI billing lock.** See §0. No KPI in this report comes from CI.
* **Host disk full.** The disk hit 100% twice: 61 MB free, then 65 MB. Several agents
  share this laptop, and a Docker VM image grew to 34 GB. The first macOS run lost 13
  cases to the harness's own ENOSPC panic (`evidence/part2-macos-run1-diskfull.txt`);
  they were re-run in run 2. The Docker VM died both times, which ended the Linux run.
  To protect the host, the Docker work was not restarted again and the multi-GB
  upstream build (Part 1) was not attempted. This agent's own disposable artefacts
  (harness `target/`) were deleted to give space back.

## 10. Reproduce

```sh
cd spikes/pk-eval && cargo build --release
./target/release/pkeval all                 # every case, this OS; KPI/INFO/FAIL lines + SUMMARY
./target/release/pkeval case W5.stream      # one case
PKEVAL_ITERS=5 ./target/release/pkeval all  # quick pass
scripts/run-linux-docker.sh <outdir> part2|part2-cgroup|part1   # Linux via Docker
```
CI: push to `spike/processkit-eval` runs `part1` and `part2` on ubuntu/macos/windows-latest.
