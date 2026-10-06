# ADR-0001 · Process model: containment, tree kill, PID safety, exit observation

> **Lead status (2026-10-02):** reviewed by Codex (`docs/research/adr-reviews-s1-s2.md`, verdict *reject as a product baseline*). The accepted parts and the replacement design are in **ADR-0005 (supervisor)**; where this ADR and ADR-0005 disagree, ADR-0005 wins.


**Status:** proposed (WP S1 spike; decisions backed by CI evidence; awaiting the lead)

**Covers:** Q1 (Windows race-free job), Q2 (nested jobs), Q3 (Windows graceful stop), Q4 (Unix groups and
sessions), Q7 (PID reuse + exit observation under INV-16), Q8 (spawn baseline for K4).
Host-exit cleanup and host signals are ADR-0002.

## Context

PLAN §3 promises: `kill()` always kills the **whole** tree (grandchildren too, even after the root exited);
graceful first, forced after `graceMs`; timeout/cancel/scope exit kill the tree; never a shell. INV-03 (no
shell; safe `.cmd`/`.bat` quoting or refusal), INV-04 (kill = tree), INV-11 (`unsafe` only in `sys/`).
G0 option B: our own lean Rust core, no processkit dependency. New invariant **INV-16**: child exit is
observed by a per-child blocking wait or a pidfd-style event, **never** a SIGCHLD reaper (tokio's hangs
inside Node/Bun on Linux without pidfd).

Evidence comes from the throwaway crate `spikes/process` (Rust 1.98 stable on the runners unless noted),
run by `.github/workflows/spike-process.yml` on every push to `spike/process`.

**Evidence runs** (job logs carry every `RESULT` line verbatim; each job's step summary lists them too):
- Run 1: https://github.com/gmhelmold/hugr-omni/actions/runs/36955254413 — jobs
  `windows` (windows-latest x64) /job/110676693505 · `unix (ubuntu-latest)` (Linux 6.17 x86_64) /job/110676693423 ·
  `unix (ubuntu-24.04-arm)` (Linux 6.17 aarch64) /job/110676693429 · `unix (macos-latest)` (Darwin 25.6 arm64) /job/110676693536
- Run 2: https://github.com/gmhelmold/hugr-omni/actions/runs/36955915197 — Unix jobs only (Windows job superseded):
  `unix (ubuntu-latest)` /job/110678719043 · `unix (ubuntu-24.04-arm)` /job/110678719284 · `unix (macos-latest)` /job/110678719304
- Run 3: https://github.com/gmhelmold/hugr-omni/actions/runs/36956229410 — all green: `windows` /job/110679683617 (adds the
  Q1 preemption control, precise Q2 membership, the Q1(c) stable/nightly steps; runner stable was rustc 1.99.0) ·
  `unix (ubuntu-latest)` /job/110679683598 · `unix (ubuntu-24.04-arm)` /job/110679683463 · `unix (macos-latest)` /job/110679683767

Reproducibility: every Q3/Q5/Q7 Windows row of run 3 equals run 1 (timings aside), and every Unix job has
the same set of `ALIVE`/`stopped`/`ok` rows in runs 1, 2 and 3.

Fixtures: `spike fx tree` spawns a grandchild as its **first** action and prints its pid; `fx tree-exit`
does the same and exits immediately; `fx escape` has the grandchild call `setsid()` and confirm it.
"dead" means exited or zombie.

## Q&A

### Q1 · Windows: create the child inside a job with no race

Each trial: create a job (`KILL_ON_JOB_CLOSE`), spawn `fx tree`, read the grandchild pid, check
`IsProcessInJob(grandchild, job)`, `TerminateJobObject`, require root and grandchild dead within 5 s.
**Positive control** (`late-assign`: assign only after the grandchild exists) proves the checker sees escapes:

> `RESULT Q1 os=windows ctx=top approach=late-assign(control) ok=0/10 grandchild_in_job=0/10 errors=0` (run 1, windows)

