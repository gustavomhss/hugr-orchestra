# R17 — Rust + Go backend depth, small enough to use

Research/design only. Recorded 2026-10-03. Target worktree HEAD: `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`.

**Recommendation:** demand-loaded `backend-rust` and `backend-go`; four focused procedures each. Shared orientation packet and evidence shape. Load procedure because affected behavior needs it, not because repository contains that language. Main value: preserve ownership, cancellation, transaction and retry semantics under failure. Measure user-visible correctness before optimizing token/tool use.

Primary docs and first-person reports inspected; fixtures, commands and integration below are proposals. No backend fixture, benchmark, plugin loader or downloaded code executed during R17. Source versions identify consulted material, not mandated project versions.

## 1. Product fit and loading boundary

Local proposal sources read from `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/`:

- `README.md`: independent plugin, shared native host runtime, optional Maestro, dynamic display name, stable member identity, work/result contract. Document labels itself architecture proposal.
- `capabilities.md`: on-demand stack skills, existing tools, held-out behavior evaluation, proportional verification.
- `atlas.md`: native Atlas Knowledge/Memory ownership, bounded headers/recall, freshness, honest admission outcomes and unresolved host integration seams.

R17 extends those proposals; reading them does not establish implemented host support.

### Proposed package shape

| Surface | Content / behavior |
| --- | --- |
| Base charter | Discover actual component and commands; select relevant procedure; make bounded change; return evidence. |
| `backend-rust` | Router to R1–R4 below; named references fetched only for unresolved semantics. |
| `backend-go` | Router to G1–G4 below. No second agent or language-specific model runtime. |
| Shared transaction note | Retry decision table in §3, referenced by R3/G2 rather than copied into every skill. |
| Human-facing title | Render host-resolved `{displayName}`. Existing proposal uses `HUGR_BACKEND_NAME`, default `BACKEND_DEFAULT_LABEL`; spelling remains proposed. |
| Machine identity | Stable `backend` member compatibility ID and role-stable skill IDs. Display rename changes neither routing nor Atlas owner. |
| Direct / Maestro | Same skills and evidence contract. Maestro adapter adds existing bounded work request when present. Standalone use remains sufficient. |

Suggested authoring budget, not measured tokens: short router, roughly one screen per procedure, references and evaluator material outside loaded body. A procedure may need a second screen for genuinely tricky driver semantics. Do not inject this whole research report. Ordinary task selects one procedure; cross-boundary task selects only relevant neighbors.

**Native Atlas use:** obtain host-bound project/member header; refresh on relevant source/state drift through host's context boundary. Recall exact task fold on real resume or relevant prior failure when needed. Useful memory: “this component uses native pgx; cancellation does not auto-rollback; regression and evidence at …”, with source revision/version and applicable scope. Record failed approaches as failures. Admit reusable project rule only through Atlas-owned door; live source overrides stale experience. Keep raw logs behind recoverable pointers. Use actual read/write receipts; refused or uncertain writes stay refused/uncertain. No competing memory store, direct `.atlas` reads, per-turn bulk recall or invented Atlas tool names. Missing Atlas permits explicitly degraded ordinary work; evidence-dependent operation retains its real blocker. V1/V2 loader and selected-member context support require later, separate conformance tests.

## 2. Discover once, then inspect narrow cause

Start at affected component. Read nearest instructions, manifests, lockfiles, task scripts, CI lane and representative adjacent tests together. Follow actual call path into dependency source only where semantics matter. Output compact orientation record, reused until relevant files/environment change:

```text
component/cwd + source revision
declared support floor + selected compiler/runtime
runtime/driver/library versions + features/tags/target
real verification command + source file defining it
database/test prerequisites + known baseline failures
selected procedure + behavior to prove
```

| Family | Discover | Smallest useful tools, only when static files leave uncertainty |
| --- | --- | --- |
| Rust | `Cargo.toml`, workspace membership/default members, `Cargo.lock`, `rust-toolchain*`, `.cargo/config*`, `rust-version`, edition, resolver, target config, CI feature combinations, runtime flavor, existing test runner | Installed toolchain/version inspection; `cargo metadata --no-deps --format-version 1` for members/targets; targeted `cargo tree -e features -i <dependency>` when feature origin matters. `--no-deps` omits resolved graph: do not infer full dependency resolution from it. |
| Go | `go.mod`, `go.sum`, `go.work`, `toolchain`/`go` lines, vendor/replace directives, build tags, generated-file policy, CI toolchain and database driver | Installed `go version`; version-supported `go env -json` keys for `GOVERSION`, `GOMOD`, `GOWORK`, `GOOS`, `GOARCH`, `CGO_ENABLED`, `GOFLAGS`, `GOTOOLCHAIN`; targeted `go list`/`go doc` for selected package/API. |

