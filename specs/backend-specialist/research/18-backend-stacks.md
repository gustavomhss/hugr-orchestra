# R18 — the backend specialist polyglot backend procedures

Research date: **2026-10-03**. Primary documentation and source inspection only. **Runtime verification: NOT RUN.** Commands, controls, and acceptance outcomes below describe proposed future work; none constitute measured compatibility, test results, or performance claims.

## Decision

**The backend specialist should be one independent OpenCode/Orchestra plugin: shared backend procedures, Atlas-native context/evidence foundation, narrow version-aware overlays.** Coverage includes Python/FastAPI, TS/JS, Node/Bun, Effect, and Next server-side. These compose within one task; they do not require separate agents, runners, or toolchains.

- **Atlas shared foundation:** reuse repository/package identity, relevant code context, freshness/provenance, and evidence references through shared Atlas interfaces. The backend specialist owns backend procedure selection and interpretation. Exact Atlas API/version binding remains an integration design input; this report does not establish a shipped Atlas interface.
- **Independent plugin:** host adapter targets installed public plugin/SDK contract. Backend frameworks belong to inspected user projects, not the backend specialist's mandatory runtime dependencies. Keep host Client runtime dependencies within Schema/Protocol boundaries; avoid importing Core/Server implementation into client-side adapters. [H1, L4]
- **Optional Maestro:** may supply task intent and consume same result/evidence references. Direct backend specialist invocation uses same procedure path.
- **Optional Composer:** existing `hugr-compose` and `hugr-scaffold` definitions explicitly target FastAPI. Reuse when task requests suitable FastAPI composition; neither prerequisite nor default architecture for other backends. Source definitions establish intended tool surface, not service availability. [L3]
- **Standard execution:** existing host read/search/LSP/shell surfaces and project's own checks. The backend specialist adds semantic judgment—where trust, errors, ownership, transactions, and caching cross boundaries—not renamed shell commands.

### UX and efficiency

One task produces one compact card:

> Affected package + detected versions → boundary at risk → source-backed constraint → exact project command/cwd → expected observable outcome → evidence/status.

Auto-select overlays from package manifests, imports, entrypoints, and changed call paths. Example: Next + Effect on Node activates shared boundary/cache procedures plus relevant Next/Effect/Node details in one card. Deduplicate overlapping findings by boundary and invariant.

Show actionable finding first; expand sources, command provenance, and counterexamples on demand. Ask only for unresolved facts that change implementation: deployment runtime, transaction semantics, or authorization policy. Persist discovery through Atlas keyed to worktree, package, lock/config fingerprints, and relevant dirty-file state; invalidate stale entries. Retrieve bounded source excerpts instead of reinjecting framework manuals each turn.

Proposed outcome vocabulary: `source-supported`, `command-discovered`, `not-run`, `blocked`, `runtime-observed`. Keep these distinct. An unavailable fixture or unsupported version yields named gap and next step, not success. Routine tasks need no extra workflow ceremony.

## C0 — Resolve actual project and command surface

**Trigger:** first task in package; changed lockfile, runtime, framework configuration, deployment command, or test setup.

**Evidence:** nearest instructions; package/workspace root; declared dependency ranges; resolved lock versions; installed package metadata when present; interpreter/container/runtime selected by CI/deployment; imports and feature flags; test files/configuration; referenced script bodies. Distinguish package manager, TypeScript compiler, test runner, and server runtime. `@types/node` or a Bun lockfile does not establish production runtime. Bun normally respects a CLI's Node shebang. [N3, B1]

**Actual command discovery:** read manifests and CI/task definitions, then follow wrapper scripts to executable, cwd, arguments, environment-variable *names*, setup, fixture services, and test selection. Preserve project runner and existing flags. Record provenance as `path:line → cwd + argv + selected tests`. Do not infer a command from framework name. Script existence alone does not establish that it exercises affected boundary.

| Discovery recipe | Files/evidence to inspect | Result the backend specialist should derive |
| --- | --- | --- |
| **D-PY** | `pyproject.toml`, Python/lock pins, requirements files, `pytest.ini`, `conftest.py`, `tox.ini`, `noxfile.py`, Make/Just tasks, CI | Existing environment runner + exact pytest node IDs; configured Ruff and mypy/Pyright commands; ASGI lifespan fixture; DB setup and ASGI server entrypoint. Do not replace Poetry/tox/nox with uv by assumption. |
| **D-JS** | Package `scripts`, workspace/lockfile, runtime pins, `tsconfig`, ESLint/Oxlint/Biome config, runner config, CI | Existing typecheck/lint/test commands, supported file/name filters, preload hooks, build output, actual interpreter and module conditions. Plain JS gets runtime checks even without TS checking. |
| **D-LIVE** | Server startup/stop code, deployment entrypoint, test server fixture, container/services configuration, shutdown deadline | Existing subprocess/socket integration command; actual process under test; test DB/cache instance; readiness and teardown mechanism. In-process handler invocation cannot establish socket backpressure or process shutdown. |
| **D-NEXT** | D-JS plus installed Next/React versions, App/Pages Router, `next.config`, route runtime exports, cache flags, Playwright config/CI | Actual build/start/E2E commands, built-server fixture and isolated authenticated contexts. Next 16 removed `next lint`; `next build` no longer runs lint. Next 16.2+ docs advertise version-bundled docs under resolved `next/dist/docs/`; inspect if present. [X4] |

