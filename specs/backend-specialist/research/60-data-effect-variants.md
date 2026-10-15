# R60 — cross-stack data/effect skill variants

**Recommendation:** five shared scope cards, backed by exact driver/ORM/queue references. Select from supplied component facts; framework name alone cannot establish transaction membership, retry identity or resource lifetime.
**Evidence:** primary docs/source inspected 2026-10-04; source-only research. Commands/API sequences below are proposed implementation procedures, not executed results. No installs, generators, tests or application/config edits performed.
**Baseline verified:** `git rev-parse --show-toplevel HEAD` returned `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0` in both metadata worktree `backend-r60-data-effects` and supplied `backend-plugin` worktree. macOS resolves metadata path under `/private/var/`.
**Read inputs:** `skill-variants-plan.md`, `31-typed-sql.md`, `32-migrations.md`, `41-application-jobs.md`, under `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/`. Named-path Git status reports these as untracked working-tree documents: verified HEAD does not pin their content. R31 supplies typed-query boundaries; R32 migration packets; R41 admission/effect boundaries. This report extracts changed instructions rather than repeats their product surveys.

## Shared scope instruction versus variant reference

- **Owner supplies:** assigned behavior/paths; persistence and queue design; participating database and transaction owner; isolation/conflict semantics; operation identity, immutable payload and retry/expiry/unknown-outcome policy; migration phase/order; resource/concurrency bounds; acceptance and available fixture interfaces. Repair gets supplied diagnosis; new feature needs no invented diagnostic prerequisite.
- **The backend specialist chooses:** concrete parameterized SQL, transaction-bound helper signatures, SDK calls, DTO mapping, cleanup structure and fixture implementation within those semantics. Missing business meaning blocks that part; missing prewritten SQL does not.
- **Component facts:** language/runtime patch, database engine/version, driver/ORM/queue/migrator lock versions, selected adapter, transaction handle, connection ownership, current schema revision and assigned phase. Incidental dependencies elsewhere in repository do not select variants.
- **Shared procedure:** establish assigned boundary → bind every participating operation to its native handle → map native completion/error into supplied result → close resources → exercise only assigned checks. Preserve distinction between admission, DB commit, external acceptance and recorded completion.
- **Reference must supply:** exact callable API and return type; connection acquisition/binding; callback sync/async semantics; commit/rollback/release ownership; queue transaction capability; runner transaction granularity; retry controls and provider caveats; cursor/batch finalization. “Use a transaction,” “retry safely,” and “stream results” omit these decisive facts.
- Scope means assigned change/technical area, not authorization. Harness/Maestro/Atlas remain existing inputs. Agent memory/cache, diagnosis, architecture selection, production operations and policy-engine implementation remain outside this research.

## Bounded source/version set

Snapshots below identify inspected implementation, not latest-version recommendations or an integration-tested matrix. Owner still supplies actual runtime/DB patches and full lockfiles. PostgreSQL 18 docs anchor SQL exception below; Bun/SQLite runtime compatibility was not exercised.

| Selected family | Source/version anchor | Instruction-bearing reference |
| --- | --- | --- |
| Node `pg` 8.16.3; `pg-cursor` 2.15.3 | Both npm `gitHead`: `8f8e7315e8f7c1bb01e98fdb41c8c92585510782` | Same-client transaction; cursor close/read; pool release [PG], [PC], [POOL] |
| PgTyped CLI 2.4.3 / runtime 2.4.2 | R31 CLI pin `e9771f2d4d68c860ef84a81749d0ea870b3590d7`; runtime `249b6282aa5923880477eba41f6725a02659eb0f` | `.run(params, connection)` and optional `.stream` adapter [PT] |
| Go sqlc 1.31.1 / pgx 5.8.0 | `a95e91d70ad9e1181253c333a1cfdd75ae4b95a5` / `fe8740aa0679b67e13d2f1744bce5b61567d584e` | `WithTx`, transaction release, rows/batch lifetime [SC], [XT], [XR], [XB] |
| River 0.48.0, `riverpgxv5` path | `c2c380490d14df8efc28b86fbe7be1cf93930405` | `InsertTx` with caller's pgx transaction [RI] |
| Graphile Worker 0.18.0 | `4cda192c5df254392a1dff350e5d73f7d2c18a85` | SQL admission versus pool-backed helper; job-key semantics [GA], [GH], [GK] |
| Drizzle ORM 0.45.3 / Kit 0.31.11 | Kit tag resolves to `15454dbe49d827c6081f3d0231e2e7985e517295` | `node-postgres` async versus `bun-sqlite` sync adapter; migration grouping [DN], [DB], [DM], [DJ] |
| Goose 3.28.0, SQL runner | Tag peeled to `43d2d9c819ed6c9ba2b67a86bdf9fc08562495b7` | Per-file transaction and explicit exception annotation [GO], [GT] |
| Stripe Node 23.0.0 | Tag peeled to `fe645f63d645011aca38dff9e245c1cf7b9ae60e`; API `2026-09-30.endive` [SV] | Explicit idempotency key, retry options, refund return/status [SN], [SR] |

