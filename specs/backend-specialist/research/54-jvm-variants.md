# R54 — JVM backend skill variants

Research date: 2026-10-04. Evidence: primary vendor documentation, tagged source, release metadata; source-only findings. All implementation, generation, compilation and behavior checks below **proposed / UNEXECUTED**. Status: researched; runtime skills not installed or exercised.

Metadata worktree HEAD verified with `git rev-parse HEAD`: `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`. Frozen source worktree returned same HEAD.
Frozen contract read: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/skill-variants-plan.md`.
Prior source lead read: same directory, `40-jvm-dotnet.md`; retain jOOQ generated/manual distinction. Frozen plan governs discretion: public contracts need specification; private helper signatures and every query do not.

## Selection, ownership and supplied packet

- Select from supplied component facts: assigned behavior/task mode → actual HTTP execution model → persistence/transaction model → Java/Kotlin overlay → exact resolved versions. Incidental WebFlux dependency, `WebClient`, `Mono` return or Kotlin source alone cannot select reactive server/persistence.
- Caller supplies change scope, public API/DTO/error contract, domain invariants, tenant/auth inputs, schema revision, concurrency/isolation/rollback/retry/cancellation policy and affected call sites. Repair additionally needs supplied diagnosis; new feature does not need invented diagnosis.
- Caller supplies allowed files, existing architecture, JDK/compiler/build wrapper, resolved Boot/Framework/Data/provider/driver/DB pins, transaction manager/proxy mode, validation mode and relevant compiler plugins. Generator edition/config/output ownership needed only when applicable.
- Caller supplies prepared dependencies/DB fixtures, working directory, assigned check commands and artifact destinations. The backend specialist implements, runs assigned checks when authorized, and corrects scoped coding mistakes. Discovery, diagnosis, stack selection, architecture/grant changes and independent review stay with upstream owners; host enforces authorization.
- The backend specialist chooses local helper decomposition, query predicates/joins/projections, DTO mapping and sequencing within supplied semantics. Missing transaction/resource ownership, required prepared dependency or conflicting contract is upstream blocker—not license to investigate, adopt framework or invent policy.

## Version/evidence boundary

Vendor `/releases/latest` observations on research date; links pin returned tags. These identify source evidence, not independently compatible upgrade bundle.

| Family | Current observed vendor tag / documentation pin |
| --- | --- |
| Spring | [Framework v7.0.9](https://github.com/spring-projects/spring-framework/releases/tag/v7.0.9), [Boot v4.1.1](https://github.com/spring-projects/spring-boot/releases/tag/v4.1.1), both 2026-08-20; Spring references below pinned to source tags. |
| Relational data | [Spring Data JPA 4.0.7](https://github.com/spring-projects/spring-data-jpa/releases/tag/4.0.7), [Relational/R2DBC 4.0.7](https://github.com/spring-projects/spring-data-relational/releases/tag/4.0.7), 2026-08-21; [Hibernate ORM 7.4.12](https://github.com/hibernate/hibernate-orm/releases/tag/7.4.12), 2026-10-04. |
| SQL generation | [jOOQ version-3.21.9](https://github.com/jOOQ/jOOQ/releases/tag/version-3.21.9), 2026-09-25; manual branch **3.21**, generator example explicitly **3.21.9**. |
| Reactive/Kotlin | [Reactor v3.8.7](https://github.com/reactor/reactor-core/releases/tag/v3.8.7), 2026-08-24; [Kotlin v2.4.20](https://github.com/JetBrains/kotlin/releases/tag/v2.4.20), 2026-09-07; [kotlinx.coroutines 1.11.0](https://github.com/Kotlin/kotlinx.coroutines/releases/tag/1.11.0), 2026-05-08. |
| Contrast only | [Quarkus 3.40.1](https://github.com/quarkusio/quarkus/releases/tag/3.40.1), 2026-09-30; [Micronaut v5.2.13](https://github.com/micronaut-projects/micronaut-core/releases/tag/v5.2.13), 2026-10-02. |

Boot **4.1.1** actually pins Framework **7.0.9**, Kotlin **2.3.21**, coroutines **1.10.2**, jOOQ **3.21.7**, Hibernate **7.4.5.Final** in inspected [properties][boot-pins]/[dependency declarations][boot-bom]. Preserve caller's resolved versions; latest vendor versions above do not authorize overrides. Older target requires matching reference/API availability. Spring 6/7 examples use Jakarta validation/persistence namespaces.

## Same assigned endpoint; implementation changes

Illustrative supplied contract: `POST /orders`, existing single DB, positive quantity; atomically decrement available stock and insert order plus lines. Supplied concurrency policy prevents oversell. Return `201` with detached order/line DTO; malformed/invalid input `400`, unavailable/cross-tenant SKU `404`, insufficient stock `409`; write failure rolls back entire unit. Caller fixes exact error body, transaction policy and allowed files. This is comparison fixture, not new application assignment.

| Selected component | Concrete implementation of same contract | Instruction that transfers badly |
| --- | --- | --- |
| MVC + JPA | Synchronous controller → externally invoked transactional service → stock/order/line work → initialize required fields and map DTO inside persistence lifetime → response after service transaction completes. | Returning lazy entity graph and relying on HTTP serialization or test transaction to keep session open. |
| MVC + jOOQ/JDBC | Generated fields → explicit stock update and inserts using supplied transaction-aware DSL/connection → check affected rows → explicit DTO mapping. | Assuming generated DAO supplies business atomicity, tenant predicates or JPA dirty checking. |
| WebFlux + R2DBC | Return composed `Mono` covering both writes and DTO; enclosing reactive transaction owns same subscriber-context connection; HTTP adaptation follows transaction outcome. | JDBC `@Transactional` around publisher construction, `.block()`, detached `.subscribe()`, or fresh raw connection per query. |
| Kotlin + R2DBC | Sequential suspending calls inside `executeAndAwait`, or existing supported proxied suspending transaction; adapt empty/single/multiple results deliberately. | Treating `suspend` as conversion of JPA/JDBC into non-blocking IO or automatic thread-local transaction propagation. |
| Approved WebFlux → blocking bridge | Defer entire proxied blocking service call onto supplied worker; transaction starts and completes there; return detached DTO. | Start transaction on event loop, then move individual repository calls elsewhere; assume HTTP cancellation guarantees JDBC rollback. |

## Variant cards

### C1 — Spring MVC + JPA unit of work; Java or synchronous Kotlin
- **Trigger / non-trigger:** supplied Servlet MVC endpoint with existing JPA persistence. Not selected by Java/Kotlin alone, WebClient usage, or reactive R2DBC endpoint.
- **Provided scope/behavior/versions:** shared packet plus entity relationships, fetch/OSIV policy, repository contracts, `JpaTransactionManager` or specified JTA manager, proxy mode, provider version and rollback rules; evidence Framework 7.0.9, Data JPA 4.0.7, Hibernate 7.4.12.
- **Steps:** (1) bind/validate request and call existing service through transaction proxy; (2) implement stock mutation and order/line persistence as one unit using supplied locking policy; (3) fetch/map required response fields while session usable, then translate failed transaction into supplied HTTP error.
- **Boundary:** default Spring proxy mode intercepts external calls only. Self-invocation adds no new transaction advice; existing outer transaction may still apply. Repository CRUD transactions do not make multiple calls one atomic unit. Default annotation rollback covers `RuntimeException`/`Error`, not checked exceptions; supplied overrides/global policy govern. [Proxy rules][tx-proxy], [repository boundaries][jpa-tx].
- **Generated/manual:** Spring repository implementations/proxies are framework infrastructure; entities, service orchestration, fetch plan and DTO/error mapping remain manual. Existing mapping/metamodel processor output remains generated-owned; no adoption needed. Lazy access after session closes can fail; OSIV can conceal that boundary, not extend original transaction. [Lazy lifetime][lazy], [OSIV][osiv].
- **Tools / artifacts / assigned check:** existing wrapper + JUnit + MockMvc (MockMvcTester only eligible versions). `OrderJpaContract`: successful detached serialization, forced second-write failure with unchanged stock/orders, actual flush/clear and fresh-transaction verification. Return source diff, HTTP fixtures, DB assertions and check log.
- **Local freedom / blocker:** choose helper/query/fetch shape within existing persistence model; caller need not prescribe JPQL. Missing locking/rollback policy or required proxy/plugin setup blocks affected work; do not enable OSIV or change architecture to hide failure.

### C2 — Spring MVC + jOOQ/JDBC typed SQL
- **Trigger / non-trigger:** supplied JDBC/jOOQ component and schema-bound SQL task; optional assigned regeneration. Not JPA, not generic Java, not non-blocking merely because jOOQ query implements `Publisher`.
- **Provided scope/behavior/versions:** shared packet plus generated schema revision, converters/naming/output directory, actual JDBC transaction owner, jOOQ runtime/codegen/plugin versions, artifact edition/JDK/DB compatibility; inspected vendor 3.21.9/manual 3.21, Boot 4.1.1 default 3.21.7.
- **Steps:** (1) consume generated table/field API, regenerate only if assigned using prepared configuration; (2) implement bound tenant/stock predicates, affected-row checks, inserts and DTO projection; (3) keep all operations inside existing Spring transaction or supplied jOOQ callback model. In callback model use transaction-derived `Configuration`/`trx.dsl()`, not unrelated outer DSL. [Generation][jooq-gen], [transactions][jooq-tx].
- **Boundary:** Spring-integrated JDBC uses transaction-aware connection. jOOQ callback API rolls back uncaught checked or unchecked exceptions; Spring annotation rules differ. Preserve chosen mechanism. `transactionPublisher` with real R2DBC is distinct from JDBC callbacks; publisher wrapper over JDBC still blocks. [Reactive fetching][jooq-reactive].
- **Generated/manual:** generator owns tables, fields, records and requested POJOs/DAOs; the backend specialist owns SQL semantics, resource scope, tenant filtering, conversions and error mapping. Typed columns prove neither live schema match nor business invariants.
- **Tools / artifacts / assigned check:** prepared `./mvnw -o generate-sources` or existing Gradle codegen task, only when assigned; compiler plus actual selected DB. `OrderJooqContract`: atomic success/rollback, cross-tenant exclusion, zero-row stock conflict; assigned renamed-column fixture must make regenerated old-field caller fail compilation. Capture schema pin, generated diff, compiler diagnostic, DB assertions.
- **Local freedom / blocker:** choose SQL shape, joins and helpers within contract; no caller-written query required. Missing schema snapshot, generated ownership, edition compatibility or transaction-aware connection wiring blocks affected step; no hand-editing generated files or inventing replacement stack.

### C3 — Spring WebFlux + Spring Data R2DBC / DatabaseClient
- **Trigger / non-trigger:** supplied WebFlux component with existing R2DBC driver and reactive transaction design. Not MVC returning `Mono`, JDBC/JPA, or mere presence of reactive dependency.
- **Provided scope/behavior/versions:** shared packet plus reactive repository/template API, `ConnectionFactory`, `R2dbcTransactionManager`, Reactor/driver pins, empty-result and cancellation semantics; inspected Framework 7.0.9, Data R2DBC 4.0.7, Reactor 3.8.7.
- **Steps:** (1) build lazy sequential write chain with `flatMap`/`then`, using explicit row-count/empty-result handling; (2) enclose whole unit with supplied `TransactionalOperator` or supported proxied reactive `@Transactional`; (3) map supplied failures after transaction sees error, return chain for framework subscription. Avoid swallowing write errors inside transaction into success. [Entity operations][r2dbc-ops], [reactive transactions][tx-operator].
- **Boundary:** reactive transaction binds connection to subscriber context, not thread identity. `DatabaseClient` uses transaction-aware lookup; direct `ConnectionFactory.create()` can bypass it. Same pipeline may change scheduler while retaining context; detached subscription is separate scope. Cancellation rolls back Spring reactive transactions; full multi-value transactional output must be consumed for completion. [Manager source][r2dbc-tm], [context contract][tx-context].
- **Generated/manual:** existing repository proxy/mapping infrastructure supplies access plumbing; the backend specialist supplies write order, explicit persistence operations, row/DTO mapping and validation/error logic. R2DBC is not JPA dirty checking/lazy association traversal.
- **Tools / artifacts / assigned check:** WebTestClient, Reactor StepVerifier, existing JUnit/DB harness. `OrderReactiveContract`: completion commits both writes; injected error or cancellation after first write/before second leaves neither effect; scheduler-hop case preserves unit. Verify through separate connection after termination/cleanup; capture terminal signals, HTTP fixtures and DB state.
- **Local freedom / blocker:** choose operator/helper/query composition under supplied concurrency and transaction policy. Missing R2DBC setup, transaction owner or required bridge policy goes upstream. If supplied jOOQ/R2DBC integration already exists, apply C2 generated boundary plus its approved reactive connection/transaction mechanism; do not assume JDBC starter wiring covers it.

### C4 — Kotlin coroutine adaptation overlay
- **Trigger / non-trigger:** caller-selected suspending/Flow API over existing reactive component. Kotlin syntax alone does not select coroutine recipe; synchronous Kotlin MVC/JPA follows C1/C2.
- **Provided scope/behavior/versions:** selected base card plus compiler/plugin/JVM target, Kotlin/coroutines/reactor bridge pins, `T` versus `T?`/empty mapping and validation annotation targets. Evidence Kotlin 2.4.20, coroutines 1.11.0, Spring 7.0.9; actual Boot-managed pins differ as above.
- **Steps:** (1) adapt `Mono<Void>`→suspending `Unit`, `Mono<T>`→`T` or `T?`, `Flux<T>`→`Flow<T>` as contract requires; (2) perform dependent DB calls sequentially inside supplied `TransactionalOperator.executeAndAwait`, or apply `Flow.transactional` when stream contract requires it; (3) propagate errors/cancellation through boundary and map returned DTO. [Coroutine reference][coroutines], [extension implementation][coroutine-tx].
- **Boundary:** Spring 7.0.9 `TransactionAspectSupport` explicitly adapts suspending functions when selected manager is reactive; do not claim suspending `@Transactional` universally unsupported. Existing proxy path still matters. Coroutine/Reactor adapters propagate `ReactorContext`; that is not propagation of JPA's thread-local session. Avoid `runBlocking`, detached scope or parallel DB calls that escape supplied resource policy. [Interceptor][suspend-tx], [context adapter][reactor-context].
- **Generated/manual:** compiler/plugin-generated bridges/open classes remain build-owned; the backend specialist owns Kotlin DTOs, nullability, annotation use sites, adaptation and service code. Prepared `kotlin-spring`/entity support and JSON module are supplied facts, not additions the backend specialist makes. Kotlin 2.2+ annotation-target defaults require version-aware validation; explicit field/getter targets follow existing model. [Boot Kotlin][boot-kotlin].
- **Tools / artifacts / assigned check:** existing Kotlin/JUnit coroutine harness and selected HTTP client. `OrderCoroutineContract`: real suspension between writes, failure/cancellation rollback, empty-result mapping, invalid field and missing/null JSON fixtures. Proxied annotation variant must be exercised via actual bean. Return Kotlin diff, fixture results and DB evidence.
- **Local freedom / blocker:** choose suspend helpers and idiomatic null handling; keep private APIs local. Missing compatible bridge/plugins or ambiguous empty/cancellation policy blocks adaptation; caller need not supply every helper or await expression.

### C5 — Already-designed async boundary around blocking persistence
- **Trigger / non-trigger:** caller already assigned WebFlux→blocking service bridge or MVC async `Callable` path, preserving existing JPA/JDBC architecture. Not permission to introduce bridge, move work into background job or migrate persistence.
- **Provided scope/behavior/versions:** C1/C2 pins plus HTTP model, approved executor/scheduler and admission limits, request context inputs, timeout/cancel/commit semantics; Reactor evidence 3.8.7, Spring 7.0.9.
- **Steps:** defer whole call as `Mono.fromCallable(() -> service.place(input)).subscribeOn(approvedScheduler)` for assigned WebFlux bridge; MVC `Callable` invokes same proxied service inside configured async executor. Transaction begins inside worker call, includes DTO materialization, and completes before result crosses boundary. [Reactor recipe][blocking], [MVC async][mvc-async].
- **Boundary:** thread-bound transaction does not propagate to newly started threads. `Mono.just(service.place(input))` executes eagerly before scheduling; method annotation around returned future/callable does not extend imperative transaction over deferred body. Reactive cancellation alone cannot promise rollback of already-running JDBC work. [Transaction contract][tx-context], [execution models][execution].
- **Generated/manual:** reuse generated persistence artifacts from C1/C2; adapter, context inputs and outcome mapping remain manual. Scheduling does not generate transaction or delivery guarantees.
- **Tools / artifacts / assigned check:** existing WebTestClient or MockMvc async-dispatch harness, worker fixture and actual DB. `OrderBridgeContract`: WebFlux does no work before subscription; MVC completes through assigned async-dispatch path. Both require DB work on assigned worker, rollback on injected service failure, detached DTO serialization and supplied timeout/cancel/commit behavior. Capture worker/subscription observations, HTTP completion and DB evidence.
- **Local freedom / blocker:** choose small adapter/helper shape. Missing worker capacity/context/cancellation policy or need to change ownership is upstream blocker; adding `@Async` is not local transaction repair.

## Validation/error and test-scope deltas

- MVC individual `@Valid` body failure: `MethodArgumentNotValidException`; WebFlux: `WebExchangeBindException`. Direct method constraints can yield `HandlerMethodValidationException` in both. Built-in method validation arrived in Framework **6.1**; controller class-level `@Validated` instead selects AOP validation. Preserve supplied mode rather than blanket annotation edits. [MVC][mvc-validation], [WebFlux][flux-validation].
- `HandlerMethodValidationException` uses **400 for input, 500 for return-value validation**; do not flatten both into client error. Binding/deserialization failures also need supplied mapping. Use stack-specific advice/`ResponseEntityExceptionHandler`; emit `ProblemDetail` only when assigned contract uses it. [Status source][validation-status], [MVC errors][mvc-errors], [WebFlux errors][flux-errors].
- `MockMvcTester` source says **`@since 6.2`**: minimum **Spring Framework 6.2**, not “Boot 3.2+”. Also requires AssertJ. Test client alone does not identify server: WebTestClient can exercise MVC through `MockMvcWebTestClient` adapter or actual server; bind to supplied stack. [Tester source][mockmvc-tester], [client setup][webtestclient].
- Spring TestContext `@Transactional` requires `PlatformTransactionManager` and binds test thread; it does not automatically enclose reactive execution. Synchronous MockMvc/service tests can inherit ambient test transaction and hide missing production boundary. Flush/clear ORM state; verify commit/rollback with service invoked outside ambient transaction and fresh connection. [Test transaction source][test-tx].
- `RANDOM_PORT`/`DEFINED_PORT` HTTP client/server execute separately; test rollback does not undo server commits. Prepared fixture cleanup required. Controller slice or mocked repository checks cannot establish database atomicity or lazy lifetime. [Boot testing][boot-tests].

## Assigned selection/behavior checks — all UNEXECUTED

| Case | Positive selection/control | Negative selection or deliberately broken implementation |
| --- | --- | --- |
| C1 | Supplied MVC + JPA selects C1; real proxy call commits complete order. | WebClient dependency does not select C3. Move only transaction annotation to self-called method; invoke without ambient transaction. Prepared fixture with individually transactional repository writes must expose partial commit; other designs must still fail success/atomicity checks. |
| C2 | Supplied schema + JDBC DSL selects C2; both writes participate. | Publisher interface does not prove R2DBC. Use unrelated transaction connection or stale generated field: assigned DB/compiler check must reject. |
| C3 | WebFlux + R2DBC selects C3; same chain survives scheduler hop. | MVC + `Mono` alone does not select C3. Remove enclosing reactive transaction or detach second subscription: rollback/cancel fixture must fail. |
| C4 | Supplied suspending R2DBC service composes C3+C4; actual suspension preserves atomicity. | Kotlin JPA does not trigger reactive overlay. Wrong annotation use site must be caught by invalid-input fixture; detached coroutine mutation must break atomicity check. |
| C5 | Explicit predesigned bridge composes C1/C2+C5; worker and complete service transaction observed. | Unspecified execution policy blocks bridge. Eager `Mono.just(...)` must fail no-work-before-subscription/worker check. |
| Version/test scope | Framework 6.2+ plus existing AssertJ permits MockMvcTester; live HTTP result checked after transaction. | “Boot 3.2+” label alone insufficient. Framework 6.1 uses assigned MockMvc API; outer test rollback must not be accepted as endpoint rollback evidence. |
| Shared endpoint | Two requests race for last stock unit: one `201`, one `409`, stock zero, one complete order. Invalid input yields prescribed `400` before writes. | Missing tenant predicate exposes foreign SKU; lost concurrency guard oversells. Assigned return-constraint failure maps to `500`; response failure alone must not be treated as proof of DB rollback. |

Future execution uses caller-provided module directory and existing wrapper/check tasks; e.g. prepared Maven `./mvnw -o -Dtest=OrderJpaContract test` or Gradle `./gradlew --offline :component:test --tests '*OrderReactiveContract'` after substituting actual assigned module/tests. These are templates, not commands executed here. Record version/schema pins, actual selected tests, terminal outcomes, expected negative diagnostics and artifact paths; skipped/unselected tests supply no behavior evidence.

## Concise existing-stack contrasts and extraction

- **Quarkus 3.40.1:** ArC explicitly supports intercepted self-invocation, unlike Spring default proxy semantics. Its Narayana `@Transactional` reactive-return support waits for terminal result before transaction ends. Consume only for caller-selected Quarkus transaction model; Spring self-call workaround cannot be copied blindly. [ArC][quarkus-self], [JTA/reactive guide][quarkus-tx].
- **Micronaut 5.2.13:** Netty controller work defaults to event-loop thread; existing `@ExecuteOn` selects worker for blocking JPA/JDBC. Pinned guide also says selected executor is coroutine resume dispatcher. MVC's request-thread blocking assumption is wrong here. [Primary guide][micronaut-threads].
- **Extract shared scope guidance first:** supplied behavior/versions/resources, the backend specialist's local judgment and assigned evidence contract. Share Spring proxy/rollback guidance across C1/C2; retain persistence-specific sections for lazy state, SQL generation and connection ownership.
- **Framework references:** MVC/WebFlux validation, transaction context and test-scope rules; JPA/jOOQ/R2DBC persistence leaves. **Language overlay:** C4 Kotlin/nullability/coroutines. **Narrow task recipe:** C5 approved async bridge plus atomic-endpoint fixture. Compose from supplied facts; avoid Cartesian-product duplication or treating descriptive card metadata as implemented loader/router/permission system.

## Primary source register

[tx-proxy]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/data-access/transaction/declarative/annotations.adoc
[tx-context]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-tx/src/main/java/org/springframework/transaction/annotation/Transactional.java
[jpa-tx]: https://github.com/spring-projects/spring-data-jpa/blob/4.0.7/src/main/antora/modules/ROOT/pages/jpa/transactions.adoc
[lazy]: https://github.com/hibernate/hibernate-orm/blob/7.4.12/hibernate-core/src/main/java/org/hibernate/LazyInitializationException.java
[osiv]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-orm/src/main/java/org/springframework/orm/jpa/support/OpenEntityManagerInViewInterceptor.java
[jooq-gen]: https://www.jooq.org/doc/3.21/manual/code-generation/codegen-execution/codegen-maven/
[jooq-tx]: https://www.jooq.org/doc/3.21/manual/sql-execution/transaction-management/
[jooq-reactive]: https://www.jooq.org/doc/3.21/manual/sql-execution/fetching/reactive-fetching/
[r2dbc-ops]: https://github.com/spring-projects/spring-data-relational/blob/4.0.7/src/main/antora/modules/ROOT/pages/r2dbc/entity-persistence.adoc
[r2dbc-tm]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-r2dbc/src/main/java/org/springframework/r2dbc/connection/R2dbcTransactionManager.java
[tx-operator]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/data-access/transaction/programmatic.adoc
[coroutines]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/languages/kotlin/coroutines.adoc
[coroutine-tx]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-tx/src/main/kotlin/org/springframework/transaction/reactive/TransactionalOperatorExtensions.kt
[suspend-tx]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java
[reactor-context]: https://github.com/Kotlin/kotlinx.coroutines/blob/1.11.0/reactive/kotlinx-coroutines-reactor/src/ReactorContext.kt
[boot-kotlin]: https://github.com/spring-projects/spring-boot/blob/v4.1.1/documentation/spring-boot-docs/src/docs/antora/modules/reference/pages/features/kotlin.adoc
[mvc-validation]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webmvc/mvc-controller/ann-validation.adoc
[flux-validation]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webflux/controller/ann-validation.adoc
[validation-status]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-web/src/main/java/org/springframework/web/method/annotation/HandlerMethodValidationException.java
[mvc-errors]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webmvc/mvc-ann-rest-exceptions.adoc
[flux-errors]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webflux/ann-rest-exceptions.adoc
[mockmvc-tester]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-test/src/main/java/org/springframework/test/web/servlet/assertj/MockMvcTester.java
[webtestclient]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/testing/webtestclient.adoc
[test-tx]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/testing/testcontext-framework/tx.adoc
[boot-tests]: https://github.com/spring-projects/spring-boot/blob/v4.1.1/documentation/spring-boot-docs/src/docs/antora/modules/reference/pages/testing/spring-boot-applications.adoc
[blocking]: https://github.com/reactor/reactor-core/blob/v3.8.7/docs/modules/ROOT/pages/faq.adoc
[execution]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webflux/new-framework.adoc
[mvc-async]: https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webmvc/mvc-ann-async.adoc
[quarkus-self]: https://github.com/quarkusio/quarkus/blob/3.40.1/docs/src/main/asciidoc/cdi-reference.adoc
[quarkus-tx]: https://github.com/quarkusio/quarkus/blob/3.40.1/docs/src/main/asciidoc/transaction.adoc
[micronaut-threads]: https://github.com/micronaut-projects/micronaut-core/blob/v5.2.13/src/main/docs/guide/httpServer/reactiveServer.adoc
[boot-pins]: https://github.com/spring-projects/spring-boot/blob/v4.1.1/gradle.properties
[boot-bom]: https://github.com/spring-projects/spring-boot/blob/v4.1.1/platform/spring-boot-dependencies/build.gradle
