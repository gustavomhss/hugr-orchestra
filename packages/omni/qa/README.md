# QA harness (QA-01, PLAN §4.2)

Real workloads run through hugr-omni and through each language's stdlib, measured as the KPIs K1–K8. One command:

```bash
qa/run --quick            # ≤ 5 min on a laptop: every workload once, the KPI table
qa/run --full             # ≤ 30 min per OS: more repetitions, 600 agent commands, 1000 K4 samples
qa/run --quick --lang rust          # one language only (v0.1 has rust and ts)
qa/run --quick --inject-orphan      # K1's teeth: the first omni task of each runner leaves a process behind
qa/run --quick --no-k4              # leaves K4 out, said so in the report (K4 is judged on quiet CI release builds)
```

On Windows: `.\qa\run.ps1 --quick`. It writes `qa/out/report.md` (also printed), `qa/out/report.json` and each runner's
stderr in `qa/out/logs/`. Exit 0 only when omni meets every target below, the oracle's control passed and no omni
check failed; exit 1 otherwise; exit 2 when the harness could not run (build, fetch).

Needs: the Rust toolchain of the repository, Node 22+ with npm, git, and network on the first run of each OS (to fetch
the pinned workloads). The TS arm also builds the Node addon (`cargo build --release -p hugr-omni-node`); a missing
addon or Node stops the run (exit 2), it never skips the arm. The report prints the load average at the start and
the end: K4 is a latency, decided on quiet CI release builds per OS (Linux the reference), and a loaded machine's
figure is reported, not decisive (PLAN, decision log).

## What runs

Each workload runs in two arms: **omni** (`hugr_omni` in Rust, the `hugr-omni` package in TS) and **std**
(`std::process` in Rust; `child_process` in TS), written the way a caller without hugr-omni writes them: collect the
output until the pipes close, a timeout or a cancellation kills the root (Rust std's only stop; Node: SIGTERM, then
SIGKILL after the grace), Node's stdin left open as its default. The only addition to the std arm: on Unix its root
starts its own process group, which changes nothing about what `kill` reaches but lets the oracle find its
descendants.

| Workload | Tasks |
|---|---|
| QA-A real suites | `cargo test` of [semver](https://github.com/dtolnay/semver) 1.0.26 (`3e64fdb`) and `npm test` of [commander](https://github.com/tj/commander.js) 14.0.1 (`bd4ae26`: jest and its workers, then tsd and tsc), each to the end (expected to pass; `--quick` runs this part through omni only, it takes most of the time) and cut by a timeout midway |
| QA-B dev server | Vite 6.4.3 through `npm run dev` (npm → sh → node → esbuild): wait for `ready`, fetch `/@vite/client`, stop |
| QA-C terminal | bash, zsh, PowerShell, pwsh, the Node and Python REPLs, whichever the OS has (`workloads/shells.json`): a command, Ctrl-C on a 30 s command, `exit`. omni only: the stdlib has no terminal |
| QA-D misbehaving | a root that exits leaving a descendant holding the output; a tree that ignores SIGTERM / CTRL_BREAK; 32 MiB through `run()`; 100 000 lines read as they come; `git commit` opening an editor that waits for input; a prompt answered through stdin; a short-lived leftover beside a longer task in one batch |
| QA-E agent loop | 200 commands (git, `git grep`, cargo build and test, node, npm ls and install; `workloads/agent.json`), 10 at a time, every 4th cancelled at a fixed pseudo-random moment within 500 ms |
| K4 | `omni-fixture exit=0` through both arms, interleaved, timed to the pid and to the exit seen |
| K6 | 1000 omni tasks in one host (a run, a tree spawned and stopped, a run in a terminal, in turn) |

The workloads are pinned: the two repositories by commit, their dependencies by `pins/semver-workspace.lock` and
commander's own `package-lock.json`, Vite by `vite/package-lock.json`. They are fetched once per OS into
`qa/.cache/<os>-<arch>` (or `$HUGR_QA_CACHE`), with their own Cargo and npm stores, and then run offline: every task
gets `CARGO_NET_OFFLINE=true` and `npm_config_offline=true`.

## KPIs

| KPI | Measured as | omni target |
|---|---|---|
| K1 orphans | processes of the task the OS still lists once the task returned (below): proven, plus incomplete observations | 0 and 0 |
| K2 hangs | tasks that did not return within their timeout + grace + 10 s, and runners that did not finish within their limit | 0 |
| K3 stop latency | p95 of (time `stop` took − its `graceMs`), and stops after which the OS still listed the tree | ≤ 500 ms, none survived |
| K4 spawn overhead | p50 of the time to the pid, and to a trivial child's exit seen | ≤ 1.25× std or ≤ +0.3 ms |
| K5 output | bytes missing, altered or extra in the flood, the lines and the prompt | 0 |
| K6 soak | host and supervisor fds/handles after 1000 tasks vs after 50 warm-up tasks (a missing supervisor figure on either side: not measured); host RSS growth | Δ ≤ 0; ≤ 10 MB |
| K7 host crashes | runners that died (a signal, a panic, an uncaught exception: any exit but 0 or 3) | 0 |
| K8 Windows parity | K1–K7 on Windows | the same targets |

The std arm runs the same tasks and is reported next to omni, not judged: its K1/K2 is what hugr-omni removes.
K9–K11 are not this harness's (W14, Q2, the design partners).

**Limits.** The measured part of a run (controls, runners, report; not the builds and the one-time fetch) has a
budget: 6 minutes for `--quick` (the card's 5 plus a margin; 18 on Windows, where omni's `run()` tasks are checked
one at a time and quick runs in CI), 30 for `--full` (on Windows with 200 agent commands instead of 600). Each runner
gets its own limit within what is left (`src/plan.rs`); past it, it is ended and counted as hung (K2) with the records
it printed, and a runner the budget cannot fit is reported as not run. Inside the runners, K4 and K6 end themselves
before their limit with a K2 record; every oracle answer, every OS tool and the report's metadata (commit, versions,
load) have deadlines within the budget, and the orchestrator stops reading a runner's stdout 5 s after it ended. A
hang always ends up in a report written within the limit.