**Concrete discovery examples from this checkout, read—not executed:**

| Source | Discovered invocation | Reach established by inspection |
| --- | --- | --- |
| `packages/core/package.json:8–14` | cwd `packages/core`; `bun typecheck` | Resolves to project `tsgo --noEmit` script. |
| `packages/opencode/package.json:8–16` | cwd `packages/opencode`; `bun run test test/plugin/hugr-composer.test.ts` | Existing test script uses Bun, its timeout/failure-output flags, and named existing test file. Example of command discovery for optional adapter work, not universal backend verification. |
| Same manifest, line 11 | cwd `packages/opencode`; `bun run test:httpapi` | Script declares coverage/auth/effect exercise modes and missing/skip flags. Script body and selected surface need inspection before claiming behavioral reach. |
| Root `package.json:7,23,34–36,64–66`; installed Effect package metadata | Bun package-manager pin `1.3.14`; Effect `4.0.0-beta.83`; Drizzle `1.0.0-rc.2`; root test command explicitly exits with failure | Demonstrates why package-local instructions and exact prerelease versions matter. Installed Effect metadata also says beta.83. These are file facts, not observed executable versions. |

For a future Python/Next target, actual commands remain unresolved until its files supply evidence. Discovery recipes above are not assertions that this checkout contains those applications.

**Main failure boundary:** advice/check runs against wrong package, runtime, version, or empty selection.

**Held-out negative control:** fixture's nested package pins Effect beta.83 while root/reference docs show beta.98; script launched through Bun actually invokes Node. The backend specialist must expose both identities and choose package-matched evidence. Healthy control: unambiguous package resolves executable/cwd without unnecessary question. Missing script, failed collection, skipped cases, or wrong runtime must remain distinguishable from successful verification.

## Cross-cutting core

These procedures describe shared invariants. Overlays below supply exact framework semantics, without repeating whole workflows.

### C1 — Validate and authorize at real boundary

- **Trigger:** HTTP/Action/RPC entrypoint, webhook/job input, configuration, external JSON, or output DTO changes.
- **Evidence/action:** trace raw input → decoder → business validation → authenticated principal → resource/tenant authorization → side effect → public output. Record size/content-type/unknown-field/coercion policy and output allowlist. Static types and assertions do not validate runtime data. Reuse project's schema library; validate outside HTTP too when data enters through another channel. [P2, P5, J1, X1–X2]
- **Command discovery:** C0 D-PY/D-JS/D-NEXT; follow affected entrypoint to existing contract/auth tests and schema-export script. Derive exact test selection; use schema fuzzing only when actual schema and isolated target are available.
- **Main failure boundary:** untrusted value acquires authority or reaches side effect; private fields cross response boundary.
- **Held-out negative control:** schema-valid request names another tenant's object, plus variant injects nested privileged field. Expect denied operation and unchanged protected state; legitimate owner request succeeds. Malformed nested data must fail before mutation. Check returned fields, not status alone.

### C2 — Preserve failures and distinguish acceptance from completion

- **Trigger:** new `catch`/`except`, error middleware, fallback, retry, background dispatch, or success response.
- **Evidence/action:** classify expected domain error, unexpected defect, cancellation, and transport/control-flow exception. Locate reporting owner and whether response already began. Empty query result differs from DB outage. Fallback needs explicit domain meaning; logging then returning success is not error handling. Retry only bounded, eligible failures with known idempotency/commit semantics. Durable job admission may validly acknowledge acceptance; detached Promise creation is not durable admission. [P1, P3, J2–J3, E1, X3]
- **Command discovery:** D-PY/D-JS; follow error types/catch sites to actual handler and failure-path tests, including worker outcome storage. Preserve test runner's unhandled-rejection behavior.
- **Main failure boundary:** failed or interrupted work becomes apparent success; unknown commit outcome gets blindly replayed.
- **Held-out negative control:** dependency outage enters same catch as legitimate “no rows”; outage must remain failure while genuine empty result keeps documented successful shape. Mutation after acknowledged commit must not be retried merely because later response delivery failed.

### C3 — Own resources and transaction as separate lifetimes

- **Trigger:** ORM/session/pool/client acquisition, multi-write operation, transaction callback, background job, or streaming DB access.
- **Evidence/action:** identify application pool, request/session, transaction, stream, and job owners separately. Trace begin/commit/rollback/close, connection/transaction handle passed to helpers, driver sync/async contract, isolation and uniqueness constraints. Commit required writes before reporting completion; cleanup closes resources. Keep unrelated network calls outside transaction. External effects cannot be rolled back by SQL: use existing idempotency/outbox mechanism only where delivery requirement warrants it. [P1, P4, D1–D3, B3]
- **Command discovery:** D-PY/D-JS plus actual DB fixture/migration setup. Select atomicity, concurrency, and teardown tests against production-relevant dialect/driver. A substitute in-memory DB answers a narrower question; record that reach.
- **Main failure boundary:** handle escapes owner, helper writes outside transaction, partial commit, or success precedes commit failure.
- **Held-out negative control:** second write fails after helper's first write; inspect durable state from independent connection. Both must roll back for atomic operation; healthy transaction commits both. Variant uses root DB client inside transaction callback, exposing escaped write.

### C4 — Make scheduling, cancellation, and capacity explicit

