# ADR-0002 · Host-exit cleanup and host signals

> **Lead status (2026-10-02):** reviewed by Codex (`docs/research/adr-reviews-s1-s2.md`, verdict *reject as a product baseline*). The accepted parts and the replacement design are in **ADR-0005 (supervisor)**; where this ADR and ADR-0005 disagree, ADR-0005 wins.


**Status:** proposed (WP S1 spike; decisions backed by CI evidence; awaiting the lead)

**Covers:** Q5 (host death cleanup, per OS) and Q6 (host Ctrl-C / SIGTERM with Node and Python hosts).
Process model (job per child, `setsid`, zombie pinning, exit observation) is ADR-0001.

## Context

PLAN §3 promises: *"O GC nunca mata um processo vivo. Quando o host sai, ele mata o que sobrou, netos órfãos
incluídos (os níveis de garantia estão no GUARANTEES)."* The host is a Rust program, a Node/Bun/Deno process
(Node-API addon) or a Python interpreter (PyO3). The host can die in five ways: normal exit, an explicit
`exit()`, a crash/abort, SIGINT/SIGTERM (Ctrl-C/ctrl-break), and SIGKILL/TerminateProcess. In-process code
(atexit hooks, destructors, signal handlers) cannot run on SIGKILL or abort, so any cleanup that must survive
those needs either the kernel (Windows job objects) or another process.

Evidence comes from the throwaway crate `spikes/process` run by `.github/workflows/spike-process.yml`.

**Evidence runs** (every answer quotes a `RESULT` line verbatim from the job log; each job's step summary
lists them too):
- Run 1: https://github.com/gmhelmold/hugr-omni/actions/runs/36955254413 — `windows` /job/110676693505 ·
  `unix (ubuntu-latest)` (Linux 6.17 x86_64) /job/110676693423 · `unix (ubuntu-24.04-arm)` (Linux 6.17
  aarch64) /job/110676693429 · `unix (macos-latest)` (Darwin 25.6 arm64) /job/110676693536
- Run 2 (same experiments plus the watchdog inside real Node/Python hosts): https://github.com/gmhelmold/hugr-omni/actions/runs/36955915197 —
  `unix (ubuntu-latest)` /job/110678719043 · `unix (ubuntu-24.04-arm)` /job/110678719284 ·
  `unix (macos-latest)` /job/110678719304 (its `windows` job was superseded by run 3)
- Run 3 (all jobs green; the latest): https://github.com/gmhelmold/hugr-omni/actions/runs/36956229410 —
  `windows` /job/110679683617 · `unix (ubuntu-latest)` /job/110679683598 · `unix (ubuntu-24.04-arm)` /job/110679683463 ·
  `unix (macos-latest)` /job/110679683767
Every Q5/Q6 row reproduced across runs (same set of `ALIVE`/`dead` rows per job; Windows Q5 rows of run 3
equal run 1).

Harness: `spike q5` launches `spike q5-host <mech> <mode>`; the host spawns a tree (root in its own
session/job + a grandchild spawned instantly by the root), prints both pids, then dies by `<mode>`. The
orchestrator then checks liveness (zombies count as dead) for 3 s (1 s for the `none` control).

## Q&A

### Q5 · What cleans up the tree when the host dies, per OS and per way of dying?

**Control (no mechanism) — the problem is real on every OS.** All 7 modes leave root and grandchild alive:

> `RESULT Q5 os=linux mech=none host_death=sigkill host=signal:9 root=ALIVE grandchild=ALIVE` (ubuntu-latest)
> `RESULT Q5 os=macos mech=none host_death=return host=exit:0 root=ALIVE grandchild=ALIVE` (macos-latest)

**Windows — job object per child with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.** The host holds the only
(non-inheritable) job handle; any host death closes it and the kernel kills every process in the job.
6/6 modes, tree dead within 1 ms; the control without a job leaves both alive (run 1, `windows`):
> `RESULT Q5 os=windows mech=job-kill_on_close host_death=TerminateProcess host_exited=true host_code=0x9 root=dead@1ms grandchild=dead@1ms`
> `RESULT Q5 os=windows mech=job-kill_on_close host_death=abort host_exited=true host_code=0xc0000409 root=dead@0ms grandchild=dead@0ms`
> `RESULT Q5 os=windows mech=job-kill_on_close host_death=ctrl_break send_ok=true host_exited=true host_code=0xc000013a root=dead@0ms grandchild=dead@0ms`
> (`return`, `exit`, `panic` identical) · control: `RESULT Q5 os=windows mech=none host_death=TerminateProcess host_exited=true host_code=0x9 root=ALIVE grandchild=ALIVE`
(The tree was created with `CREATE_NEW_PROCESS_GROUP`, so the CTRL_BREAK aimed at the host did not reach it
directly: the kill came from the job.)

