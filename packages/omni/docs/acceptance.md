# hugr-omni — Acceptance

Two layers. The **contract** (C-*) is a small set of deterministic promises, written once as shared
scenarios and run through every language. The **KPIs** (K*) are measured by using the library for real
(see PLAN §4.2) and decide the release. Management items (G0/UX/REL/...) are judged by people.

"3 OS" = Windows, macOS, Linux. "5 targets" = win-x64, darwin-arm64, darwin-x64, linux-x64, linux-arm64.
Owner = the work package that turns the item green. Contract tests are read-only for implementers. The API they exercise is frozen in `docs/api-contract.md`.

## Contract (36)

| ID | Promise | Owner |
|---|---|---|
| C-SPAWN-01 | A bare program name resolves against the child's final PATH on 3 OS, incl. Windows PATHEXT (`npm` → `npm.cmd`); with PATH removed/absent the error says so | W03 |
| C-SPAWN-02 | Args (spaces, quotes, backslashes, empty, non-ASCII) arrive byte-identical, incl. `.cmd`/`.bat`; an arg that cannot be passed safely to a batch file → `INVALID_ARGUMENT`, nothing runs; shell metacharacters are never interpreted | W06 |
| C-SPAWN-03 | A relative program path with a separator resolves against `cwd` (host cwd if none); a relative `cwd` resolves against the host cwd — identically on 3 OS | W03 |
| C-ERR-01 | Errors per `docs/api-contract.md` §8 outcome table. Missing program → `NOT_FOUND`; not executable → `NOT_EXECUTABLE`; bad cwd → `INVALID_CWD`; every message names the value and the fix, identical text in all languages | W03 |
| C-ERR-02 | Invalid inputs (negative/NaN durations, bad PTY size, negative limits, NUL bytes) → `INVALID_ARGUMENT` naming the field, before any process exists | W03 |
| C-ENV-01 | `env` merges over the inherited env; `null` removes; clean-env gives only what was passed (+ documented OS-required vars on Windows); `PATH`/`Path` case-insensitive on Windows; non-ASCII round-trips | W03 |
| C-IO-01 | stdout/stderr are separate live streams (delivered before exit); `mergeStderr` gives one OS-level chronological stream; UTF-8 split across chunks decodes correctly; invalid UTF-8 → U+FFFD; bytes mode is exact; `lines()` splits, keeps the final unterminated line, and marks pieces of >1 MiB lines with `continues` | W10 |
| C-IO-02 | The child never blocks on output: up to 16 MiB/stream buffered for an attached consumer, 1 MiB with none, the rest dropped and counted in `droppedBytes`; loss is reported in order (`lostBefore`, incl. a final item before EOF) with decoding/line assembly restarting at gaps; single consumer (second claim → `INVALID_ARGUMENT`), break detaches; `wait()`/`stop()` complete with a paused consumer and 50 MB unread | W10 |
| C-IO-03 | `write` resolves when the pipe accepted the bytes, in call order; `closeStdin` flushes then closes, idempotent; spawn stdin is closed by default (`write` → `INVALID_ARGUMENT`); writing after close/exit → `CLOSED`, host never crashes; pending writes settle on exit/stop/timeout/cancel | W10 |
| C-IO-04 | Nothing written before exit is lost; if the root exits while a descendant holds the pipe, `wait()` resolves at root exit, `output` stays open until the descendant closes or `stop()`, and `run()` returns within `graceMs` with what it read and stops the rest — never hangs | W10 |
| C-RUN-01 | `run()` returns exitCode/stdout/stderr/success/reason (`success` ⇔ reason `exit` and code 0); a resolved result is always complete — above `maxOutputBytes` (default 16 MiB/stream) the tree is stopped and it rejects `OUTPUT_LIMIT` with the first bytes in `error.result`; `input` is fed then closed, without it stdin is closed; a timeout after the root exited still yields `reason: "timeout"`; non-zero exit never throws | W10 |
| C-KILL-01 | `stop()` ends child, grandchildren and great-grandchildren — also after `wait()` resolved and only descendants remain (root `Exit` unchanged); once the tree is gone it is a no-op | W07 |
| C-KILL-02 | `stop()` asks gracefully first with one deadline for the whole tree; a cooperative child finishes cleanup; one that ignores it is forced after `graceMs` (per-OS tier in GUARANTEES) | W07 |
| C-KILL-03 | A descendant that deliberately escapes (setsid / job breakaway) behaves exactly as GUARANTEES declares per OS | W07 |
| C-EXIT-01 | Exit codes 0/1/42/255 and Windows codes > 255 (e.g. `0xC000013A`) are reported as the same non-negative integer in all languages; `reason` is `exit`/`signal`/`killed`/`timeout`/`aborted` with the documented precedence | W07 |
| C-PROC-01 | `processes()` lists exactly the live processes `stop()` would end: a 3-level fixture tree appears with correct `parentPid` links and names (root's `parentPid` null), descendants stay listed after the root exits, a Unix descendant that escaped via `setsid` is alive and not listed; after `stop()` it returns `[]` and every listed pid is dead per the OS; no argument text appears | W07 |
| C-SCOPE-01 | Leaving scope kills the tree: TS `await using`, Python `with`/`async with`, Rust drop. Proven by the per-language idiom tests (C-RS-01, C-TS-01, C-PY-01): the scenario DSL has no scope | W07 |
| C-TMO-01 | `timeout` kills the whole tree, reason `timeout`, returns within timeout + grace + 1 s | W09 |
| C-TMO-02 | Cancellation (AbortSignal / task cancel / KeyboardInterrupt / CancellationToken) kills the tree, reason `aborted`; an already-cancelled request runs nothing (`ABORTED`) | W09 |
| C-HOST-01 | Rust host: main return, `process::exit`, uncaught panic, SIGINT/SIGTERM and hard kill leave trees as GUARANTEES declares per OS | W09 |
| C-RS-01 | Rust idioms: `#[non_exhaustive]` `Error` with `code()`, `CancellationToken`, drop kills, the tokio executor is never blocked | W09 |
| C-RS-02 | Every contract scenario passes through the Rust API on 5 targets | W09 |
| C-PTY-01 | With `pty` the child sees a terminal of the requested size (default 80x24); `resize` (PtyChild only) updates it; invalid size → `INVALID_ARGUMENT`; resize after exit → `CLOSED`; `run()` with `pty` + `input` → `INVALID_ARGUMENT`; in `run()` pty output lands in `stdout`, `stderr` empty | W12 |
| C-PTY-02 | Interactive exchange works (prompt → typed answer → reply) and `\x03` interrupts the foreground program on 3 OS | W12 |
| C-PTY-03 | PTY output is UTF-8 safe, nothing printed before exit is lost, and the stream ends when the child exits — no hang, incl. Windows ConPTY | W12 |
| C-PTY-04 | `stop()` on a PTY process ends its whole tree on 3 OS | W12 |
| C-TS-01 | TS idioms and host: `for await`, `await using` (awaits `stop()`), `AbortSignal`, `OmniError.code`, `PipeChild`/`PtyChild` overloads, zero `any` in the d.ts; a live Child keeps the event loop alive; GC never kills a child; normal end / `process.exit()` / uncaught exception / SIGINT / SIGTERM / hard kill behave per GUARANTEES on Node, Bun, Deno | W13 |
| C-TS-02 | Every contract scenario passes through TS on Node 22/24 (5 targets), Bun and Deno (3 OS) | W13 |
| C-PY-01 (v0.2) | Python idioms and host: `with`/`async with`, KeyboardInterrupt and task cancel kill and re-raise, `CommandNotFoundError` is a `FileNotFoundError`, `.pyi` clean under `pyright --strict`, waits release the GIL; normal end / `sys.exit()` / uncaught exception / SIGINT / SIGTERM / hard kill behave per GUARANTEES | W15 |
| C-PY-02 (v0.2) | Every contract scenario passes through Python sync and asyncio on CPython 3.10 and 3.14, 5 targets | W15 |
| C-PAR-01 (v0.2) | The glossary (`docs/api-contract.md` §2) has ≤ 15 concepts and none of the excluded capabilities; every public function, option and result field of each language maps to it, and each concept exists in all 3 languages; CI fails on drift | W18 |
| C-ARC-01 | All process semantics live in the Rust core; TS loads it via Node-API, Python via a CPython extension; binding sources never spawn/signal processes or implement timeouts | W18 |
| C-GUA-01 | Every GUARANTEES row has per-OS status and links the scenario or KPI that proves it; CI fails on a missing link | W18 |
| C-DOC-01 | The root README and guide lead with TypeScript (Python and Rust as equals); each language quickstart ≤ 10 lines; every README code block runs in CI on 3 OS | W18 |
| C-PKG-01 | Clean install with no compiler on 5 targets runs the hello example (= K9): npm / bun / deno in v0.1; pip / uv / cargo in v0.2 | W14 |
| C-REL-01 | One tag publishes npm, PyPI and crates.io at the same version; post-publish smoke passes on 5 targets; CHANGELOG and SemVer 0.x policy published | W21 |

Promises the deterministic scenarios cannot express are proven elsewhere, never dropped:
- leaving scope (C-SCOPE-01): idiom tests;
- pending writes settling on exit (C-IO-03): the stdin workload of QA-D;
- decoding restarting at a gap (C-IO-02): `io` unit tests, plus K5;
- a relative program resolved against the host cwd (C-SPAWN-03): `spawn` unit tests;
- loss at exit (C-IO-04): K5.

**Pending ledger.** `conformance/pending.txt` lists, one per line, the items whose owning WP has not landed yet (`<ID> <WP>`).
The runners report a pending item that fails as `pending`, and FAIL a pending item that passes (remove it from the
ledger). Only the lead edits the ledger, and it must be empty for a release.

Sandbox (phases 2–3):

| ID | Promise | Owner |
|---|---|---|
| C-SBX-01 | The policy (fs read/write allowlists + network on/off) is accepted by spawn/run in all 3 languages; invalid policy → `INVALID_ARGUMENT` before launch; unenforceable → `SANDBOX_UNAVAILABLE`, nothing runs; works with PTY; every sandbox scenario passes through Rust, TS and Python | SB1 |
| C-SBX-02 | macOS via Seatbelt: denied writes/reads/network fail, allowed ones work, descendants included | SB2 |
| C-SBX-03 | Linux via the ADR-0006 mechanisms: same as C-SBX-02 | SB3 |
| C-SBX-04 | An independent escape suite (symlinks/hardlinks, /proc & fd inheritance, re-exec, loader env, IPv6/UNIX sockets/DNS) is fully blocked on macOS/Linux | SB4 |
| C-SBX-05 | Windows via AppContainer/restricted token: exactly the declared tier holds, each row tested | SB6 |

## KPIs (measured by the QA harness, PLAN §4.2)

| ID | Release target |
|---|---|
| K1 orphan processes after a task | 0 |
| K2 hangs | 0 |
| K3 stop latency p95 | ≤ graceMs + 500 ms |
| K4 spawn overhead p50 (time to PID, and trivial round-trip) | ≤ 1.25× stdlib or ≤ +0.3 ms absolute, whichever is looser |
| K5 output bytes lost/garbled within documented limits | 0 |
| K6 1000-task soak: fds/handles back to baseline; RSS growth | ≤ 10 MB |
| K7 host crashes | 0 |
| K8 Windows parity on K1–K7 | same targets |
| K9 clean installs | 100% |
| K10 cold user (README only) | 15/15 tasks; median first success ≤ 5 min |
| K11 design partners | ≥ 2 languages; platform code removed; Windows bug repros fixed |

## Internal and management items

| ID | What | Owner |
|---|---|---|
| PLAN-01 | Every WP card has completeness, success, invariants, quality, DoD, owner and dependencies (`scripts/plan-sections-check.py`); ownership is total and disjoint (plan-check); Owner judges it actionable — judged | lead |
| G0-01 | Landscape: 22 behaviors × candidates with links; verdict on ≥ 80% — judged | R1 |
| G0-02 | Pain: issues across ≥ 8 agents in TS/Python/Rust, reproducible counts — judged | R2 |
| G0-03a/b/c | Spike ADRs (process + host exit · PTY · packaging) answering their listed questions with CI links on 3 OS — judged | S1 / S2 / S3 |
| G0-03d | Supervisor spike (ADR-0005) with asserting tests on 3 OS — judged | S5 |
| G0-04 | Go/no-go evaluating each kill criterion, signed by the Owner before Phase 1 — judged | lead + Owner |
| G0-05 | ≥ 5 maintainer conversations recorded — judged | Owner |
| UX-02 | Owner approves the API (ergonomics and small size) before the freeze — judged | Owner |
| REL-02 | ≥ 2 design partners in different languages (= K11) — judged | Owner |
| UX-01 | Cold-user test (= K10) — judged | Q2 |
| SCF-01 | Scaffold compiles on 3 OS; stubs return errors, never panic | W00 |
| ARC-FS | God-file guard: no tracked code file over 650 lines (`scripts/file-size-guard.py`, teeth in `scripts/test_file_size_guard.py`); wired into CI by W00 and run on every bundle | W00 |
| FIX-01 | Fixture implements FIXTURE.md on 3 OS | W01 |
| ACC-01 | Every contract item has a red scenario (the seam suites PROTO-01, SUP-U/W, PTYSYS-U/W belong to W04/W05/W06/W12/W12w) | W01 |
| ACC-02 | TS and Python runners execute the same scenarios; idiom tests for C-TS-01 / C-PY-01 | W02 |
| PROTO-01 | Host↔supervisor channel suite (ADR-0005 R1, R2, R6, R7) | W04 |
| SUP-U / SUP-W | Supervisor suites on Unix (incl. static musl) / Windows (ADR-0005 R3–R5, R8, R10) | W05 / W06 |
| PTYSYS-U / PTYSYS-W | `pty` seam suite green on Unix / Windows | W12 / W12w |
| QA-01 | QA harness runs workloads A–E in 3 languages vs stdlib and reports K1–K8 per OS | Q1 |
| SBX-00 | Sandbox ADR + threat model — judged | S4 |