| Approach | Result (run 1, windows) |
|---|---|
| naive: std spawn, then `AssignProcessToJobObject` | `approach=naive-assign-after-spawn ok=100/100 grandchild_in_job=100/100` — passes only because child start-up is slower than the assign. Simulated host preemption between spawn and assign (run 3, windows): `approach=naive+preempt(2ms) ok=99/100 grandchild_in_job=99/100` · `approach=naive+preempt(10ms) ok=0/100 grandchild_in_job=0/100` · `approach=naive+preempt(50ms) ok=0/100 grandchild_in_job=0/100` — **racy** |
| **(a) std `Command` + `CREATE_SUSPENDED` → assign → resume** | `approach=a-suspended+NtResumeProcess ok=100/100 grandchild_in_job=100/100 errors=0` · `approach=a-suspended+toolhelp-resume ok=100/100 grandchild_in_job=100/100 errors=0` |
| **(b) `CreateProcessW` + `STARTUPINFOEX` + `PROC_THREAD_ATTRIBUTE_JOB_LIST`** | `approach=b-CreateProcessW+JOB_LIST ok=100/100 grandchild_in_job=100/100 errors=0` |
| (c) std `spawn_with_attributes`/`raw_attribute` | **not usable on stable**: `RESULT Q1 os=windows c-std-raw_attribute-on-stable rustc="rustc 1.99.0 (b940084d7 2026-09-28)" compile_error=E0554`; on nightly it works: `RESULT Q1 os=windows ctx=top approach=c-std-spawn_with_attributes(nightly) ok=100/100 grandchild_in_job=100/100 errors=0` (run 3) |

*Can (a) resume without the thread handle?* Yes, two ways, both 100/100. std closes nothing — it keeps the
thread handle — but `ChildExt::main_thread_handle` is unstable (`windows_process_extensions_main_thread_handle`,
#96723), so on stable we either call `NtResumeProcess(hProcess)` (ntdll export, undocumented but present
since XP) or walk a `CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD)` and `ResumeThread` the child's threads
(documented, but scans every thread on the machine). Cost, including job creation (Q8, run 1, windows):

> `RESULT Q8 os=windows variant=std-status-nullio warmup=50 n=500 p50_us=3402 p95_us=4064`
> `RESULT Q8 os=windows variant=job+suspended+NtResumeProcess warmup=50 n=500 p50_us=3298 p95_us=3812`
> `RESULT Q8 os=windows variant=job+suspended+toolhelp-resume warmup=50 n=500 p50_us=9460 p95_us=11689`
> `RESULT Q8 os=windows variant=job+CreateProcessW+JOB_LIST warmup=50 n=500 p50_us=3298 p95_us=3662`
> run 3 (slower runner, same ranking): std 5263/6132 · NtResumeProcess 5343/6658 · toolhelp 15869/17079 · JOB_LIST 5289/6098 µs p50/p95

*(c)* On Rust 1.98 `CommandExt::spawn_with_attributes` and `ProcThreadAttributeList` are
`#[unstable(feature = "windows_process_extensions_raw_attribute", issue = "114854")]` (std source,
`library/std/src/os/windows/process.rs`; still unstable on the runners' stable 1.99, where the required
`#![feature]` is refused with E0554). Run 1's nightly step (rustc
1.101.0-nightly 2026-10-01, before the crate enabled the feature) failed with
`error[E0658]: use of unstable library feature 'windows_process_extensions_raw_attribute'`; with the feature
enabled, stable refuses it (`E0554`) and nightly works 100/100 at the same cost as (a)/(b):
> `RESULT Q8 os=windows variant=job+std-spawn_with_attributes(nightly) warmup=50 n=500 p50_us=5137 p95_us=5723` vs the same job's `variant=std-status-nullio ... p50_us=5632 p95_us=6384` (run 3)

*If CreateProcessW is required* (approach (b), or (a) without std), the command line must come from a
**port of Rust std's own algorithm**: `library/std/src/sys/args/windows.rs` (`make_command_line`/`append_arg`
for programs; `make_bat_command_line`/`append_bat_arg` for `.bat`/`.cmd`, including the CVE-2024-24576
"BatBadBut" fix shipped in Rust 1.77.2: force-quote every ASCII symbol except `#$*+-./:?@\_`, refuse `\r`/`\n`
and NUL, `%` handling, wrap as `cmd.exe /e:ON /v:OFF /d /c "…"`) plus `resolve_exe` and the environment
block from `library/std/src/sys/process/windows.rs`. Rust std is licensed **MIT OR Apache-2.0**, the same
dual license as hugr-omni (`LICENSE-MIT`, `LICENSE-APACHE`), so a port with the copyright notice kept is
compatible. processkit (MIT) is reference-only: nothing copied.