- **Trigger:** async conversion, task/Promise/fiber creation, fan-out, CPU-heavy work, timeout, streaming, or shutdown change.
- **Evidence/action:** follow calls to actual I/O/CPU implementation; identify event-loop work, worker/thread capacity, owner, deadline, cancellation propagation and cleanup. Async syntax does not offload synchronous work. Bound concurrency by known resource limits. Cancellation of waiter need not stop underlying thread, request, or DB work; verify client's contract before promising that. [P3, N1–N3, B2–B3, E1–E2]
- **Command discovery:** D-LIVE and corresponding package runner. Discover readiness/barrier fixtures and live-vs-virtual-clock setup; use external observer for event-loop stalls. Set budgets from service requirements, not arbitrary universal milliseconds.
- **Main failure boundary:** work never awaited, event loop stalls, queue grows without bound, or orphan work survives request cancellation.
- **Held-out negative control:** nominally async handler calls blocking helper while independent request arrives; real subprocess probe must distinguish healthy concurrency from stalled service. Cancellation variant waits for explicit “resource acquired”, aborts request, then observes actual owner/cleanup and upstream cancellation where supported.

### C5 — Treat cache identity as authorization-sensitive data

- **Trigger:** memoization, shared cache, fetch cache, prerendering, user/tenant switch, or invalidation changes.
- **Evidence/action:** name cache plane and lifetime: request, process, shared store, rendered route/CDN, browser. Trace key/arguments/closures and trusted principal/tenant through lookup. Include dimensions that change permissible result; authorize each access, including hits. Decide TTL/invalidation/revocation semantics. Keep credentials out of keys. Reuse public immutable data when valid; do not disable every cache indiscriminately. [R1, X1, X5–X8]
- **Command discovery:** D-JS/D-PY or D-NEXT; derive multi-principal tests using same actual cache instance and production-relevant execution mode. Discover reset/warmup fixtures and post-mutation assertions.
- **Main failure boundary:** cached result crosses principal/tenant boundary or bypasses fresh authorization.
- **Held-out negative control:** tenant A warms object ID `7`; tenant B has different object `7`, then A loses permission before TTL expires. B must receive only B-authorized representation; revoked A must be denied. Repeat within one tenant for users with different field visibility. Healthy repeated authorized request still returns correct data. Fixture must actually hit intended cache, not silently bypass it.

## Narrow stack overlays

### PY — Python/FastAPI lifecycle and SQLAlchemy mapping

**Trigger/core:** changed Python coroutine, FastAPI dependency/response/background task, or SQLAlchemy use; specializes C1–C4.

**Evidence and actions:**

- FastAPI runs framework-invoked plain `def` routes/dependencies in external threadpool. Ordinary synchronous helper called from `async def` runs directly. Select async driver or established offload boundary; do not infer non-blocking behavior from function name. Python 3.13 docs: `to_thread` introduced 3.9; `TaskGroup`/`asyncio.timeout` introduced 3.11. Preserve cancellation after cleanup. Threads are not general CPU parallelism on conventional GIL builds. [P3, P6]
- Record installed FastAPI version before `yield` edits: **0.106.0–<0.118.0** cleanup before response; **0.118.0+** cleanup after response restored; **0.121.0+** offers `Depends(scope="function")` before response versus default request scope after response. Function scope is wrong if stream still needs resource. Keep transaction success/error decision in operation, not post-response finalizer. [P1]
- **0.110.0+** caught dependency exceptions are not automatically forwarded: re-raise or deliberately translate. Background task owns its resources; pass IDs rather than request-owned ORM/session objects. App pool/client belongs in lifespan; providing lifespan supersedes old startup/shutdown handlers. [P1, P7]
- Pydantic **2.12** defaults to coercion. Strict Python and strict JSON validation can differ; choose coercion intentionally per transport. FastAPI response models validate/filter output, but returned `Response`/`JSONResponse` bypass that processing. [P2, P5]
- SQLAlchemy **2.0**: separate `AsyncSession` per concurrent task; session closure distinct from commit. After failed flush, explicitly roll back before reusing session, or close/discard it. If work must share one atomic transaction, sequence its operations rather than splitting into independently committing sessions. Load needed relationships explicitly before DTO serialization; `AsyncAttrs.awaitable_attrs` requires 2.0.13+. [P4, D1]

**Command discovery:** D-PY; inspect actual ASGI fixture, AnyIO backend, database driver and marked test node IDs. HTTPX `AsyncClient` does not itself trigger ASGI lifespan; use existing lifespan-aware fixture. Socket/cancellation behavior needs D-LIVE, not only ASGI in-process calls. [P8]

**Main failure boundary:** lifecycle mismatch causes late commit failure, premature/overlong resource retention, hidden exception, or event-loop blocking.

**Held-out negative control:** streaming endpoint on identified FastAPI version depends on DB cursor; deliberately close owner before stream consumption, then disconnect client midstream in corrected variant. Assert resource usable for intended stream lifetime and released after termination. Separate commit-failure case must not already have emitted success. Healthy response-model test must still exclude nested private field when handler's return path changes.

### JS — TS/JS runtime boundaries and Promise ownership

**Trigger/core:** TS assertion/JSDoc annotation, JSON parsing, callback/Promise middleware, async array work, or module/entrypoint change; specializes C1–C2/C4.

**Evidence and actions:** inspect actual parser invocation rather than inferred/static shape; `as T`, non-null assertions, and declared response types supply no runtime check. Plain JS needs same decoder/business boundaries. Find returned/awaited Promise chain and final error owner; `void promise` does not handle rejection, and `.catch(() => undefined)` can erase failure even when lint accepts syntax. [J1–J2]

