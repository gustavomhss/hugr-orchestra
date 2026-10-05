# R50 — Rust backend skill variations

Research snapshot: 2026-10-04. Metadata worktree HEAD verified by `git rev-parse`: `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`.
Evidence: primary versioned Rustdocs and pinned source inspected; code shapes below source-derived, uncompiled. Cargo, solvers, generators and tests not run.
Read first: frozen `skill-variants-plan.md`; leads `36-rust-code.md`, `31-typed-sql.md`, `30-rpc-contracts.md`, under `/Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/`.

## Scope and version boundary

Charlie implements selected component behavior. Caller supplies design, authorized paths, component versions/features, contracts, domain boundaries and assigned checks; repair packets additionally supply diagnosis/reproducer. New features need no invented diagnosis prerequisite. Discovery, framework choice, architecture and independent verification remain owner work.
Local freedom includes SQL, DTOs, helpers, rejection adapters, stream wrappers, cloning/pinning and borrow annotations needed for assigned behavior. Missing policy blocks affected work; ordinary compiler/implementation mistakes remain Charlie's scoped corrections. Skill selection describes applicability; host owns authorization.

| Reference snapshot | Concrete boundary |
| --- | --- |
| Axum 0.8.9; Tower 0.5.3; tower-http 0.7.1 | `http`/`http-body` 1.x traits; Axum body-consuming extractor last; `Body::from_stream` requires `Send + 'static`. [AX], [AB], [AM], [TL], [TT] |
| Actix Web 4.11.0 | Worker-local application factories/runtimes; `web::Data` for shared state; Actix `Transform`/`Service` and `MessageBody`, not Tower/body drop-ins. [AD], [AS], [AR], [AW], [AT] |
| tonic / tonic-prost / tonic-prost-build 0.14.6; prost version supplied by component packet | Generated gRPC trait/dispatch; response stream `Send + 'static`; Prost build integration lives in separate crate. [TG], [TB], [TM] |
| SQLx / sqlx-cli 0.9.0 | PostgreSQL recipe; checked macros require matching DB descriptions/cache; transaction and row-stream lifetimes explicit. [XQ], [XA], [XT], [XP], [XC] |
| Tokio 1.48.0; tokio-util 0.7.16 | `JoinHandle`, `JoinSet`, bounded mpsc, semaphore and child cancellation-token semantics. [JH], [JS], [MC], [SE], [CT] |