## Same supplied business contract, different selected stacks

**Contract B, verbatim R41 §M2:** “Commit order and enqueue receipt together in existing Postgres transaction.” Hold order fields, receipt payload, operation identity/conflict rule and retry policy fixed across variants. These are alternative already-selected implementation packets, not proposals to change an application's stack.
R41 acceptance: committed transaction exposes order plus job; rollback exposes neither from second connection; worker sees committed order. Its retry extension reconciles same business operation after lost commit acknowledgement and enqueues only on new admission. Queue retention does not define business-operation identity.

| Assigned component | Concrete procedure for same B | Wrong transfer |
| --- | --- | --- |
| Go / sqlc + pgx / River | Receive caller's `tx`; use `queries.WithTx(tx)` for supplied admission/order SQL; on newly admitted operation call `riverClient.InsertTx(ctx, tx, ReceiptArgs{OrderID: id}, opts)`; check errors and return to transaction owner for commit/rollback. [SC], [RI] | Using pool-bound `queries` or River `Insert` merely inside same Go function does not join that transaction. |
| TS / PgTyped + node-postgres / Graphile | Receive caller's checked-out transactional client; await `.run(params, client)` for admission/order; on new admission await `SELECT graphile_worker.add_job('receipt', json_build_object('orderId', $1::text))` on same client. Add supplied queue options through named SQL arguments; commit/rollback/release remain owning scope's work. [PG], [PT], [GA] | Passing pool instead of checked-out client can still fit query interface but loses transaction binding. |
| TS / Drizzle `node-postgres` / Graphile | Receive existing Drizzle `tx`; await `tx.insert`/`tx.execute` for all participating SQL, including parameterized `add_job`. Enclosing `db.transaction(async tx => ...)` owns completion; propagate failure to its callback. [DN], [GA] | Outer `db.execute` or independent pool-backed queue helper escapes `tx`. |
| Same Node stack, enqueue after commit | `await client.query('COMMIT')`, then pool-backed `workerUtils.addJob(...)`: ordering follows commit, but interruption between calls leaves order without job. [PG], [GH] | **Not valid for B.** After-commit ordering cannot replace atomic admission. |
| Drizzle `bun-sqlite` present elsewhere | No B selection: B expressly requires existing PostgreSQL transaction and selected PG queue. SQLite adapter informs C1 only when target component actually uses it. | Same ORM name is not same database/queue capability. |

## C1 — implement assigned atomic data writes

- **Trigger:** assigned writes/invariants must share supplied transaction. **Non-trigger:** read-only mapping; remote HTTP call assumed to join SQL; choosing isolation or persistence topology.
- **Facts:** exact DB/adapter; existing versus locally owned transaction; required affected-row/cardinality/conflict behavior; supplied error/result mapping. Typed query object alone does not establish transaction ownership. [SC], [PT], [PG]
- **Shared steps:** validate supplied input contract; acquire or receive correct handle; execute parameterized writes and required result checks through that handle; propagate failure; only transaction owner commits/rolls back. Do not swallow error and report callback success.
- **Native variants:** pg/PgTyped transaction owner uses one checked-out client and awaited `BEGIN`/queries/`COMMIT`; sqlc binds `WithTx(tx)` and checks Go errors; Drizzle node-postgres awaits callback and commits afterward. Borrowed handles do not authorize a nested `BEGIN` or independent commit. [PG], [SC], [DN]
- **Sync exception:** Drizzle `bun-sqlite` passes callback into native SQLite transaction without awaiting its return. Use synchronous `tx...run()/all()/get()`; complete all participating writes before callback returns. Copying `async tx => { await ... }` from PG does not make SQLite transaction await continuation. This is adapter-specific, not a claim about every SQLite driver. [DB]
- **Tools/output:** existing query generator when assigned, selected driver/ORM APIs; handwritten repository/helper bound to client/tx plus error mapping and fixture cases. Generated types stay native artifacts, not hand-faked transaction proofs.
- **Freedom/blocker:** the backend specialist chooses SQL/helper layout and concrete constraint checks implementing packet. Block if required writes span stores without supplied design, transaction ownership conflicts, or retry semantics are unspecified where assignment requires retry.
- **Proposed checks, unexecuted:** commit path persists all writes; inject later failure and inspect second-connection state for rollback. Negative controls: change one write to pool/outer-db handle; insert async suspension into sync SQLite callback. Assertions must distinguish escaped write from rollback.
- **Selection pair:** supplied Bun + `drizzle-orm/bun-sqlite` → sync reference; Node + `drizzle-orm/node-postgres` → async reference. “Repository uses TypeScript/Drizzle” alone selects neither.

