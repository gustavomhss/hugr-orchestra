# CI history: failures already paid for

Distilled from [HANDOFF.md](../../../HANDOFF.md), the PLAN status and decision log ([PLAN.md](../../../PLAN.md)), and
the commit history (commit ids are from the GitHub mirror, `gustavomhss/hugr-omni`). Each entry gives the symptom,
the cause, what changed, and the lesson for triage.

## W06b: the Windows stop under a saturated runner (`ce06163`, `9ab7692`)

- **Symptom.** On GitLab's Windows Server 2022 runner, `stopped_arrives_only_once_every_member_is_gone_even_ones_born_between_polls`
  (`crates/omni-supervisor/tests/windows_tree.rs`) failed. CTRL_BREAK sometimes did not reach the root, and a stop
  with a 2000 ms grace took 5230 ms. Separately, a W09 grace-window test measured 1.53 s against a 1 s grace.
- **Cause.** On a 2-vCPU runner, the breeding test's descendants did not start and log themselves before the deadline,
  so the oracle could not see them. A single forced pass could miss a process that was still joining the Job. The
  measured window also included the root's start-up.
- **Fix.** The breeder logs each descendant when `CreateProcess` returns. The forced pass repeats while the Job has
  members (forced means "until the Job is empty", like SIGKILL until the session is empty on Unix). After host
  death the supervisor waits 5 s, not 2, before it reports trees not proven gone. The grace bound became "under two
  graces". GUARANTEES declares the OS teardown time after `TerminateJobObject`: 840 ms for 875 processes.
- **Lesson.** CTRL_BREAK is best effort on Windows. The forced step is the guarantee. A bound that includes process
  start-up must allow for a loaded machine.

## macOS EMSGSIZE on the channel (`3dd5fb7`)

- **Symptom.** The first GitHub Actions run on `macos-14` (arm64) killed the host-supervisor channel under concurrent
  spawns. The host took it for a dead supervisor.
- **Cause.** XNU refuses a `sendmsg` with SCM_RIGHTS that does not fit the socket send buffer whole, and that buffer
  shrinks while the peer has not read. Linux has no such failure.
- **Fix.** Both ends (`crates/hugr-omni/src/client/unix.rs` and `crates/omni-supervisor/src/unix/chan.rs`) send the
  descriptors with one byte, or wait for the peer. Guarded by `a_spawn_with_a_large_environment_starts`
  (`crates/hugr-omni/src/process/tests/big.rs`), with a 64 KiB environment, far above the 8 KiB socket buffer.
- **Lesson.** A test suite green on one Unix is not green on the other. Run macOS CI before you trust a channel change.

## Oracles that hold while other tests run (`8f01860`, `bc5599e`)

- **Symptom.** On Windows, a pid "stayed alive" after `stop()` (QA-E, and a W09 test). On Unix, a descriptor-leak test
  saw "open" descriptors after the batch was closed.
- **Cause.** Not leaks. Windows reused the freed pid at once, often for another test's `omni-fixture`. Other tests
  reopened the same descriptor numbers.
- **Fix.** On Windows, a logged pid counts as alive only while its command line still names this test's log
  (`assert_dead_logged` in `crates/hugr-omni/src/process/tests/mod.rs`). The descriptor test compares (device,
  inode) identities, not numbers. The same commit kept the large-environment test's 64 KiB variable under Linux's
  128 KiB limit for one environment string.
- **Lesson.** Before you report a leak, prove that the pid or descriptor is still the one you created.

## Other recorded traps

- **Linux PID reuse needs privilege.** The supervisor's PID-reuse test steers `ns_last_pid`. Docker needs
  `--privileged`, and GitHub's Ubuntu runner needs `kernel.apparmor_restrict_unprivileged_userns=0`. Without them the
  test fails. It never skips.
- **A cold build can take down Docker Desktop** on the lead's 16 GB machine (PLAN decision log, 2026-10-04). Hence
  the limit of two heavy builds at once, and the CI container capped at 2 CPUs.
- **K4 (time to pid) on macOS** measured about +0.7 ms over the standard library on a loaded developer machine. K4 is
  judged on quiet CI release builds, with Linux as the reference. The macOS figure is still open (HANDOFF,
  2026-10-06).
- **Windows ConPTY close** can block for seconds on Server 2022. A test that waits for the close on the test thread
  hangs. The supervisor closes on a worker under an independent deadline (ADR-0003, S3).
- **Path filters.** `ci.yml` ignores pushes that change only `**.md`, `docs/**` or licenses. A docs-only change runs
  no CI, so run the static docs checks by hand.