## K1: the orphan oracle

K1 comes from the OS process table, never from the library (`src/oracle`). Every task gets a marker,
`HUGR_QA_TASK=q-<32 hex>i<k>-<arm>-<n>-` (128 random bits per run, from the OS's random source, so nothing outside the
run carries it by chance), only ever in the environment of everything it starts (never in argv), and remembers every
root it spawned (`run()` does not tell it) as its pid with the spawn call's window (read before and after the call):
only the task's own root can have been created with that pid inside that window. Each task is checked as soon as it returns or runs
out of its bound, by a snapshot of the process table taken after that moment (tasks of a batch that return together
share one), so a short-lived leftover is seen even if it is gone before the rest of its batch ends. Ownership needs
positive evidence, observed during the run:

- **Unix** (`/proc/<pid>/environ` on Linux, exact NUL-separated entries; `ps -A -E` on macOS, where the environment
  is what follows the process's own command line, read by a second `ps` without `-E`): proven = an exact
  `HUGR_QA_TASK=<the task's value>` entry of the environment (not in argv, not under another name; a root's pid alone
  proves nothing: another task may have it by now); the process group of a marked process; a child of a proven
  process. macOS hides the environment of Apple platform binaries (`/bin/sh`, `/usr/bin/git`, `sleep`): those are
  proven through their group or their parent only, and a live root of that kind is an incomplete observation.
- **Windows** (`Win32_Process` through PowerShell, also sampled every 250 ms while a batch runs): processes are
  identified by pid and creation time, and parent links are recorded when parent and child are seen alive together.
  The history keeps every process created from the instant read before the runner was spawned, less one clock tick,
  so a root and its descendants started before the oracle's thread ran are still traced. The runner's own identity
  is pinned on the oracle's first snapshot (while the orchestrator holds its handle);
  supervisors count only when seen as children of that identity, and a later process with the runner's pid never
  does.
  Proven = the recorded links lead to one of the task's roots (a child of the runner or of its supervisor with the
  root's pid, created inside its spawn window, give or take the 15.6 ms clock tick Windows stamps creations with). A
  root of omni's `run()` is known only as the supervisor's child (`run()` does not tell its pid), so on Windows the
  omni arm runs every task as a batch of its own: what leads to such a root is the task's, checked as soon as it
  returns.

A process tied to the task's roots only by a link nobody observed (the root had exited, and its pid could have been
reused) is an **incomplete observation**: counted apart, failing K1 like an orphan, and never killed. Anything else is
not the task's: neither counted nor killed. Only proven processes are killed, after they are counted, so a task's
leftovers never reach the next one. Zombies count as dead. A check whose snapshot failed or did not answer fails K1
("not observed"), in every kind of record.

