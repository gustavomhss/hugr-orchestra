# R19 — Backend correctness: small controls, hard evidence

Research date: 2026-10-03. Product premise supplied by user: Charlie operates independently inside OpenCode/Orchestra, with native shared Atlas Knowledge/Memory.

## Decision

Give Charlie change-triggered workflows: identify invariant, locate enforcement boundary, choose smallest control, exercise failure, retain evidence. Ordinary CRUD starts with database constraints, scoped authorization, explicit API contract, and focused integration tests. Add durable idempotency when duplicate intent matters; add durable jobs/outbox when committed work must survive process failure and cross an asynchronous boundary.

Primary documentation establishes guarantees below. Proposed mechanisms, agent failure scenarios, and cost judgments are research synthesis. Scenarios were not executed; agent-specific failure prevalence and tool performance were not measured. Costs describe implementation/operating burden, not benchmark timings. Versioned PostgreSQL 18, OpenAPI 3.1.1, and ASVS 5.0.0 references are intentional; installed versions remain current-fact checks. Live tool documentation reflects retrieval date.

## 1. SQL transactions protect only invariants their isolation and constraints actually enforce

**Primary evidence.** PostgreSQL 18 [§13.2.1–13.2.3, Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED): successive `SELECT`s under default Read Committed can see different committed data; Repeatable Read still permits serialization anomalies; Serializable can abort with SQLSTATE `40001`, requiring whole-transaction retry. [§5.5.1 and §5.5.3, Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS): `CHECK` accepts true **or NULL**, cross-row `CHECK` expressions cannot establish lasting consistency, and ordinary uniqueness treats NULLs as distinct.

**Applicability trigger.** Concurrent writers touch stock, balances, quotas, uniqueness, reservation state, or rules spanning rows. Agent edits read-modify-write code or changes transaction isolation.

**Agent failure.** Wrap `SELECT → decide → UPDATE` in transaction and declare race fixed. Sequential tests pass while concurrent requests both reserve last item. Snapshot consistency gets mistaken for serial execution; app-side uniqueness checks race.

**Smallest mechanism / tool judgment.**

- Put local invariants in `NOT NULL`, `CHECK`, `UNIQUE`, foreign-key, or exclusion constraints where expressible. Choose NULL semantics deliberately; preserve tenant scope in relevant keys/references.
- Prefer atomic conditional write for single-row decisions: `UPDATE inventory SET available = available - $3 WHERE tenant_id = $1 AND sku = $2 AND available >= $3 RETURNING available`, with positive quantity validation and nonnegative, non-null storage. Returned row determines admission.
- For cross-row rules, choose explicit locking of a shared existing guard row, or Serializable with bounded whole-transaction retry. Locking only matching rows does not protect a missing-row predicate. Every participating writer must follow chosen protocol.
- PostgreSQL supplies strong, testable mechanisms; ORM transaction syntax does not select correct invariant or isolation. Keep irreversible remote calls outside any automatically replayed transaction body; see finding 3.

**Failure/control scenario.** Use real PostgreSQL, separate connections, explicit synchronization. Start with stock one; race two distinct reservations. Assert one accepted reservation and stock zero—not merely nonnegative stock. Known-bad control: replace conditional decrement with stale read-then-set; both callers can report success while stock still ends at zero. For cross-row admission, force write-skew schedule and verify abort/re-evaluation preserves rule. Record actual outcomes and SQLSTATEs.

**Cost.** Low for constraint plus atomic statement and focused concurrent test. Medium for shared locks/Serializable: contention, abort handling, and retry work. Scope stronger isolation to invariant-bearing operations.

**Atlas memory.** Keep invariant, competing-writer map, minimal bad schedule, chosen isolation, and SQLSTATE policy. Before reuse, inspect current SQL, constraints, server version, transaction settings, and other writers. Old “race fixed” note is a lead, not present evidence.

## 2. Safe migration is application coexistence plus data preservation, not successful DDL

