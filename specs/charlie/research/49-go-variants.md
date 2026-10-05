# R49 — Go implementation skill variants

Research date: 2026-10-04. Metadata worktree `charlie-r49-go-variants`: `git rev-parse HEAD` observed **76015a9dcd5b0c77164a3f1bee49b0060a4d37f0**; explicit equality check succeeded. Worktree is metadata-only, not an application checkout.
Read [frozen brief][brief], [R31 typed SQL][R31], [R37 Go accelerators][R37]. Primary docs/source inspected below. **All implementation examples, proposed generator/test commands, selection cases and behavior checks are source-only proposals, unexecuted.**

## Recommendation and ownership

Compose common Go guidance + supplied component's transport reference + supplied data reference + task mode. Six cards below describe changed instructions, not framework-name tags or implemented loading/dispatch rules.
Charlie owns assigned implementation, local SQL/builder design, DTO mapping, small helpers, appropriate existing-tool arguments, and correction of his implementation mistakes. A new feature supplies semantics/schema/contracts; **exact SQL need not arrive prewritten**. R31's supplied-SQL example is one input shape, not a universal prerequisite.
Discovery, diagnosis, storage/framework selection, cross-owner architecture, grant changes and independent review remain other owners. Repair consumes diagnosis/reproducer; new feature does not require invented diagnosis. Technical applicability does not confer authorization. Consume existing harness/Atlas inputs; propose no new harness, persistence or dispatcher.

## Verified reference versions — supplied target pins still govern

