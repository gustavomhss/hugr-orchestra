# R31 — supplied SQL contracts → typed application code

Research date: **2026-10-03**. Public primary sources only; source, generated examples, and test assertions inspected. Tools/tests not installed or executed; snippets below illustrate expected integration, not recorded generation results.
Charlie receives database/version, schema, query semantics, architecture, paths, result contract, and acceptance. His work: implement that packet. Tool recommendations below are conditional on supplied stack; architecture discovery and native agent persistence/harness are outside scope.

## Recommendation

- **sqlc: strongest Go SQL-first fit.** Supplied DDL + queries become callable Go methods, parameter/result structs, binding and scanning code.
- **SQLx: strongest Rust checked-SQL fit.** Query macros check SQL metadata and Rust bindings; `query_file_as!` checks supplied result struct without generating repository source files.
- **PgTyped: strongest shortlisted TS raw-SQL fit.** Annotated PostgreSQL queries become parameter/result interfaces and executable `PreparedQuery` objects. Explicit nullability/driver alignment matters.
- **Kysely + kysely-codegen: strongest shortlisted TS builder fit.** Schema becomes TS database types; handwritten builder expressions get inferred result types. Use when packet already prescribes builder-based access; arbitrary SQL strings do not gain SQLx-style checking.
- Use existing CLIs/libraries and packet's handwritten repository boundary. Evidence does not justify new ORM or generic tool adapter. Concrete handwritten value: transaction binding, prescribed DTO mapping, paging, validation, error mapping.

## Current release / source / license verification

Versions checked against GitHub releases and npm/crates registries; annotated tags peeled to **commit** SHAs. Links identify inspected release source, not verified downloaded binaries.