**Primary evidence.** Prisma [Expand-and-contract migrations, introduction and steps 4–6](https://www.prisma.io/docs/guides/database/data-migration): retain old representation, move application, then remove old field; explicitly wait until nothing reads or writes it. Current guide targets Prisma ORM 8 and links separate version-7 guidance. Flyway [Migration transaction handling](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/migration-transaction-handling), updated 2025-09-02: normally one transaction per migration, with nontransactional exceptions. PostgreSQL 18 [CREATE INDEX, “Building Indexes Concurrently”](https://www.postgresql.org/docs/18/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY): concurrent builds require extra scans/waits, cannot run inside transaction block, and failure can leave invalid index. Same page's `IF NOT EXISTS` clause explicitly does not establish equivalent index definition.

**Applicability trigger.** Existing production data; rename/drop/type conversion; new constraint/index on busy table; rolling deployment where old/new binaries overlap.

**Agent failure.** Generate destructive rename or backfill only empty test database. New binary dual-writes but old binary still updates only old column, making backfill stale. Wrap every migration in transaction, breaking concurrent index creation. Assume down migration reconstructs discarded values.

**Smallest mechanism / tool judgment.**

1. Expand schema compatibly; state authoritative representation during overlap.
2. Make all live writers compatible. Use application transition or temporary database synchronization only where overlap requires it. Dual-writing from new binary alone cannot synchronize old writers.
3. Backfill with repeatable progress and validation. Batch when table size, locking, WAL, or replication burden warrants it; protect newer writes from stale backfill values.
4. Switch reads, verify mixed-version behavior and data invariants, retire old writers/readers, then contract in later deploy. Name last rollback-compatible release when transformation loses information.

Use existing migration runner. Flyway supplies ordered execution and transaction handling; Prisma supplies migration planning and reviewed data transforms. Neither establishes workload-specific lock budget, deployment coexistence, or mapping correctness. Review generated SQL and actual runner transaction mode. For concurrent index failure, inspect validity **and definition** before retrying; name-only existence is insufficient.

**Failure/control scenario.** Start from previous schema with representative populated rows; run old/new application paths through expand and backfill. Pause backfill, issue old-writer update, resume; verify new read preserves latest meaning. Kill backfill and resume without overwriting newer values. Hold conflicting database lock to observe timeout/recovery behavior. Known-bad controls: contract while old reader remains; remove overlap synchronization. Tests must expose each relevant break. Separate fresh-install verification from upgrade verification.

**Cost.** Medium: temporary compatibility code, extra deploy stage, data scan, cleanup ownership. Large hot tables add operating cost. Small offline changes can use straightforward transactional migration when coexistence and lock constraints are explicitly satisfied.

**Atlas memory.** Store migration sequence, data mapping, old/new compatibility matrix, rollback boundary, and prior lock failures. Re-read deployed application versions, migration history, live schema/index validity, table characteristics, and installed runner version before acting. Completion memory cannot establish current rollout completion.

## 3. Retry safety requires durable operation identity and explicit unknown outcomes

**Primary evidence.** Stripe [Idempotent requests](https://docs.stripe.com/api/idempotent_requests): same key replays saved status/body, “including `500` errors”; parameters must match; keys may be removed after at least 24 hours, with reuse after pruning treated as new request. Validation and concurrent-execution conflicts do not save an idempotent result. Malcolm Featonby, AWS Builders' Library, [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/), sections “Reducing client complexity,” “Late arriving requests,” and “Same client request ID, different intent”: caller-provided identity distinguishes intent, and token recording plus mutation must be atomic. AWS [SDK retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html#how-retries-work) documents retry classification, attempt limits, quota, and jitter; retrieved page explicitly conditions updated behavior on a 2026 opt-in.

**Applicability trigger.** Retried command can duplicate payment, provisioned resource, email, reservation, or other material effect; network timeout or crash leaves outcome uncertain.

**Agent failure.** Generate new key on each retry, deduplicate by request-body hash alone, or record key after effect. Assume timeout means failure; regenerate operation on resume. Cache response globally across tenants. Add retry wrapper around SDK retries without shared deadline.

**Smallest mechanism / tool judgment.**

- First consider natural idempotence: fixed resource identity or conditional state transition. Otherwise durably bind `(tenant/caller scope, operation, key)` to normalized request meaning and operation/result identity. Identical payloads with distinct keys can express distinct user intent; same key with different meaning must fail.
- For local database-only effects, claim key, mutate state, and store replayable result atomically under uniqueness constraint. Define concurrent in-flight behavior and retry horizon. Reauthorize before returning sensitive cached result.
- For remote effects, persist intent before call, reuse provider key across attempts/resumes, and record provider operation ID. Local DB transaction cannot roll back remote effect. Timeout after possible acceptance means **unknown**, requiring provider lookup, verified webhook, or reconciliation before fresh intent is admitted. Without provider deduplication/query support, safe automatic replay can remain unresolved.
- Prefer installed SDK's documented retry policy; inspect actual version/configuration. Bound total attempts/deadline, classify retryable errors, apply backoff with jitter, and account for nested retries. Stripe-style saved `500` is replay behavior, not evidence that effect failed or that new key is safe.

**Failure/control scenario.** Provider accepts operation; drop reply; restart caller before local completion record. Retry same intent and verify provider-side resource/effect plus local result reconcile. Concurrent same-key requests must converge; changed payload must conflict; another tenant's same textual key must stay isolated. Known-bad control: regenerate key after lost reply; effect-count assertion should catch duplicate. Include late retry beyond retained-key horizon rather than assuming permanent deduplication. Test provider adapter against supported sandbox contract as well as deterministic fault injection.

**Cost.** Low for natural idempotence; medium for durable request/result record and retention. Remote ambiguity adds reconciliation state and operating work. **Retry/resume alone never establishes end-to-end exactly-once effects.**

**Atlas memory.** Keep operation identity rules, provider contract/version, retention assumptions, and lost-reply reproducer. Re-read current provider records, local durable state, authorization, SDK settings, and key-retention policy. Memory must never answer “payment happened” in place of payment system.

## 4. Queues solve delivery boundaries; consumers still own effect correctness

**Primary evidence.** AWS [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html), “Intent,” “Issues and considerations,” and relational implementation: write business state and outbox event in same transaction; duplicates and ordering still require attention. SQS [Visibility timeout, “Understanding visibility timeout in standard and FIFO queues” and “Handling failures”](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html): unacknowledged work can become visible again. [FIFO exactly-once processing](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html) describes send deduplication within five-minute interval. [SendMessageBatch, opening contract and Response Elements](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessageBatch.html): check individual failures even on HTTP `200`.

**Applicability trigger.** Committed database change must reliably schedule later work, broker publishing can fail independently, or worker may die after doing work but before acknowledgment.

**Agent failure.** Commit order then publish notification, losing notification on crash; acknowledge before durable effect; assume FIFO prevents repeated application effects; mark whole batch sent after HTTP `200`.

**Smallest mechanism / tool judgment.**

- For local deferred work, durable job row in same database transaction may suffice, serviced by existing worker with due-work scan and bounded retries. When external broker publication must follow commit, use outbox plus relay. Choose existing queue infrastructure when present.
- Relay marks only confirmed-success entries delivered. Crash after send before mark may resend, so consumer needs stable event identity. For DB-only consumer effects, deduplication marker and business mutation commit together; acknowledge afterward. External consumer effects require finding 3's provider/reconciliation boundary.
- If business correctness depends on ordering, specify per-entity ordering/version policy; detect or defer gaps and prevent stale updates. FIFO groups and timestamps alone do not establish whole-workflow order across independent publishers.
- Give stalled/poison work bounded attempts, observable failed state or existing DLQ, oldest-pending visibility, and explicit redrive semantics. Reuse original logical identity on redrive. Leases coordinate workers; they do not fence remote side effects after lease expiry.

**Source trap worth retaining.** Retrieved AWS outbox sample calls `sendMessageBatch(...)`, then deletes all selected outbox entities without inspecting returned per-entry result. Copying that sample literally can discard failed entries under documented `200` partial-success response. This is source-level analysis, not executed reproduction. Same guide's broad FIFO “exactly once” wording must be bounded by send-deduplication and visibility contracts above; it cannot establish atomic consumer-plus-external-effect execution.

**Failure/control scenario.** Kill after business commit before send; pending job/event survives. Kill after consumer DB commit before acknowledgment; redelivery leaves business state unchanged under retained deduplication identity. Inject mixed successful/failed batch result; only successful entries leave pending state. Known-bad controls: remove consumer marker, or discard whole batch on `200`; corresponding assertions must fail. Where ordering matters, deliver newer then older event and verify stated policy.

**Cost.** Medium: job/outbox rows, polling or existing broker operations, deduplication retention, lag monitoring, recovery path. CDC or distributed orchestration adds cost justified only by workload requirements. Ordinary synchronous single-database CRUD needs its local transaction boundary.

**Atlas memory.** Retain crash-point matrix, event identity/version rules, retention/redrive assumptions, and partial-batch counterexample. Inspect current queue type, visibility/retention settings, worker deployment, backlog, and stored delivery state before replay.

## 5. API compatibility includes ordering, pagination, and value meaning

**Primary evidence.** PostgreSQL 18 [§7.6, LIMIT and OFFSET](https://www.postgresql.org/docs/18/queries-limit.html): `ORDER BY` must constrain rows into unique order; large offsets still compute skipped rows. [§13.2.1](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED) explains changing snapshots. OpenAPI [3.1.1 §4.4.1 and §4.8.24](https://spec.openapis.org/oas/v3.1.1.html#schema-object): schemas follow JSON Schema 2020-12; `format`, `readOnly`, and `writeOnly` can be annotations rather than automatically enforced constraints. oasdiff [“How oasdiff decides what is breaking”](https://github.com/oasdiff/oasdiff/blob/main/docs/BREAKING-CHANGES.md#how-oasdiff-decides-what-is-breaking) judges declared contract compatibility; [OpenAPI 3.1 “Caveats”](https://github.com/oasdiff/oasdiff/blob/main/docs/OPENAPI-31.md#caveats) documents parser limitations around dynamic references and reusable component path items.

**Applicability trigger.** Change request/response schema, serialization, status, enum, list filter/order, pagination, SDK generation, or persistence-to-API mapping.

**Agent failure.** Update server and generated client together and infer existing clients remain compatible. Treat added response enum as universally safe. Conflate absent field with explicit NULL. Paginate by timestamp alone, or promise stable export from changing snapshots.

**Smallest mechanism / tool judgment.**

- Compare released contract to proposed contract in correct direction; use existing OpenAPI diff tooling. oasdiff efficiently identifies encoded changes such as new required request property or removed response field. Review configured severities and documented parser coverage; dynamic-reference-heavy schemas need explicit fixtures. Syntax diff cannot establish business behavior omitted from schema.
- Keep old-client request/decoder fixture against new server. Specify missing-vs-null behavior, error/status mapping, enum handling, and bounds. In OAS 3.1, nullable value uses JSON Schema null type; field presence remains separate. Annotations require real validator/authorization behavior, not wishful schema labels.
- Every paged query needs total order. Small bounded lists can retain offset with documented live-list behavior. When churn/deep traversal warrants keyset, use immutable non-null sort tuple such as `(created_at, id)`, matching cursor predicate/index, and bound page size. Scope every query to authorized tenant and bind cursor to filter/sort version; cursor never grants access.
- Keyset reduces offset-shift problems but is not fixed snapshot: deletes, backdated inserts, mutable filters, and changes to sort keys affect traversal. Exact exports require explicitly stable snapshot or materialized membership; timestamp cutoff alone is insufficient.

**Failure/control scenario.** Seed more rows sharing timestamp than fit on page; compare concatenated traversal with expected ordered set on frozen fixture. Interleave insert/delete and test explicitly chosen live-list behavior. Known-bad control: use timestamp-only continuation predicate; fixture must detect skipped tied rows. Merely removing SQL tie-breaker can accidentally preserve observed order, so that mutation alone is unreliable control. Add required request field and confirm diff plus old-client fixture detect break. Changing default sort with unchanged shape must be caught by behavioral fixture even when schema comparison has nothing relevant to classify.

**Cost.** Low for total order, schema diff, and old-client fixture. Medium for versioned cursors and stateful pagination tests. Stable export snapshots/materialization add resource/retention cost; use when exact membership is promised.

**Atlas memory.** Store compatibility baseline, consumer assumptions, cursor/order policy, dialect/tool versions, and minimal breaking fixture. Retrieve actual released specification, current consumers, query/index definitions, and installed parser support before reuse. Memory of previous generated SDK does not establish current compatibility.

## 6. Authentication establishes identity; authorization decides operation, object, and field access

**Primary evidence.** OWASP [ASVS 5.0.0 V8](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x17-V8-Authorization.md), requirements 8.2.1–8.2.3, 8.3.1, and 8.4.1, distinguish function/data/field authorization, trusted enforcement, and cross-tenant controls. OWASP [API1:2023, “Is the API Vulnerable?”](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/#is-the-api-vulnerable): authenticated user must have permission for requested action on requested object. [API3:2023, “How To Prevent”](https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/#how-to-prevent) recommends explicitly selected response fields and permitted input properties. PostgreSQL 18 [§5.9, Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html): superusers/`BYPASSRLS` bypass policies; owners normally bypass unless forced.

**Applicability trigger.** Endpoint accepts resource identity, tenant, role, mutable fields, privileged function, nested relationship, or bulk operation. Includes reads, aggregates, exports, replayed responses, and user-delegated jobs.

**Agent failure.** JWT verification treated as full access control. Unpredictable UUID treated as permission. Raw request body assigned into ORM object. Tenant supplied in request/cursor accepted as authority. Background worker's service identity silently grants user extra privileges.

**Smallest mechanism / tool judgment.**

- Define small actor × operation × object/tenant × field policy matrix. Enforce at trusted service/data boundary using verified identity and current policy. Scope queries and writes; explicitly project permitted output and mutable input fields. Ordinary application policy function plus scoped SQL often suffices.
- Put ownership/tenant/action condition in mutation boundary where possible, avoiding unprotected check-then-write window. Define revocation and admission-versus-execution policy for queued work; service privilege is not originating user's authorization.
- ASVS gives precise verification requirements, not automatic vulnerability verdict. API Top 10 supplies attack scenarios, not complete coverage. RLS can reinforce tenant isolation; it needs correct connection context, roles, policy composition, and tests using actual application role. Authentication fuzzing alone does not test BOLA or field-level permissions.

**Failure/control scenario.** Known legitimate actor first reads/changes permitted object. Different authenticated tenant then tries same existing ID through detail, list, bulk, nested relation, and applicable async path; expect policy-defined denial and unchanged durable state. Inspect responses/aggregates for forbidden fields and tenant data. Try privileged field insertion and inspect stored value, not only status. Known-bad controls: bypass effective object-authorization boundary or permit forbidden property; fixture must expose violation. If RLS used, exercise pooled connections across tenants under real runtime role and verify context isolation. Denial against nonexistent fixture is insufficient evidence.

**Cost.** Low to medium for explicit policy matrix, scoped queries, and paired allow/deny cases. RLS and complex delegated rights add operational/policy burden. Choose defenses matching actual exposure.

**Atlas memory.** Retain policy rationale, endpoint/field matrix, and sanitized authorization counterexamples. Re-read current memberships, claims validation, policy code, grants, runtime role, and queue delegation rules. Shared memory holds neither access grants nor credential-bearing fixtures.

## 7. Generated tests need business oracles and proof they reached intended behavior

**Primary evidence.** Schemathesis [Checks](https://schemathesis.readthedocs.io/en/stable/reference/checks/), “positive_data_acceptance,” “Stateful behavior,” and “ignored_auth”: positive-acceptance defaults include authentication/missing-resource/conflict statuses; other checks apply independently. Stateful checks need operation links and scenario history. Authentication check can give no verdict when explicitly supplied credentials are outside declared schemes. [Stateful guide, “Troubleshooting”](https://schemathesis.readthedocs.io/en/stable/guides/stateful-testing/#troubleshooting): `API Links: 0 covered` can mean every producer request lacked valid credentials. fast-check [Model based testing, “Overview” and replay](https://fast-check.dev/docs/advanced/model-based-testing/) warns against comparing implementation with carbon copy; [Race conditions, “scheduleFunction”](https://fast-check.dev/docs/advanced/race-conditions/#schedulefunction) states scheduler postpones promise resolution while underlying call starts immediately.

**Applicability trigger.** Agent cites passing tests for changed backend behavior, introduces API fuzzing/property tests, or claims concurrency, retry, migration, or authorization coverage.

**Agent failure.** Tests duplicate implementation's mistaken rule. Requests all hit 401/404, empty fixtures make assertions vacuous, or optional database tests skip. Schema and implementation share same mistake. Promise scheduling gets credited with controlling database transaction interleavings.

**Smallest mechanism / tool judgment.**

- Start with deterministic invariant/failure fixture from relevant finding. Exercise real PostgreSQL and runtime role when claim concerns PostgreSQL behavior. Await work and inspect committed outcomes from independent connection when persistence is claimed.
- Schemathesis adds generated boundary/invalid-input and response-conformance coverage cheaply once schema and test API exist. Current tool can infer links and learn from responses; add explicit links where discovery misses critical flow. Verify actual successful producer/consumer transitions, not merely selected endpoints. Its built-in auth check addresses missing/invalid credentials, not complete permission matrix.
- fast-check fits existing TypeScript tests for independent properties and small command models: reservation conservation, same-intent replay invariance, tenant noninterference, or frozen-set pagination. Shrinking/replay help diagnose failures. Keep model simpler than implementation; reject generated runs that never reach required transition. Controlled promise resolution does not control PostgreSQL's internal schedule; use real connections and explicit barriers for that claim.
- Bound generated exploration to changed operations and known risky inputs. Record expected versus exercised operation/role/transition identities, assertion outcomes, skips/errors, and reproduction data. Missing required environment or unexercised transition means **inconclusive**, not coverage success.

**Failure/control scenario.** Give harness valid credentials and seeded resource; show changed success path and required state transition. Deliberately induce cross-tenant access, cursor regression, or duplicate effect in isolated test copy; corresponding assertion must turn red. If independent defense still blocks attempted mutation, record surviving protection: mutation has not yet produced known-bad control for that property. Restore implementation and run same targeted probe. A single mutation proves only that detector, not universal test quality. Preserve minimal failing trace as deterministic regression. Provider fakes can force rare timing, but need separate conformance against real supported provider interface for adapter claims.

**Cost.** Low for focused deterministic case plus known-bad control. Medium for generated/stateful exploration: schema upkeep, seeded environment, Python tooling for Schemathesis or TypeScript dependency for fast-check, and triage. Adopt whichever adds missing coverage; broad model construction for trivial CRUD wastes effort.

**Atlas memory.** Save minimized counterexample, seed/path/replayPath where applicable, property intent, tool versions, execution environment, and evidence location. Re-run against current revision and configuration. Remembered green result or cached counterexample alone cannot establish present correctness.

## Charlie workflow and evidence handoff

Charlie can invoke these workflows directly through OpenCode/Orchestra using native Atlas retrieval. Maestro participation is unnecessary. Treat Knowledge/Memory distinction below as record organization, following existing Atlas interfaces.

1. **Ground current change.** Inspect touched route, query, migration, caller, and effect boundary. Retrieve only matching invariant/workflow and prior failure cards. Compare their revision/version assumptions with current code and environment.
2. **Select triggered findings.** SQL writer → 1; migration → 2; harmful retried command → 3; durable async boundary → 4; API/list change → 5; permission-bearing access → 6. Finding 7 calibrates whichever test evidence is claimed. Shared constraints or probes can satisfy related findings together.
3. **Choose smallest sufficient control.** Reuse installed database, runner, SDK, and test tools. Write invariant and failure schedule before choosing mechanism. Increase architecture only when local boundary cannot satisfy requirement.
4. **Capture reviewable evidence.** Current revision; schema/migration/spec identity; actual DB version/isolation/role; relevant tool configuration; test command; expected and exercised behavior; before/after durable state; known-bad control outcome; skips/errors; unresolved boundary. Include only fields relevant to claimed property. Proposed, executed, failed, and inconclusive evidence stay distinguishable.
5. **Retain reusable lesson.** Knowledge card: trigger, invariant, smallest mechanism, source/section/version/date, limits, cost. Memory card: repository/revision/environment, sanitized reproducer, observed result, evidence reference, and invalidation conditions. Store once; link from later work. Revalidate whenever schema, provider contract, authorization, tool version, or deployment state changes.

For later implementation in this repository, public Protocol/Server `HttpApi` changes trigger `bun run generate` from `packages/client`; generated directories remain generator outputs. Legacy JavaScript SDK regeneration uses `./packages/sdk/js/script/build.ts` when that SDK is affected. Those generation steps update artifacts; finding 5's old-consumer and behavior checks supply compatibility evidence.

**Priority:** make concurrent-write, cross-tenant, old-client, and populated-upgrade probes easy to reuse. Add lost-reply and crash/redelivery probes at effect boundaries. Exceptional result means smallest justified mechanism with evidence that can detect its failure.
