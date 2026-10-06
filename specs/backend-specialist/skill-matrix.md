# Backend skill variants: concrete differences and composition examples

Status: source-researched variant design, 2026-10-04. This matrix supplements [skill-catalog.md](skill-catalog.md). Rows are reference profiles, not separate installed skills or a tested dependency matrix. Source reports contain exact pins; use the target component's versions, not the newest package by default.

## Language/runtime, framework and library differences

| Supplied target | Instructions that materially change | Wrong transfer to prevent | Source |
| --- | --- | --- | --- |
| Python / FastAPI / Pydantic 2 / SQLAlchemy async | Await DB work on task-owned session; project validated data; load response fields before resources close; match dependency scope to response/body lifetime | Nullable annotation is not automatically an optional field; a dependency-lifetime recipe from another FastAPI version can close DB access before streaming | [R48](research/48-python-variants.md) |
| Python / Django / DRF | Use actual DRF validation/permission hooks and Django transaction boundary; at inspected 5.2/3.16 pins, bridge the complete synchronous atomic unit from async callers | Copying SQLAlchemy async-session code; assuming object permissions filter list results or authorize creation | [R48](research/48-python-variants.md) |
| Python / Flask WSGI | Preserve request context for dependent streams; let iterator lifetime own cleanup | Treating unfinished spawned async tasks as durable work after the request's loop ends | [R48](research/48-python-variants.md) |
| Go / net/http / chi | Use request context and router's actual path/error semantics; observe cancellation completion | Treating chi timeout as forced termination or as a universal guarantee of the desired response envelope | [R49](research/49-go-variants.md) |
| Go / Gin or Echo | Match framework binding/error APIs and explicit return behavior; pass the real request context to I/O | Gin abort is not function return; Echo v4/v5 handler and error APIs differ; framework timeout status may differ from the contract | [R49](research/49-go-variants.md) |
| Go / pgx + sqlc or Ent | Native pgx requires explicit transaction completion/rollback; bind sqlc calls to transaction. Use selected Ent client and SQL-driver semantics | Assuming context cancellation completes native pgx rollback; regenerating Ent for every new builder query | [R49](research/49-go-variants.md) |
| Rust / Axum + Tower + Tokio | Parts extractors precede body-consuming extractor; returned body/producer owns streaming resources; use compatible `Send` boundaries | Dropping permit/snapshot when handler returns headers; assuming Tower response-future completion covers body consumption | [R50](research/50-rust-variants.md) |
| Rust / Actix Web | Place process-shared state outside app factory; use Actix extraction/middleware/body contracts and valid worker-local data | A pool/semaphore constructed inside each factory is not process-global; tuple argument position is not an async auth barrier | [R50](research/50-rust-variants.md) |
| Rust / tonic + SQLx | Implement generated gRPC trait, message/status/trailer mapping and exact Prost build integration; preserve query/transaction lifetime | Copying HTTP JSON errors, an older tonic build API or a non-`Send` worker-local stream | [R50](research/50-rust-variants.md) |
| JS/TS / Express 4 or 5 | Match rejected-promise propagation to major; use validated/transformed values and explicit output mapping | Express 4 does not automatically forward rejected async handlers; detached tasks escape both versions' returned-handler path | [R51](research/51-js-runtime-variants.md) |
| JS/TS / Fastify 4 or 5 | Respect schema/plugin encapsulation and selected validator/serializer compilers. Default JSON Schema compilers require full schemas in v5; custom compilers retain their own schema contracts | v4 shorthand on v5 default compilers; treating response serialization as strict validation; transferring Ajv coercion or string-length assumptions into a Zod compiler recipe | [R51](research/51-js-runtime-variants.md) |
| JS/TS / Hono on Node or Bun | Use `c.req.valid(...)` data after validation; bind adapter-specific abort/cleanup; distinguish runtime from build tooling | Reading raw hook data as transformed value; assuming successful headers or buffered tests establish disconnect cleanup | [R51](research/51-js-runtime-variants.md) |
| TS / Effect v4 | Match exact beta/host patch; use named service bindings, schemas/codecs, declared errors and scoped layers/streams | Promise or Effect v3 recipes; bare payload fields versus JSON schema value; raw responses bypassing success encoding | [R52](research/52-effect-variants.md) |
| Next / App Route Handler | Web Request/Response contract, selected Node/Edge APIs, explicit auth/error/cache behavior | Pasting Server Action result conventions into an HTTP endpoint or loading Node-only driver on Edge | [R53](research/53-next-variants.md) |
| Next / Server Action or Pages API | Action invocation, React serialization and error channel differ from HTTP; Pages built-in parsing can fail before user handler | `server-only` does not make an action private; generic “JSON-only” serialization advice is wrong; parser errors may bypass custom envelope | [R53](research/53-next-variants.md) |
| JVM / Spring MVC + JPA/jOOQ | Use selected thread-bound transaction owner and loaded DTO projection; account for proxy interception | Self-invocation does not create proxy advice; an ambient test transaction can hide production lifetime behavior | [R54](research/54-jvm-variants.md) |
| JVM / WebFlux + R2DBC / Kotlin coroutine | Keep reactive transaction in subscriber context and use matching suspending adapters | Moving JDBC work into `suspend` does not make it non-blocking; thread-local imperative rules do not transfer unchanged | [R54](research/54-jvm-variants.md) |
| .NET / Minimal APIs versus controllers | Select version-specific validation path and actual endpoint/model-state pipeline | .NET 8/9 Minimal APIs do not gain .NET 10 validation merely from annotations; .NET 10 still needs registration and metadata | [R55](research/55-dotnet-variants.md) |
| .NET / EF Core versus Dapper | EF bulk operations execute immediately; keep multi-operation transaction explicit. Dapper requires explicit connection/transaction/token propagation | Concurrent work on one scoped DbContext; assuming everything waits for `SaveChanges`; unconnected serializer source-generation metadata | [R55](research/55-dotnet-variants.md) |
| Ruby / Rails API versus browser/session app | Use matching parameter APIs and supplied authorization; preserve selected session/CSRF behavior | JSON responses alone do not justify stripping browser protections; Rails generator output is not the completed business behavior | [R56](research/56-ruby-variants.md) |
| Ruby / Active Record + Active Job | Match Rails version, queue adapter and actual transaction/enqueue boundary; verify real commit where required | Rails 7.2 symbolic versus Rails 8 boolean enqueue settings; after-commit enqueue is not atomic row+job insertion | [R56](research/56-ruby-variants.md) |
| PHP / Laravel | FormRequest/policy and Eloquent persistence; selected queue's after-commit, attempt and delay semantics | Validation is not authorization; save is explicit; `$tries` counts total attempts, not retries after first attempt | [R57](research/57-php-variants.md) |
| PHP / Symfony + Doctrine / Messenger | Match DTO validation/security hooks, unit-of-work/flush and selected bus middleware; reset long-lived worker state | Messenger after-current-bus dispatch is not automatically after a controller-owned transaction commits; retries/units differ from Laravel | [R57](research/57-php-variants.md) |
| Elixir / Phoenix + Ecto | Changeset/context mapping, exact Repo transaction API, actual connection/process ownership | An error tuple is not universal rollback: legacy `transaction` and newer `transact` differ; shared SQL sandbox cannot prove independent transaction races | [R58](research/58-elixir-variants.md) |
| Elixir / Ash + Oban | Supplied actor/policy through action construction; respect action rollback and transaction-bound job admission | Action completion is not outer commit; insertion uniqueness is not exactly-once effects; inline job mode does not prove persisted admission | [R58](research/58-elixir-variants.md) |