Command spellings above are candidates, not repository recipes. Discover working directory, wrapper, package, feature/tag selection and required environment before execution. Inspect toolchain selection first: Cargo/rustup overrides and Go auto toolchains can select or fetch another compiler. Under no-download policy, use installed tools and command-scoped offline/local controls supported by that version; report unavailable prerequisites instead of changing project configuration. Cargo `--locked` prevents lockfile resolution changes, not network access; `--frozen` adds offline behavior. Go `go.sum` is integrity metadata, not Cargo-style lockfile. [S08–S10, S12]

Avoid habitual `cargo update`, `go get -u`, `go mod tidy`, runner installation or framework replacement. Necessary dependency change names needed capability, support-floor impact and attributable manifest/lock delta. Missing test tool is not reason to upgrade application.

## 3. Shared mechanism: effect ownership + retry classification

For affected work only, annotate this compact ledger; it may fit in working notes rather than new project file:

```text
resource / owner / acquisition / cancellation signal / completion proof
business effect / commit point / retry identity / ambiguous-outcome behavior
```

Separate **request stopped waiting**, **local worker finished**, **resource released**, and **durable effect known**. Neither dropping future nor canceling context means remote write did not happen.

| Observed outcome | Correct next action |
| --- | --- |
| Validation/domain rejection | Preserve contract error; no transient retry. |
| Request cancellation/deadline | Stop request-owned attempts and cancel-aware backoff. Complete bounded cleanup. Do not refresh deadline or detach work merely to obtain success. Already-admitted durable jobs follow their own owner. |
| PostgreSQL `40001` | Retry complete transaction, including decision reads, in fresh transaction; bounded attempts/time, existing backoff/jitter policy. Do not repeat only failed statement. |
| PostgreSQL `40P01` | Retry only under project's deadlock policy and same whole-transaction/side-effect constraints. |
| Unique violation | Classify specific constraint and intent. Duplicate idempotency key may require result reconciliation; unrelated domain conflict is not blanket retry. |
| Connection loss / timeout around commit or external request | Outcome may be unknown. Reconcile stable operation identity or use established idempotent protocol. Error alone proves neither rollback nor safe replay. |
| Job performed effect, completion acknowledgment lost | Expect possible redelivery. Stable deduplication identity or transactional completion for same-database effects; remote effects need remote idempotency/reconciliation. |

Map by structured driver code/type; preserve cause. Retry one owning layer, accounting for driver/SDK/queue retries already present. New outbox only when contract needs atomic DB change plus eventual external delivery; reuse existing mechanism. Enqueueing in same transaction fixes dual-write visibility/loss boundary, not universal exactly-once external execution. [S18–S22]

## 4. Rust procedures

### R1 — Compiler-led ownership and API repair

**Trigger:** borrowing, lifetime, `Send`/`Sync` diagnostic; task boundary change; exported type/error change.

**Inspect:** exact diagnostic and required bound; captured values and returned task output; values/guards retained across suspension; borrow owner and public callers. `Send` means transferable; `Sync` means shared references transferable. `tokio::spawn` needs `Send + 'static` future and output; it does not universally require `Sync`. `'static` bound does not mean value must live forever. [S01–S04]

**Procedure:**

1. Identify specific value and boundary requiring ownership/trait change. Prefer shortening borrow/guard scope or moving owned request data into task.
2. Add sharing only where multiple owners need it. `Arc` does not make thread-unsafe contents safe. Intentional local executor remains valid design; switching to it solely to hide lock/`Send` problem is not repair.
3. Keep meaningful project error type and source chain; add required bounds at real boundary. Avoid turning errors into strings or panics to satisfy compiler. Choose concrete function/type unless real consumer needs polymorphism; public bounds/fields commit callers to constraints.
4. Reject lifetime leakage, `transmute`, `unsafe impl Send/Sync`, blanket cloning or `Arc<Mutex<_>>` spread justified only by “compiles”. Legitimate unsafe boundary requires actual invariant, not trait-silencing rationale.

**Small tools:** focused source/diagnostic read, discovered package check, caller/consumer compile test; existing lint command if required. No new abstraction/tool suite.

**Evidence:** original failing boundary → ownership rationale → successful actual caller compilation; exported auto-trait/error behavior retained. For changed public `Send` contract, compile consumer using that contract. Runtime concurrency claims still need R2. Older Async Book/tutorial compiler limitations need confirmation on project compiler, not verbatim generalization.

### R2 — Cancellation, hidden blocking and supervised completion

**Trigger:** `select!`, timeout, spawn, shutdown, hung request, blocking dependency or lock near async path.

**Inspect:** every relevant suspension boundary, child handle, permit, buffer, lock and sync/async bridge. Dropped `JoinHandle` detaches task. Losing `select!` future may lose partial `read_exact`/`write_all` progress; canceled lock/semaphore acquisition may lose queue position. Check concrete API. [S05–S07]

**Procedure:**

