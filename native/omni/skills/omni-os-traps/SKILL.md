---
name: omni-os-traps
description: "Symptom to cause to fix to guarding test, for the OS-level traps hugr-omni already paid for in spikes S1 to S5 and on CI - macOS PTY output lost by a program that prints and exits at once (the Go hold), host-side SIGCHLD reapers stealing children, ptsname thread safety, ConPTY close blocking for seconds, inheritable Windows handles, macOS posix_spawn descriptor leaks, PID reuse, and macOS EMSGSIZE on descriptor passing. Use when a supervisor, PTY, channel or spawn path shows one of these symptoms, before changing code in crates/omni-supervisor, crates/hugr-omni/src/client or src/pty, or when reviewing such a change."
---

# OS traps already paid for

Each trap below cost a spike or a CI run to find. The short list in
[AGENTS.md](../../AGENTS.md#traps-already-paid-for-s1s5) is the rule source. This skill adds, for each trap, how it
shows up, why, the fix in the code, and the test that guards it, so a regression is recognized at once. The evidence
is in the ADRs ([0001](../../docs/adr/0001-process-model.md), [0003](../../docs/adr/0003-pty.md),
[0005](../../docs/adr/0005-supervisor.md)).

## When to use

- You see one of the symptoms below, on any OS.
- You are about to change spawn, channel, PTY or tree code in the supervisor or the client.
- You are reviewing such a change, and want to know which test must stay green.

## When not to use

- A new, unexplained failure: start with the triage steps of the `omni-gates` skill.
- API usage questions: use the usage skills (`omni-processes`, `omni-lifecycle`, `omni-terminals`).

## The traps

| Symptom | Cause | Fix (where) | Guarding test |
|---|---|---|---|
| macOS: a terminal program that prints and exits at once shows **no output** | the root exits and the PTY is torn down before the host reader runs; macOS discards the unread output | the PTY root is held before `exec` until the host confirms its reader runs (`Go`, R9). This is two round trips for a Unix PTY spawn (`crates/omni-supervisor/src/pty_unix`, `crates/hugr-omni/src/pty`) | `a_program_that_prints_and_exits_at_once_loses_nothing_300_times` (`crates/hugr-omni/src/pty/tests.rs`) |
| a child's exit is **never observed**, or `wait()` hangs, in some hosts only | the host has `SIGCHLD = SIG_IGN` (auto-reap), or runs a `waitpid(-1)` reaper (tokio, Node, Bun), and steals in-host children | the supervisor owns every child, and the host never forks (ADR-0005); no `tokio::process` (INV-16) | `an_identity_never_signals_a_reaped_and_reused_number` (`crates/hugr-omni/src/client/tests/identity.rs`); the SIGCHLD-ignored start in `crates/omni-supervisor/tests/unix_spawn.rs` |
| a PTY child gets **another terminal's** slave, rarely and under concurrency | `ptsname` returns a static buffer and is not thread-safe | `ptsname_r` on Linux, `TIOCPTYGNAME` on macOS; `/dev/ptmx` opened with `O_CLOEXEC` (`crates/omni-supervisor/src/pty_unix/mod.rs`) | no dedicated test; a race is not reproducible on demand. Keep the calls as they are, and review any change to them |
| Windows: `stop()` of a terminal **takes about 5 s** or hangs | `ClosePseudoConsole` can block for seconds on Server 2022 (build 20348) | close on a worker thread, with an independent deadline that enforces `graceMs` (`crates/omni-supervisor/src/pty_windows`) | `conpty_a_stubborn_writer_ends_within_a_grace_of_1000_ms`, `conpty_the_close_path_200_times_loses_nothing_and_handles_stay_bounded` (`crates/omni-supervisor/tests/windows_pty.rs`) |
| Windows: an **unrelated child of the host** holds our pipe, so output never ends | `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` limits only *our* child. Any inheritable handle in the host leaks into every other `CreateProcess` | never create inheritable handles in the host: a private named-pipe rendezvous, `bInheritHandles = FALSE`, non-inheritable `DuplicateHandle` (R7) | `the_bootstrap_creates_no_inheritable_handle` (`crates/hugr-omni/src/client/tests/windows.rs`) |
| macOS: a child **inherits stray descriptors** (a socket, the channel) | `posix_spawn` inherits every fd without CLOEXEC, and macOS has no `MSG_CMSG_CLOEXEC`, so a received fd is briefly inheritable | `POSIX_SPAWN_CLOEXEC_DEFAULT` plus explicit `dup2` actions for stdio; `fcntl(FD_CLOEXEC)` at once on received fds (a declared window, see GUARANTEES "Host state") | `a_pipe_root_leads_its_session_with_only_stdio_and_default_signals`, `without_close_range_leaked_descriptors_are_still_closed` (`crates/omni-supervisor/tests/unix_spawn.rs`) |
| a `stop()` **signals a stranger**, or a test sees a dead pid "alive" | PID reuse is real on CI (S5 T6): the root's number is recycled after it is reaped | the root is kept unreaped (pinned) until its session is empty; a gone tree is never signalled again (ADR-0005 decision 4). Windows holds the root handle | `a_gone_tree_never_touches_its_recycled_number_and_a_pinned_one_is_skipped` (`crates/omni-supervisor/tests/unix_pid_reuse.rs`, Linux with `--privileged`) |
| macOS: the channel **dies under concurrent spawns**; the host reports a dead supervisor | XNU refuses (EMSGSIZE) a `sendmsg` with SCM_RIGHTS that does not fit the send buffer whole, and the buffer shrinks while the peer has not read | send the descriptors with one byte, or wait for the peer, on both ends (`crates/hugr-omni/src/client/unix.rs`, `crates/omni-supervisor/src/unix/chan.rs`) | `a_spawn_with_a_large_environment_starts` (`crates/hugr-omni/src/process/tests/big.rs`) |
| Windows: a **graceful stop does nothing**; the stop lasts the whole grace | CTRL_BREAK does not reach a process without a console, or one that ignores it; a `.bat` continues after "Terminate batch job" | graceful is best effort on Windows; the forced pass repeats until the Job is empty (W06b) | `stopped_arrives_only_once_every_member_is_gone_even_ones_born_between_polls` (`crates/omni-supervisor/tests/windows_tree.rs`) |
| Windows terminal: **Ctrl-C (`\x03`) is ignored** | the child inherits the per-process "ignore Ctrl-C" flag from the CI chain, or from `CREATE_NEW_PROCESS_GROUP` | clear the flag for the PTY child before `CreateProcessW`; never use a new process group for a PTY child ([ADR-0003 Q3](../../docs/adr/0003-pty.md#q3-x03-interrupts-the-foreground-program)) | `conpty_ctrl_c_typed_on_the_terminal_interrupts_its_program` (`crates/omni-supervisor/tests/windows_pty.rs`) |

## How to use the table

1. Match the symptom. The OS column matters: several traps exist on only one OS, so green on your OS proves nothing
   about the others.
2. Before you change the fixed code, run its guarding test on the affected OS (`TEST_FILTER=<test name>`; see the
   `omni-gates` skill).
3. After the change, the guarding test must stay green there. A fix for a new trap adds a row to this table: the
   symptom, the cause, the fix, and a test that fails without the fix. Prove the "fails without" part by reverting the
   fix once.
4. If a limit cannot be fixed, declare it in GUARANTEES with the measured number. A declaration needs the lead.

## Related history

The CI side of these stories (what the runner showed, how it was traced) is in the `omni-gates` skill,
references/ci-history.md.