These are coding differences, not a recommendation to replace a project's framework. Language rules are shared where correct; framework and driver exceptions remain adjacent to the affected step.

## Cross-cutting procedure variants

| Assigned scope | Shared intent | Variant-specific obligation |
| --- | --- | --- |
| REST / gRPC / GraphQL | Implement the supplied public contract and principal/resource policy | HTTP status is not universal completion: gRPC needs terminal RPC status; GraphQL has data/error and transport-profile semantics |
| SSE / WebSocket / streaming body | Produce prescribed messages and terminate/release correctly | EOF/close does not alone prove application completion; resource owner and error channel follow selected protocol/runtime |
| Webhook / upload / binary input | Decode and validate the specified input before protected work | Signature uses original bytes; spool threshold is not upload rejection limit; structural parse is not business validity |
| Query / schema migration | Implement supplied data semantics | A query projection does not perform persisted backfill; generator does not necessarily apply migration; runner transaction boundaries differ |
| PostgreSQL / Bun SQLite | Keep selected atomic unit on correct connection | Async PostgreSQL work is awaited; inspected Bun SQLite transaction callbacks must stay synchronous |
| Transaction → job admission | Meet the selected data/job consistency contract | Transaction-bound insert can share commit; after-commit enqueue leaves a failure window and is not an interchangeable implementation |
| External API retry | Preserve chosen effect identity and unknown-outcome policy | Provider idempotency, SDK transport retry and application retry have distinct lifetimes/limits |
| App-auth implementation | Apply supplied allow/deny and resource rules | Framework hooks, list filtering, create policy and token verification are different enforcement points |
| Observability | Emit the specified bounded signals at correct lifecycle points | Recording an error may not set span status; handler end may precede stream/work completion |