## C2 — author only assigned schema migration/backfill phase

- **Trigger:** owner supplies exact starting revision, target phase and data transformation. **Non-trigger:** invent expand/backfill/contract plan, infer rename meaning from diff, run rollout/recovery, or alter applied history.
- **Facts:** selected runner/adapter/version; immutable history; assigned phase dependencies/end state; rename/NULL/default/conflict rules; batch limits and commit/restart semantics if batching required; allowed model/journal edits; supplied populated fixtures.
- **Concrete phase example from R32 E:** owner sequence is rename `name` → `display_name`, fill NULL with `'Unknown'`, then NOT NULL. For a backfill-only assignment starting after rename, author `UPDATE users SET display_name = 'Unknown' WHERE display_name IS NULL;`; ending this assignment does not authorize adding final constraint. Expected fixture rows remain `(1,'Ada'),(2,'Unknown')`.
- **Drizzle procedure:** use assigned local `drizzle-kit generate --custom --config="$CONFIG" --name="$NAME"` scaffold for data-only phase; author SQL and review native journal/history linkage. Ordinary generation supplies schema diff, not backfill meaning. Rolling docs show newer directory layout; R32 and pinned reader establish this version's `meta/_journal.json` and statement breakpoints. [DG], [DJ]
- **Runner difference:** pinned Drizzle PG ORM migrator places all pending migration statements/history rows in one transaction; history schema/table setup precedes it. Separate files or `--> statement-breakpoint` do not imply separate commits. Goose SQL runner normally uses one transaction per file with `-- +goose Up`; `goose ... up-to "$REV"` supplies explicit target. [DM], [GO], [GT]
- **Exception:** PostgreSQL `CREATE INDEX CONCURRENTLY` cannot run inside transaction block. Goose supports owner-assigned `-- +goose NO TRANSACTION`; that comment has no authority over Drizzle runner. Incompatible assigned phase/runner boundary returns to owner, not silent transaction removal or runner replacement. [PI], [GO]
- **Tools/output:** selected generator/scaffolder, native migration runner on assigned disposable fixture, SQL row/constraint assertions; only assigned SQL/code/model metadata and phase evidence. Batched backfill stays in owner-selected job/migration entrypoint with supplied restart semantics.
- **Freedom/blocker:** the backend specialist writes transformation SQL, bounded batch helper and fixtures; owner fixes value semantics, phase boundaries and restart policy. Missing prewritten SQL is not blocker; missing NULL meaning or required cross-phase compatibility is.
- **Proposed checks, unexecuted:** replay populated predecessor to assigned endpoint; assert exact values and phase-specific schema. Wrong fill constant, destructive drop/add rename, or premature NOT NULL must fail applicable assertions; rerun/interruption checks only when assigned. Empty-schema replay alone cannot establish backfill behavior.
- **Selection pair:** assigned backfill uses data-phase recipe plus actual runner reference; same final schema with only index phase assigned must not trigger unrelated rename/data cleanup. Two pending Drizzle files do not justify copying Goose per-file rollback expectations.

## C3 — bind transaction to job admission