| Component | Current published version | Source commit SHA | License |
|---|---|---|---|
| sqlc | [v1.31.1, 2026-04-22](https://github.com/sqlc-dev/sqlc/releases/tag/v1.31.1) | [`a95e91d70ad9e1181253c333a1cfdd75ae4b95a5`](https://api.github.com/repos/sqlc-dev/sqlc/git/ref/tags/v1.31.1) | [MIT](https://github.com/sqlc-dev/sqlc/blob/v1.31.1/LICENSE) |
| SQLx / sqlx-cli | [0.9.0](https://crates.io/api/v1/crates/sqlx/0.9.0) / [0.9.0](https://crates.io/api/v1/crates/sqlx-cli/0.9.0), 2026-05-21 | [`75bc0487eb661da811bb7a3c5d158f1bd463fef4`](https://api.github.com/repos/transact-rs/sqlx/tags?per_page=5) | [MIT](https://github.com/transact-rs/sqlx/blob/v0.9.0/LICENSE-MIT) OR [Apache-2.0](https://github.com/transact-rs/sqlx/blob/v0.9.0/LICENSE-APACHE) |
| PgTyped CLI | [2.4.3](https://registry.npmjs.org/@pgtyped/cli/latest), [release 2025-03-15](https://github.com/adelsz/pgtyped/releases/tag/v2.4.3) | [`e9771f2d4d68c860ef84a81749d0ea870b3590d7`](https://api.github.com/repos/adelsz/pgtyped/git/tags/e397474697968dab22ddb240d9a4a4015c4c7430) | [MIT](https://github.com/adelsz/pgtyped/blob/v2.4.3/LICENSE) |
| PgTyped runtime | [2.4.2](https://registry.npmjs.org/@pgtyped/runtime/latest), independently published | [`249b6282aa5923880477eba41f6725a02659eb0f`](https://github.com/adelsz/pgtyped/tree/249b6282aa5923880477eba41f6725a02659eb0f) — npm `gitHead` | [MIT](https://github.com/adelsz/pgtyped/blob/249b6282aa5923880477eba41f6725a02659eb0f/LICENSE) |
| Kysely | [0.29.6, 2026-09-16](https://github.com/kysely-org/kysely/releases/tag/v0.29.6), [npm](https://registry.npmjs.org/kysely/latest) | [`2fefd4c848cc3129281fac0632d2376c7a723ee4`](https://api.github.com/repos/kysely-org/kysely/git/tags/fbb5f839dc03459ff5ed19d7806e309f0f70365b) | [MIT](https://github.com/kysely-org/kysely/blob/v0.29.6/LICENSE) |
| kysely-codegen | [0.20.0, 2026-02-16](https://github.com/RobinBlomberg/kysely-codegen/releases/tag/0.20.0), [npm](https://registry.npmjs.org/kysely-codegen/latest) | [`dacb4faaec98061a1946ffac96347b9d5f4fb63d`](https://api.github.com/repos/RobinBlomberg/kysely-codegen/git/ref/tags/0.20.0) | [MIT](https://github.com/RobinBlomberg/kysely-codegen/blob/0.20.0/LICENSE) |

SQLx repository now resolves to `transact-rs/sqlx`; GitHub `/releases/latest` returned 404, so current version established from crates metadata plus tag, not inferred from that failure. SQLx 0.9.0 declares Rust ≥1.94.0. Kysely declares Node ≥22 and TS ≥5.4; codegen declares Node ≥20 and Kysely `>=0.27.0 <1.0.0`, while its development dependency remains `^0.28.11`. Latest pair's execution compatibility was not tested here. PgTyped CLI declares TypeScript peer `3.1 - 5`; newer TS compatibility needs separate validation.

**Provenance clarification, 2026-10-04:** the lead rechecked [GitHub's `v0.9.0` commit](https://api.github.com/repos/transact-rs/sqlx/commits/v0.9.0), which resolves to the table's `75bc0487eb661da811bb7a3c5d158f1bd463fef4`. The [published crate's `.cargo_vcs_info.json`](https://docs.rs/crate/sqlx/0.9.0/source/.cargo_vcs_info.json) instead records `003b698e99e024f3621b8043a2426fde5b741171`. These are distinct tag-source and published-package provenance, not evidence that the inspected tag SHA is wrong or that a behavioral regression occurred. Package-specific recipes must identify the actual artifact/source they use; [R50](50-rust-variants.md) uses the published-source pin.

**Kanel considered, not separately shortlisted:** [npm 4.0.4](https://registry.npmjs.org/kanel/latest), source [`cb2e8b3065e504e3a1801f4895d50786f3bfcf36`](https://github.com/kristiandupont/kanel/commit/cb2e8b3065e504e3a1801f4895d50786f3bfcf36), [MIT](https://github.com/kristiandupont/kanel/blob/cb2e8b3065e504e3a1801f4895d50786f3bfcf36/LICENSE). Live PostgreSQL schema → relation types; [kanel-kysely](https://kristiandupont.github.io/kanel/kanel-kysely.html) adds `ColumnType`, `Selectable`, `Insertable`, `Updateable`, ID flavors. Useful existing schema-generation path; overlaps codegen rather than checking supplied arbitrary SQL. GitHub's latest release page still reports 3.5.1; npm establishes current package version.

## Exact mechanisms and evidence

### 1. sqlc — source-file compiler + generated Go

- **Inputs:** `sqlc.yaml` v2: `engine`, `schema` DDL file/migration directory, `queries` files, `gen.go.package/out/sql_package`; named SQL comments such as `-- name: ListTenantTasks :many`; `$1` or `sqlc.arg(name)` parameters. Prescribed overrides and generator flags also affect ABI. [Config][S-config]
- **Outputs/checking:** `db.go` (`DBTX`, `Queries`, `New`, `WithTx`), `models.go`, `<query>.sql.go` (SQL constants, parameter/result structs, methods). Analyzer resolves supported schema/query constructs; Go compiler checks callers against generated signatures. `emit_interface` optionally adds `Querier`.
- **Nullability:** schema and query analysis, including ordinary outer joins; pgx/v5 nullable text defaults to `pgtype.Text`, or `*string` with `emit_pointers_for_null_types: true`. `sqlc.narg(...)` forces nullable input. Overrides are policy inputs, not proofs. [Parameters][S-params]; [`isTableRequired` source][S-analysis]
- **Cardinality/transactions:** `:many` returns slice, including zero rows; default empty result may be nil, with `emit_empty_slices` available. `:one` uses `QueryRow().Scan()`: pgx returns `ErrNoRows` for zero, ignores extra rows. `:exec` discards affected count; `:execrows` exposes count. `q.WithTx(tx)` binds generated calls; caller begins/commits/rolls back. [Annotations][S-annotations]; [generated DBTX][S-db]; [pgx row behavior][PG-row]
- **Offline:** built-in analyzer consumes DDL directly; migrations parsed, not applied, with lexicographic ordering. Optional database-backed analyzer requires matching running schema and changes requirements. Source flags `--no-database --no-remote` make restricted mode explicit. [Analysis modes][S-generate]; [DDL][S-ddl]; [CLI][S-cli]
- **Observed source/test behavior:** [authors SQL][S-query] → [generated Go][S-generated] expands `*`, emits `pgtype.Text`, explicit `Scan`, `rows.Close`, and `rows.Err`. [`TestExamples`][S-test] regenerates and compares checked-in outputs. [`output_columns.go`][S-analysis] rejects unresolved/ambiguous direct column references but also falls back to `any` for unsupported expressions/functions; `strict_function_checks` defaults false. Successful generation is not full PostgreSQL semantic validation.

### 2. SQLx — DB-described SQL + Rust macro checks

- **Inputs:** literal SQL in `query!`/`query_as!`, or SQL file path relative to `Cargo.toml` in `query_file!`/`query_file_as!`; Rust bind expressions; named Rust struct for `*_as!`; selected DB/runtime/type features; matching database description or `.sqlx` cache. Optional supplied `sqlx.toml` overrides affect checking. [Macro source/docs][X-macros]
- **Outputs/checking:** compiler expansion builds row extraction/binding code; `query!` exposes anonymous record, `query_file_as!` checks handwritten struct field names/types with no unused fields. It does not require `FromRow`. Ordinary `query()`/`query_as()` functions do not perform these macro SQL checks.
- **Nullability:** PostgreSQL table `NOT NULL` metadata plus `EXPLAIN VERBOSE` outer-join analysis; expressions often inferred `Option<T>`. `"field?"` forces nullable, `"field!"` asserts non-null, `"field: Type"` overrides type. Inference is plan/version-sensitive; wrong assertions can fail decoding. Inputs accept both `T` and `Option<T>`; compilation does not enforce domain-required non-null arguments.
- **Cardinality/transactions:** `fetch_all` → `Vec<T>`; `fetch_optional` → `Option<T>`; `fetch_one` errors on zero. Last two ignore extra rows. Owned transaction local uses `&mut *tx`; borrowed `&mut Transaction` uses `&mut **tx`. Commit/rollback explicit; dropping open transaction starts rollback. [Transaction implementation][X-tx]
- **Offline:** `cargo sqlx prepare` records `.sqlx/query-<SHA256(SQL)>.json` containing database name, query, description, hash. DDL dump alone cannot populate it. Set `SQLX_OFFLINE=true` to force cache usage; otherwise `DATABASE_URL` can trigger connection. Cache is query metadata, not whole schema or migration attestation. [Cache source][X-cache]; [CLI][X-cli]
- **Observed tests:** [`wrong_param_type.rs` and expected diagnostic][X-negative] include `select $1::text` supplied `i32`, expecting `error[E0308]: mismatched types`. [`macros.rs`][X-tests] asserts nullable columns and transaction reads; `test_nullable_err` deliberately forces nullable text to `String` and expects runtime `UnexpectedNullError`. Strong evidence of both checking and its escape hatch; not tests run here.

### 3. PgTyped — PostgreSQL descriptions → generated TS query objects

- **Inputs:** `.sql` statements each ending `;`, preceding `/* @name QueryName */`, named `:parameter` placeholders; config `srcDir`, `transforms[{mode:"sql",include,emitTemplate}]`, DB connection, optional `typesOverrides`. TS-tag extraction also supported. Compiler sends PostgreSQL Parse/Describe and reads catalogs; supplied business query is described, not executed. [Syntax][P-syntax]; [CLI][P-cli]; [description source][P-describe]
- **Outputs/checking:** `<name>.queries.ts` exports `I...Params`, `I...Result`, query-pair interface, query IR, and `PreparedQuery<Params,Result>` instance. Runtime converts named placeholders to positional bindings; TS checks `.run(params, connection)`. Generated files compile offline but SQL edits alone do not refresh their types/embedded SQL.
- **Nullability:** plain parameter can become optional `T | null | void`; `:parameter!` emits required non-null parameter. Outputs use `attnotnull` for base columns; outer-join null extension is not modeled in that catalog lookup. Use `AS "assignee_name?"`; `!` forces non-null. Runtime strips hint suffixes, not validates result values; scalar required hints do not add runtime non-null checks. [Runtime][P-runtime]; [binding source][P-bind]
- **Cardinality/transactions:** `.run()` returns `Promise<Result[]>` even for primary-key lookup; `.runWithCounts()` additionally returns affected `rowCount`. Repository owns zero/one/exactly-one policy. Supply same checked-out `pg` client throughout transaction; `IDatabaseConnection` does not prove transaction ownership. [node-postgres transaction rules][PG-tx]
- **Offline:** standard CLI generation requires matching running PostgreSQL; DDL file is not direct schema input. Owner-provided generated query artifacts permit offline TS builds. `failOnError` defaults false: packet should prescribe true for generation. Column-name/type overrides only change declarations; runtime naming/parsers must match.
- **Observed examples/tests:** [`books.sql`][P-query] and [`books.queries.ts`][P-generated] show optional `id`, required `authorName!`, and `name!` override. [Integration tests][P-tests] wrap calls in `BEGIN`/`ROLLBACK` and explicitly install INT8/date parsers matching overrides. One array test even expects enum-array text `'{novel,science-fiction}'` while generated result declares array: useful counterexample to treating generated TS as runtime validation.

### 4. Kysely + kysely-codegen — schema types + typed builder

- **Inputs:** codegen CLI receives database URL/dialect, schema/table include filters, name/type mapping options; introspects database already built from supplied migrations. Generates `DB` and table interfaces in assigned `.d.ts` path; `ColumnType<Select,Insert,Update>`, `Generated<T>`, enums, nullable unions encode column usage. Handwritten `Kysely<DB>` builder expressions are separate source input. [README][K-codegen]
- **Outputs/checking:** TS checks typed references, bind-value compatibility, projections/aliases and supported joins. Builder infers result type; `.compile()` produces SQL + parameters + query tree, not application source or server validation. Arbitrary `sql<T>` expressions and `$castTo` trust author. Driver decides runtime values. [Builder source][K-select]; [runtime types][K-types]
- **Nullability/cardinality:** nullable columns stay unions; left joins widen joined columns to nullable. `where(..., 'is not', null)` does not automatically narrow; `$notNull`/`$narrowType` assert knowledge. `execute()` returns array; `executeTakeFirst()` may return undefined; `executeTakeFirstOrThrow()` throws on empty. First-row methods do not check uniqueness or automatically add SQL limit.
- **Transactions:** `db.transaction().execute(async trx => ...)` uses single connection, commits successful callback, rolls back thrown failure. Queries must originate from `trx`; accidentally using outer `db` still typechecks. `Transaction<DB>` can be required by handwritten repository signature. [Implementation][K-tx]
- **Offline:** checked-in generated `db.d.ts` supports new builder queries without database. CLI generation and `--verify` still introspect. Exported `serializeFromMetadata({metadata,dialect,...})` also accepts constructed `DatabaseMetadata` offline; structured metadata is not DDL text or automatically a portable JSON snapshot. Prefer existing generated artifact unless packet already specifies this library boundary. [Generator][K-gen]
- **Observed tests:** [join typings][K-joins] assert nullable left/right/full-join results and reject wrong table aliases; [select typings][K-select-tests] reject unknown columns but allow explicit narrowing/raw type assertions. [Codegen tests][K-tests] compare migrated-DB output to [snapshot][K-snapshot] and exercise metadata-only serialization. `--verify` implementation throws on diff; its drift test only asserts inside `catch`, so that test alone does not prove rejection if no exception occurs.

## Concrete assigned packet: tenant-scoped keyset page

Illustrative packet below is already decided by backend owner. Stack variants demonstrate tool boundary; Charlie receives one prescribed variant. PostgreSQL version/collation pinned by owner; service → repository → caller-owned transaction. IDs immutable, nonempty, ordered under `C` collation. Tenant comes from authenticated context. First cursor `""`; integer page size `1..100`; fetch size `pageSize + 1`.

Supplied `db/schema.sql`:
```sql
CREATE TABLE member (
  tenant_id text NOT NULL, id text COLLATE "C" NOT NULL,
  display_name text NOT NULL, PRIMARY KEY (tenant_id, id)
);
CREATE TABLE task (
  tenant_id text NOT NULL, id text COLLATE "C" NOT NULL CHECK (id <> ''),
  title text NOT NULL, assignee_id text COLLATE "C",
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, assignee_id) REFERENCES member (tenant_id, id)
);
```
Supplied logical query, `db/queries/list_tasks.sql`; `$1=tenantID`, `$2=afterID`, `$3=rowLimit`:
```sql
SELECT t.id, t.title, m.display_name AS assignee_name
FROM task t
LEFT JOIN member m ON m.tenant_id = t.tenant_id AND m.id = t.assignee_id
WHERE t.tenant_id = $1::text AND t.id > $2::text
ORDER BY t.id ASC
LIMIT $3::int4;
```
Prescribed wire shape: `{ items: { id: string; title: string; assignee_name: string | null }[]; next_cursor: string | null }`. Return first `pageSize` rows; cursor is last emitted ID only when extra row exists, otherwise null. Empty page is `items: []`, not null. No total-count query prescribed.

| Assigned variant | Generated/checked work | Charlie's handwritten work |
|---|---|---|
| Go/sqlc | Header `-- name: ListTenantTasks :many`; replace placeholders with `sqlc.arg(tenant_id)`, `sqlc.arg(after_id)`, `sqlc.arg(row_limit)`, retaining casts. Supplied config: pgx/v5, pointer nulls, empty slices, `out: internal/dbgen`. Expected params `{TenantID string; AfterID string; RowLimit int32}`, row `{ID string; Title string; AssigneeName *string}`, method returning `([]ListTenantTasksRow,error)`. | `internal/repository/tasks.go`: call `queries.WithTx(tx).ListTenantTasks(ctx, params)`; validation, DTO JSON names, paging/error mapping. |
| Rust/SQLx | Keep positional parameters; alias joined result `AS "assignee_name?"`. Macro checks handwritten `TaskRow { id: String, title: String, assignee_name: Option<String> }`; generates extraction code inside compiler. Owner supplies matching `.sqlx` metadata. | `src/repository/tasks.rs`: `sqlx::query_file_as!(TaskRow, "db/queries/list_tasks.sql", tenant_id, after_id, row_limit).fetch_all(&mut **tx).await?`, where `tx: &mut Transaction<'_, Postgres>`; result struct, envelope/serialization, validation. |
| TS/PgTyped | Header `/* @name ListTenantTasks */`; parameters `:tenantID!`, `:afterID!`, `:rowLimit!` retaining casts; joined alias `"assignee_name?"`. SQL-mode transform emits `db/queries/list_tasks.queries.ts`: expected required string/string/number params, result `{id:string; title:string; assignee_name:string\|null}`, `listTenantTasks` object. | `src/repository/tasks.ts`: `listTenantTasks.run({tenantID, afterID, rowLimit: pageSize + 1}, client)` using caller's transactional client; envelope/validation. |
| TS/Kysely | Codegen emits `src/db/db.d.ts`: `task`/`member` column interfaces. `assignee_id` nullable in schema; `display_name` becomes nullable in query result through left join. Result type inferred from builder below; query method is not generated. | `src/repository/tasks.ts`: typed builder, envelope/validation; `trx: Transaction<DB>` supplied by caller. |

Kysely's handwritten equivalent; all predicates/projection/order still authored from packet:
```ts
const rows = await trx.selectFrom("task as t")
  .leftJoin("member as m", (join) => join
    .onRef("m.tenant_id", "=", "t.tenant_id")
    .onRef("m.id", "=", "t.assignee_id"))
  .select(["t.id", "t.title", "m.display_name as assignee_name"])
  .where("t.tenant_id", "=", tenantID)
  .where("t.id", ">", afterID)
  .orderBy("t.id", "asc").limit(pageSize + 1).execute()
```
Packet acceptance remains behavioral: cross-tenant tasks excluded; same member ID in another tenant never leaks name; null assignee remains null; fixed fixture pages neither duplicate nor omit IDs; final/empty page cursor null; invalid sizes rejected; caller transaction's uncommitted insert visible and rollback removes it. These requirements are supplied, not discovered by Charlie. Compilation does not establish them.

## Regeneration and reproducibility contract

Reference commands only; none executed here. Record schema/migration revision, engine version/extensions/search path/collation, SQL sources, generator config, type/parser overrides, tool version, compiler features and dependency lockfile alongside generated artifacts. TS nullability guarantees require `strictNullChecks`; use packet's strict typecheck. Keep supplied compatible pins; table records current upstream.

| Route | Native regeneration/check | Restricted/offline consequence |
|---|---|---|
| sqlc | `sqlc generate --no-database --no-remote`; `sqlc diff --no-database --no-remote`; then packet's Go compile/tests. Pin 1.31.1 executable/container digest, Go/pgx dependencies, config and DDL. | DDL + query changes can regenerate offline with built-in analyzer; Go compilation alone does not notice stale generated SQL. |
| SQLx | Matching-schema fixture: `cargo sqlx prepare --workspace -- --all-targets --all-features`; check with `cargo sqlx prepare --check --workspace -- --all-targets --all-features`. Use packet's actual supported feature combinations if all-features conflicts. Pin crate and CLI 0.9.0, Rust, `Cargo.lock`. | `SQLX_OFFLINE=true` build uses checked-in metadata. Changed SQL needs new matching cache; unchanged SQL + changed schema can still compile against stale cache. `prepare --check` requires DB access; offline build is not schema-freshness check. |
| PgTyped | Pinned local `pgtyped -c pgtyped.config.json`, prescribed `failOnError:true`, explicit SQL transform/output paths; review regenerated artifacts/diff and run packet's TS check. Pin CLI 2.4.3 + runtime 2.4.2 independently, driver and lockfile. | Fresh descriptions require running matching PG. With DB access prohibited, packet must supply regenerated query artifacts; do not fabricate query types to claim generation. |
| Kysely | `kysely-codegen --out-file src/db/db.d.ts`; same command with `--verify` compares current introspection. Pin Kysely 0.29.6 + codegen 0.20.0, driver, TS and lockfile. | Existing schema types permit new builder checks offline. CLI freshness check requires DB; metadata serializer can regenerate types only from supplied structured metadata. |

Full source SHA identifies reviewed code; package lock integrity or published release asset SHA256 pins distributed bytes. Re-run generation after query/schema/config/type mapping changes; review generated nullability and DTO differences. DB-dependent regeneration belongs to owner-provided artifacts or separately authorized disposable schema fixtures, never implicit production access in this workflow.

## Guarantees compilation does not supply

- **Meaning/security:** correct tenant predicate, authenticated tenant provenance, RLS policy, authorization, join condition or pagination logic. Removing tenant filter leaves well-typed SQL. Parameter binding protects bound values; unsafe raw SQL/identifier construction remains separate.
- **Cardinality/business constraints:** uniqueness, existence, page bounds, requested nullability, JSON payload schema, numeric precision or custom codec correctness. `:one`, `fetch_one`, and `executeTakeFirstOrThrow` are not proofs of exactly one matching row.
- **Deployment:** production schema matches checked snapshot; migrations applied safely; prepared metadata reflects runtime extensions, role/search path or server behavior. Generation freshness and application compilation answer different questions.
- **Transactions/runtime:** correct client used everywhere, isolation across multiple page requests, retry/idempotency policy, successful commit, deadlock/timeout avoidance, or successful decoding. Transactions expose binding mechanisms; application must use them correctly.
- **Performance:** useful index, chosen plan, bounded latency/memory, or production throughput. No benchmark claims made. Existing packet's integration/acceptance checks remain necessary evidence.

[S-config]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/docs/reference/config.md
[S-annotations]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/docs/reference/query-annotations.md
[S-params]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/docs/howto/named_parameters.md
[S-analysis]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/internal/compiler/output_columns.go
[S-db]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/examples/authors/postgresql/db.go
[S-generate]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/docs/howto/generate.md
[S-ddl]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/docs/howto/ddl.md
[S-cli]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/docs/reference/cli.md
[S-query]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/examples/authors/postgresql/query.sql
[S-generated]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/examples/authors/postgresql/query.sql.go
[S-test]: https://github.com/sqlc-dev/sqlc/blob/v1.31.1/internal/endtoend/endtoend_test.go
[PG-row]: https://github.com/jackc/pgx/blob/v5.8.0/rows.go
[PG-tx]: https://node-postgres.com/features/transactions
[X-macros]: https://github.com/transact-rs/sqlx/blob/v0.9.0/src/macros/mod.rs
[X-tx]: https://github.com/transact-rs/sqlx/blob/v0.9.0/sqlx-core/src/transaction.rs
[X-cache]: https://github.com/transact-rs/sqlx/blob/v0.9.0/sqlx-macros-core/src/query/data.rs
[X-cli]: https://github.com/transact-rs/sqlx/blob/v0.9.0/sqlx-cli/README.md
[X-negative]: https://github.com/transact-rs/sqlx/blob/v0.9.0/tests/ui/postgres/wrong_param_type.stderr
[X-tests]: https://github.com/transact-rs/sqlx/blob/v0.9.0/tests/postgres/macros.rs
[P-syntax]: https://pgtyped.dev/docs/sql-file
[P-cli]: https://pgtyped.dev/docs/cli
[P-describe]: https://github.com/adelsz/pgtyped/blob/v2.4.3/packages/query/src/actions.ts
[P-runtime]: https://github.com/adelsz/pgtyped/blob/249b6282aa5923880477eba41f6725a02659eb0f/packages/runtime/src/tag.ts
[P-bind]: https://github.com/adelsz/pgtyped/blob/249b6282aa5923880477eba41f6725a02659eb0f/packages/runtime/src/preprocessor-sql.ts
[P-query]: https://github.com/adelsz/pgtyped/blob/v2.4.3/packages/example/src/books/books.sql
[P-generated]: https://github.com/adelsz/pgtyped/blob/v2.4.3/packages/example/src/books/books.queries.ts
[P-tests]: https://github.com/adelsz/pgtyped/blob/v2.4.3/packages/example/src/index.test.ts
[K-codegen]: https://github.com/RobinBlomberg/kysely-codegen/blob/0.20.0/README.md
[K-select]: https://github.com/kysely-org/kysely/blob/v0.29.6/src/query-builder/select-query-builder.ts
[K-types]: https://kysely.dev/docs/recipes/data-types
[K-tx]: https://github.com/kysely-org/kysely/blob/v0.29.6/src/kysely.ts
[K-gen]: https://github.com/RobinBlomberg/kysely-codegen/blob/0.20.0/src/generator/generator/generate.ts
[K-joins]: https://github.com/kysely-org/kysely/blob/v0.29.6/test/typings/test-d/join.test-d.ts
[K-select-tests]: https://github.com/kysely-org/kysely/blob/v0.29.6/test/typings/test-d/select.test-d.ts
[K-tests]: https://github.com/RobinBlomberg/kysely-codegen/blob/0.20.0/src/generator/generator/generate.test.ts
[K-snapshot]: https://github.com/RobinBlomberg/kysely-codegen/blob/0.20.0/src/generator/generator/snapshots/postgres.snapshot.ts