1. Assign request/service owner and cancellation policy. Preserve progress outside restartable future or retain/pin future when operation must survive selection; otherwise cancel only at safe boundary.
2. Signal owned tasks, then join/drain using existing handle collection or tracker. Abort appropriate async work only where dropped state remains valid; await completion. Notification alone is not completion proof.
3. Find hidden blocking in called code: sync DB/file/process calls, CPU loops, logger/lock contention, `block_on` bridges. Keep short low-contention synchronous locks when valid; end guard scope before async work. Async mutex is not automatic fix for bad ownership or long critical section.
4. Offload bounded blocking work using existing executor. Bound admission before spawn; keep capacity permit inside closure until actual completion. Started `spawn_blocking` cannot be aborted: use cooperative stop between bounded chunks and join. Uninterruptible call needs honest lifetime limit; timeout cannot certify it stopped.

**Small tools:** call-path read; focused cancellation test with barriers; existing tracing only if stall unresolved. Test runtime flavor that exposed bug plus relevant deployed flavor.

**Evidence:** canceled checkpoint, owned task termination, resource reacquisition, preserved progress/side-effect contract. Paused Tokio time helps timers when supported/configured, not proof of external I/O cleanup. [S11]

### R3 — Transaction ownership and replay-safe failure

**Trigger:** DB writes, cancellation during transaction, retries, job enqueue/completion or uncertain commit.

**Inspect:** actual driver/version; begin/query/commit/rollback call chain; borrowed executor; connection return; uniqueness/isolation; external effects inside retry scope. Every statement in atomic unit must use same transaction, not pool convenience method.

**Procedure:**

1. Trace transaction through real function signatures. Keep one owner; borrow transaction for helpers. Scope rows/streams and release before next operation when driver requires it.
2. Prefer awaited rollback on handled failure where control remains. SQLx 0.8.6 `Drop` calls `start_rollback`; source describes generally queued rollback on later async connection activity. RAII fallback is not receipt proving server rollback already finished. [S17]
3. Classify failure through §3. Retry complete known-aborted unit with fresh reads and existing stable operation key. Cancellation during `commit().await` may leave durable outcome unknown; preserve that distinction.
4. Exercise cancellation and fault after first write against actual database engine. Observe committed rows plus pool reuse/transaction state. SQL macro compilation or fake executor proves neither isolation nor cancellation semantics.

**Small tools:** narrow source/schema read, repository integration runner, real DB query and existing pool stats. Driver source only for unresolved cancellation/drop boundary.

**Evidence:** rollback/commit classification, atomic business rows, retry-attempt trace, reused capacity, stable result after exact retry. External side-effect scope stated explicitly. Missing DB yields unavailable integration evidence, not a substitute green SQLite/mock result.

### R4 — Verify real Cargo surface without dependency churn

**Trigger:** Rust change reaches verification; feature/target/MSRV discrepancy; proposed dependency or runtime-feature change.

**Inspect:** orientation packet, affected package targets, `required-features`, dev/build dependency feature unification, real consumer configuration and selected CI commands. `--all-features` does not cover every meaningful configuration and may enable incompatible choices. [S08–S10]

**Procedure:**

1. Reproduce on repository's actual package/feature/runtime path. Reuse installed wrapper or runner; identify selected test name before treating filtered command as evidence.
2. Make smallest fix, then run detecting regression and affected package checks. Broaden to supported consumer/feature/MSRV lane when changed boundary demands it; preserve mandatory project checks.
3. Compare manifest/lock delta with intended dependency change. Keep feature enablement narrow; avoid runtime `full` or toolchain bump as default compile workaround.
4. Inspect whether test executed, ignored/skipped or compiled only. Break protected behavior in isolated evaluation copy to prove regression detects it. Retain at least one real environment case when fake time or synthetic crate narrows coverage.

**Small tools:** discovered package check/test/lint commands; targeted feature tree only for uncertainty. Existing property/fuzz tooling only when input/state space warrants it.

**Evidence:** exact command/cwd/compiler/target/features, named executed tests, before/after behavior and justified dependency delta. Compile-only cross-target check labeled compile-only. No claim of Windows, Linux or macOS runtime behavior from another host's green run.

## 5. Go procedures

### G1 — Context-owned bounded workers

**Trigger:** new goroutine/channel/worker pool; early-return hang; timeout, shutdown or pool starvation.

**Inspect:** parent context through HTTP/DB calls; every blocking send/receive and admission wait; cancellation owner; channel-closing owner; resource lifetime per item; worker join path. `CancelFunc` does not wait for work to stop. Goroutines are not garbage-collected away. [S13–S15]

**Procedure:**