- **Trigger:** prescribed write → queue boundary such as B. **Non-trigger:** choose queue/outbox architecture, design a dispatcher, or infer external-effect uniqueness from job key.
- **Facts:** native transaction-bound insertion support, same database/handle, supplied queue schema/worker identifier/payload codec, operation identity/conflict behavior, enqueue options, ownership of commit and retry.
- **Native steps:** follow B's selected path; determine new versus exact-retry admission using supplied DB identity semantics; insert job only for new admission; check both business and queue results before commit. River uses typed `ReceiptArgs` + `InsertTx`; Graphile uses SQL `add_job` on existing client/tx. [RI], [GA]
- **After-commit variant:** select only when owner explicitly assigns after-commit behavior and its failure handling. Pool-backed Graphile helper obtains client through `withPgClient`; proximity inside transaction callback is insufficient. When B requires joint commit, after-commit helper is a blocker, not interchangeable recipe. [GH]
- **Identity limit:** Graphile default job key can replace unlocked payload, create another job when locked, and disappears after successful completion. Supplied immutable-operation retry rule cannot be implemented by treating `job_key` as permanent dedupe record. Queue admission and provider outcome remain separate. [GK]
- **Tools/output:** native insert API/SQL, typed/validated payload and repository-worker boundary fixtures. Prefer already-selected queue primitive; no new relay for same-DB native path.
- **Freedom/blocker:** the backend specialist chooses SQL shape, payload mapping, helper boundaries and fixtures. Owner resolves absent atomic-enqueue capability, identity retention/conflict semantics or required failure policy; the backend specialist does not switch persistence/queue design.
- **Proposed checks, unexecuted:** pause worker, assert committed order/job from second connection; rollback both; resume worker and assert committed order visible. Prove server commit before dropping acknowledgement, retry supplied operation identity, assert one admission and one job before draining.
- **Counterexample/check:** move insert to post-commit helper and interrupt between commit/enqueue; B's paired-state assertion must reject order-only state. A rollback-only test misses this after-commit gap. Same function, same database URL, or same pool does not establish same transaction.

## C4 — implement assigned external retry/idempotency semantics

- **Trigger:** prescribed outbound effect with supplied retry identity/policy, e.g. R41 partial-refund adapter. **Non-trigger:** read-only mapping automatically importing payment retry policy; designing compensation/reconciliation; adding blanket retries to every exception.
- **Facts:** provider/API and SDK version; business operation key/account scope and immutable request; idempotency retention; job plus SDK retry budgets, deadline/cancellation and retryable/terminal classification; prescribed unknown-outcome result. Owner supplies these, including behavior after retention expires.
- **Native steps/output:** map assigned input into `stripe.refunds.create({ payment_intent, amount }, { idempotencyKey, timeout, maxNetworkRetries })`; reuse supplied stable business key across job attempts/processes; map returned refund ID/status into assigned result. SDK defaults/per-request auto keys do not establish cross-job business identity. Output is adapter/error mapping plus fault-fixture implementation, not new workflow platform. [SR], [SN]
- **Provider distinction:** Stripe saves first executed status/body, including `500`; different parameters with same key error; keys may be pruned after at least 24 hours; validation/concurrent-execution rejection before execution is not saved. Receipt of refund object is not necessarily terminal `succeeded`. [SI], [SR]
- **Unknown outcome:** timeout, connection loss or cancellation does not prove effect failed. Stripe documents `500` outcome as indeterminate and cautions against retrying with new key. Follow supplied same-key/reconciliation/unknown-result branch; absent provider dedupe/query contract blocks automatic resend design. Database rollback cannot undo provider acceptance. [SE]
- **Exact SDK exception:** Stripe Node 23 documents one connection-closed reattempt for `ECONNRESET`/`EPIPE` even at `maxNetworkRetries: 0`. Therefore “set zero to ensure one wire attempt” is invalid reference guidance; queue retries and SDK retries need jointly supplied budget. [SN]
- **Freedom/blocker:** the backend specialist chooses SDK plumbing, error mapping and fixtures. Missing retry identity, ambiguous-outcome branch or SDK semantics incompatible with supplied strict attempt budget returns to owner; no new retry-policy engine.
- **Proposed checks, unexecuted:** acceptance-confirming fault proxy drops refund response before local completion; reconstruct adapter and repeat same key/parameters within retention; assert same refund ID and provider state despite repeated requests. Fund fixture for multiple partial refunds so fresh-key mutation can reveal duplication. Wrong payload under same key and simulated expired-key/unknown branches exercise supplied policy.
- **Selection pair:** selected Stripe Node 23 refund operation → this reference; unrelated vendor POST without documented dedupe must not inherit Stripe guarantees. Worker retry mechanism alone does not select or validate provider policy.

## C5 — keep batch/stream resources within assigned lifetime