**Killing.** Counting is generous, killing strict. A snapshot is not atomic, so a parent line can be stale (read, then
exited, its pid reused by a stranger whose child is read later): a link proves enough to count, not to kill. A
proven process is killed only on strong evidence, confirmed by a fresh snapshot right before the kill: it carries the
task's marker (Unix), it is the task's root identity (Windows), or every parent link that proved it is still live up
to such a process (or, for a batch or a runner's leftovers on Windows, up to the runner or its supervisor): each
parent alive with the identity it was observed with, each child's parent pid still that parent's. A dead identity
never comes back, so a parent alive at both moments was the parent all along. The evidence itself is compared again
too: every process of the chain must show the marker it was observed with (or none), listed once. macOS start times
are to the second, so a replacement born in the same second shares a pid and start; without the marker it is never
taken for the marked process. Windows creation times (100 ns) make the identity itself unique. Anything else is counted but **left
running (link unconfirmable)**: the K1 cell says so, the report lists the pids per runner, and the log names them.
On Windows that includes the descendants of an exited root (CI's machine ends them). The kill itself checks the
identity once more: Windows opens one handle, compares the creation time and terminates through that same handle;
Unix signals right after the fresh snapshot. On Unix a residual race remains: the pid would have to be freed and
reused by a stranger between that snapshot and the signal (declared; pids are handed out in sequence, so that means
wrapping the whole pid space in that time). A process whose identity cannot be confirmed is never killed.

Every ask to the oracle has a deadline: one whose snapshot finishes later acts on nothing (no count, no kill) and
answers that it expired, so a late observation never kills on stale evidence.

**After each runner**, however it ended (finished, crashed, or killed at its limit), one bounded observation finds
what its tasks left: every process whose marker starts with the runner's own run id, their groups and children (on
Windows: what the observed links lead back to the runner or its supervisor). They count in K1 of that runner's arm and
are killed under the rule above.

**Controls** (every run, before anything is measured, through the same oracle): a std tree whose root is killed leaves
two descendants, which the oracle must count and kill (exactly the pids they wrote themselves, `pidlog`); a sentinel
the harness started outside the task, a stranger whose parent exits during the task, and a decoy carrying the task's
marker only as an argument (`HUGR_QA_TASK=<value>` in argv) and under another name (`OTHER_HUGR_QA_TASK`), in a group
of its own with a descendant that has no marker, must be neither counted nor killed; nothing may be counted after the
oracle's kill (on Windows, except what it reports left running). If any fails, the run fails and no K1 figure is
believed. Each control process lives at most 15 s on its own and is identified as soon as it logged itself, before its parent ends, and taken only if proven the controls' own
(created no earlier than the sentinel, which starts first, with a parent chain, each parent no younger than its child,
to a process whose handle the controls hold: a logged pid may have been reused by the time the OS answers); that
identification serves counting and the assertions only. The controls' own cleanup never kills by identity: it
signals only the processes it holds a handle of (the sentinel, the tree's root, the decoy, the stranger's parent),
through that handle, which can never reach a reused pid; everything else ends on its own within its lifetime, and the
controls wait for that by identity, without a signal. One still listed after its lifetime, or an identity that cannot
be taken, stops the run with exit 2 (once the processes it would have covered have ended).
**Declared limits** (none of them can make the harness kill a process outside the run):
- macOS splits a `ps -E` line into command line and environment by the same process's command line from a second `ps`.
  A variable whose value holds a space followed by `HUGR_QA_TASK=<this run's token>...` would read as a marker; only
  this run's processes can know the token. A process that execs between the two calls usually shows no marker in
  that snapshot (its group and parent links still apply), with one exception: if its first command line held
  `HUGR_QA_TASK=<this run's token>` as an argument and the exec shortens it to a prefix of itself, that old argument
  reads as environment and the process as marked. Only a process that carries this run's 128-bit token can be misread
  this way; only the run's own processes know it (in practice, only the decoy control has it in argv), so it can never
  reach a process outside the run.
- Unix kill race: see **Killing** above.

**Teeth:** `--inject-orphan` makes the first omni task of every runner leave an `omni-fixture hang` behind, and K1
(and the run) must fail. QA-D's `short-leftover` (a descendant that outlives a root-only stop by 2 s, beside a 4 s
task) shows the per-task check: the std arms count it, omni has none.