1. Keep simple work synchronous; caller owns concurrency. For parallel work, bound producers, queued data and active workers—not merely DB connections after unbounded goroutine creation.
2. Make request-owned waits cancellation-aware; defer derived cancel at correct scope. Propagate worker context into downstream calls. Do not replace canceled request with `Background()`/`WithoutCancel` to keep doing ordinary work.
3. Reuse `errgroup.WithContext` when installed and fitting: wait for workers, preserve error, never reuse derived context after `Wait`. `SetLimit` makes `Go` block on admission; cancellation does not itself release stuck worker. Avoid nested submissions into saturated group; fixed workers with cancel-aware job feed often clearer.
4. Sender/coordinator closes channel after senders finish. Close rows, HTTP bodies and per-item resources promptly; `defer` inside long-lived loop retains resources until enclosing function returns.

**Small tools:** narrow call-path search/read, focused barrier-driven lifecycle test; goroutine profile/pool stats only for unresolved hang.

**Evidence:** cancellation acknowledgment plus all owned workers joined; blocked downstream/early-return cases release capacity; active work stays within configured limit and next healthy request succeeds. Define cancellation race boundary instead of asserting instantaneous termination.

### G2 — Driver-specific transaction and worker effects

**Trigger:** transactional change, duplicate work, queue/DB coordination, canceled query or commit error.

**Inspect:** `database/sql` versus native pgx versus ORM; transaction executor passed through helpers; rows/`BatchResults` cleanup; isolation and retry owner; job's effect/ack boundary.

**Procedure:**

1. Begin with owned context; arrange rollback immediately after successful begin. Execute atomic statements through transaction methods and handle commit result before reporting success. Avoid non-transaction `DB`/pool calls inside atomic unit. [S16]
2. Match driver: `database/sql.BeginTx` context covers transaction and cancellation triggers rollback. Native `pgxpool.BeginTx` context affects begin only; commit or rollback still required. For pgx cleanup after request cancellation, use project's bounded cleanup context when needed, created when cleanup runs; it authorizes cleanup, not fresh business work. [S18]
3. Apply §3 using wrapped error/code, cancellation provenance and transaction phase. Do not classify every `sql.ErrTxDone` as benign cancellation or every canceled commit as proved rollback.
4. For workers, distinguish at-least-once execution from unique enqueue. Use existing transactional enqueue/completion for same-DB effects; remote calls retain deduplication/reconciliation requirement. [S20–S21]

**Small tools:** existing real-engine integration tests, pool `Stat`/`DB.Stats`, scoped SQL inspection. Mock tests can cover branch mapping; they cannot replace transaction evidence.

**Evidence:** failed unit leaves atomic state intact; connection reusable after cancellation; whole-unit retry reads fresh state; duplicate delivery has intended business result; unknown commit remains explicit until reconciled.

### G3 — Error/API repair with minimal abstraction

**Trigger:** error mapping, retry branch, handler/service boundary, public API or proposed interface/dependency change.

**Inspect:** caller's branching contract, current sentinels/types, `Unwrap`, driver/domain translation, actual interface consumers and module/support-floor delta.

**Procedure:**

1. Separate cancellation, deadline, not-found/conflict, transient failure and unknown durable outcome only where callers need distinction. Preserve causes for internal classification with `%w`, `errors.Is`/`errors.As`; do not match formatted strings. [S14]
2. Choose exposure deliberately. Wrapping driver error can make it public API; translate to established domain error at intended boundary, without destroying classification earlier in retry path.
3. Return concrete type when sufficient. Define small interface at actual consumer seam when needed; do not generate implementor-wide interface/repository/factory layers “for mocking”. Avoid nil-error-interface traps where changed code introduces typed pointer errors. [S23]
4. Fix local behavior before replacing library. Necessary module changes must explain useful capability and minimum-Go impact; discovered go/workspace/version rules remain authoritative.

**Small tools:** callers + implementation + focused table-driven contract test; installed `go doc`; existing formatting/vet checks. No project-wide style sweep.

**Evidence:** caller-level `errors.Is`/`As` and wire/domain behavior, wrapped failure preserved, success still usable, interface/dependency delta justified by concrete call site. Compilation is insufficient when client retry decision changed.

### G4 — Tests and diagnostics that see actual failure

**Trigger:** verifying Go behavior change; flaky concurrency test; parser edge case; measured CPU/latency/resource symptom.

**Inspect:** real test selection/build tags, caches/skips, test environment, shared fixture lifecycle and production call path. Pick tool by question:

1. **Behavior/lifecycle:** focused test through actual implementation; barriers/channels establish interleaving, then join. Inspect named execution events. When fresh execution matters, discovered `go test` wrapper may use `-count=1`; cached output is not new run. [S24]
2. **Shared-memory concurrency:** supported-target `-race` lane. It detects executed data races, not goroutine leaks, deadlocks or DB isolation anomalies. Respect installed platform/cgo requirements. [S25]
3. **Untrusted parser/serializer:** version-supported native fuzz target with independent invariant, meaningful valid/invalid seeds, bounded `-fuzztime`; retain minimized counterexample. Normal `go test` replays seeds, not fuzz exploration. [S26]
4. **Performance/hang:** identify symptom/workload first; select CPU, heap, goroutine, block or mutex profile. Use `go tool pprof`; trace only if scheduling/I/O question remains. Keep race-instrumented timing separate from performance evidence. [S27]