Inspect installed framework's error contract. Express **5.x** forwards rejection from *returned* handler Promises; timer/callback errors and unreturned work still need explicit propagation. Do not transfer that guarantee to another framework/major. Match import conditions, ESM/CJS and emitted artifact to production runtime: Node **24.0.0** native TS strips types, performs no typecheck, ignores `tsconfig` paths, and does not support `.tsx`. These limits describe that pinned release. [J3, N3]

**Command discovery:** D-JS; locate configured typecheck and typed-lint commands, handler/error tests, build and deployed artifact entrypoint. Check enabled rules/options before attributing coverage to lint. Use same JS suite for untyped packages rather than requiring TS migration.

**Main failure boundary:** type-correct code trusts invalid bytes; async rejection escapes framework; dev loader hides deployment import error.

**Held-out negative control:** valid JSON violates nested schema while forged static cast compiles; request must be rejected before side effects. Promise variant returns success after launching unreturned failing operation; test must expose premature acknowledgement. Healthy awaited operation completes and reports intended result.

### NODE — Streams, backpressure, and bounded shutdown

**Trigger/core:** Node HTTP upload/download/SSE/proxy, stream adapter, AbortSignal, or process termination; specializes C2–C4.

**Evidence and actions:** identify Node versus Web Stream API, each buffering stage, sink readiness, disconnect/error paths and abort propagation. Prefer existing `stream.pipeline`/`node:stream/promises` composition where appropriate; hand-written writes must stop after `write()` returns `false`, resume on `drain`, and also handle close/error/abort while waiting. `highWaterMark` is threshold, not hard memory cap. Async generator stages must observe signal. Pipeline can destroy HTTP socket on failure, preventing a later JSON error response: decide error handling before headers begin. [N1]

For shutdown, trace readiness removal → stop accepting → drain bounded in-flight work → abort/close remaining owned work → release pools/log sinks. Application deadline and SSE/WebSocket policy matter. Node **24.0.0** HTTP docs record `server.close()` reaping idle connections since **19.0.0**; `closeAllConnections()` added **18.2.0**, is forceful, and excludes upgraded sockets. Call force-close after stopping admission to avoid new-connection race; handle upgraded protocols explicitly. [N2]

**Command discovery:** D-JS + D-LIVE; inspect actual server bootstrap/signal handler and process/socket tests. Derive command invoking installed Node version and built entrypoint. Fake timers or in-memory Response objects cannot substitute for slow-peer/disconnect behavior.

**Main failure boundary:** ignored pressure accumulates buffers; disconnect leaves producer alive; shutdown drops acknowledged writes or waits forever.

**Held-out negative control:** slow client stops reading while large producer continues, then disconnects during drain wait. Expect bounded queued data under fixture's stated budget, producer termination and owned-resource release. Send termination during separate in-flight transaction plus SSE connection: ordinary transaction completes or explicitly aborts, SSE follows deadline policy, and process exits. Healthy fast consumer still receives complete ordered payload. All measurements remain proposed.

### BUN — Compatibility evidence and native lifecycle

**Trigger/core:** Node→Bun move, dual-runtime claim, `bun:*`, native package/worker/AsyncLocalStorage use, or Bun server/DB change; specializes C0/C3–C4.

**Evidence and actions:** record exact Bun version, OS/architecture, entrypoint interpreter, relevant API and driver—not blanket “Node-compatible”. Moving compatibility page currently targets Node **26**, but does not establish Bun **1.3.14** compatibility. It lists API-specific differences, including HTTP server behavior and AsyncLocalStorage propagation across worker/message events; treat these as candidates to check for version actually used. [B1]

Native `Bun.serve` uses `await server.stop()` for graceful stop and `stop(true)` for forceful termination. Inspect streaming idle timeout and per-request `server.timeout`, cancellation, WebSockets and shutdown deadline for installed release. Bun's Node shim and native server are distinct paths. [B2]

**High-value source trap:** Bun **1.3.14** `bun:sqlite` `wrapTransaction` calls callback, runs commit/release, then returns callback result. An async callback returns Promise before later awaits finish. Therefore synchronous transaction wrapper does not supply async transaction semantics. Source inspection supports this conclusion; no execution performed. Keep transaction callback synchronous or use actual async-capable driver/transaction abstraction. Do not apply generic async Drizzle/Postgres example to synchronous SQLite adapter. [B3–B4, D3]

**Command discovery:** D-JS + D-LIVE; follow script and shebang, inspect `bunfig.toml`, runtime pins, native package constraints and CI support matrix. Select same focused semantic tests on each *claimed* runtime. Bun package-manager use alone does not warrant dual-runtime suite.

**Main failure boundary:** API name/type presence mistaken for equivalent behavior; synchronous transaction commits before promised work completes.

**Held-out negative control:** on pinned SQLite implementation, insert row inside async transaction callback, cross `await`, then throw. Independent connection must expose partial commit in broken implementation; corrected atomic operation must roll back intended unit. Also inspect a Bun-launched Node-shebang CLI as runtime-identity control. Normal synchronous transaction must commit successfully.

### EFFECT — Exact version, scope, error channel, interruption

**Trigger/core:** Effect imports, Schema decoding, Layer/runtime provisioning, resource acquisition, fiber creation, Promise bridge or recovery; specializes C0–C4.