Pins define reviewed reference variants, not upgrade instructions or one resolver-validated dependency graph. Target component's supplied lock/toolchain/features win; incidental/transitive Axum inside tonic does not select HTTP endpoint guidance. Actix/Tokio references deliberately use named versions, not claims of newest releases.
**Provenance distinction, rechecked by lead:** [GitHub's `v0.9.0` commit](https://api.github.com/repos/transact-rs/sqlx/commits/v0.9.0) resolves to R31's valid tag-source pin `75bc0487eb661da811bb7a3c5d158f1bd463fef4`; published SQLx 0.9.0 `.cargo_vcs_info.json` reports `003b698e99e024f3621b8043a2426fde5b741171`. SQLx source citations here use the published pin. The two provenance scopes differ; this does not invalidate the tag citation or establish a measured behavioral regression. [XV]

## Same supplied task for A and B

Illustrative owner-decided packet: add `POST /exports`, JSON `{after_id: string}`, authenticated tenant from existing auth boundary; stream matching tasks ordered by immutable ID, each NDJSON row `{id,title,assignee_name}` with nullable assignee. PostgreSQL schema/query semantics match R31's tenant-scoped join; caller selects read-only snapshot consistency.
HTTP contract: 200 `application/x-ndjson`; malformed JSON 400, wrong media type 415, excessive body 413, auth failures as supplied, saturation 503; pre-header failures use supplied problem JSON, post-header failures terminate body with error. Body limit `L`, process-wide active-export cap `K`, setup timeout `T`, output chunk bound and snapshot termination policy are supplied values.
Selected base design: pull-driven export stream owns read-only transaction and export permit through completion/drop. Explicitly finish snapshot before normal EOF; disconnect/drop cancels local production. No background producer required for this packet. Card E composes only when caller instead selects existing supervised producer/channel design.
Example destinations below stand for caller-authorized module paths. Caller supplies behavior and boundaries, not prewritten `open_export`, every SQL statement or every lifetime annotation.

## A — Axum/Tower API + pull-stream implementation

- **Trigger / non-trigger:** assigned Axum endpoint/router or HTTP stream change; not Actix endpoint, tonic method, or repository-only edit.
- **Supplied facts:** common packet; concrete `AppState`/auth/error APIs, route subtree and middleware order; Axum `json` plus existing serving features; tower-http features only for selected policies.
- **Implement 1:** author DTO and validation; use signature shape `export(State(state): State<AppState>, auth: Auth, input: Result<Json<ExportInput>, JsonRejection>)`. State/auth implement parts extraction; JSON remains last. Map actual rejection variants to contract before opening snapshot. [AX]
- **Implement 2:** acquire `state.exports.clone().try_acquire_owned()` before expensive DB setup; map no-permit/closed cases to prescribed response. Prepare snapshot, then move owned transaction, tenant/filter values and permit into pull stream; serialize each row plus newline to owned bytes. Keep borrowed SQLx fetch stream inside that owner, not borrowed from returning handler. [SE], [AB], [XT]
- **Implement 3:** return response containing `Body::from_stream(stream)` and NDJSON header. Stream releases resources at terminal/error/drop path. Register route before applying selected `.layer(...)`; `ServiceBuilder` request order is top-to-bottom, unlike repeated router `.layer` calls. [AB], [AM]
- **Existing route:** Axum extractors/Serde, existing stream combinators, Tower `ServiceBuilder`; JSON `DefaultBodyLimit::max(L)`, setup `tower_http::timeout::TimeoutLayer::with_status_code`. Map native policy failures to required problem envelope: timeout layer alone returns empty body. Whole-response timing needs body wrapper: 0.7.1 has `ResponseBodyTimeoutLayer` for inter-frame stall and `ResponseBodyDeadlineLayer` for elapsed body lifetime. Neither changes already-sent status. [AX], [TT], [TD]
- **Output / hand-owned:** `src/http/exports.rs`, router registration, DTO/error mappings and narrow resource-owning stream adapter. Libraries own decode/body polling/layer composition; Charlie owns tenant call, row encoding and cleanup transitions. No generated source required.
- **Local freedom / blockers:** choose local helpers and concrete/boxed stream shape; enable selected crate features within assigned manifest scope. Block on unresolved wire errors, state ownership, snapshot policy or unavailable dependency outside scope.
- **Assigned checks — unexecuted:** `axum_export_contract`: real router accepts valid filter; verify row order/nulls and exact error envelopes. `axum_export_lifetime`: keep `K` response bodies open after headers; request `K+1` stays rejected; EOF/drop frees capacity and eventually closes snapshot; slow body survives setup timeout but follows assigned body timeout. Route invocation alone cannot check streaming lifetime.

## B — Actix Web API + same pull-stream implementation

- **Trigger / non-trigger:** same endpoint task in supplied Actix application; not selected merely because repository also contains Actix actors or an Actix dev dependency.
- **Supplied facts:** common packet; factory/bind/worker layout, shared versus worker-local state decision, nested scopes, existing auth/error middleware and runtime entrypoint.
- **Implement 1:** construct shared pool/semaphore state once outside `HttpServer::new`; clone `web::Data<AppState>` into each `App::new().app_data(data.clone())`. Creating new `AppState`/pool/semaphore inside factory multiplies resources and changes process cap into per-instance caps. Merely wrapping an already-shared handle inside factory does not duplicate its underlying pool. [AD], [AS]
- **Implement 2:** use `web::Json<ExportInput>`, `web::Data<AppState>` and existing auth extractor. Configure `JsonConfig::default().limit(L).error_handler(...)` at intended scope; map content-type/parse/overflow separately. Unlike Axum, JSON may precede Data. Tuple extractors can progress concurrently: parameter position is not an async authentication barrier; required auth-before-body processing belongs in outer middleware/composed extractor. [AE], [AJ]
- **Implement 3:** acquire same process permit and construct same owned snapshot stream; return `HttpResponse::Ok().content_type("application/x-ndjson").streaming(stream)`. Its stream bound is `'static`, without Axum's `Send` requirement. Own values after handler returns even on worker-local runtime. [AT]
- **Existing route:** native `web::Data`, `JsonConfig`, response streaming; `.wrap(middleware::from_fn(...))` or existing Actix `Transform` for assigned policy. Last `.wrap` receives request first. `client_request_timeout` covers request-head receipt, not handler execution or response stream. Tokio timeout can wrap assigned setup future inside native middleware. [AW], [AS]
- **Output / hand-owned:** `src/http/exports.rs`, `src/http/app.rs`; shared-state placement, route, rejection mapping and body-lifetime adapter. Framework owns extraction and stream transport.
- **Local freedom / blockers:** local non-`Send` stream is allowed; choose local adapter/error types. Block when packet contradicts worker/process scope or demands cross-thread reuse of worker-local state; do not add unsafe `Send` or silently replace runtime. [AR]
- **Assigned checks — unexecuted:** `actix_export_contract` checks same HTTP packet through `actix_web::test`; `actix_export_workers` exercises actual multi-worker factory with evidence requests reached distinct workers, proving aggregate cap `K` and shared state. `actix_export_drop` checks open-body capacity and snapshot cleanup. Single `init_service(App)` instance cannot establish worker sharing.

## C — tonic generated gRPC server-stream implementation

- **Trigger / non-trigger:** supplied `.proto` method `Export(ExportRequest) returns (stream ExportRow)` in existing tonic service; not REST/NDJSON or an unassigned REST-to-gRPC conversion.
- **Supplied facts:** proto/import roots, package/service names, generator/runtime/protoc versions, generated destination policy, tenant metadata source, `Status` mapping, message-size limits, deadline propagation and selected stream/resource ownership.
- **Implement 1:** use existing `build.rs` route `tonic_prost_build::configure().compile_protos(...)`; include package via `tonic::include_proto!`. Implement actual generated trait, register generated server wrapper. Standard generation emits `type ExportStream: Stream<Item = Result<ExportRow, Status>> + Send + 'static`. [TB], [TG]
- **Implement 2:** copy required metadata/extensions before `request.into_inner()`; validate owned filter and invoke assigned storage/domain boundary. Return `Response<Self::ExportStream>` over owned rows/resources; map pre-stream failure to method `Err(Status)`, mid-stream failure to stream `Err(Status)`, not HTTP problem JSON. tonic encoder emits server error as gRPC trailers. [TG], [TE]
- **Implement 3:** enforce selected deadline through stream/producer lifetime, then release resources on EOF/error/drop. Reviewed transport `GrpcTimeout` times inner response future; successful initial response does not prove remaining stream has deadline enforcement. Async auth cannot be pasted into synchronous `Interceptor::call(Request<()>)`; use assigned handler/Tower async boundary. [GT], [GI]
- **Existing route / output:** tonic-prost-build + provisioned protoc generate package Rust in `OUT_DIR`, message derives, trait, dispatch and client; tonic-prost supplies codec. `src/rpc/exports.rs` owns implementation, mapping and lifecycle. Generated output is regenerated, not manually patched.
- **Local freedom / blockers:** choose stream boxing, private adapters and owned value conversion; no requirement caller prewrite them. Missing proto/deadline policy, incompatible generator/runtime or unavailable authorized generation route blocks affected output. Older `tonic_build::configure().compile_protos` recipe does not transfer to 0.14's split integration. [TM], [TB]
- **Assigned checks — unexecuted:** `grpc_export_contract` uses generated client against actual service: expected rows, tenant isolation, specified pre-stream code and mid-stream trailers. `grpc_export_cancel` cancels after first row and observes cleanup; deadline expires after initial headers too. Default stubs returning `Unimplemented` cannot satisfy endpoint assignment. [TG]

## D — SQLx checked queries, transaction and streaming resource scope

- **Trigger / non-trigger:** assigned PostgreSQL SQLx repository/query/transaction change, or SQLx-backed export; not Diesel/SeaORM, schema-only contract editing or unconditional DB-tool activation for every Rust handler.
- **Supplied facts:** engine/schema revision and types, query/result semantics, authenticated tenant source, isolation/commit ownership, pool budget, timeout/retry policy, lock/features and matching `.sqlx` metadata or separately assigned disposable-schema preparation route.
- **Implement 1:** author tenant predicate and tenant-qualified join from supplied semantics. Use `query_file_as!(TaskRow, "db/queries/export.sql", tenant, after)`; handwritten `TaskRow` has `Option<String>` for joined assignee. Alias `AS "assignee_name?"` where required. Macros check bindings/fields; `query_as()` function plus `FromRow` is a different, runtime-query route. [XQ], [XA]
- **Implement 2:** reuse caller-owned transaction: owned local `tx` executes via `&mut *tx`; `tx: &mut Transaction<'_, Postgres>` via `&mut **tx`. Never switch one statement to `&pool` inside supposed atomic unit. Write task commits only at selected owner boundary; explicit rollback where normal error path requires awaited cleanup. [XT]
- **Implement 3:** export owns pool-begun transaction inside async stream/producer, applies supplied read-only snapshot settings before queries, and scopes borrowed `.fetch(...)` to that owner. End row-stream borrow before finishing transaction. `.fetch_all(...)` materializes entire export; use only when assigned bounded-page design permits it. Pool-backed fetch itself retains acquired connection until fetch completes or stream drops. [XT], [XP]
- **Cancellation rule:** dropped open transaction starts rollback; PostgreSQL implementation queues rollback, not synchronous completed cleanup. Dropped future does not prove server statement stopped, nor undo commit already accepted. Apply supplied statement timeout/cancellation and commit-ambiguity/retry policy; do not invent retries around uncertain effects. [XT], [PG]
- **Existing route / output:** checked macro expands bind/row code; hand-owned SQL, `src/db/exports.rs`, row/DTO mapping and transaction calls remain. Existing `cargo sqlx prepare --workspace -- <assigned target/features>` refreshes `.sqlx`; `--check` checks against matching live schema. `SQLX_OFFLINE=true` forces cached descriptions for assigned builds, not schema freshness. Commands documentary only. [XC]
- **Local freedom / blockers:** Charlie writes SQL/helpers and fixes borrow scopes; need no supplied SQL text or every borrow annotation. Missing schema semantics, new-query metadata without permitted preparation, incompatible lock/toolchain or unresolved retry semantics block corresponding work. Do not hand-forge cache as generated evidence.
- **Assigned checks — unexecuted:** `sqlx_export_scope`: tenant-qualified join excludes cross-tenant rows; nulls preserved; assigned snapshot excludes later changes; empty stream ends correctly. `sqlx_transaction_binding`: read own uncommitted insert then rollback; catches stray pool executor. `sqlx_export_cancel`: drop during acquisition/fetch, observe eventual reusable pool capacity and closed snapshot. Assigned macro check uses exact cache/features; freshness check remains separately assigned.

## E — Tokio bounded producer, cancellation and task ownership

- **Trigger / non-trigger:** caller selects producer/channel, concurrent work or blocking-stage change with explicit task owner; not automatic spawn for A/B's pull stream, nor generic ownership lesson for synchronous Rust.
- **Supplied facts:** existing supervisor/shutdown hook, Send versus worker-local execution, limits `K` and channel capacity `B`, item/chunk byte bound, ordering, cancellation/deadline and retry/side-effect semantics; blocking stage only if selected.
- **Implement 1:** acquire admission before spawning work; use bounded `mpsc::channel(B)` and assigned ordering. Channel length bounds messages, not bytes; cap encoded chunk size too. Put owned DB source into producer and receiver into returned stream. Share export-permit lease between body and producer if cap must cover both until body termination and producer cleanup. [MC], [SE]
- **Implement 2:** derive request `child_token()` from shutdown token; body owns child's `drop_guard()`, producer observes child. Plain token clone shares cancellation both ways: canceling cloned root can stop sibling requests. Keep guard in returned stream, not handler local. Body drop only signals; producer must select cancellation/receiver closure against blocked source and send waits. [CT], [MC]
- **Implement 3:** preserve in-progress operations across unrelated `select!` branches when restart loses progress. `mpsc::send(value)` losing race drops value; reserve capacity first when value must survive nonterminal branch. Cancellation loses semaphore/mpsc queue position; shutdown/disconnect may intentionally discard work only per supplied semantics. [MC], [SEL]
- **Implement 4:** register producer in existing service-owned `JoinSet`/task owner; reap results during normal operation and join cleanup during shutdown. Dropping `JoinHandle` detaches; `abort()` requests cancellation, joining observes termination. Handler-local `JoinSet` instead aborts producers on return. Receiver checks terminal outcome: sender disappearance after failure/panic must not become successful EOF. Do not depend on async work in `Drop`. [JH], [JS]
- **Blocking branch:** selected `spawn_blocking` gets owned inputs and concurrency permit held inside closure until closure exits. Started closure cannot be aborted; implement cooperative stop checks matching supplied cancellation semantics. `block_in_place` cannot transfer to Actix's single-thread workers. Missing stop capability for mandated cancellation is owner blocker, not rationale to release permit while work runs. [BL], [AR]
- **Existing route / output:** Tokio semaphore/mpsc/JoinSet and tokio-util CancellationToken; `src/export/producer.rs`, small body guard and existing shutdown integration. Hand-owned work: row/codec loop, lease transfer, error propagation and cancellation wiring; libraries own queueing/scheduling/wakeup mechanics.
- **Local freedom / blockers:** choose small wrapper/helper/pinning layout; use worker-local spawn only within supplied LocalSet/runtime. Unresolved supervisor, queue/byte budget, allowed side effects or cancellation semantics blocks corresponding path; no new orchestration subsystem.
- **Assigned checks — unexecuted:** `export_backpressure` fills actual channel then proves source advancement bounded; `export_cancel_full_queue` drops receiver while producer waits and observes joined exit/resource release; `export_cancel_isolation` leaves sibling alive. Selected blocking test requests cancellation while closure active, confirms permit retained until real exit; shutdown observes results rather than detached success.

## Wrong transfers: same task, code must change

| Copied instruction | Concrete failure | Correct variant-specific action |
| --- | --- | --- |
| Build fresh shared state wherever router/App is constructed | Actix factory creates independent semaphore/pool per app instance; `K` no longer process-wide. | Build once, clone handles into factories; scoped Data can shadow parent Data. [AD], [AS] |
| Actix `export(Json<T>, Data<S>)` ordering works in Axum | Axum nonfinal body extractor fails handler bounds. Conversely Axum's sequential extraction assumption fails for Actix async tuple extractors. | Axum parts first/body last; Actix auth sequencing through actual middleware/composed extraction. [AX], [AE] |
| Worker-local `Rc`-capturing stream can be reused unchanged | Actix streaming permits non-`Send`; Axum body and tonic generated stream require `Send`. | Own compatible Send state when cross-thread boundary required; retain legitimate local stream in Actix. [AT], [AB], [TG] |
| Middleware future completed, so export resources may drop | Headers returned while body still live; Tower concurrency permit resides in response future. Setup timeout also ends there. | Body/producer owns export lease and snapshot; distinct body timing/cancellation. [TL], [TT], [GT] |
| Drop task handle on request cancellation | Tokio child continues; producer may retain SQLx connection. | Signal/abort according to selected policy, retain join owner; body token guard must target child. [JH], [CT] |
| Copy prior generator/source pin because crate name matches | 0.14 separates Prost build integration; R31 SQLx source SHA differs published package provenance. | Use supplied exact-version APIs and published source mapping; report mismatch to owner. [TM], [TB], [XV] |

Body timing nuance: tower-http `DeadlineBody` measures wall-clock from construction but surfaces error on `poll_frame`; it is not an independent reaper of an unpolled body. Required cleanup despite absent polling needs assigned producer/supervisor timer. Successful channel send likewise does not establish client receipt. [TD], [MC]

## Selection cases, composition and extraction

Positive/negative selection cases — proposed, unexecuted: supplied Axum export selects A+D; equivalent Actix component selects B+D. tonic server-stream with selected supervised queue selects C+D+E even when Axum is transitive. SQLx tenant-join repair with supplied diagnosis selects D, without HTTP rewiring. Pure DTO rename does not activate E; unknown target framework/version returns missing component fact to caller, not repository-wide investigation.
Checks above describe task acceptance for owner assignment; Charlie executes only assigned implementation checks. Source reading here neither executes these cases nor grants independent verifier mission. Existing package targets/fixtures own checks; names are proposed labels, not claims tests already exist. Compile/macro checks and body/DB behavior checks answer different questions.
Composition examples: **new snapshot HTTP export = implement-feature + API/stream scope + Rust runtime rules + A or B + D**; **given disconnect leak repair = implement-fix + supplied cause + selected framework + E resource recipe + D if pool affected**; **given gRPC export = C + D + E only for selected task-producing design**.
Extraction: shared scope page owns supplied-contract/role boundary; Rust/runtime page owns Send crossing, task/drop and cancellation facts; framework references own extraction/state/middleware/body adapters; SQLx page owns query metadata/executor/transaction; narrow stream recipe owns permit/token/source lifetime. R36 validation/OpenAPI/typed-route recipes remain opt-in Axum adjuncts; do not copy them wholesale into Actix/tonic or every data task.
Author shared boundary first, then framework references and narrow recipes. Status: source-researched variant design; native loader composition, skill installation and exercised implementations remain separate deliverables. Descriptive composition here introduces no loader/router or permission mechanism.

## Primary sources inspected

[AX]: https://docs.rs/axum/0.8.9/axum/extract/index.html#the-order-of-extractors
[AB]: https://github.com/tokio-rs/axum/blob/c59208c86fded335cd85e388030ad59347b0e5ae/axum-core/src/body.rs
[AM]: https://github.com/tokio-rs/axum/blob/c59208c86fded335cd85e388030ad59347b0e5ae/axum/src/docs/middleware.md
[TL]: https://github.com/tower-rs/tower/blob/4b0a6b0e688bd177eb2c9c97f5268dd9703c66fc/tower/src/limit/concurrency/future.rs
[TT]: https://github.com/tower-rs/tower-http/blob/c9414514a421b07b6520e040a3fd6a579b0c5e1b/tower-http/src/timeout/service.rs
[TD]: https://github.com/tower-rs/tower-http/blob/c9414514a421b07b6520e040a3fd6a579b0c5e1b/tower-http/src/timeout/deadline_body.rs
[AD]: https://github.com/actix/actix-web/blob/web-v4.11.0/actix-web/src/data.rs
[AS]: https://docs.rs/actix-web/4.11.0/actix_web/struct.HttpServer.html
[AR]: https://github.com/actix/actix-web/blob/web-v4.11.0/actix-web/src/rt.rs
[AW]: https://github.com/actix/actix-web/blob/web-v4.11.0/actix-web/src/middleware/mod.rs
[AE]: https://github.com/actix/actix-web/blob/web-v4.11.0/actix-web/src/extract.rs
[AJ]: https://github.com/actix/actix-web/blob/web-v4.11.0/actix-web/src/types/json.rs
[AT]: https://github.com/actix/actix-web/blob/web-v4.11.0/actix-web/src/response/builder.rs
[TG]: https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/tonic-build/src/server.rs
[TB]: https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/tonic-prost-build/src/lib.rs
[TM]: https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/tonic-build/src/lib.rs
[TE]: https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/tonic/src/codec/encode.rs
[GT]: https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/tonic/src/transport/service/grpc_timeout.rs
[GI]: https://docs.rs/tonic/0.14.6/tonic/service/trait.Interceptor.html
[XQ]: https://docs.rs/sqlx/0.9.0/sqlx/macro.query.html
[XA]: https://docs.rs/sqlx/0.9.0/sqlx/macro.query_as.html
[XT]: https://github.com/transact-rs/sqlx/blob/003b698e99e024f3621b8043a2426fde5b741171/sqlx-core/src/transaction.rs
[XP]: https://github.com/transact-rs/sqlx/blob/003b698e99e024f3621b8043a2426fde5b741171/sqlx-core/src/pool/executor.rs
[PG]: https://github.com/transact-rs/sqlx/blob/003b698e99e024f3621b8043a2426fde5b741171/sqlx-postgres/src/transaction.rs
[XC]: https://github.com/transact-rs/sqlx/blob/003b698e99e024f3621b8043a2426fde5b741171/sqlx-cli/README.md
[XV]: https://docs.rs/crate/sqlx/0.9.0/source/.cargo_vcs_info.json
[JH]: https://github.com/tokio-rs/tokio/blob/tokio-1.48.0/tokio/src/runtime/task/join.rs
[JS]: https://github.com/tokio-rs/tokio/blob/tokio-1.48.0/tokio/src/task/join_set.rs
[MC]: https://docs.rs/tokio/1.48.0/tokio/sync/mpsc/struct.Sender.html
[SE]: https://docs.rs/tokio/1.48.0/tokio/sync/struct.Semaphore.html
[CT]: https://github.com/tokio-rs/tokio/blob/tokio-util-0.7.16/tokio-util/src/sync/cancellation_token.rs
[SEL]: https://github.com/tokio-rs/tokio/blob/tokio-1.48.0/tokio/src/macros/select.rs
[BL]: https://github.com/tokio-rs/tokio/blob/tokio-1.48.0/tokio/src/task/blocking.rs