**Small tools:** relevant test command, then one matching diagnostic. Go 1.25+ `testing/synctest` can test in-process time/quiescence; real network/syscalls are not durably blocked in its model. Use normal real-I/O integration checks for those claims. [S28]

**Evidence:** behavior and named executed case, negative-control failure, preserved success; fuzz corpus/budget or profile/workload pointer only when used. Failed prerequisites, zero selected tests and skips cannot become passed coverage. Report scope-specific results; do not run every diagnostic for every edit.

## 6. Developer pain: direct reports, limited inference

These establish failure existence and cost to developers. They do not establish population frequency, current unresolved library defects or measured coding-agent error rates. Agent mistake priorities come from R17 brief; proposed mitigations need evaluation.

| Report | Observed pain | Design consequence / inference limit |
| --- | --- | --- |
| **Community/production anecdote:** Turso, Piotr Jastrzebski, 2024-09-02, [single-mutex Tokio deadlock](https://turso.tech/blog/how-to-deadlock-tokio-application-in-rust-with-just-a-single-mutex) | Team supplies reproducer: synchronous mutex retained while `spawn_blocking` code calls runtime `block_on`; async progress stalls. | Inspect transitive blocking and guard lifetime, not just lexical `.await`. Author recommends async mutex default; official Tokio guidance still permits short uncontended sync locks. Do not turn anecdote into blanket mutex replacement. |
| **Community support report:** [Tokio #2170](https://github.com/tokio-rs/tokio/issues/2170), 2020, Tokio 0.2.10 | Developer struggles with `'static` reasoning; actual diagnostic involves non-`Send` error trait object. | R1 starts from precise compiler bound including error/output type. Historical report, not current Tokio bug or endorsement of reporter's lifetime interpretation. |
| **Community workplace report:** [Go #43507](https://github.com/golang/go/issues/43507), 2021, reported Go 1.15.6 | Team spent time diagnosing canceled transaction as double-completion bug; observed commit error varies with cancellation/rollback interleaving. | Test cancellation semantics/provenance rather than one error string. Reproduce on selected Go/driver before describing current behavior; issue narrative is not normative API guarantee. |
| **Community diagnostic report:** [pgx #713, concrete `BatchResults` finding](https://github.com/jackc/pgx/issues/713#issuecomment-977995337) | Reporter inspected pool stats and found unclosed `BatchResults`; closing it fixed that reporter's pool exhaustion. Thread also contains unresolved/different reports. | Observe result lifetime and capacity; do not “fix” by inflating pool. Scope claimed cause to this comment, not whole issue or current pgx release. |
| **Community goroutine report:** [pgx #713, blocked-acquire stacks](https://github.com/jackc/pgx/issues/713#issuecomment-634629137) | Reporter provides goroutine stacks waiting in pool acquisition after goroutine-per-item processing; maintainer later requests pool stats/reproducer. | G1 bounds admission; G4 separates queued demand from proven connection leak. Stack sample is useful evidence, not verified final attribution. |

Official Go maintainer's [Testing Time](https://go.dev/blog/testing-time) also reports difficulty making real `net/http` asynchronous tests both fast and reliable. Primary maintainer account supports barriers/quiescence and version-gated `synctest`; it explicitly documents real-I/O limits. River docs are primary ecosystem design guidance, not independent benchmark or field-incident evidence.

## 7. Evaluator-only held-out fixture design

### Fixture: `reservation-batch`, sibling Rust and Go implementations

**Status:** specified here, not implemented/executed. Deployable skill assets exclude this section. Actual holdout requires evaluator to instantiate and seal hidden inputs/interleavings after skill freeze; this visible recipe alone does not establish uncontaminated holdout.

Small existing service per family, same business contract; independent runs, not compulsory polyglot migration:

- Rust sibling: Tokio + existing SQLx/PostgreSQL integration, small synchronous validation/hash step already offloaded where needed.
- Go sibling: standard HTTP + native pgx/PostgreSQL, bounded request-owned worker pipeline. Separate driver variant may use `database/sql` to expose false semantic transfer; do not silently switch driver mid-run.
- Existing schema contains account balance, reservation keyed by `(tenant, request_key)` with canonical payload identity, and outbox row. Existing query/status route resolves reservation by key. Existing helpers and scripts provide test DB and synchronization seams.
- Repository declares pinned compiler, runtime/driver/DB versions, production features/tags, commands and supported OS lane. Candidate must discover them. Evaluator provisions approved dependencies beforehand; installing tools or rewriting manifests is not required solution.

**User task:** repair intermittent cancellation hang and inconsistent retry result in batch reservation endpoint. Preserve API, bounded concurrency, atomic per-item reservation/balance/outbox update and exact-retry result. Same key with changed intent is conflict. Batch is not globally atomic: committed items remain committed if later cancellation stops other items. Request-owned work must finish cleanup; committed outbox belongs to durable service, not disconnected caller.

Give candidate task text, real source, visible happy-path tests and normal commands. Keep acceptance scripts, mutation locations, timing seeds and evaluator DB/proxy controls outside candidate writable scope. Start from compiling runtime-bug variant so lifecycle/data oracles can run. Hidden downstream Rust consumer protects declared future/error `Send` contract during repair. Go caller assertions protect wrapped error semantics.

### Controlled execution, not sleep lottery

Evaluator supplies barriers around worker start, slot acquisition, first DB write, commit transport and result handoff. Hidden schedules vary batch size, bounded concurrency, pool capacity and cancellation stage. Wall-clock watchdog bounds harness hangs; assertion depends on observed state transition, not “slept long enough”. Record barrier reach so test cannot pass before target operation starts.

Use real PostgreSQL and actual application drivers. For serialization conflict, two real serializable transactions read same account before contending update; observe actual SQLSTATE before evaluating retry. For ambiguous commit, evaluator-owned local protocol proxy forwards commit, observes upstream completion and withholds response/disconnects downstream. Independent connection confirms committed outcome before retry assertions. Proxy fault is controlled; transaction engine is real. Fixture protocol/TLS assumptions remain recorded, not generalized.

| Hidden case | Oracle / required evidence | Broken variant that must be rejected |
| --- | --- | --- |
| **C1: cancel while capacity/result path blocked** | First prove work started. Cancel parent; join owned tasks/workers; await resource recovery; next healthy request obtains slot/connection. Inspect real resource activity as well as app counters. Committed rows remain valid. | Rust timeout drops handle/releases permit while started blocking work continues. Go worker blocks sending to abandoned consumer or waits using unrelated context. |
| **C2: fail after first write** | Real DB constraint/fixture fault aborts remaining unit. Independent query shows balance/reservation/outbox atomicity; next transaction reuses capacity. | One helper writes through pool rather than transaction; missing rollback/rows/`BatchResults` close. Pool size one can expose escape by hang; larger pool exposes partial write. |
| **C3: serialization retry + canceled backoff** | Record real `40001`, fresh transaction/read on next attempt, bounded attempt budget and unchanged original deadline. Cancel during scheduled backoff; no further business attempt after cancellation acknowledged. | Retry failed statement on aborted transaction, reuse stale read, reset timeout or retry canceled context. |
| **C4: committed but reply lost** | Confirm committed operation by independent query, then exact key replay yields same business result and single reservation/outbox effect. Changed payload under same key yields conflict. | Blind retry with new key; treat transport error as rollback; report success without reconciliation; duplicate debit/outbox. |
| **C5: unaffected success + consumer compatibility** | Valid concurrent request completes; error/API consumer compiles and behaves correctly; declared production feature/tag lane executes. Existing short sync critical section stays valid. | Stub/no-op “cleanup fix”; stringify all errors; broaden trait bounds/API unnecessarily; blanket runtime-feature or module/toolchain upgrade hiding problem. |

C1 checks completion of identified request-owned workers, not exact global goroutine count. Background driver/runtime housekeeping can legitimately persist. Capacity probe alone cannot prove transaction atomicity; C2–C4 inspect DB state. Fake-time tests supplement these real-I/O cases, not replace them. Outbox assertion proves DB atomicity only; no claim that external notification delivery is exactly once.

### Negative control and instrument calibration

First calibrate each oracle on evaluator-owned known-correct reference: C1–C5 must execute and pass. Primary **negative control**: restore known broken lifecycle branch in otherwise correct sibling. Run same C1 schedule and command. Expected outcome: named lifecycle assertion fails or watchdog reports evidenced blocked owned worker. Compilation/setup failure does not count as successful mutation detection. Restore reference and require same C1 case to pass. Repeat lifecycle mutation against candidate repair; require red → restored green evidence. C2 transaction-escape mutation separately calibrates DB oracle in both directions. C5 preserves useful success, preventing cancellation fix from winning by disabling work.

Also submit no-op handler to C5: “nothing leaked” is vacuous unless required reservation/outbox effect and response occur. Verify selected named cases actually execute using runner results. Required case omitted, skipped, unavailable or never reaching barrier means evaluation incomplete—not green. Evaluator records candidate diff and hidden test hashes to detect test bypass; assess behavior, not regex presence of preferred APIs.

These are planned controls. R17 claims no observed mutation kills or passing run.

### Candidate result contract

```text
disposition: completed | blocked | failed | interrupted
scope: revision, changed files, discovered toolchain/driver/DB/OS
decision: cause, chosen owner/lifetime, transaction/retry semantics
checks[]: exact command, cwd, features/tags, named cases,
          passed | failed | skipped | unavailable, recoverable evidence pointer
delta: dependency/API changes and reason, if any
remaining: actual coverage gap or unresolved durable outcome
memory: native Atlas receipt/refusal/unknown outcome, if attempted
```

No raw transcript needed for ordinary handoff. Full logs stay recoverable; summary retains status, relevant failing assertion and environment. Required tests run before any completion claim.

### Compare skill benefit without rewarding empty efficiency

Use same model/provider version, task variant, host tools, permissions and total budget. Randomize run order and repeat paired runs across sealed variants; choose repetition plan before results. Baseline gets ordinary repository context but neither specialist procedure nor leaked memory. Treatment adds only triggered procedure. Evaluate Rust and Go separately before pooled summary.

Order results:

1. **Correct outcome:** C1–C5, preserved API/data invariants, no prohibited workaround or evaluator bypass. Missing environment means incomplete coverage.
2. **Honest evidence:** correct commands/selection, actual failures reported, ambiguous outcomes preserved, scope-correct claims.
3. **Useful restraint:** unnecessary dependencies, abstraction/changed-surface burden, repeated failed approaches and avoidable human repair. Small diff alone does not earn correctness.
4. **Efficiency conditional on comparable correctness:** actual provider input/output/cache usage when exposed; tool calls/output volume; repeated unchanged reads/tests; elapsed work and metered cost when available. Report cost per successful task alongside failures, not cheaper mean caused by early surrender. Byte/word proxies labeled proxies.

Separate Atlas benefit trial: resume exact task in new Session after meaningful failed approach, with/without relevant native memory; then rename display label and retry recall under stable member identity. Change source/version to invalidate old lesson; record whether candidate reconciles drift. Never mix fixture solutions into project memory shared with fresh benchmark runs.

Minimal host conformance alongside backend trials: direct selection without Maestro; same work via optional Maestro adapter; display rename preserving identity/Atlas ownership; real native Atlas write/read/resume and capability-specific degradation. Results apply only to exercised OpenCode/Orchestra loader versions. No V1/V2 or cross-platform parity inferred.

## 8. Primary source register

Exact URLs consulted 2026-10-03. Unversioned documentation is living guidance; project work must resolve installed version. Linked tutorial examples sometimes reflect older compilers/APIs. Use documented concept plus current project compiler/driver evidence. Community reports remain separately labeled in §6.

### Rust language, API, Cargo and Tokio

- **S01 — Rust API Guidelines, interoperability:** https://rust-lang.github.io/api-guidelines/interoperability.html#types-are-send-and-sync-where-possible-c-send-sync and https://rust-lang.github.io/api-guidelines/interoperability.html#error-types-are-meaningful-and-well-behaved-c-good-err — auto-trait compatibility tests and useful error bounds/source behavior; apply relevant clauses, not entire checklist.
- **S02 — Rust API Guidelines, future-proofing:** https://rust-lang.github.io/api-guidelines/future-proofing.html#data-structures-do-not-duplicate-derived-trait-bounds-c-struct-bounds — unnecessary bounds constrain clients; private fields protect invariants. Library guidance, not mandate to wrap every application value.
- **S03 — Rustonomicon:** https://doc.rust-lang.org/nomicon/send-and-sync.html — exact `Send`/`Sync` distinction and unsafe-implementation obligation.
- **S04 — Async Book / Tokio spawning:** https://rust-lang.github.io/async-book/07_workarounds/03_send_approximation.html and https://tokio.rs/tokio/tutorial/spawning — suspension-held values, scope and task bounds; `'static` misconception. Compiler-workaround details version-sensitive.
- **S05 — Tokio select, inspected latest rendering identified 1.53.2:** https://docs.rs/tokio/1.53.2/tokio/macro.select.html#cancellation-safety — cancellation-safe versus progress-losing operations; fairness and same-task blocking.
- **S06 — Tokio task lifetime:** https://docs.rs/tokio/1.53.2/tokio/task/struct.JoinHandle.html and https://docs.rs/tokio/1.53.2/tokio/task/fn.spawn_blocking.html — drop detaches, abort differs from completion, started blocking work cannot be aborted, CPU concurrency needs explicit bound.
- **S07 — Tokio ownership/shutdown:** https://tokio.rs/tokio/tutorial/shared-state and https://tokio.rs/tokio/topics/shutdown — short synchronous locks can fit; detect shutdown, signal, then wait.
- **S08 — Cargo metadata:** https://doc.rust-lang.org/cargo/commands/cargo-metadata.html — workspace/targets, stable format selection, no-deps limits, locked/offline distinction.
- **S09 — Cargo features:** https://doc.rust-lang.org/cargo/reference/features.html#feature-unification and https://doc.rust-lang.org/cargo/reference/features.html#feature-combinations — additive/unified features, resolver distinctions and proportional supported combinations.
- **S10 — Cargo support floor:** https://doc.rust-lang.org/cargo/reference/rust-version.html — declared MSRV and actual verification, workspace/dependency interactions.
- **S11 — Tokio testing:** https://tokio.rs/tokio/topics/testing — paused-time mechanisms and `test-util` feature requirement; not proof of real DB/network behavior.

### Go language/runtime and testing

- **S12 — Toolchain selection:** https://go.dev/doc/toolchain — `go.mod`/`go.work`, `go`/`toolchain`, `GOTOOLCHAIN`, selected versus bundled version and automatic downloads.
- **S13 — Context:** https://pkg.go.dev/context#CancelFunc and https://pkg.go.dev/context#WithCancel — propagate parent, call cancel, cancellation does not wait. Fetched package rendered Go 1.27.1; no requirement to use that version or newer convenience APIs.
- **S14 — Error API:** https://go.dev/blog/go1.13-errors — `%w`, `errors.Is`/`As`, deliberate public exposure of wrapped errors.
- **S15 — Pipelines and group semantics:** https://go.dev/blog/pipelines and https://pkg.go.dev/golang.org/x/sync/errgroup — abandoned consumers, bounded parallelism, group context lifetime and blocking admission. Fetched errgroup rendered v0.23.0; inspect installed version.
- **S16 — SQL transactions:** https://go.dev/doc/database/execute-transactions — same connection/unit, explicit commit result, rollback and danger of non-transaction `DB` calls.
- **S23 — Go project review guidance:** https://go.dev/wiki/CodeReviewComments#interfaces, https://go.dev/wiki/CodeReviewComments#goroutine-lifetimes and https://go.dev/wiki/CodeReviewComments#synchronous-functions — concrete producer values, consumer-owned interfaces and obvious goroutine lifetimes. Style guidance, not language specification.
- **S24 — Official test-command source, inspected via GitHub API:** https://github.com/golang/go/blob/go1.25.0/src/cmd/go/internal/test/test.go — package-list caching, `-count=1`, structured `-json` output. Use repository runner/version's accepted flags.
- **S25 — Race detector:** https://go.dev/doc/articles/race_detector — runtime-path reach, target/cgo requirements and instrumented overhead. R17 makes no measured overhead claim.
- **S26 — Native fuzzing:** https://go.dev/doc/security/fuzz/ — Go 1.18+ native support, deterministic targets, seeds versus exploration, bounded runs and minimized failure corpus; supported instrumentation is platform-dependent.
- **S27 — Diagnostics:** https://go.dev/doc/diagnostics — symptom-specific profiles, runtime traces and diagnostic interference; one appropriate measurement before optimization.
- **S28 — Asynchronous testing:** https://go.dev/blog/testing-time — Go 1.25 `testing/synctest`, fake time/quiescence, real I/O/syscall/mutex limits.

### Database and production ecosystem boundaries

- **S17 — SQLx API and implementation, 0.8.6:** https://docs.rs/sqlx/0.8.6/sqlx/struct.Transaction.html and https://docs.rs/sqlx-core/0.8.6/src/sqlx_core/transaction.rs.html#260-274 — commit/rollback consume transaction; drop starts driver rollback, generally queued for later async activity.
- **S18 — Driver cancellation contrast:** https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool#Pool.BeginTx — native pgx needs explicit finalization; fetched rendering v5.11.0. Official Go source inspected: https://github.com/golang/go/blob/go1.25.0/src/database/sql/sql.go — `DB.BeginTx` documents transaction-wide context and automatic rollback on cancellation. Public API reference: https://pkg.go.dev/database/sql#DB.BeginTx.
- **S19 — PostgreSQL serialization handling:** https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html — fetched PostgreSQL 18; `40001`, conditional treatment of other SQLSTATEs and complete-transaction replay. Version-specific URL: https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html.
- **S20 — River transactional enqueueing:** https://riverqueue.com/docs/transactional-enqueueing — commit/queue dual-write failure and same-DB atomic insertion. Product's scaling/default recommendations not adopted as measured conclusions.
- **S21 — River reliable workers:** https://riverqueue.com/docs/reliable-workers — context cooperation, at-least-once execution, external-effect limits of rollback and transactional completion. Living examples require installed-version validation.
- **S22 — Amazon Builders' Library, primary production design account:** https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/ — ambiguous response, caller-supplied identity, atomic idempotency record/effects, same ID/different intent, retention tradeoffs. Pattern applies when business contract needs it; not universal retry or exactly-once guarantee.

## 9. Decision

Ship compact routing and selected procedures after native host/Atlas seams exist; evaluate lifecycle/data correctness before adding tools or more prose. Most valuable specialist behavior: locate exact semantic boundary, choose existing mechanism that fits, and prove failure path with smallest credible observation. Expand corpus only when held-out failure exposes concrete missing capability.