| Family | Inspected boundary and transfer trap |
|---|---|
| Go | `go1.27.1` request/test source; method-qualified `ServeMux` patterns and `PathValue` begin in Go 1.22. `GET` also matches `HEAD`; `httpmuxgo121=1` restores old routing semantics. Record target Go patch, module language version and effective compatibility settings. [G22][Greq][Gtest] |
| chi | `github.com/go-chi/chi/v5` **v5.3.2**, [declared Go 1.23](https://github.com/go-chi/chi/blob/v5.3.2/go.mod). Standard `http.Handler` middleware; chi route parameters and timeout behavior remain chi-specific. [CHI][CT] |
| Gin | **v1.12.0**; [tag go.mod](https://github.com/gin-gonic/gin/blob/v1.12.0/go.mod) and [module-proxy go.mod](https://proxy.golang.org/github.com/gin-gonic/gin/@v/v1.12.0.mod) both declare **Go 1.25.0**. Do not infer floor from release changelog's intermediate “1.24” bump. Record JSON codec/build tags and validator configuration too. [GIN][GJSON][GENGINE] |
| Echo | Compare **v4.13.4** ([Go 1.23.0](https://github.com/labstack/echo/blob/v4.13.4/go.mod)) and **v5.4.0** ([Go 1.25.0](https://github.com/labstack/echo/blob/v5.4.0/go.mod)). `/v4` handlers take `echo.Context`; `/v5` takes `*echo.Context`. Custom binder and HTTP error-handler signatures change. [E4][E5][EB4][EB5] |
| pgx/sqlc | Native **pgx/v5 v5.8.0** ([Go 1.24.0](https://github.com/jackc/pgx/blob/v5.8.0/go.mod)); **sqlc v1.31.1**, config `sql_package: pgx/v5`. sqlc's pgx/v5 support starts at **1.18.0**; `database/sql`, pgx/v4 and pgx/v5 generated APIs are not interchangeable. [PG][SC][SCP] |
| Ent | **v0.14.6**, [Go 1.24](https://github.com/ent/ent/blob/v0.14.6/go.mod). Generator and runtime versions must match; selected dialect, driver, templates and feature flags affect generated API. `ent` client below means application-generated package. [ECG][ED] |
| Optional concurrency | `golang.org/x/sync` **v0.23.0**, [Go 1.26.0](https://github.com/golang/sync/blob/v0.23.0/go.mod). Use owner's compatible existing pin; do not upgrade toolchain to obtain helper. `errgroup.Wait` cancels derived context even on success. [SYNC] |

## Same assigned endpoint and transaction — illustrative packet P

Owner supplies `POST /projects/{projectID}/tasks`: authenticated principal supplies tenant; path supplies project; JSON supplies nonblank `title` (up to 120 Unicode code points) and required integer `priority` in `0..3`, including valid zero. Tenant/project cannot be overwritten from body/query. JSON-only, 16 KiB limit, unknown fields and trailing JSON rejected.
Existing PostgreSQL schema/revision, server patch, driver, project relationship and unique `(tenant_id, project_id, title)` constraint are supplied. Create task plus audit row atomically, then return `201` with `{id,title,priority}`. Missing auth → `401`; foreign/missing project → `404`; malformed/invalid input → `400`; excessive body → `413`; wrong media type → `415`; named uniqueness conflict → `409`; audit failure → `500`, neither insert persists.
Existing deadline policy supplies 2-second request budget, `504` for deadline failure while response remains writable, and bounded rollback cleanup. Cancellation observed before commit stops work and rolls back. Cancellation racing a sent COMMIT does not prove rollback; preserve supplied uncertain-outcome handling, do not add blind retries.
Assigned manual targets: `internal/httpapi/tasks.go`, `internal/service/tasks.go`, `internal/repository/tasks.go`, neighboring `*_test.go`. SQL-first sources: `db/queries/tasks.sql`, generated `internal/dbgen/`. Ent sources: supplied `ent/schema/`; generated `ent/` according to existing command. These are example packet paths, not repository discoveries. Schema unchanged in this feature; Ent can reuse builders while sqlc needs new query generation.

| Same operation | net/http / chi | Gin | Echo |
|---|---|---|---|
| Route + extraction | `HandleFunc("POST /projects/{projectID}/tasks", h)` + `r.PathValue`; chi `Post("/projects/{projectID}/tasks", h)` + `chi.URLParam`. | `POST("/projects/:projectID/tasks", h)` + `c.Param`. | `POST("/projects/:projectID/tasks", h)` + `c.Param`, but handler signature follows major version. |
| Binding | Explicit decoder and validation; router provides neither. | `ShouldBindJSON` returns decode/validation errors without writing. Default JSON binder alone does not enforce P's unknown-field/trailing-value rules. | `Bind` combines sources, can overwrite path-bound values, and is not validation. Use separate body DTO, explicit path extraction, assigned strict decoder and validator. |
| Middleware + errors | `func(http.Handler) http.Handler`; on rejection write assigned envelope and return without calling next. chi `With` scopes endpoint middleware. | Middleware uses `c.Next()` for around-handler work; rejection uses abort **and return**. `c.Error` only records error; assigned renderer owns response. | `func(next echo.HandlerFunc) echo.HandlerFunc`; return error through existing central handler; return `next(c)` to continue. `Pre` runs before routing, `Use` after routing. |
| Service context | Pass `r.Context()`. | Pass `c.Request.Context()`, not `c`. | Pass `c.Request().Context()`, not pooled Echo context. |

| Same atomic write | Concrete data procedure | Wrong instruction transferred from another stack |
|---|---|---|
| Native pgx / sqlc | Begin on supplied pool; defer bounded cleanup; author tenant-scoped project lookup, task insert and audit insert; bind every call to same `pgx.Tx` (`q.WithTx(tx)` for sqlc); inspect commit error before responding. | Expecting cancellation to auto-rollback because Ent's standard SQL driver uses `database/sql`; or keeping original pool-bound `q` inside transaction. |
| Ent SQL driver | `client.Tx(ctx)`; tenant-filtered project lookup, `tx.Task.Create()` and `tx.Audit.Create()` builders; `tx.Client()` for existing client-based helpers; `Commit()`/`Rollback()` explicit. Keep transaction operations sequential. | Supplying `pgx.Tx` to generated Ent client, passing context to Ent `Commit`, or continuing through outer `client` inside transaction. |

## Variant cards — inputs inherit P and supplied exact component pins

### 1. net/http / chi transport
- **Apply / non-trigger:** supplied target is standard handler or chi route. Example positive: chi task endpoint; negative: Gin dependency elsewhere while assigned service is transport-free. Do not replace existing router with new `ServeMux`.
- **Supplied:** selected router/version, route group, principal accessor, middleware order, JSON/error contract, effective Go routing settings, handler/test paths.
- **Steps:** register assigned method/path; keep path/body values separate; apply `http.MaxBytesReader`; decode with assigned strict `json.Decoder` (`DisallowUnknownFields`, second decode must reach EOF); validate presence/ranges; call service; encode success only after commit. Path-dependent middleware must run after matching, e.g. chi route-level `With` rather than outer pre-routing wrapper.
- **Middleware/lifetime delta:** standard wrappers pass modified request with `r.WithContext(ctx)`. chi `Timeout` cancels context, then attempts `504` **after handler returns**; it neither kills ignored work nor replaces already-written success. Integrate existing JSON timeout renderer, do not assume stock timeout supplies P's envelope. [CHI][CT]
- **Tools / ownership:** existing `gofmt`, `go vet`, `httptest`; transport/service/test code manual, data generation belongs card 4/5. Local latitude: decoder/validation helpers and wrapping at assigned route. Blocker: missing route compatibility or middleware/error ownership decision.
- **Proposed checks:** H1–H3, C1; exercise real mux, assigned method mismatch/escaping policy and chi timeout path. Direct handler tests alone do not test routing or wrapper order.

### 2. Gin transport
- **Apply / non-trigger:** supplied handler is `func(*gin.Context)`; negative: choosing Gin because module appears transitively, or applying Gin binding tags to Echo DTOs.
- **Supplied:** Gin/validator/codec versions and build tags, engine construction/options, actual router group, error middleware, principal accessor, DTO/handler/test targets.
- **Steps:** extract `c.Param`; use body-only DTO with presence-aware `*int` for required-but-zero-valid priority; reuse strict binder through `ShouldBindWith` or local strict decoder plus existing validator. Ordinary `ShouldBindJSON` has default unknown-field acceptance and performs only one decode. Do not toggle package-global decoder settings inside requests/tests. [GJSON]
- **Error/context delta:** `BindJSON`/`MustBindWith` abort and commit error status: v1.12.0 maps detectable `*http.MaxBytesError` to `413`, other binding failures to `400`; alternate codecs may lose that typed error. `Abort` does not stop current function. `c.Error(err)` does not itself serialize. `ContextWithFallback` defaults false, making `c.Done()` nil; use request context. `c.Copy()` retains same Request and shallow value references; it does not extend lifetime or permit response writes. [GIN][GENGINE]
- **Tools / ownership:** existing Gin engine + `httptest`, existing validator, scoped Go tools; DTOs/handlers/error mapping manual. Local latitude: local binder and mapping shape within contract. Blocker: codec or global error policy requiring changes outside supplied targets. `c.Set` values do not automatically become request-context values; pass supplied principal explicitly or use existing bridge.
- **Proposed checks:** H1–H3, C1; valid priority `0`, absent priority, oversized body with actual codec, one error envelope, auth abort blocks downstream service, cancellation reaches repository even with fallback disabled.

### 3. Echo transport, major-version-specific reference
- **Apply / non-trigger:** supplied `/v4` or `/v5` component; negative: copying current v5 docs into pinned v4 handler or initiating migration during endpoint work.
- **Supplied:** exact major/patch, custom Binder/Validator/HTTPErrorHandler contracts, `Pre`/`Use`/group order, principal and timeout adapters, assigned route/test targets.
- **Steps:** extract path separately; strict body DTO decode; call configured `c.Validate` or existing explicit validator; return errors through supplied mapper; return `c.JSON` on committed success. v4 body helper is `(&echo.DefaultBinder{}).BindBody(c, &dto)`; v5 is `echo.BindBody(c, &dto)`; neither alone establishes P's strict JSON rules. [EB4][EB5]
- **Version/error delta:** custom Binder `Bind(target, c)` becomes `Bind(c, target)`; HTTP error handler `(err, c)` becomes `(c, err)`. Default binder order is path → applicable query → body; source says v4 query applies GET/DELETE/HEAD, v5 also QUERY. Current v5 binding guide's GET/DELETE-only table is incomplete: pinned source wins. Default central handlers skip committed responses. [E4][E5][EB4][EB5][EBdoc]
- **Tools / ownership:** existing Echo instance + `httptest`, registered validator, scoped Go tools; handlers/DTO/mapping manual. Echo contexts are pooled on handler completion; extract values/request context before request-local work. v5 `ContextTimeout` maps returned `context.DeadlineExceeded` to **503**, not P's 504, and needs downstream cooperation; use assigned timeout/error mapping. [E5][ET]
- **Latitude / blocker / checks:** choose local binding/DTO conversion; ask owner when changing shared timeout/binder policy exceeds targets. Propose H1–H3, C1 plus body/path collision and validator-not-invoked negative cases; exercise configured central handler through `ServeHTTP`, not only returned Go error.

### 4. Native pgx / sqlc data implementation
- **Apply / non-trigger:** owner selected native pgx SQL access; compose sqlc only when selected generation path exists. Negative: Ent repository with pgx solely underneath `database/sql`; native pgx transaction API does not follow from driver name alone.
- **Supplied:** PostgreSQL patch/schema/constraints, pgx import major, sqlc pin/config/overrides if used, transaction owner/isolation, error classification, query/output/repository/test paths and disposable DB fixture.
- **Steps:** derive parameterized SQL from P; use tenant predicate in project lookup and inserts, prescribed uniqueness constraint for concurrency, task ID returned for audit insert. For sqlc, author named SQL, regenerate configured output, inspect signatures/null types, bind `WithTx(tx)`. For raw pgx, bind/scan manually, close rows and check `rows.Err`; keep single transaction client throughout. [SC][SCP][PG]
- **Lifetime delta:** native pgx Begin context affects BEGIN only; cancellation never substitutes for explicit rollback. Defer existing bounded cleanup, obtain usable cleanup context when request context is canceled, preserve primary error and report cleanup failure per contract. Do not detach business queries. Pool `Commit`/`Rollback` release acquired connection. [PG][PP]
- **Tools / ownership:** existing pinned `sqlc generate --no-database --no-remote` and `sqlc diff --no-database --no-remote` when packet uses built-in offline analyzer; existing matching-PostgreSQL fixture for behavior. SQL/manual adapter owned by Charlie; sqlc owns `db.go`, query methods and models. Raw pgx has no generated output. [SCLI]
- **Latitude / blocker / checks:** SQL structure and helper choice remain local; missing exact SQL is not blocker. Missing schema semantics/isolation/constraint mapping or required generator access is blocker. Propose D1–D2/C1; generation and compilation do not prove tenant predicates, atomicity or schema deployment.

### 5. Ent data implementation
- **Apply / non-trigger:** assigned repository already uses generated Ent client. Negative: “typed Go needed” in sqlc code is not reason to select ORM or change storage.
- **Supplied:** Ent generator/runtime pin, actual generated package, schema/edges/optional fields, SQL dialect/driver, privacy/hook registration and context, flags/templates, repository/test targets; schema/output targets only when schema change assigned.
- **Steps:** P uses existing schema: compose tenant-filtered lookup and task/audit builders without regeneration. If assigned schema changes, edit `ent/schema`, run existing generator entrypoint, inspect generated diff. Begin `client.Tx(ctx)`, perform all calls through `tx`/`tx.Client()`, pass request context to `Save`/query, explicitly finalize. Map known domain/not-found/constraint errors; not every constraint error means P's duplicate conflict. [ECG][EX][ED]
- **Lifetime delta:** standard Ent SQL driver delegates to `database/sql.BeginTx`; its context spans transaction and cancellation triggers SQL rollback, unlike native pgx. Ent `Commit()`/`Rollback()` take no context and generated hooks receive stored transaction context. Transaction driver is not goroutine-safe. Prefer materialized DTO result; after commit, transaction-created entity needs `Unwrap()` once before further edge queries; ordinary/already-unwrapped entity panics. [ED][EX][EU]
- **Tools / ownership:** existing pinned `go generate ./ent` only if assigned generation inputs change; generated builders/client/Tx/predicates owned by generator. Charlie owns builder composition, DTOs and assigned policy bodies; applying migrations belongs supplied rollout work, not code generation. [ECG]
- **Latitude / blocker / checks:** choose generated predicates/traversal inside prescribed policies; block missing tenant policy, driver semantics or required generation feature. Propose D1–D2/C1 on supplied PostgreSQL, including foreign-project relationship and registered policy path. SQLite-only examples do not establish this dialect's behavior.

### 6. Request lifetime and scoped implementation checks
- **Apply / non-trigger:** assigned I/O path, bounded fan-out, cancellation repair or regression tests; negative: unrelated CPU-only helper does not justify adding `errgroup`, concurrency or broad suite work.
- **Supplied:** request/dependency deadlines, cancellation/error behavior, cleanup budget, child-operation ownership/concurrency limits, existing test seams/DB fixture and exact package/test targets. Repair additionally supplies diagnosis/reproducer; feature supplies desired lifetime behavior.
- **Steps:** propagate standard context through service/repository/downstream HTTP calls; derive timeouts and defer cancel. Join request-local goroutines before return; keep framework contexts/writer out of workers. If independent pre-transaction reads require fan-out, use supplied `errgroup.WithContext`, set limit before launch, pass derived context, `Wait`; start transaction afterward with still-live parent. Successful `Wait` cancels group context; Ent stores Begin context, so changing context for later work cannot rescue transaction begun under that canceled context. Never parallelize one native connection/Ent transaction merely because pool is concurrent. [Greq][GC][SYNC][EX]
- **Tools / ownership:** existing `testing`, `httptest.NewRecorder`, `httptest.NewServer`, channel barriers and disposable PostgreSQL fixture; scoped `gofmt`, `go vet`, `go test -count=1`, conditional `-race` for assigned concurrency. Manual service/test changes; no generated artifacts. Commands are proposed, not run.
- **Latitude / blockers:** deterministic fixtures and local cleanup implementation are Charlie's judgment. Detached jobs, shared-work lifetime, unknown retry semantics or missing real-driver fixture return to owner. Server request context ends on disconnect/cancel or `ServeHTTP` return; copying request/context does not create durable job lifetime. [Greq]
- **Proposed checks:** C1 plus assigned H/D cases. `httptest.NewRequest` starts with background context; direct recorder invocation does not emulate server's automatic return/disconnect cancellation. Explicitly cancel attached context for propagation tests; use real `httptest.Server` for network-lifetime claim. Record skipped/missing-fixture coverage separately from observed checks. [Gtest][Greq]

## Proposed assigned behavior checks — not execution results

| ID | Positive control + rejection/failure observation |
|---|---|
| H1 | Through actual selected router and middleware, valid JSON with priority `0` returns exact 201 DTO and both rows visible from another connection after commit. This prevents reject-all handlers satisfying negative cases. |
| H2 | Missing/null priority, out-of-range priority, blank/overlong title, malformed/extra JSON, unknown field, wrong media type and oversized body produce P's exact status/envelope and no service write. Exercise codec and binder actually configured, not substitute decoder. |
| H3 | Same-tenant project succeeds; missing principal gives 401; foreign/missing project gives 404. Body/query tenant/project spoof cannot redirect operation. Use actual assigned principal middleware seam and prove downstream writes stopped. |
| D1 | Successful task/audit commit; force audit insert failure after task insert using existing DB fixture/error seam, then observe neither row from fresh connection. Duplicate named constraint gives 409 and no extra audit. Commit failure must never produce 201. |
| D2 | Two tenants with comparable project/task fixtures: inspect stored tenant/project relationship and rows left unchanged in other tenant. Route-to-repository test must exercise actual selected SQL/builders/privacy hooks, not duplicate predicates in test. |
| C1 | Coordinate work with channels; cancel actual repository query blocked by PostgreSQL lock held on separate fixture control connection. Assert exit within supplied budget and neither insert after pre-commit cancellation. Single-slot pool fixture must reacquire sole slot within cleanup budget; spare connections cannot hide unreleased transaction. Live success control still commits. Network disconnect test proves server-derived cancellation; recorder-only test proves explicit propagation. Assigned concurrency uses scoped race check and bounded joins, not arbitrary sleeps. |

Proposed test-strength controls, where assigned: omit tenant predicate, route first task insert through outer pool/client, or replace request context with background context in disposable implementation fixture; respective H3/D2, D1 or C1 must fail. These are scoped implementation checks, not independent review or a new CI gate.
Suggested selection examples: supplied chi + sqlc feature → cards 1/4 plus common Go and required lifetime checks; Gin + Ent → 2/5; Echo v4 + native pgx → v4 half of 3/4. Repository-only SQL change → 4, no transport recipe. Incidental Echo import in another component → no Echo selection. Undecided stack → owner input, not Charlie discovery.

## Content extraction and task-mode boundary

- **Common Go:** standard-context propagation, cancellation/cleanup ownership, presence versus zero, explicit DTO/domain conversion, `errors.Is`/`errors.As`, response after successful commit, bounded goroutine ownership, actual-implementation scoped tests, generated/manual ownership. Keep contract-specific status codes and budgets in assignment.
- **Framework references:** route syntax/parameter extraction, middleware flow and order, binding versus validation, response/error commitment, pooled-context rules, Gin fallback/codec flags, Echo major-version signatures and timeout mapping. Select by supplied component/version, not repository dependency inventory.
- **Data references:** native pgx versus `database/sql` lifetime, sqlc config/null types/query regeneration/`WithTx`, Ent builders/transactional client/privacy registration/`Unwrap`/generator matching. Reuse across transport families; do not duplicate Gin×Ent, Echo×sqlc, etc.
- **Task mode:** feature implements behavior and derives SQL/builders; repair consumes diagnosis and adds assigned regression; refactor preserves supplied external behavior/interfaces; generated-refresh changes authoritative inputs and reviews generated diff. None selects storage/framework, expands grants or performs independent review. Lifetime card is cross-cut implementation guidance, not new execution owner.
- **Authorship order:** common Go contract first, transport/data version references next, narrow task-mode recipes last. This report is **researched only**; cards are design proposals, not installed/exercised skills or native loader inheritance.

## Primary source ledger

[brief]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/skill-variants-plan.md
[R31]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/31-typed-sql.md
[R37]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/37-go-code.md
[G22]: https://go.dev/doc/go1.22#enhanced_routing_patterns
[Greq]: https://github.com/golang/go/blob/go1.27.1/src/net/http/request.go
[Gtest]: https://github.com/golang/go/blob/go1.27.1/src/net/http/httptest/httptest.go
[GC]: https://go.dev/doc/database/cancel-operations
[CHI]: https://github.com/go-chi/chi/blob/v5.3.2/README.md
[CT]: https://github.com/go-chi/chi/blob/v5.3.2/middleware/timeout.go
[GIN]: https://github.com/gin-gonic/gin/blob/v1.12.0/context.go
[GENGINE]: https://github.com/gin-gonic/gin/blob/v1.12.0/gin.go
[GJSON]: https://github.com/gin-gonic/gin/blob/v1.12.0/binding/json.go
[E4]: https://github.com/labstack/echo/blob/v4.13.4/echo.go
[E5]: https://github.com/labstack/echo/blob/v5.4.0/echo.go
[EB4]: https://github.com/labstack/echo/blob/v4.13.4/bind.go
[EB5]: https://github.com/labstack/echo/blob/v5.4.0/bind.go
[EBdoc]: https://echo.labstack.com/guide/binding/
[ET]: https://github.com/labstack/echo/blob/v5.4.0/middleware/context_timeout.go
[PG]: https://github.com/jackc/pgx/blob/v5.8.0/tx.go
[PP]: https://github.com/jackc/pgx/blob/v5.8.0/pgxpool/tx.go
[SC]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/examples/authors/postgresql/db.go
[SCP]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/docs/guides/using-go-and-pgx.rst
[SCLI]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/docs/reference/cli.md
[ECG]: https://github.com/ent/ent/blob/v0.14.6/doc/md/code-gen.md
[EX]: https://github.com/ent/ent/blob/v0.14.6/examples/traversal/ent/tx.go
[ED]: https://github.com/ent/ent/blob/v0.14.6/dialect/sql/driver.go
[EU]: https://github.com/ent/ent/blob/v0.14.6/examples/traversal/ent/user.go
[SYNC]: https://github.com/golang/sync/blob/v0.23.0/errgroup/errgroup.go