- **Trigger:** assigned cursor/batch/backfill/export whose consumption owns DB resources. **Non-trigger:** already-materialized DTO map; choosing throughput strategy, profiling memory or adding application/agent cache.
- **Facts:** actual return type (array/cursor/rows/batch), acquired versus borrowed handle, consumer/transaction lifetime, bounded batch size/concurrency, cancellation/error behavior, and supplied checkpoint/partial-progress semantics.
- **Node procedure:** with already-selected `pg-cursor`, acquire client, create `client.query(new Cursor(sql, params))`, read bounded batches; on early stop or consumer failure await `cursor.close()` before releasing client. Close cursor before ending surrounding transaction; if connection cannot be restored, use `client.release(true)` instead of returning busy/broken client. Borrowed client remains caller-owned. [PC], [POOL]
- **Pinned API discrepancy:** 2.15.3 source resolves `await cursor.read(n)` to row array, despite pinned cursor docs describing/destructuring `pg.Result`. Prefer inspected implementation signature and assign conformance check; discrepancy is source observation, not reproduced runtime failure. [PC], [PCD]
- **PgTyped variant:** `.run()` materializes array; `.stream()` requires supplied connection's optional `stream` implementation and exposes `read/close`. Plain `pg` query interface is insufficient; source throws `"Connection doesn't support streaming."` when adapter missing. The backend specialist may implement assigned cursor adapter locally; installing/selecting new driver is separate owner decision. [PT]
- **Go variant:** consume `pgx.Rows`, close on early exit and check `rows.Err()`; pool-owned rows release connection on close. `BatchResults.Close()` drains unread results and must be called/checked before reuse or transaction commit; pending callback/error results are not optional cleanup. Pool transaction commit/rollback releases its own connection. [XR], [XB], [XT]
- **Bun variant:** Drizzle sync `all()` already materializes rows; an async iterator wrapper does not turn it into DB streaming. If packet prescribes bounded pages, finish synchronous DB batch before remote await; do not keep sync transaction open across async consumer. [DB]
- **Tools/output:** native cursor/rows/batch APIs; bounded consumer/helper with explicit cleanup ownership and cancellation/early-stop fixtures. Preserve supplied progress semantics; do not invent durable checkpoints.
- **Freedom/blocker:** the backend specialist chooses loop/helper shape, missing wrapper and fixture hooks within supplied bounds. Block if streaming exceeds selected driver's capability or needs unassigned dependency/design, snapshot/lifetime contract conflicts with early release, or required partial-progress semantics are missing.
- **Proposed checks, unexecuted:** nonempty multi-batch fixture exercises full drain, early stop, decoding/consumer error and assigned cancellation path; verify expected prefix/result and subsequent query/acquisition works. Force unread later batch error; ignoring `Close()` result must fail assertion. Negative control releasing client before cursor closure must fail explicit cleanup-order/connection-use check, not merely return expected first row.
- **Selection pair:** PgTyped `PreparedQuery.stream` plus cursor adapter → stream recipe; `.run` result array → array mapping. `sqlc :many` returns materialized slice; generated typed query alone is not streaming API (R31).

## Extraction and proposed assignment checks

- **Shared scope bodies:** C1 atomic writes, C2 assigned migration phase, C3 admission boundary, C4 external outcome/retry, C5 resource lifetime. Keep role/inputs/error reporting common; avoid copying universal recipe into every language/framework cell.
- **Runtime/driver references:** pg/pg-cursor/PgTyped; pgx/sqlc; Drizzle `node-postgres` versus `bun-sqlite`. **Narrow recipes:** River `InsertTx`, Graphile SQL versus pool helper, Drizzle PG ORM migrator versus Goose, selected Stripe refund semantics.
- **Proposed composition:** B on Go combines C1+C3 with sqlc/pgx/River references; B on TS combines C1+C3 with selected PgTyped/pg or Drizzle/pg plus Graphile. C4 applies only when external effect itself assigned. C2 backfill adds C5 only if packet requires batched/streamed implementation.
- **Reference payload requirement:** exact version/source pin; positive component predicate and near-miss counterexample; native handle/API/return type; failure/cleanup sequence; artifacts; assignment-owned checks. These are proposed documentation fields, not implemented inheritance, loader, routing or permissions.
- **Check reach:** every proposed check above remains unexecuted. Owner-provisioned fixtures must demonstrate named seed/fault boundary and exact observed state; missing service, skipped test or unreached fault is incomplete evidence. Unit doubles establish mapping only, not DB transaction membership or hosted-provider idempotency. No throughput, latency, memory or runtime-success claims.