**Evidence and actions:** resolve exact package and companion platform versions. Current website separates v3/v4; checkout pins **4.0.0-beta.83**, installed metadata matches, while pre-existing effect-smol reference is **beta.98**, commit `3a1128c7684e04d34d9f541f77adaac38a513056`. These are distinct evidence targets, not interchangeable “latest Effect”. [E1–E3, L1]

For inspected beta.83, exported APIs include `Effect.catch`, `catchTag`, `catchCause`, `forkChild`, `forkIn`, `forkScoped`, and `forkDetach`. Reuse project's Schema decoder for untrusted values; actual API signature must match installed package. Separate typed failures, defects and interruption; broad full-Cause recovery should not relabel cancellation/defects as business success. `tryPromise` maps expected rejection; `promise` routes rejection to defect. Pass supplied abort signal through to cooperating external API. Fiber interruption alone does not establish physical cancellation of external work. [E1–E2]

Map lifetime explicitly: application Layer/runtime, request scope, resource use, stream consumption, child fiber. `acquireRelease` registers release after successful acquisition; default acquisition is uninterruptible. `scoped` closes on completion, including failure/interruption. Returning lazy stream or live handle from already-completed scope can end ownership too soon. `forkIn`/`forkScoped` bind fiber to scope; `forkDetach` uses global scope. Preserve deliberate app-owned jobs, but expose their stop/error owner. Reuse application's runtime/Layer memoization boundary rather than rebuilding pooled services per call. [E1]

**Command discovery:** D-JS; inspect installed `.d.ts`/source and existing Effect test helper before choosing runner. This checkout has `testEffect` with scoped execution and live/instance variants (`packages/opencode/test/lib/effect.ts`); package typecheck is `bun typecheck`. Choose live tests for sockets/processes and readiness barriers for interruption, not sleeps that assume acquisition already happened. [L2]

**Main failure boundary:** mixed-version API advice; live resource escapes closed scope; detached work loses parent ownership; cancellation/failure erased.

**Held-out negative control:** after explicit acquisition signal, close request scope while child awaits external I/O. Correct case releases resource once, terminates child, and propagates supported upstream abort; broken detached child or missing signal forwarding must be distinguishable. Separate lazy-stream case consumes only after creator returns, exposing premature finalization. Healthy scope keeps resource available through actual use.

### NEXT — Server Action authority and cache/version semantics

**Trigger/core:** Server Action/Route Handler, DAL, server/client DTO, auth redirect, cache directive or revalidation; specializes C1–C2/C5.

**Evidence and actions:** identify Next/React version, router, runtime, deployment adapter and `cacheComponents`. Treat reachable Actions as public mutation endpoints: derive session server-side, validate `FormData`/arguments, authorize specific resource/tenant immediately before mutation in action or shared DAL. Page/layout/UI checks, action IDs, encrypted closures and same-origin protections do not replace authorization. `server-only` protects import boundary, not business permission. Return minimal DTO. `redirect()` throws control-flow error; keep outside broad error-catching block. [X1–X3]

Apply only matching cache model:

- **React `cache`:** Server Component request memoization; invalidated per server request. Not persistent tenant cache. [R1]
- **Next 14 `unstable_cache` onward:** cross-request/deployment Data Cache; arguments/function participate in key; external captured values need suitable key parts. Tags invalidate and **do not provide key isolation**. Read cookies/headers outside cached function. [X5]
- **Next 15:** default `fetch` and GET Route Handler caching changed to uncached; request APIs became async with temporary sync compatibility. This does not mean every cache plane is disabled. [X4]
- **Next 16:** sync request API compatibility removed; Cache Components is opt-in, not a rename-only migration. Plain `use cache` cannot read request cookies/headers; derive authorized identity outside and pass necessary non-secret identity dimensions. Current **16.3.8** docs describe `use cache: private` as request-time processing without server cache across production requests, with browser-router caching. Check installed minor/flags before using. [X4, X6–X7]
- **Next 16 invalidation:** `updateTag` is Server-Action-only, for immediate expiry/read-your-writes; `revalidateTag(tag, 'max')` is stale-while-revalidate. Choose based on requirement and call context; invalidate after committed mutation. [X8]

**Command discovery:** D-NEXT. Inspect existing authenticated browser/API fixtures and exact production build/start commands; unit-importing Action does not exercise compiler-generated HTTP entrypoint. Reuse current-build action invocation captured by fixture rather than hard-coding action IDs or private wire format. Serverless/custom adapters may require their own existing preview fixture instead of generic `next start`.

**Main failure boundary:** direct Action bypasses UI authorization; shared cache leaks user data; version defaults/invalidation return wrong representation.

**Held-out negative control:** obtain valid current-build action invocation, preserve valid Origin/Host and payload shape, then invoke directly as another authenticated tenant with foreign object ID. Expect denied mutation and unchanged object—not merely rejection from invalid action ID/CSRF. Healthy owner invocation succeeds. Cache variant warms same route as A then B against same built server; inspect data/RSC payload, fresh authorization after revocation, and post-mutation read-your-writes.

## Useful standard tools; no tool inflation

Tools support procedures above; they are not extra workflows. Discover installed version/configuration and actual project command via C0 before use.