## Runners and their protocol

`omni-qa` (this crate, `src/`) is the orchestrator and the Rust runner; `node/` is the TS runner. Python joins in v0.2
as one more runner speaking the same protocol, listed in `LANGS` (`src/plan.rs`):

- started as `<runner> <QA-A|QA-B|QA-C|QA-D|QA-E|K4|K6> <omni|std>` with `HUGR_QA_ROOT`, `HUGR_QA_FIXTURE`,
  `HUGR_QA_CACHE`, `HUGR_QA_RUN`, `HUGR_QA_MODE`, `HUGR_QA_SIZES` (how many of each), `HUGR_QA_TASK_ENV` (every
  task's environment), `HUGR_QA_INJECT_ORPHAN`, `HUGR_QA_BOUND_MS` (its limit), `HUGR_OMNI_SUPERVISOR`,
  `HUGR_OMNI_ADDON`;
- prints one JSON record per line on stdout (`src/record.rs`), then `{"kind":"end"}`, and exits 0; exit 3 is an
  error it reports itself (on stderr); any other end is a crash (K7);
- asks the oracle on the same stdout
  (`{"kind":"check","id":n,"probe":{"tag","roots":[{"pid","from","to"}],"since"},"last":b,"batch_since":t}`, `{"kind":"usage","id":n}`, `{"kind":"arm","on":b}` at a batch's start and end) and reads the
  answers on stdin (`{"id":n,"ok":..}` or `{"id":n,"error":".."}`; `src/invoke.rs`). The oracle runs in the
  orchestrator, one per runner, the same for every language.

## Linux (Docker) and Windows (GitLab CI)

Linux, from the repository root on any Docker host (the cache lands in the worktree, `qa/.cache/linux-x86_64`):

```bash
docker run --rm -v "$PWD":/w -w /w -v omni-cargo:/usr/local/cargo/registry -v omni-target:/w/target \
  -v omni-rustup:/usr/local/rustup rust:1.96 sh -c '
    apt-get update -qq && apt-get install -y -qq xz-utils zsh > /dev/null &&
    curl -fsSL https://nodejs.org/dist/v22.20.0/node-v22.20.0-linux-x64.tar.xz | tar -xJ -C /opt &&
    export PATH=/opt/node-v22.20.0-linux-x64/bin:$PATH && qa/run --quick'
```

Windows, a GitLab job for `.gitlab-ci.yml` (the lead's file), on the `windows-2022` runner:

```yaml
qa-windows:
  tags: [saas-windows-medium-amd64]
  timeout: 60m
  when: manual
  script:
    - Invoke-WebRequest https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
    - .\rustup-init.exe -y --default-toolchain none --profile minimal
    - $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
    - rustup toolchain install
    - Invoke-WebRequest https://nodejs.org/dist/v22.20.0/node-v22.20.0-win-x64.zip -OutFile node.zip
    - Expand-Archive node.zip -DestinationPath C:\node
    - $env:Path = "C:\node\node-v22.20.0-win-x64;$env:Path"
    - .\qa\run.ps1 --quick    # or --full
  artifacts:
    when: always
    paths: [qa/out/]
```

The same job on Linux is the Docker command's `sh -c` body after the toolchain the `linux` job already installs.

## Checks of this crate

`qa/` is a workspace of its own (its dependencies stay out of the product), so the root gates do not reach it:

```bash
cargo fmt --manifest-path qa/Cargo.toml -- --check
cargo clippy --manifest-path qa/Cargo.toml --target-dir target --all-targets -- -D warnings
cargo clippy --manifest-path qa/Cargo.toml --target-dir target --all-targets --target x86_64-pc-windows-msvc -- -D warnings
cargo test --manifest-path qa/Cargo.toml --target-dir target
node --test qa/node/runner.test.mjs
```