**Linux — `PR_SET_PDEATHSIG` is rejected (measured, three defects):**
1. It covers only the direct child. Grandchild survives every mode:
   > `RESULT Q5 os=linux mech=pdeathsig host_death=sigkill host=signal:9 root=dead@0ms grandchild=ALIVE` (ubuntu-latest; identical for return/exit/panic/abort/sigint/sigterm)
2. It fires when the *thread* that forked exits, not the process — the host is still alive:
   > `RESULT Q5 os=linux pdeathsig spawner=std-thread-that-exited child_alive_after_500ms=false (host still alive)`
   > `RESULT Q5 os=linux pdeathsig spawner=tokio-spawn_blocking(keep_alive=200ms) alive@100ms=true alive@1500ms=false (runtime+host alive)`
   (control: `spawner=main-thread child_alive_after_500ms=true`). Any spawn from a tokio blocking-pool
   thread, a libuv worker or a Python thread would randomly kill healthy children.
3. It needs `pre_exec` (prctl in the child), which forces std's fork+exec path instead of `posix_spawn`
   (ADR-0001 Q8: 26.6 ms vs 0.53 ms p50 on aarch64 with a 1 GiB host).

**Linux and macOS — a per-host watchdog process (adopted).** On the first spawn the core `fork()`s
(no `exec`) a tiny watchdog that runs only async-signal-safe syscalls: `setsid()` (so terminal SIGINT/SIGHUP
aimed at the host's job does not kill it), closes every inherited fd except its pipe (so it never pins the
host's sockets/pipes open), then waits. The host writes `+pgid` / `-pgid` (4-byte atomic pipe writes) as
trees are created and reaped. On host death the watchdog sends SIGTERM to every tracked group, sleeps the
grace, then SIGKILL, then `_exit`.

Two death detectors were measured:
- `watchdog-pipe`: EOF on the pipe. Works for all 7 modes, **but fails when the host has a forked (no-exec)
  child that inherited the write end** (Python `os.fork()`, `multiprocessing` fork start method):
  > `RESULT Q5 os=linux mech=watchdog-pipe host_death=sigkill host=signal:9 root=ALIVE grandchild=ALIVE forked_worker_holds_pipe=1`
- `watchdog-proc`: the pipe for data + **pidfd of the host (Linux) / kqueue `EVFILT_PROC` `NOTE_EXIT` on the
  host (macOS)** for death. 7/7 modes and the forked-worker case, on all three Unix jobs:
  > `RESULT Q5 os=linux mech=watchdog-proc host_death=sigkill host=signal:9 root=dead@2ms grandchild=dead@0ms` (ubuntu-latest, ubuntu-24.04-arm)
  > `RESULT Q5 os=linux mech=watchdog-proc host_death=abort host=signal:6 root=dead@0ms grandchild=dead@0ms`
  > `RESULT Q5 os=macos mech=watchdog-proc host_death=sigkill host=signal:9 root=dead@2ms grandchild=dead@0ms` (macos-latest)
  > `RESULT Q5 os=macos mech=watchdog-proc host_death=sigkill host=signal:9 root=dead@2ms grandchild=dead@0ms forked_worker_holds_pipe=1`
  (`dead@Nms` is measured after the host was reaped; the fixture dies on SIGTERM, so the 200 ms grace is
  not exercised here.)

**The same watchdog started from inside a real Node 22 and CPython 3.12 host** (the cdylib forks it from the
addon / ctypes call; host killed by SIGINT, SIGTERM or SIGKILL to its process group) — run 2, all three Unix jobs:
> `RESULT Q6 os=linux host=node scen=watchdog sig=KILL armed=true host_after_2500ms=signal:9 ... child=dead@0ms`
> `RESULT Q6 os=linux host=python3 scen=watchdog sig=TERM armed=true host_after_2500ms=signal:15 ... child=dead@0ms`
> `RESULT Q6 os=macos host=node scen=watchdog sig=INT armed=true host_after_2500ms=signal:2 ... child=dead@0ms`
> `RESULT Q6 os=macos host=python3 scen=watchdog sig=KILL armed=true host_after_2500ms=signal:9 ... child=dead@0ms`
> (all 6 host×signal combinations dead on ubuntu-latest, ubuntu-24.04-arm and macos-latest)

**macOS — "what is realistically possible":** the same watchdog. A kqueue watcher *thread* inside the host
dies with the host, so `NOTE_EXIT` is only useful from a separate process — which is exactly the watchdog's
death detector. macOS has no subreaper and no pdeathsig; nothing else exists.

**Tier table (what GUARANTEES can claim):**

| Host dies by | Windows | Linux | macOS |
|---|---|---|---|
| normal exit / return | **T1** kernel (job closes) | **T2** watchdog | **T2** watchdog |
| `exit()` / `process.exit()` / `sys.exit()` | **T1** | **T2** | **T2** |
| crash / panic=abort / `abort()` | **T1** | **T2** | **T2** |
| SIGINT / SIGTERM / Ctrl-C / Ctrl-Break | **T1** | **T2** | **T2** |
| SIGKILL / TerminateProcess / OOM-kill of the host | **T1** | **T2** | **T2** |

- **T1 (kernel-enforced):** the OS kills every process in the job when the last job handle closes; no user
  code involved; forced (TerminateProcess semantics), no graceful phase.
- **T2 (watchdog-enforced):** SIGTERM to each tracked process group, SIGKILL after the grace; holds as
  long as the watchdog process is alive. Not covered: descendants that left the group (`setsid`/`setpgid`,
  ADR-0001 Q4), and the watchdog itself being killed (e.g. `kill -9 -1`, an OOM kill of the watchdog,
  a cgroup-wide kill — the last one kills the tree too).

### Q6 · Host Ctrl-C / SIGTERM: what happens today, and may native code chain a signal handler?

Harness: `spike q6` runs a real Node 22 host (`q6/host.js`, `child_process.spawn(..., {detached: true})`)
and a CPython 3.12 host (`q6/host.py`, `subprocess.Popen(..., start_new_session=True)`), puts the host in
its own process group (= the terminal's foreground job) and sends the signal to that group, as a terminal
Ctrl-C would. The native shim `src/sigchain.rs` (cdylib loaded with `process.dlopen` / `ctypes`) installs a
SIGINT/SIGTERM handler that `kill(-pgid, SIGKILL)`s the tracked group and then chains by restoring the
previous `sigaction` and re-raising.

**Today (no hooks): the child is orphaned on both runtimes, both OSes.**
> `RESULT Q6 os=linux host=node scen=today sig=INT armed=true host_after_2500ms=signal:2 ... child=ALIVE`
> `RESULT Q6 os=linux host=python3 scen=today sig=TERM armed=true host_after_2500ms=signal:15 ... child=ALIVE`
> (same on macos-latest)

**Native chaining is fragile in three independent ways (all measured):**
1. *Node/libuv replaces it.* If JS adds `process.on('SIGINT')` after the addon loaded, libuv installs its own
   handler and ours never runs; if the last JS listener is removed, libuv resets to `SIG_DFL` (ours is gone):
   > `RESULT Q6 os=linux host=node scen=js-after-native sig=INT ... host_after_2500ms=exit:0 native_chain_fired=false ... js_py_marks=["JS-HANDLER"] child=ALIVE`
   > `RESULT Q6 os=linux host=node scen=js-before-native-removed sig=INT ... host_after_2500ms=signal:2 native_chain_fired=false ... child=ALIVE`
2. *On macOS, chaining breaks Node itself.* The very same Node handler (`node::SignalExit`, which re-raises)
   is reported with `flags=0x84000000` (`SA_RESETHAND|SA_RESTORER`) on Linux but `flags=0x0` on macOS: Darwin's
   `sigaction()` does not hand back `SA_RESETHAND` in the old action. Restoring it therefore loses the one-shot
   flag, `SignalExit`'s re-raise lands on itself, and Ctrl-C/SIGTERM no longer terminate Node (the host keeps
   running, spinning):
   > macOS: `RESULT Q6 os=macos host=node scen=native sig=INT armed=true host_after_2500ms=running native_chain_fired=true fired_count=1 prev_action_at_install=sig=2,handler=0x10446df64,sym=_ZN4node10SignalExitEiP9__siginfoPv,flags=0x0 js_py_marks=[] child=dead@0ms`
   > Linux:  `RESULT Q6 os=linux host=node scen=native sig=INT armed=true host_after_2500ms=signal:2 native_chain_fired=true fired_count=1 prev_action_at_install=sig=2,handler=0xf5c230,sym=_ZN4node10SignalExitEiP9siginfo_tPv,flags=0x84000000 js_py_marks=[] child=dead@0ms`
   (A first version that *called* the previous handler instead of restoring it spun forever on macOS too;
   see the comment in `src/sigchain.rs`.)
3. *Python semantics are violated.* Python turns SIGINT into `KeyboardInterrupt`; an app (REPL, CLI with a
   cancel prompt) may catch it and continue. The native handler has already killed the children:
   > `RESULT Q6 os=linux host=python3 scen=native-catch sig=INT ... host_after_2500ms=running native_chain_fired=true ... js_py_marks=["CAUGHT"] child=dead@0ms`
   (control without the shim: `scen=today-catch ... host_after_2500ms=running ... child=ALIVE`). And a later
   `signal.signal()` silently replaces the shim: `scen=py-after-native ... native_chain_fired=false ... child=ALIVE`.

**Language exit hooks are not sufficient on their own:**
> `RESULT Q6 os=linux host=python3 scen=atexit-hook sig=INT ... js_py_marks=["EXIT-HOOK"] child=dead@0ms` (atexit runs after an unhandled KeyboardInterrupt)
> `RESULT Q6 os=linux host=python3 scen=atexit-hook sig=TERM ... js_py_marks=[] child=ALIVE` (SIGTERM is SIG_DFL in Python: no atexit)
> `RESULT Q6 os=linux host=node scen=exit-hook sig=INT ... js_py_marks=[] child=ALIVE` (`process.on('exit')` does not run on signal death)

**What works without touching any handler:** the Q5 watchdog — the host dies from the signal by its own
rules, the watchdog sees the death and cleans up. Inside real hosts (run 2):
> `RESULT Q6 os=linux host=node scen=watchdog sig=INT armed=true host_after_2500ms=signal:2 native_chain_fired=false ... child=dead@0ms`
> `RESULT Q6 os=macos host=python3 scen=watchdog sig=INT armed=true host_after_2500ms=signal:2 native_chain_fired=false ... child=dead@0ms`
The host's own exit status is unchanged (`signal:2` exactly as in `scen=today`).

## Decision

1. **Windows:** every child tree lives in its own job object created with
   `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; the job handle is non-inheritable and held only by the core for the
   life of the `Child` (and implicitly until host death). Host death on Windows = T1, forced.
2. **Linux and macOS:** the core starts **one watchdog per host process**, lazily on the first spawn, by
   `fork()` without `exec`. The watchdog: `setsid()`; dup `/dev/null` onto 0/1/2; closes every other fd
   except its pipe read end and its death handle; detects host death with **pidfd + poll (Linux ≥ 5.3)**
   or **kqueue `EVFILT_PROC`/`NOTE_EXIT` (macOS)**, plus `getppid() != host` as the registration-race check
   and pipe EOF as a secondary signal; keeps the tracked pgids in a fixed array; on death: SIGTERM each
   group → sleep grace → SIGKILL each group → `_exit(0)`. Only async-signal-safe calls after `fork`.
   On Linux < 5.3 the death detector degrades to pipe EOF (and the forked-worker caveat applies).
3. **The bindings install no signal handlers and no exit hooks for cleanup.** Node: no `process.on('SIGINT'|'SIGTERM'|'exit')`
   from the binding; Python: no `signal.signal`, no `atexit` from the binding; the Rust API registers
   nothing either. Graceful cleanup is the job of scopes (`await using` / `with` / `Drop`), which in Python
   also run when `KeyboardInterrupt` unwinds; abrupt host death is the job of the job object / watchdog.
   This keeps the host's own Ctrl-C behaviour bit-for-bit unchanged (INV-07 spirit, INV-10).
4. **Grace at host death:** the watchdog uses one host-wide grace: the largest `graceMs` among live tracked
   trees, capped at 5 s (Unix only; Windows is forced by the kernel).

## Rejected alternatives

- **PR_SET_PDEATHSIG** — grandchildren survive; fires on spawning-*thread* exit (kills healthy children
  spawned from tokio/libuv/Python worker threads); forces fork+exec (Q5 evidence above; ADR-0001 Q8).
- **Pipe-EOF-only watchdog** — defeated by any forked-without-exec child of the host (`forked_worker_holds_pipe=1 ... ALIVE`).
  `pthread_atfork` closing the fd in the child would mitigate it, but pidfd/kqueue makes it unnecessary.
- **Chaining SIGINT/SIGTERM handlers from native code** — overwritten by libuv and by Python's `signal.signal`;
  breaks Node's own Ctrl-C on macOS (`SA_RESETHAND` not round-tripped); kills children even when a Python
  app catches `KeyboardInterrupt` and continues.
- **Exit hooks (`process.on('exit')`, `atexit`) as the mechanism** — do not run on SIGTERM (Python) or on
  any signal death (Node), nor on SIGKILL/abort anywhere.
- **In-host kqueue/pidfd watcher thread** — dies with the host; useless for host death.
- **Linux `PR_SET_CHILD_SUBREAPER` on the host** — see ADR-0001 Q4 (makes the host reap every library's orphans).
- **One watchdog per child** — doubles process count and spawn cost; one per host suffices.

## Consequences for the contract

Frozen `sys` seam (exact text to carry into the trait docs):

- `sys::host_guard()` — *"Called once, lazily, before the first spawn. Windows: no-op (each child's job object
  is created with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE). Unix: forks the watchdog (no exec, async-signal-safe
  only), which survives the host and, on host death detected via pidfd (Linux ≥ 5.3) / kqueue NOTE_EXIT
  (macOS), sends SIGTERM to every tracked process group and SIGKILL after the grace. Never installs a
  signal handler, never registers an exit hook."*
- `sys::track(pgid, grace)` / `sys::untrack(pgid)` — *"Must be called after the group exists and before
  the root is reaped (untrack strictly before reaping the zombie root, ADR-0001 Q7). Non-blocking; a
  4-byte write to the watchdog pipe."*

GUARANTEES.md rows (one per OS, each tied to the Q5/Q6 CI rows above):

| Promise | Windows | Linux | macOS |
|---|---|---|---|
| Host exits normally / calls exit / aborts / is SIGINT- or SIGTERM-ed / is SIGKILL-ed → the whole tree is killed, orphaned grandchildren included | **Guaranteed** (kernel job object, forced kill) | **Guaranteed while the hugr-omni watchdog process is alive** (SIGTERM, SIGKILL after grace) | same as Linux |
| Descendant that called `setsid`/`setpgid` (daemonized) is killed at host exit | Guaranteed (job membership is inherited unless breakaway is allowed — we never allow it) | **Not guaranteed** (escapes the process group) | **Not guaranteed** |
| The library never changes how the host reacts to Ctrl-C / SIGTERM | Guaranteed | Guaranteed | Guaranteed |
| Ctrl-C at a terminal does not reach the children directly (they are in their own session/group); they are stopped when the host exits, or by scope exit if the host handles the signal | Guaranteed | Guaranteed | Guaranteed |

## Open risks

- **Watchdog can be killed** (`kill -9 -1`, an OOM kill that picks it, a sandbox that forbids fork). Then
  host-death cleanup silently degrades to "none" on Unix. Mitigation idea (not measured): the host can detect a
  dead watchdog via its pid/pidfd and restart it on the next spawn.
- **Fork from a large multithreaded host:** the watchdog is a COW copy of Node/Python; it touches almost no
  memory, but the `fork()` itself costs page-table copies once per host (ADR-0001 Q8 measured fork+exec at
  26.6 ms p50 for a 1 GiB host on aarch64). One-time cost, but visible on the first spawn.
- **Sandboxes/seccomp** that block `fork` or `pidfd_open`; Linux < 5.3 loses the forked-worker protection.
- **Grace at host death** is host-wide (max of live trees, capped) — per-tree grace is not preserved.
- **Bun and Deno** were not exercised (Node 22 and CPython 3.12 only). The decision (no handlers in the binding)
  avoids depending on their signal handling, but the watchdog has not been forked from inside Bun/Deno yet.
- **Windows host death is never graceful** (no CTRL_BREAK is sent at host death; the kernel terminates).