## Primary references

[PG]: https://github.com/brianc/node-postgres/blob/8f8e7315e8f7c1bb01e98fdb41c8c92585510782/docs/pages/features/transactions.mdx
[POOL]: https://github.com/brianc/node-postgres/blob/8f8e7315e8f7c1bb01e98fdb41c8c92585510782/docs/pages/apis/pool.mdx
[PC]: https://github.com/brianc/node-postgres/blob/8f8e7315e8f7c1bb01e98fdb41c8c92585510782/packages/pg-cursor/index.js
[PCD]: https://github.com/brianc/node-postgres/blob/8f8e7315e8f7c1bb01e98fdb41c8c92585510782/docs/pages/apis/cursor.mdx
[PT]: https://github.com/adelsz/pgtyped/blob/249b6282aa5923880477eba41f6725a02659eb0f/packages/runtime/src/tag.ts
[SC]: https://github.com/sqlc-dev/sqlc/blob/a95e91d70ad9e1181253c333a1cfdd75ae4b95a5/examples/authors/postgresql/db.go
[XT]: https://github.com/jackc/pgx/blob/fe8740aa0679b67e13d2f1744bce5b61567d584e/pgxpool/tx.go
[XR]: https://github.com/jackc/pgx/blob/fe8740aa0679b67e13d2f1744bce5b61567d584e/pgxpool/rows.go
[XB]: https://github.com/jackc/pgx/blob/fe8740aa0679b67e13d2f1744bce5b61567d584e/batch.go
[RI]: https://github.com/riverqueue/river/blob/c2c380490d14df8efc28b86fbe7be1cf93930405/example_insert_and_work_test.go
[GA]: https://github.com/graphile/worker/blob/4cda192c5df254392a1dff350e5d73f7d2c18a85/website/docs/sql-add-job.md
[GH]: https://github.com/graphile/worker/blob/4cda192c5df254392a1dff350e5d73f7d2c18a85/src/helpers.ts
[GK]: https://github.com/graphile/worker/blob/4cda192c5df254392a1dff350e5d73f7d2c18a85/website/docs/job-key.md
[DN]: https://github.com/drizzle-team/drizzle-orm/blob/15454dbe49d827c6081f3d0231e2e7985e517295/drizzle-orm/src/node-postgres/session.ts
[DB]: https://github.com/drizzle-team/drizzle-orm/blob/15454dbe49d827c6081f3d0231e2e7985e517295/drizzle-orm/src/bun-sqlite/session.ts
[DM]: https://github.com/drizzle-team/drizzle-orm/blob/15454dbe49d827c6081f3d0231e2e7985e517295/drizzle-orm/src/pg-core/dialect.ts
[DJ]: https://github.com/drizzle-team/drizzle-orm/blob/15454dbe49d827c6081f3d0231e2e7985e517295/drizzle-orm/src/migrator.ts
[DG]: https://orm.drizzle.team/docs/drizzle-kit-generate#custom-migrations
[GO]: https://github.com/pressly/goose/blob/43d2d9c819ed6c9ba2b67a86bdf9fc08562495b7/README.md
[GT]: https://github.com/pressly/goose/blob/43d2d9c819ed6c9ba2b67a86bdf9fc08562495b7/migration_sql.go
[PI]: https://www.postgresql.org/docs/18/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY
[SN]: https://github.com/stripe/stripe-node/blob/fe645f63d645011aca38dff9e245c1cf7b9ae60e/README.md#network-retries
[SR]: https://github.com/stripe/stripe-node/blob/fe645f63d645011aca38dff9e245c1cf7b9ae60e/src/resources/Refunds.ts
[SV]: https://github.com/stripe/stripe-node/blob/fe645f63d645011aca38dff9e245c1cf7b9ae60e/src/apiVersion.ts
[SI]: https://docs.stripe.com/api/idempotent_requests
[SE]: https://docs.stripe.com/error-low-level

Registry provenance for shared pg/pg-cursor SHA: https://registry.npmjs.org/pg/8.16.3 and https://registry.npmjs.org/pg-cursor/2.15.3. Other new SHAs resolved through GitHub tag refs; annotated Stripe/Goose tags peeled. Stripe service docs are rolling pages inspected on research date; SDK SHA does not pin hosted service behavior. Source links support API/implementation distinctions only.