| Tool | Useful contribution | Reach/selection limit |
| --- | --- | --- |
| Host read/search + existing LSP/compiler | Locate boundary, callers, exact APIs and command provenance | Search match is lead, not proof of behavior; confirm actual call path. |
| Existing Ruff + mypy/Pyright; TS/tsgo + project's linter | Static feedback on selected package | Ruff `ASYNC251` exists since 0.5.0 and detects `time.sleep` in async functions, not arbitrary blocking helpers. TS checks do not validate input. [T1, J1] |
| Configured typescript-eslint typed Promise rules | Identify missing ownership in TS Promise expressions/callbacks | Requires type information; `no-floating-promises` default `ignoreVoid: true` permits `void` without handling rejection. Inspect actual config. [J2] |
| Existing pytest/AnyIO/HTTPX or JS runner | Real boundary, transaction and error-path tests | Preserve lifespan/backend/driver and package fixtures. Use existing runner; do not install competing suite. [P8] |
| Existing Playwright browser + `APIRequestContext` | Direct mutation requests, independent cookie contexts, UI/server postconditions | Browser-associated request shares cookies; isolated request context required for independent principals. Production cache tests need proper built/preview server. [T2] |
| Schemathesis, selectively | Generates malformed/edge requests from actual OpenAPI/GraphQL and checks response contracts; useful across Python and JS services | Optional when schema-driven input coverage adds value. Discover pinned CLI or pytest integration, schema path, selected operations and isolated base URL. Use existing installation; copied `uvx` demo is not project discovery. Cannot infer application-specific tenant policy, transaction atomicity or shutdown correctness from schema alone. [T3] |
| Existing DB migration tool; native HTTP client such as curl | Prepare project test database; inspect headers/chunking and reproduce specific request | Use project's dialect/fixture commands. Manual HTTP observation does not replace assertions about durable state or cleanup. |

Reject `backend-shell`, `backend-run-tests`, `backend-curl`, six language agents, blanket framework migrations, always-on fuzzing/load tests, and mandatory scaffolding. They add surface without new decision quality. A new semantic tool is justified only if it resolves versioned evidence or a real lifecycle boundary that existing Atlas/host primitives cannot express.

## Held-out evaluation contract — proposed, unexecuted

Each C/overlay card supplies candidate negative scenario. **These descriptions are not evidence that a held-out suite already exists.** Future evaluator should instantiate unseen route names, principals, payload shapes, package layouts and scheduling barriers separately from coding prompt; freeze expected external outcomes before evaluating implementation.

Pair every negative scenario with healthy control. For behavioral checks, apply targeted defect—remove decoder/auth check, return fallback on outage, escape transaction handle, ignore pressure, detach child, omit tenant key—and confirm check detects violation for intended reason. An implementation that rejects all requests or never starts cannot satisfy healthy control. Distinguish setup failure, timeout, skipped selection and unsupported capability from negative-case success.

Use actual decoder, driver, transport/cache and resource owner where they carry invariant. Test-only fake error values can support narrow domain mapping, but do not establish underlying runtime conformance. Synchronize acquisition/stream readiness explicitly; choose new failure interleavings rather than merely repeating implementation's happy path. Escalate from focused static/contract checks to real DB/socket/built-server fixtures only when relevant boundary requires them.

Prioritize C1/C2/C3 for ordinary mutations; activate C5 for caching/auth changes and C4 for scheduling/streaming/lifecycle. Keep all requested stacks addressable through these same procedures from product baseline. Efficiency comes from selective evidence and test scope, not FastAPI-only coverage.

## Primary evidence ledger

All URLs below consulted **2026-10-03**, except source URLs marked as corresponding public location for locally inspected published source. Page dates below are publisher metadata, not runtime observations. Moving guides constrain advice only after comparison with target project's exact version. Vendor benchmark/test-pass claims were not adopted.