### Q2 · Windows: does it work when the host is already inside a job?

The GitHub runner already runs every step inside a job (so every Q1 row above was already nested):

> `RESULT Q2 os=windows ci-step-process in_job=true query_ok=true limit_flags=0x0 BREAKAWAY_OK=false SILENT_BREAKAWAY_OK=false KILL_ON_JOB_CLOSE=false` (run 1, windows)

Simulated host jobs (the host process is put in an outer job, itself inside the runner's job = 3 levels), all
approaches 20/20 under every outer configuration (run 1, windows):

> `RESULT Q1 os=windows ctx=outer-kill_on_close approach=a-suspended+NtResumeProcess ok=20/20 grandchild_in_job=20/20 errors=0`
> `RESULT Q1 os=windows ctx=outer-silent_breakaway_ok approach=b-CreateProcessW+JOB_LIST ok=20/20 grandchild_in_job=20/20 errors=0`
> (and the same for `outer-plain`, `outer-breakaway_ok`, and every approach)

Breakaway flags: the legacy pre-Windows-8 trick `CREATE_BREAKAWAY_FROM_JOB` is refused unless the outer job
allows it:

> `RESULT Q2 os=windows ctx=outer-plain CREATE_BREAKAWAY_FROM_JOB spawn=ERR(Access is denied. (os error 5))`
> `RESULT Q2 os=windows ctx=outer-kill_on_close CREATE_BREAKAWAY_FROM_JOB spawn=ERR(Access is denied. (os error 5))`
> `RESULT Q2 os=windows ctx=outer-breakaway_ok CREATE_BREAKAWAY_FROM_JOB spawn=ok child_in_outer_job=false child_in_any_job=true (runner job is above outer)` (run 3)
> `RESULT Q2 os=windows ctx=outer-silent_breakaway_ok plain-child_in_outer_job=false plain-child_in_any_job=true` (run 3: with
> `SILENT_BREAKAWAY_OK` *every* child silently leaves the host's job — yet our explicit per-child job still holds:
> `RESULT Q1 os=windows ctx=outer-silent_breakaway_ok approach=a-suspended+NtResumeProcess ok=20/20 grandchild_in_job=20/20 errors=0`)

So nested jobs (Windows 8 / Server 2012+) make breakaway unnecessary, and our own job must not set
`BREAKAWAY_OK`/`SILENT_BREAKAWAY_OK`: a program that asks for `CREATE_BREAKAWAY_FROM_JOB` inside our tree gets
`ERROR_ACCESS_DENIED` (documented risk).

### Q3 · Windows graceful termination (CTRL_BREAK)

Child created with `CREATE_NEW_PROCESS_GROUP` (inside its job, approach (a)); host sends
`GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, child_pid)`; wait 3 s. Host console modes: inherited (the CI
step has a console without a window), `CREATE_NEW_CONSOLE`, `CREATE_NO_WINDOW`, `DETACHED_PROCESS`.

Finding 1 — `CREATE_NO_WINDOW` gives the host a **windowless console**, not "no console":
> `RESULT Q3 os=windows host=CREATE_NO_WINDOW host_has_console=true console_window=false`
> `RESULT Q3 os=windows host=DETACHED_PROCESS host_has_console=false console_window=false`

Finding 2 — with a console, Rust, Node 22 and Python 3.12 children honour CTRL_BREAK (they exit with
`0xC000013A` = STATUS_CONTROL_C_EXIT in 1–5 ms) and the signal reaches the grandchild (whole console group):
> `RESULT Q3 os=windows host=inherit host_has_console=true child=rust-tree child_extra_flags=- ready=true method=direct send_ok=true send_err=0 exited_within_3s=true exit_code=0xc000013a ms=1 grandchild=dead@0ms ...`
> `RESULT Q3 os=windows host=inherit host_has_console=true child=node ... method=direct send_ok=true ... exited_within_3s=true exit_code=0xc000013a ms=4 ...`
> `RESULT Q3 os=windows host=inherit host_has_console=true child=python ... method=direct send_ok=true ... exited_within_3s=true exit_code=0xc000013a ms=2 ...`

Finding 3 — a `.bat` (run through `cmd.exe` by std) does **not** stop: cmd kills the current command, prints
`Terminate batch job (Y/N)?`, reads EOF from the null stdin, and **continues the script**:
> `RESULT Q3 os=windows host=inherit host_has_console=true child=bat ... send_ok=true ... exit_code=0x0 ms=4 grandchild=- bat_prompt=true bat_continued=true`

Finding 4 — a host with no console (`DETACHED_PROCESS`, i.e. GUI apps, services, Electron) cannot send
directly (`send_err=6` = ERROR_INVALID_HANDLE); temporarily attaching to the child's console works for every
child kind, with or without `CREATE_NO_WINDOW` on the child:
> `RESULT Q3 os=windows host=DETACHED_PROCESS host_has_console=false child=node child_extra_flags=CREATE_NO_WINDOW ready=true method=attach send_ok=true send_err=6 exited_within_3s=true exit_code=0xc000013a ms=5 ...`
> `RESULT Q3 os=windows host=DETACHED_PROCESS host_has_console=false child=rust-tree child_extra_flags=- ... method=attach send_ok=true ... grandchild=dead@0ms ...`
Without `CREATE_NO_WINDOW`, a console child of a console-less host gets a **new visible console window**.

Tier we can promise on Windows: **graceful = best effort** (CTRL_BREAK to the tree's console group: most
runtimes exit at once through their own handler; programs with a handler may clean up; batch scripts keep
going); **forced = guaranteed** (`TerminateJobObject` after `graceMs`).

### Q4 · Unix: `setsid` vs `setpgid(0,0)`, killpg, escapes

Both put root + grandchild in one group and `killpg` kills the grandchild (100/100 on Linux x64, Linux
arm64 and macOS, run 1), also **after the root exited and was reaped**:
> `RESULT Q4 os=linux killpg-kills-grandchild mode=setsid 100/100 gc_in_root_group=100/100` (ubuntu-latest; same on ubuntu-24.04-arm)
> `RESULT Q4 os=linux killpg-after-root-exited-and-reaped mode=setsid 100/100 gc_alive_before_kill=100/100 last_errno=0`
> `RESULT Q4 os=macos killpg-after-root-exited-and-reaped mode=setsid 100/100 gc_alive_before_kill=100/100 last_errno=0` (macos-latest; `setpgid` identical)

The difference is the controlling terminal. A pty is made the controlling terminal of a helper session; the
helper spawns a child that reads stdin (the tty), or receives `^C`:
> `RESULT Q4 os=linux tty child_mode=setpgid test=read armed=true outcome=stopped(sig=21)` — **SIGTTIN: the child hangs forever** (K2)
> `RESULT Q4 os=linux tty child_mode=setsid test=read armed=true outcome=exited(code=0)`
> `RESULT Q4 os=linux tty child_mode=setsid test=ctrlc armed=true outcome=running` (`setpgid` also `running`; control `child_mode=none test=ctrlc ... outcome=signaled(sig=2)`)
> identical on macos-latest.

A descendant that calls `setsid` escapes:
> `RESULT Q4 os=linux setsid-descendant-escapes-killpg survived=true gc_pgid_differs=true` (same on macOS)

Linux `PR_SET_CHILD_SUBREAPER` on the host does catch the orphaned escapee, cheaply, but it makes the
**host** the reaper of every orphan of every library in the process — a foreign daemonizing child leaves a
zombie on the host that nobody (libuv, CPython) will ever reap; and while the root lives the escapee is only
found by a racy `/proc` ppid walk:
> `RESULT Q4 os=linux subreaper-adopts-orphaned-escapee adopted=true found_by_scan=true scan_us=2225 procs=164 host_must_reap=true`
> `RESULT Q4 os=linux descendant-walk-root-alive found_escapee=true walk_us=2085 (racy: forks during walk are missed)`
> `RESULT Q4 os=linux subreaper=1 foreign-orphan-left-zombie-on-host=true` vs `subreaper=0 ... =false`

cgroup v2 (`cgroup.kill`) would catch escapees, but only where the cgroup is delegated; on the runner it is not:
> `RESULT Q4 os=linux cgroup-v2 own_cgroup=/system.slice/hosted-compute-agent.service can_create_child_cgroup=false cgroup_kill_file=true`

How to get `setsid` without fork: std's `CommandExt::setsid` is unstable (`process_setsid`, #105376) and std
maps it to `POSIX_SPAWN_SETSID` only on linux-gnu; `pre_exec(setsid)` forces std's fork+exec path, which is
expensive in a large host (Q8). Calling `posix_spawn` directly with `POSIX_SPAWN_SETSID` (glibc ≥ 2.26:
`0x80`; macOS: `0x0400`, `<sys/spawn.h>` — not exported by the libc crate) is as fast as std or faster:
> `RESULT Q8 os=linux variant=RSS1GiB-std-pre_exec-setsid(fork+exec) warmup=50 n=500 p50_us=26592 p95_us=27974` (ubuntu-24.04-arm)
> `RESULT Q8 os=linux variant=RSS1GiB-raw-posix_spawn-SETSID warmup=50 n=500 p50_us=532 p95_us=589` (ubuntu-24.04-arm)
> `RESULT Q8 os=linux variant=RSS1GiB-std-pre_exec-setsid(fork+exec) warmup=50 n=500 p50_us=1429 p95_us=1558` vs `RSS1GiB-raw-posix_spawn-SETSID ... p50_us=638` (ubuntu-latest)

### Q7 · PID reuse safety, and exit observation under INV-16

**Pin the group by not reaping the root.** Observe the root's exit without reaping it
(`waitid(WEXITED|WNOWAIT)`, pidfd, or kqueue); while the root is a zombie its pid = pgid cannot be reused,
so `killpg` reaches exactly the remaining tree. Reaping first leaves an empty group whose id is free:
> `RESULT Q7 os=linux observe-exit-with-WNOWAIT-then-killpg 100/100 root_still_zombie=100/100` (ubuntu-latest)
> `RESULT Q7 os=macos observe-exit-with-WNOWAIT-then-killpg 100/100 root_still_zombie=100/100` (macos-latest)
> `RESULT Q7 os=linux killpg-on-empty-reaped-group ret=-1 errno=3 (ESRCH=3; id now reusable)`
(POSIX also forbids reusing a pgid while the group has members, which is why Q4's after-reap kill worked;
the pin closes the remaining window, when every member died and the number recycled.)

**Linux pidfd** (kernel ≥ 5.3; runners: 6.17) works end to end and can never hit a stranger:
> `RESULT Q7 os=linux pidfd open=true send_signal=true poll_readable_on_exit=true waitid_P_PIDFD=true send_after_reap_errno=3 (ESRCH=3) PIDFD_SIGNAL_PROCESS_GROUP_errno=0`
(`PIDFD_SIGNAL_PROCESS_GROUP` needs ≥ 6.9; not needed given the zombie pin.)

**macOS**: no pidfd; kqueue `NOTE_EXIT` fires while the root is still an unreaped zombie, so the pin holds:
> `RESULT Q7 os=macos kqueue-EVFILT_PROC-NOTE_EXIT register=true fired=true root_unreaped_zombie_at_event=true`

**Windows**: an open process handle pins the pid; the job is addressed by handle, never by pid:
> `RESULT Q7 os=windows handle-pins-pid exited=true OpenProcess_while_handle_held=true OpenProcess_after_all_handles_closed_err=87 (87=ERROR_INVALID_PARAMETER: pid released)`
> `RESULT Q7 os=windows TerminateJobObject-on-empty-job ok=true (no pid involved)`

**INV-16: per-child blocking `waitid` thread vs pidfd/kqueue event watcher.**
> `RESULT Q7 os=linux exit-observe-latency blocking-waitid-thread(64KiB stack) p50_us=724 p95_us=810 | pidfd+poll p50_us=697 p95_us=813 register_failed_child_already_gone=0/300` (ubuntu-latest)
> `RESULT Q7 os=macos exit-observe-latency blocking-waitid-thread(64KiB stack) p50_us=1894 p95_us=3001 | kqueue-NOTE_EXIT p50_us=1783 p95_us=1997 register_failed_child_already_gone=0/300`
> `RESULT Q7 os=linux exit-observe-256-concurrent blocking-waitid-threads observed=256/256 threads=256 wall_ms=300 | pidfd+poll(single watcher thread) observed=256/256 threads=1 wall_ms=301 fds=256`
> `RESULT Q7 os=macos exit-observe-256-concurrent blocking-waitid-threads observed=256/256 threads=256 wall_ms=369 | kqueue-NOTE_EXIT(single watcher thread) observed=256/256 threads=1 wall_ms=368 fds=1`

Hostile hosts decide it. With `SIGCHLD = SIG_IGN` in the host (auto-reap), a blocking `waitid` on macOS
does not return when *its* child exits but when **all** children have exited; pidfd/kqueue fire on time:
> `RESULT Q7 os=macos host-SIGCHLD=SIG_IGN blocking-waitid(short 100ms child, sibling 1500ms) returned_after_ms=1546 ret=-1 errno=10 (ECHILD=10) | kqueue-NOTE_EXIT fired=Ok(true) after_ms=184`
> `RESULT Q7 os=linux host-SIGCHLD=SIG_IGN blocking-waitid(short 100ms child, sibling 1500ms) returned_after_ms=100 ret=-1 errno=10 (ECHILD=10) | pidfd+poll fired=Ok(true) after_ms=101`
With a foreign `waitpid(-1)` reaper in the host (Python `os.wait()` / old asyncio watchers) both observe the
exit, but the status can be stolen:
> `RESULT Q7 os=linux host-foreign-waitpid(-1)-reaper blocking-waitid observed_exit=50/50 got_status=49/50 | pidfd+poll observed_exit=50/50 | reaper_stole=101`

### Q8 · Baseline for K4: std::process spawn-to-exit of a trivial child (50 warm-up + 500 runs)

`noop` = `fn main() {}` built in release. `status` = null stdio; `output` = piped stdout/stderr.

| OS (job) | std `status()` p50 / p95 µs — run 1 · run 3 | std `output()` p50 / p95 µs — run 1 · run 3 | proposed core path p50 / p95 µs — run 1 · run 3 | ratio core/std (p50) |
|---|---|---|---|---|
| Linux x86_64 (ubuntu-latest) | 717 / 786 · 703 / 789 | 710 / 791 · 701 / 791 | raw `posix_spawn`+SETSID 637 / 737 · 649 / 768 | 0.89 · 0.92 |
| Linux aarch64 (ubuntu-24.04-arm) | 571 / 624 · 583 / 657 | 566 / 609 · 586 / 669 | raw `posix_spawn`+SETSID 528 / 576 · 556 / 616 | 0.92 · 0.95 |
| macOS arm64 (macos-latest) | 2832 / 3446 · 2170 / 3838 | 1671 / 3234 · 1615 / 2008 | raw `posix_spawn`+SETSID 1308 / 2974 · 1811 / 3376 | 0.46 · 0.83 (noise) |
| Windows x64 (windows-latest) | 3402 / 4064 · 5263 / 6132 | 3340 / 3793 · 5329 / 6427 | job + suspended + NtResumeProcess 3298 / 3812 · 5343 / 6658 | 0.97 · 1.02 |

Verbatim lines: `RESULT Q8 os=linux variant=std-status-nullio warmup=50 n=500 p50_us=717 p95_us=786`,
`RESULT Q8 os=linux variant=std-output-piped warmup=50 n=500 p50_us=710 p95_us=791` (ubuntu-latest);
`... p50_us=571 p95_us=624`, `... p50_us=566 p95_us=609` (ubuntu-24.04-arm);
`RESULT Q8 os=macos variant=std-status-nullio warmup=50 n=500 p50_us=2832 p95_us=3446`,
`RESULT Q8 os=macos variant=std-output-piped warmup=50 n=500 p50_us=1671 p95_us=3234` (macos-latest — the
macOS runner is noisy: the two std variants differ by 1.7×, so K4 on macOS needs a paired, interleaved
measurement); `RESULT Q8 os=windows variant=std-status-nullio warmup=50 n=500 p50_us=3402 p95_us=4064`,
`RESULT Q8 os=windows variant=std-output-piped warmup=50 n=500 p50_us=3340 p95_us=3793` (run 1, windows) and
`... p50_us=5263 p95_us=6132`, `... p50_us=5329 p95_us=6427` (run 3, windows). Absolute numbers move 50% between
runner instances, so K4 must compare core vs std **inside the same job** (as this table's ratio column does),
never against a stored baseline. The core paths are at or below std on every OS (K4 target ≤ 1.25×).

## Decision

1. **Windows spawn = approach (a):** `std::process::Command` with
   `CREATE_SUSPENDED | CREATE_NEW_PROCESS_GROUP` (plus `CREATE_NO_WINDOW` when the host has no console) →
   `AssignProcessToJobObject` to a fresh per-child job created with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`
   (no breakaway flags) → `NtResumeProcess` (resolved with `GetProcAddress` at runtime; Toolhelp-snapshot
   resume as fallback). If assignment fails, `TerminateProcess` the still-suspended child (it never ran) and
   return a typed error. This keeps std's program resolution, quoting (including the BatBadBut fix), env block
   and pipes — nothing to port — at no measured cost. Switch to `spawn_with_attributes` +
   `PROC_THREAD_ATTRIBUTE_JOB_LIST` when it is stable (no suspension needed).
2. **Windows stop:** graceful = `GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, root_pid)`; when the host has no
   console, `AttachConsole(root_pid)` → send → `FreeConsole` under a process-wide lock; forced =
   `TerminateJobObject` after `graceMs`. Exit code `0xC000013A` is reported as 3221225786.
3. **Unix spawn:** our own `posix_spawn(p)` with `POSIX_SPAWN_SETSID` (plus SETSIGDEF/SETSIGMASK, and
   `POSIX_SPAWN_CLOEXEC_DEFAULT` on macOS). Never `fork`, never `pre_exec`. PTY children get the same
   session (and `TIOCSCTTY`). Owning `posix_spawn` means the core owns PATH resolution against the
   child's final PATH (PLAN §3 already requires that), argv/envp building and the stdio file actions.
4. **Unix stop:** graceful = `killpg(pgid, SIGTERM)`; forced = `killpg(pgid, SIGKILL)` after `graceMs`.
   No subreaper, no `/proc` scans; descendants that leave the group are declared out of reach (Linux cgroup v2
   delegation is a possible future tier, not v1).
5. **PID safety:** the root is never reaped while the `Child` handle may still signal its group: exit is
   observed with WNOWAIT semantics and the zombie is reaped only after the final `killpg` (and after the
   watchdog untrack, ADR-0002). Windows: hold the process handle and the job handle.
6. **INV-16 exit observation:** Linux: a pidfd per child (`pidfd_spawnp` when glibc ≥ 2.39, else
   `pidfd_open` immediately after `posix_spawn`) watched by one dedicated reactor thread (epoll); status read
   with `waitid(P_PIDFD, WEXITED|WNOWAIT)`. Fallback for kernels < 5.3: one blocking
   `waitid(P_PID, WEXITED|WNOWAIT)` thread per child (64 KiB stack). macOS: one dedicated kqueue thread
   (`EVFILT_PROC`/`NOTE_EXIT`); if registration fails because the child is already a zombie, a
   `waitid(WNOHANG|WNOWAIT)` probe. Windows: wait on the process handle (`RegisterWaitForSingleObject` or a
   waiter thread). Never a SIGCHLD handler, never tokio's process reaper.

## Rejected alternatives

- **Naive spawn-then-assign (Windows):** correct only while the host is not descheduled between the two calls.
- **Toolhelp resume as the primary path:** +6 ms per spawn (scans every thread on the machine).
- **(b) CreateProcessW + JOB_LIST now:** equally race-free and documented, but it means porting std's
  quoting, PATH resolution and env block today; kept as the fallback if `NtResumeProcess` is vetoed.
- **(c) std `spawn_with_attributes`/`raw_attribute`:** refused on stable 1.98/1.99 (unstable feature); works on
  nightly (100/100). Adopt it the release it stabilises.
- **`CREATE_BREAKAWAY_FROM_JOB`:** refused (`os error 5`) unless the outer job allows it; unnecessary with nested jobs.
- **`setpgid(0,0)`:** a child that reads the terminal is stopped by SIGTTIN forever.
- **`pre_exec(setsid)` / std `setsid`:** fork path (26.6 ms vs 0.53 ms with a 1 GiB host) / unstable.
- **`PR_SET_CHILD_SUBREAPER` on the host:** leaves other libraries' orphans as zombies on the host.
- **Reaping the root on exit:** reopens the PID/PGID reuse window (`killpg-on-empty-reaped-group errno=3`).
- **Per-child blocking `waitid` as the primary watcher:** one thread per child, and wrong under
  `SIGCHLD=SIG_IGN` on macOS (returns only after all children exit).

## Consequences for the contract

Frozen `sys` seam (exact text for the trait docs):

- `sys::spawn(spec) -> Result<RawChild>` — *"Returns only after the child is contained: Windows — created
  suspended, assigned to its own job (KILL_ON_JOB_CLOSE, no breakaway), then resumed; no instruction of the
  child runs outside the job. Unix — created by posix_spawn with POSIX_SPAWN_SETSID: the child is the leader
  of a new session and process group (pgid == pid) before its first instruction. Never forks the host, never
  runs a shell (a .bat/.cmd goes through std's quoting, which refuses unsafe arguments)."*
- `sys::signal_tree(&RawChild, Graceful | Forced)` — *"Graceful: Unix killpg(pgid, SIGTERM); Windows
  CTRL_BREAK_EVENT to the child's console process group (borrowing the child's console when the host has
  none). Forced: Unix killpg(pgid, SIGKILL); Windows TerminateJobObject. Valid until `reap`; never targets a
  recycled pid because the root is not reaped before it."*
- `sys::exit_events()` — *"Reports root exit (code or signal) without reaping it (WNOWAIT semantics).
  Linux: pidfd + one reactor thread; macOS: kqueue NOTE_EXIT + one thread; Windows: process-handle wait.
  Never installs a SIGCHLD handler (INV-16)."*
- `sys::reap(RawChild)` — *"Final step: after the last signal_tree and the watchdog untrack; releases pid,
  pidfd/handles and the job."*

GUARANTEES.md rows:

| Promise | Windows | Linux | macOS |
|---|---|---|---|
| `kill()` kills the whole tree, grandchildren included, even after the root exited | **Guaranteed** (job object) | **Guaranteed for descendants that stay in the child's process group**; descendants that call `setsid`/`setpgid` are not reached | same as Linux |
| A grandchild spawned at the child's first instruction is contained | Guaranteed (suspended until assigned) | Guaranteed (session created inside posix_spawn) | Guaranteed |
| Graceful phase | **Best effort**: CTRL_BREAK to the tree's console group; batch scripts continue after it | SIGTERM to the group | SIGTERM to the group |
| Forced phase after `graceMs` | Guaranteed (TerminateJobObject) | Guaranteed (SIGKILL to the group) | Guaranteed |
| `kill()` never signals an unrelated process (PID reuse) | Guaranteed (handles) | Guaranteed while the `Child` lives (root zombie pins pid = pgid) | same as Linux |
| A child reading the terminal never hangs on SIGTTIN | n/a | Guaranteed (own session) | Guaranteed |
| Exit observation never uses SIGCHLD and works when the host ignores SIGCHLD or reaps with `waitpid(-1)` (status may be unavailable if the host steals it) | Guaranteed | Guaranteed (pidfd, kernel ≥ 5.3) | Guaranteed (kqueue) |
| Minimum OS | Windows 8 / Server 2012 (nested jobs) | Linux 5.3 for pidfd (fallback thread below), glibc ≥ 2.26 for POSIX_SPAWN_SETSID | macOS version providing `POSIX_SPAWN_SETSID` (in the current SDK; exact minimum not verified — open risk) |

## Open risks

- `NtResumeProcess` is undocumented (stable for 20+ years, used by Sysinternals); vetoing it means approach (b) and
  the std quoting port now, or +6 ms Toolhelp resume.
- A child that itself uses `CREATE_BREAKAWAY_FROM_JOB` fails with ERROR_ACCESS_DENIED inside our job.
- Windows handle inheritance: std serialises its own spawns (`CREATE_PROCESS_LOCK`), but another runtime in
  the same process (libuv in Node) spawning concurrently can inherit our pipe ends during its CreateProcess,
  delaying EOF; the "root exited → return after graceMs" rule bounds the damage. Not measured.
- The `AttachConsole` fallback is process-global state: it needs a lock and must never run in a host that has a console.
- Zombie roots live as long as the user holds a `Child`; leaked handles leak one zombie each.
- One pidfd per live child on Linux (RLIMIT_NOFILE); kqueue on macOS uses one fd total.
- musl, glibc < 2.26 and older macOS releases were not tested for `POSIX_SPAWN_SETSID`; the minimum macOS
  version is unverified (only Darwin 25.6 arm64 on CI and Darwin 24.3 x86_64 locally). Bun/Deno not exercised.
- Escapes via `setsid` on Unix remain; cgroup v2 delegation (systemd user sessions) is the only real fix on Linux.
- macOS runner timing noise (Q8) makes a single-number K4 on macOS unreliable.