Primary procedure sources: [R47](research/47-scope-variants.md), [R59](research/59-protocol-variants.md), [R60](research/60-data-effect-variants.md). These are target-application behaviors; agent persistence/cache/permission ownership is unchanged.

## Complete composition examples

All examples are proposed task fixtures, not executed applications. They demonstrate what to load and what materially differs. Their behavior is supplied by the task owner; the backend specialist authors local implementation details.

### 1. New debit endpoint — Python/FastAPI

- **Assignment:** implement owner-only `POST /accounts/{account_id}/debits`; reject invalid amount; maintain supplied atomic balance/ledger behavior.
- **Composition:** `backend-implement` feature mode + `backend-api` + `backend-data`; Python async, selected FastAPI/Pydantic and SQLAlchemy/PostgreSQL references. Add `backend-check` only for assigned test authoring/specialized verification.
- **Implementation:** parse according to contract, bind trusted principal, use task-owned async session and prescribed transaction/locking design, write balance/ledger, return loaded DTO through declared error mapping.
- **Local decisions:** SQL expressions, helper functions, DTO mapping and fixture implementation. No caller-written function body required.
- **Assigned evidence:** balance 100 and competing debits 70 yield one success, one conflict, balance 30 and one ledger entry; forbidden owner and invalid input cause no write; supplied late failure rolls back.
- **Different framework:** same Django/DRF task uses synchronous atomic unit under inspected pins, DRF validation and the correct object/list/create policy hooks. It does not reuse async SQLAlchemy calls. [R48](research/48-python-variants.md).

### 2. Diagnosed API boundary repair — Go/ogen

- **Assignment:** supplied diagnosis says handwritten route bypasses already-generated validation. Restore supplied request/error contract without changing API schema or storage.
- **Composition:** repair mode + `backend-api`; Go/ogen and existing router/auth references. SQLx/Ent/migration guidance is irrelevant.
- **Implementation:** bind the existing generated router to real handler; implement required error envelope; retain existing auth placement. Regenerate only if actual generator inputs change.
- **Assigned evidence:** provided invalid payload is rejected before domain call; valid and unauthorized cases preserve expected outcomes. Report actual results without inventing a pre-fix test run.
- **Different mode:** a new endpoint feature adds canonical operation/generated artifacts; a behavior-preserving refactor starts from already-correct behavior and cannot silently change validation. [R47](research/47-scope-variants.md).

### 3. Snapshot export — Rust/Axum versus Actix

- **Assignment:** stream selected tenant rows as NDJSON under a supplied process-wide export cap, snapshot and disconnect policy.
- **Composition:** feature + `backend-api` + `backend-data` + `backend-concurrency`; Rust/Tokio/SQLx plus either Axum or Actix profile.
- **Implementation:** keep transaction and permit alive through body consumption; encode bounded rows; map pre-header and body errors through their proper channels. Add a producer task only when the design selects one.
- **Framework delta:** Axum body extractor goes last and body crosses `Send` boundary. Actix can use worker-local non-`Send` stream, but shared cap/pool must be placed outside per-app construction.
- **Assigned evidence:** open response bodies continue consuming capacity; completion/drop eventually releases it; same tenant/query/snapshot outcomes hold. A handler-only test does not establish body lifetime. [R50](research/50-rust-variants.md).