| ID | Primary source | Version/date limit and supported fact |
| --- | --- | --- |
| P1 | [FastAPI advanced dependencies](https://raw.githubusercontent.com/fastapi/fastapi/master/docs/en/docs/advanced/advanced-dependencies.md); [yield dependencies](https://raw.githubusercontent.com/fastapi/fastapi/master/docs/en/docs/tutorial/dependencies/dependencies-with-yield.md) | Moving official docs; explicitly identify 0.106.0, 0.110.0, 0.118.0, 0.121.0 behavior changes. Background tasks own resources; swallowed dependency exceptions require deliberate handling. |
| P2 | [Pydantic strict mode, 2.12](https://docs.pydantic.dev/2.12/concepts/strict_mode/) | Versioned 2.12 page redirects to publisher's newer documentation host. Coercion default; strict JSON/Python differences. Does not establish v1 behavior. |
| P3 | [CPython asyncio-task source, 3.13 branch](https://raw.githubusercontent.com/python/cpython/3.13/Doc/library/asyncio-task.rst) | Python 3.13 documentation branch; version-added notes for `to_thread`, TaskGroup/timeouts; cleanup and cancellation; `gather` differs from TaskGroup on sibling failure. |
| P4 | [SQLAlchemy asyncio, 2.0](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#using-asyncsession-with-concurrent-tasks) | Retrieved page identifies **2.0.54**, release **2026-09-15**. Per-task AsyncSession, explicit loading, async engine disposal; AsyncAttrs since 2.0.13. Not blanket 2.1/1.4 prescription. |
| P5 | [FastAPI response model](https://raw.githubusercontent.com/fastapi/fastapi/master/docs/en/docs/tutorial/response-model.md); [direct Response](https://raw.githubusercontent.com/fastapi/fastapi/master/docs/en/docs/advanced/response-directly.md) | Moving official docs; output filtering/validation versus direct Response bypass. |
| P6 | [FastAPI async technical details](https://fastapi.tiangolo.com/async/#very-technical-details) | Moving official guide; framework-invoked sync route/dependency offload does not apply to ordinary direct helper calls. |
| P7 | [FastAPI lifespan](https://raw.githubusercontent.com/fastapi/fastapi/master/docs/en/docs/advanced/events.md) | Moving official docs; app startup/shutdown ownership and lifespan versus deprecated event handlers. |
| P8 | [FastAPI async tests](https://raw.githubusercontent.com/fastapi/fastapi/master/docs/en/docs/advanced/async-tests.md) | Moving official docs; AnyIO/HTTPX patterns and explicit warning that AsyncClient does not trigger lifespan. |
| D1 | [SQLAlchemy Session Basics source, 2.0.44](https://raw.githubusercontent.com/sqlalchemy/sqlalchemy/rel_2_0_44/doc/build/orm/session_basics.rst) | Pinned 2.0.44 source; commit/rollback block separate from close, failed-flush recovery, session per thread/task. Source specimen distinct from P4's moving 2.0 patch. |
| D2 | [Prisma v6 transactions](https://www.prisma.io/docs/v6/orm/prisma-client/queries/transactions); [current transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) | v6 URL resolves to versioned v6 guide: `$transaction`, `tx`, rollback, short interactive transactions, single connection serializes queries. Current URL redirected to **ORM 8** `db.transaction` guide with different APIs/options. Concrete reason not to copy “latest Prisma” into older project. |
| D3 | [Drizzle transactions](https://orm.drizzle.team/docs/transactions) | Moving dialect-aware guide; callback `tx`, rollback/savepoints and dialect-specific options. It does not prove every adapter supports async callbacks. |
| J1 | [TypeScript Handbook: assertions](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions) | Moving language docs; assertions removed at compile time, no runtime checking. Applies to meaning of assertions, not every compiler option across releases. |
| J2 | [typescript-eslint no-floating-promises](https://typescript-eslint.io/rules/no-floating-promises/) | Retrieved site labels **v8.71.0**. Type-aware rule; default ignores `void`; references separate `no-misused-promises` responsibility. |
| J3 | [Express error handling](https://expressjs.com/en/guide/error-handling.html) | Resolved **5.x** guide. Returned rejection forwarded; unreturned Promise/callback errors require handling; headers-sent error boundary. |
| N1 | [Node stream API, v24.0.0](https://nodejs.org/download/release/v24.0.0/docs/api/stream.html) | Pinned release; pressure threshold, write/drain, pipeline AbortSignal, generator cancellation, socket-destruction caveat. Promise stream helpers introduced v15.0.0. |
| N2 | [Node HTTP source docs, v24.0.0](https://raw.githubusercontent.com/nodejs/node/v24.0.0/doc/api/http.md) | Pinned release records idle-close change v19.0.0 and force/idle-close APIs v18.2.0. Upgraded sockets excluded from `closeAllConnections`. |
| N3 | [Node TS source docs, v24.0.0](https://raw.githubusercontent.com/nodejs/node/v24.0.0/doc/api/typescript.md); [Node blocking guide source](https://raw.githubusercontent.com/nodejs/learn/main/pages/asynchronous-work/overview-of-blocking-vs-non-blocking.md) | Type stripping/loader limits pinned to v24.0.0; blocking guide moving. No inference that these describe every later Node release. |
| B1 | [Bun Node compatibility](https://bun.sh/docs/runtime/nodejs-compat); [Bun runtime/script execution](https://bun.com/docs/runtime) | Moving docs; compatibility page explicitly targets Node v26 at retrieval. Script launcher respects Node shebang unless overridden. Neither certifies installed binary. |
| B2 | [Bun server](https://bun.com/docs/runtime/http/server) | Moving native-server guide; graceful/forceful stop, idle timeout, request controls. `routes` example explicitly requires Bun 1.2.3+. Exact installed release still governs. |
| B3 | [Bun SQLite](https://bun.com/docs/runtime/sqlite) | Moving docs; synchronous API, callback-return commit, prepared-statement cache distinct from result cache. |
| B4 | [Bun SQLite implementation, bun-v1.3.14](https://raw.githubusercontent.com/oven-sh/bun/bun-v1.3.14/src/js/bun/sqlite.ts) | Pinned `wrapTransaction`: `const result = fn.$apply(this, args); after.run(); return result;`. This ordering establishes source-level async-callback hazard. |
| E1 | [Effect beta.83 package](https://raw.githubusercontent.com/Effect-TS/effect-smol/effect%404.0.0-beta.83/packages/effect/package.json); [corresponding Effect source](https://github.com/Effect-TS/effect-smol/blob/effect%404.0.0-beta.83/packages/effect/src/Effect.ts); [internal source](https://github.com/Effect-TS/effect-smol/blob/effect%404.0.0-beta.83/packages/effect/src/internal/effect.ts) | Package tag fetched; published source inspected locally under `packages/opencode/node_modules/effect/src`. Inspected scope/fork/recovery APIs and internal Promise rejection/AbortController finalizer paths. |
| E2 | [Effect source snapshot](https://github.com/Effect-TS/effect-smol/blob/3a1128c7684e04d34d9f541f77adaac38a513056/packages/effect/src/Effect.ts) | Public location corresponds to pre-existing local reference inspected at this commit, package beta.98. JSDoc explicitly says underlying Promise operation stops only if it observes signal. Not substituted for beta.83 API matching. |
| E3 | [Effect v3 scope](https://effect.website/docs/resource-management/scope/); [v4 docs](https://effect.website/docs/v4); [v4 concurrency](https://effect.website/docs/v4/concurrency/basic-concurrency) | Old unversioned scope URL resolves into v3 section; v4 site separately available. Moving conceptual docs; pinned package source controls exact API names and Cause representation. |
| R1 | [React cache](https://react.dev/reference/react/cache) | Current Server Component reference; per-server-request invalidation and cached errors. Check installed React integration; do not generalize to arbitrary process memoization. |
| X1 | [Next authentication](https://nextjs.org/docs/app/guides/authentication) | Retrieved **16.3.8**, updated **2026-08-25**. Action/Route Handler authorization and DAL; layout/UI restrictions insufficient. |
| X2 | [Next data security](https://nextjs.org/docs/app/guides/data-security) | **16.3.8**, updated **2026-08-25**. Direct Action POST, input/resource auth, DTOs, server-only, origin and closure limits. |
| X3 | [Next redirect](https://nextjs.org/docs/app/api-reference/functions/redirect) | **16.3.8**, updated **2026-07-28**. Throws `NEXT_REDIRECT`; keep outside broad catch. |
| X4 | [Next 15 upgrade](https://nextjs.org/docs/app/guides/upgrading/version-15); [Next 16 upgrade](https://nextjs.org/docs/app/guides/upgrading/version-16) | Pages labeled **16.3.8**, updated **2026-08-25**, documenting historical 14→15 and 15→16 changes. Cache defaults, async request APIs, opt-in Cache Components, lint removal, bundled docs 16.2+. |
| X5 | [Next unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) | **16.3.8**, updated **2026-07-21**; API introduced v14. Cross-request cache, key parts versus invalidation tags; v16 replacement guidance depends on feature adoption. |
| X6 | [Next auth with Cache Components](https://nextjs.org/docs/app/guides/authentication-with-cache-components) | **16.3.8**, updated **2026-08-25**; explicit flag prerequisite, identity-aware caching and action reauthorization. |
| X7 | [Next use cache: private](https://nextjs.org/docs/app/api-reference/directives/use-cache-private) | **16.3.8**, updated **2026-09-07**; version table says v16.0.0 with Cache Components. Request-time execution and browser caching; no cross-production-request server cache. Do not transplant into older/canary project by name alone. |
| X8 | [Next updateTag](https://nextjs.org/docs/app/api-reference/functions/updateTag) | **16.3.8**, updated **2026-08-25**; Action-only immediate expiry versus `revalidateTag(..., 'max')` SWR. v16 introduction also documented in X4. |
| T1 | [Ruff ASYNC251](https://docs.astral.sh/ruff/rules/blocking-sleep-in-async-function/) | Rule added **0.5.0**; specific `time.sleep` detection, not complete async analysis. |
| T2 | [Playwright API testing](https://playwright.dev/docs/api-testing) | Moving official guide; direct HTTP requests, shared versus isolated cookie contexts, server postconditions. Pin project's installed Playwright version. |
| T3 | [Schemathesis docs](https://schemathesis.readthedocs.io/en/stable/); [quick start](https://schemathesis.readthedocs.io/en/stable/quick-start/) | Moving stable docs; schema-generated requests, response checks, CLI/pytest integration. Discover installed CLI flags rather than importing examples as execution instructions. |
| H1 | [OpenCode plugins](https://opencode.ai/docs/plugins/) | Page updated **2026-10-03**; JS/TS plugin context/hooks/tool surface. Local installed SDK declarations take precedence for Orchestra compatibility. |

### Local primary evidence

- **L1:** `package.json:7,34–36,64–66`; `packages/core/package.json:8–14`; `packages/opencode/package.json:8–16`; `packages/opencode/node_modules/effect/package.json:1–12`. Exact pins and script definitions read from working tree on research date.
- **L2:** `packages/opencode/test/lib/effect.ts:34–85` and adjacent test instructions: scoped execution, live versus test layers, memoized shared runtime path. Source inspection only.
- **L3:** `packages/opencode/src/plugin/hugr-composer/tools.ts:12–99`: explicit FastAPI descriptions; delegates `fastapi_meta_compose` / `fastapi_meta_scaffold`; dry-run/write authorization and abort forwarding. Existing optional reuse boundary.
- **L4:** `packages/plugin/src/index.ts:56–80`: local `PluginInput`, plugin options/hooks return and module shape. Basis for matching host adapter to installed public contract rather than assuming website examples exactly match fork.

### Evidence limits that affect recommendations

Primary docs still contain narrowly illustrative examples. Bun server example annotates raw `req.json()` without runtime validation; Next examples sometimes catch data errors into `null`. Those snippets demonstrate local API usage, not complete C1/C2 policy. Node learning guide's historical default-buffer discussion is less precise than pinned stream API's “threshold, not limit”; N1 governs recommendation. Moving Prisma transactions URL now serves ORM 8, demonstrating why URL familiarity is not version evidence.

This research establishes source-backed constraints and proposed evaluation design. Project-specific authorization rules, Atlas binding, deployed runtime behavior, cancellation conformance, cache isolation, performance and test outcomes still require their corresponding project evidence or later execution.