### 4. Application API — Effect v4 versus Promise-style Hono

- **Assignment:** implement supplied profile-rename contract with validation, authenticated actor, reserved-name behavior and encoded DTO.
- **Composition:** API feature + exact Effect beta/patch profile, or existing Hono/Node-or-Bun profile; same business acceptance, different implementation procedure.
- **Implementation delta:** Effect uses schema values/codecs, declared errors, named service bindings and scoped provisioning. Hono uses actual validated output and explicit service/error/output handling. A raw HTTP response can bypass normal codec behavior.
- **Assigned evidence:** actual mounted endpoint accepts and transforms valid input; supplied invalid/auth/reserved-name/output cases use intended error mapping and side effects.
- **Boundary:** do not replace Hono with Effect or transfer beta.98/v3 APIs into the host's beta.83 implementation. [R51](research/51-js-runtime-variants.md), [R52](research/52-effect-variants.md).

### 5. Same business operation — Next HTTP versus Server Action

- **Assignment:** owner-only profile update with supplied DTO and freshness requirements; target entrypoint is already selected.
- **Composition:** `backend-api` with Next Route Handler or Server Action profile, relevant exact version/runtime and app-data reference.
- **Implementation delta:** HTTP handler returns prescribed status/body; action follows its invocation/result/error/React-serialization contract. Apply auth to each invocation. Cache tags invalidate; tenant identity still belongs to cache keys according to supplied policy.
- **Assigned evidence:** correct owner succeeds, forged owner does not write, error path matches chosen transport, and required freshness holds. No UI implementation is added. [R53](research/53-next-variants.md).

### 6. Receipt job after order submission — Rails, PHP or Elixir

- **Assignment:** transition an authorized order and admit a receipt job under the supplied consistency and retry policy. The selected stack/queue determines implementation.
- **Composition:** data + concurrency; Rails/Active Record/Active Job, Laravel/Eloquent/queue, Symfony/Doctrine/Messenger or Ecto/Ash/Oban references as appropriate.
- **Implementation delta:** respect actual transaction and job-insertion boundary. Match attempt counts and delay units: for three total attempts, Laravel `$tries=3` differs from Messenger `max_retries=2`. In Ecto, select the actual rollback semantics; in Rails, use the version-specific enqueue setting.
- **Assigned evidence:** transition rollback excludes job where joint admission is promised; repeated delivery follows supplied effect identity; real-commit checks use a fixture able to observe actual commit.
- **Boundary:** a queue-specific recipe cannot silently replace a required atomic outbox with after-commit publication. [R56](research/56-ruby-variants.md), [R57](research/57-php-variants.md), [R58](research/58-elixir-variants.md), [R60](research/60-data-effect-variants.md).

### 7. Scoped refactor — TS/Fastify

- **Assignment:** move specified handler logic into the supplied service seam while preserving HTTP behavior and the existing Fastify major.
- **Composition:** `backend-refactor` + relevant API/TS/Fastify references; selected structural-edit recipe only when useful.
- **Implementation:** keep plugin/schema visibility, parsed values and error handling correct while moving code. Use binding-aware rename when required; syntax matching alone does not prove symbol identity.
- **Assigned evidence:** original request/response/error cases retain outcomes; requested structural change exists; unrelated files remain outside the delta. A Fastify 4→5 upgrade is a separate compatibility assignment. [R33](research/33-codemods.md), [R51](research/51-js-runtime-variants.md).

## Authoring and evaluation consequences

Write substantive deltas like those above into version-aware references. Do not create an entire skill for each row/combination, or copy every family into one always-loaded body. Common invariants have one source; different control flow, APIs, lifetimes and checks live in the appropriate variant.

Future selection cases should pair the correct component with misleading nearby dependencies, compare framework majors with different APIs, and distinguish feature/refactor/repair on the same files. Runtime evaluation needs real target boundaries: buffered HTTP tests cannot prove live disconnect timing, transaction-managed test fixtures can hide commit behavior, and a generated type cannot prove application policy.
