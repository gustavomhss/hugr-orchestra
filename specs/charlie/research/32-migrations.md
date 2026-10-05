# R32 — prescribed backend application migrations

**Decision:** shortlist four mechanisms: editable metadata-diff revisions; schema/history-to-SQL generation; ordered native migration authoring/replay; disposable-DB replay/diff plus assertions. Select through project's existing tooling. Ariga Atlas option conditional on already-selected tooling/edition; avoid framework/DB changes or new migration platform.
**Scope:** Charlie authors, generates, reviews against prescribed delta/order, and verifies supplied fixtures. Responsible owners supply DB, schema change, rename/backfill semantics, strategy, sequencing, paths, transaction policy, and acceptance. Discovery, diagnosis, impact-design, recovery/deploy decisions remain owner responsibilities. Charlie harness persistence already native; this research concerns application schemas only.
**Evidence:** primary docs/source inspected 2026-10-03; examples below illustrative, not captured generator runs. Research performed through document/source reads; migration commands and fixture tests not executed.
**Names:** **Ariga Atlas (`atlasgo.io`, `ariga/atlas`) unrelated to HuGR Atlas foundation.** Neither dependency nor architectural relationship implied.

## Complete owner input packet P — inherited by every candidate

- **Identity/tooling:** task/acceptance IDs; application root; selected DB engine + exact version, extensions/collation/schema; existing runner, generator, driver/adapter, locked versions and licensed edition; executable and config paths.
- **Baseline/target:** immutable migration history and checksums/snapshots; exact starting revision/head(s); complete desired schema/model inputs; managed-object scope; prescribed delta, explicit rename mapping, names and allowed drops. Return unexpected diff to owner.
- **Implementation:** exact phase/file order, dependencies and application compatibility boundaries; supplied backfill expression, NULL/default/conflict policy, batching/restart behavior if required; explicit transaction boundaries, timeouts, exceptions; rollback artifact requirements or forward-only instruction.
- **Paths:** schema/model files; migration/changelog directory; new revision/name/parent; output SQL/code and evidence paths; existing formatting/hooks; permitted generated metadata. Preserve applied history identities.
- **Execution:** owner-provisioned disposable baseline/target fixtures, separate disposable shadow/dev DB where needed, connection references, existing reset/seed/replay commands. No production connection required.
- **Acceptance:** supplied seed rows and expected rows/schema/constraints; commands/assertions and expected errors/exits; relevant replay/no-op, rollback and transaction-failure cases. Missing semantics go back to owner, never inferred from data.
- **Reproducibility:** fixed source/history hashes, generator/DB/driver versions, config, environment/placeholders, naming and prompt answers; compare generation from identical copies of baseline, not successive runs against updated snapshots.

Prompt provides research acceptance, not concrete application fixtures or executable acceptance suite. Tests below are recipes bound to P's supplied acceptance; no claim those fixtures were supplied or passed here.
**Illustrative contract E:** PostgreSQL `users(id integer PRIMARY KEY, name text NULL)`; rows `(1,'Ada'),(2,NULL)`; prescribed rename to `display_name`, fill NULL with `'Unknown'`, then require NOT NULL. Expected rows `(1,'Ada'),(2,'Unknown')`. Example only; no project DB/strategy selection.

## Version/license boundaries

| Implementation examined | Version anchor | License/edition consequence |
|---|---|---|
| Alembic | `1.20.0` / `rel_1_20_0` | MIT. [A1] |
| Drizzle | Kit `0.31.11`; ORM `0.45.3` at same repository tag | Kit MIT; ORM Apache-2.0. Generator layout below follows pinned source, not newer rolling-doc layout. [D1] |
| Prisma Migrate | `7.10.0` | Apache-2.0. Examples use v7 commands. npm `latest` observed `8.0.0-rc.19`, `prev` `7.10.0`; unversioned docs now describe different contract/TypeScript migration workflow. Do not silently upgrade or mix formats. [P1,P2] |
| Flyway | `13.9.0` / `flyway-13.9.0` | Apache-2.0 repository core; Enterprise SQL generation commercial. Core license does not grant Enterprise capability. [F1,F2] |
| Liquibase | Community `5.0.4` | FSL-1.1-ALv2, permitted-use restrictions, Apache-2.0 grant after two years per version; source-available, not presently unrestricted Apache. `4.33.0` source Apache-2.0; preserve selected project version. Secure features separate. [L1] |
| Ariga Atlas | `v1.3.0` source; current edition docs | Community Apache-2.0 core; standard CLI Atlas MSA. Current `migrate lint` and `migrate test` Pro features, absent from Community. Lint became Pro-only in v0.38. [T1,T3] |
| Goose | `v3.28.0` | MIT; SQL runner and Go-function migrations. [G1] |

## 1. Metadata comparison → editable revision → offline SQL

**Fit/leverage:** existing SQLAlchemy/Alembic application. Generates repetitive dialect-aware DDL operations and revision linkage; keeps prescribed custom work in normal Python migration files. [A2,A3]
- **Input:** P + SQLAlchemy `target_metadata`, existing `env.py`/config/template, supplied baseline fixture at prescribed parent, naming conventions and existing comparison/include hooks.
- **Operation → artifact:** `alembic -c "$CONFIG" revision --autogenerate --head "$PARENT" --rev-id "$REV" -m "$NAME"` → revision with `upgrade()`/`downgrade()`. Review/edit prescribed changes; `alembic -c "$CONFIG" upgrade "$PARENT:$REV" --sql` → SQL on stdout for supplied artifact path. Offline rendering needs explicit range; autogenerate itself needs baseline DB reflection.
- **Concrete code:** E requires following hand-edited `upgrade` body; autogenerate ordinarily proposes add/drop for rename, not this preservation operation:
```python
def upgrade():
    op.alter_column("users", "name", new_column_name="display_name")
    op.execute("UPDATE users SET display_name = 'Unknown' WHERE display_name IS NULL")
    op.alter_column("users", "display_name", nullable=False)
```
- **Manual still required:** rename replacement, supplied backfill and phase ordering, unsupported/custom objects, downgrade semantics. E's NULL replacement loses original NULL provenance; reverse DDL cannot restore it. Offline SQL cannot render Python logic that requires reading live rows.
- **Determinism:** fixed revision ID controls one variable; template `Create Date`, reflection/dialect versions and hooks still affect bytes. Pin these inputs; compare ordered operations/SQL with explicitly identified header metadata ignored only in comparison view. Keep original artifacts intact. [A1]
- **Transactions:** existing `env.py` + dialect determine transactional DDL; `transaction_per_migration` controls boundary. `autocommit_block()` unconditionally commits preceding transaction, so owner-prescribed nontransactional statements break whole-run atomicity. [A4]
- **Dangerous misclaim:** “`alembic check` proves migration correct.” It only reports whether autogenerate finds pending operations, sharing its blind spots. Named CHECK comparison in 1.20 is opt-in/name-only; same-name expression changes can escape detection. [A2]
- **Useful supplied-acceptance test:** replay P's exact parent + populated fixture through `$REV`; compare expected values, keys and constraints. For E, replacing rename with drop/add must fail value-preservation assertion. Then `alembic check` supplements row assertions; run downgrade/re-upgrade only when P requires it.

## 2. Schema snapshots/history → reviewable SQL draft

**Fit/leverage:** already-selected Drizzle or Prisma project. Removes hand-transcription of schema additions/types/indexes; native metadata keeps subsequent generation aligned. These are interchangeable mechanisms conceptually, not interchangeable migration directories. [D2,P3]
- **Input:** P + either Drizzle TS schema, complete `meta` snapshots/journal and dialect/casing options, or Prisma v7 schema/config, migration history/lock and disposable shadow connection. Owner provides rename answers and target file/phase boundaries.
- **Drizzle operation → artifact:** `drizzle-kit generate --config="$CONFIG" --name="$NAME"` compares TS-derived snapshot to previous snapshot without needing DB credentials → `<prefix>_<name>.sql`, `meta/<prefix>_snapshot.json`, updated `meta/_journal.json` in Kit 0.31.11. `generate --custom` scaffolds custom SQL, not a backfill implementation. Schema/config imports can themselves execute code. [D2]
- **Prisma operation → artifact:** `prisma migrate dev --config "$CONFIG" --create-only --name "$NAME"` → `<timestamp>_<name>/migration.sql`. It replays shadow history and can apply already-pending migrations to development DB before creating draft; **`--create-only` is not no-writes**. Supplied disposable connections essential. [P3,P4]
- **Narrow Prisma generation:** `prisma migrate diff --config "$CONFIG" --from-migrations "$HISTORY" --to-schema "$SCHEMA" --script --output "$SQL"` emits SQL without applying target migration; history comparison still uses shadow DB. Owner/project convention must place resulting SQL into migration history. [P4]
- **Concrete final SQL for E:** Drizzle rename prompt can select prescribed rename; Prisma rename needs replacing generated drop/add. Backfill inserted manually before constraint:
```sql
ALTER TABLE "users" RENAME COLUMN "name" TO "display_name";
UPDATE "users" SET "display_name" = 'Unknown' WHERE "display_name" IS NULL;
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;
```
- **Manual still required:** backfill implementation, unsupported DDL, owner-defined phase splitting and transaction exceptions. A rename prompt asks for meaning; it does not discover meaning. Drizzle custom migrations preserve previous snapshot state, so raw schema-changing SQL needs project-prescribed model/snapshot reconciliation. [D2]
- **Determinism:** Drizzle uses random snapshot UUIDs and journal wall-clock times; unnamed migrations also get generated names. Prisma directories timestamped. Fixed names do not make full artifacts byte-reproducible. Compare ordered SQL from same baseline, retain metadata and validate parent/order relations; never rewrite execution timestamps just to obtain matching hashes. [D2]
- **Transactions:** pinned Drizzle PostgreSQL ORM migrator wraps pending migration statements/history inserts together; history-table setup occurs beforehand. Other adapters differ; statement breakpoints are not transaction boundaries. Prisma v7 PostgreSQL renderer does not add explicit BEGIN/COMMIT by default; owner may prescribe them. MySQL implicit DDL commits defeat blanket rollback claims. [D3,P5]
- **Dangerous misclaim:** “Drizzle `check` proves SQL/data correctness” or “Prisma shadow replay proves backfill.” Kit check validates snapshot format/lineage and warns on journal timestamps; it does not execute SQL. Shadow schema replay is not supplied populated-fixture verification. [D3,P4]
- **Useful supplied-acceptance test:** selected `drizzle-kit migrate --config="$CONFIG"`/ORM `migrate()` or `prisma migrate deploy --config "$CONFIG"` against P's populated prior-version fixture; assert expected rows/NOT NULL/unique/FK constraints. Replay complete history from empty fixture when required. For E, wrong-constant backfill can leave matching schema but must fail value assertion. Prisma v7 `migrate diff --exit-code` supplements this: 0 empty, 2 differences, 1 error. [P4]

## 3. Explicit ordered changes → native packaging, SQL preview and replay

**Fit/leverage:** SQL-first project already using Flyway, Liquibase or Goose. Greatest gain: consistent file/changeset identity, order, SQL rendering and repeatable fixture execution. Goose/Flyway-core scaffolding does not infer schema delta. [F2,F3,L2,G1]
- **Input:** P + runner's existing locations/changelog, version allocator/parent, SQL delimiter conventions, fixed placeholder values; Liquibase author/ID/logical path/contexts/labels; Goose SQL or existing compiled Go-migration registration; fixture history table. Optional generation inputs must be owner-supplied desired/baseline schemas or preselected diff artifact/change IDs.
- **Operation → artifact:** Flyway author `V0042__r32.sql`; Goose `goose -dir "$DIR" -s create r32 sql` scaffolds next sequence file; Liquibase author explicit XML/YAML/JSON/formatted-SQL changeset and `liquibase --output-file="$SQL" update-sql --changelog-file="$CHANGELOG" --url="$FIXTURE"` renders SQL preview. Native naming/identity stays project-owned.
- **Generation when already selected:** Liquibase `diff-changelog --reference-url="$DESIRED" --url="$BASELINE" --changelog-file="$DRAFT"` compares supplied snapshots/fixture DBs → candidate changesets; `generate-changelog` instead captures a baseline, not incremental intent. Flyway Enterprise `generate` consumes supplied `diff` artifact, selected change IDs/direction and explicit version/path → V/U scripts; core `migrate` is not this generator. [F2,L2]
- **Concrete artifact:** E's three SQL statements from §2 inside `V0042__r32.sql`, or under Goose `-- +goose Up`, or following Liquibase headers below. Values/rename SQL authored from P, not generated by scaffolder:
```sql
--liquibase formatted sql
--changeset app-owner:r32 runInTransaction:true
ALTER TABLE "users" RENAME COLUMN "name" TO "display_name";
UPDATE "users" SET "display_name" = 'Unknown' WHERE "display_name" IS NULL;
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;
```
- **Manual still required:** all SQL for plain runner, semantic renames/backfills even with diff generation, changeset/phase ordering, procedures/delimiters and requested reverse code. Liquibase diff docs explicitly require completeness/dependency review; some stored-object diffs require Secure. Generated undo schema cannot resurrect discarded data. [L2,G1]
- **Determinism:** prescribed IDs/versions, explicit changelog order and fixed placeholders make handwritten artifacts reproducible. Goose default timestamp naming differs; `-s` follows existing directory state. Liquibase diff IDs derive from wall clock; Flyway generation can auto-name/version. Pin baselines/options and review resulting ordered statements; checksums detect covered content changes, not business correctness or authorship. [L3,F2]
- **Transactions:** Flyway normally per migration where supported (`group` changes scope; script `executeInTransaction` override); Liquibase normally per changeset, `runInTransaction:false` disables; Goose normally per file, `-- +goose NO TRANSACTION` disables both Up/Down. DB implicit commits/nontransactional DDL can leave partial effects. Goose procedural blocks need `StatementBegin`/`StatementEnd`. [F4,L3,G1]
- **Dangerous misclaim:** “validate means SQL will work.” Flyway checks resolved/applied history and checksums; Liquibase checks changelog structure/identity/checksums, not SQL correctness; Goose validate parses migration files, not DB semantics. Goose default store records versions, not Flyway-style SQL checksums. Liquibase validate may create tracking tables: not guaranteed read-only. [F3,L4,G2]
- **Useful supplied-acceptance test:** run chosen runner (`flyway migrate`, `liquibase update`, or `goose … up-to "$REV"`) only on supplied fixture; assert P's order, values, constraints and applied revision. Rerun: supplied no-op expectation must hold. Mutate meaningful SQL in applied immutable versioned migration/non-`runOnChange` changeset copy: Flyway/Liquibase checksum validation should reject under normal validation policy; Goose has no equivalent expectation. For P's atomicity acceptance, injected later failure must leave asserted prior state/history; otherwise verify prescribed partial-state expectation.

## 4. Replay-based SQL generation + migration assertions — conditional Ariga Atlas

**Fit/leverage:** existing Ariga Atlas setup, or already-selected compatible generation integration. Reconstructs baseline by replaying history on disposable DB, computes SQL delta, and can test data transitions between exact revisions. SQL-format adapters alone do not justify adding a second migration platform. [T2,T4]
- **Input:** P + complete migration directory/checksum, supplied target SQL/HCL/existing ORM loader, existing directory format, dedicated same-engine dev URL, explicit version/format policy; supplied `.test.hcl` acceptance or exact SQL assertions; existing Pro entitlement if lint/test required.
- **Operation → artifact:** `atlas migrate diff "$NAME" --dir "$DIR_URL" --to "$TARGET_URL" --dev-url "$DEV_URL"` → timestamped SQL + `atlas.sum`; baseline replay writes dev DB. Existing compatible Flyway/Goose/Liquibase directory formats supported, but retain native runner and verify its exact parsing/transaction behavior. [T2]
- **Concrete SQL:** simple prescribed optional-column delta can yield `ALTER TABLE "users" ADD COLUMN "nickname" text NULL;`. For E, reviewed final SQL must implement §2, irrespective of diff's proposed add/drop pairing. SQL examples illustrative; actual formatting depends on pinned renderer.
- **Manual still required:** owner's rename/backfill semantics, unsupported objects, exact phase sequence and nontransactional annotations. After intentional edits to unapplied SQL, native Atlas checksum must be regenerated with `atlas migrate hash --dir "$DIR_URL"`; hash update is integrity bookkeeping, not correctness approval.
- **Determinism:** SQL depends on identical replay history, target, DB version, schema qualifiers and formatting; default filenames use time, changing checksum manifest. Keep native metadata; compare ordered SQL separately. Planner's DDL dependency order does not supply application's expand/backfill/contract design. [T2]
- **Transactions:** Atlas runner defaults one transaction/file; `--tx-mode all|file|none`, per-file `-- atlas:txmode none`. Nontransactional operations and MySQL implicit commits invalidate full rollback assumptions. Atlas directives do not configure another runner's transaction mode. [T5]
- **Dangerous misclaim:** “Apache Atlas includes lint/testing” or “lint certifies migration safe.” Current CE omits both commands; Pro lint reports configured analyzers' findings, not proof of data preservation, production lock duration or rollout suitability. Use only checks already supplied in P; report findings to responsible owner. [T1,T3]
- **Useful supplied-acceptance test:** `atlas migrate test --dir "$DIR_URL" --dev-url "$DEV_URL" "$TEST_FILE"` on already-entitled setup: exact prior revision → supplied seed → target revision → expected SQL results. E adaptation below; replacing backfill with wrong value must fail. Existing native-runner fixture replay still required when another runner executes final artifacts. [T4]
```hcl
test "migrate" "r32_values" {
  migrate { to = "20261002000100" }
  exec { sql = "INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, NULL)" }
  migrate { to = "20261003000100" }
  exec {
    sql    = "SELECT id, display_name FROM users ORDER BY id"
    output = <<CSV
1,Ada
2,Unknown
CSV
  }
}
```

## Integration and evidence contract

- Route P to selected project command; author only prescribed model/migration/backfill artifacts. Prefer §1/§2 where native generator exists, §3 for explicit SQL projects; §4 only existing integration. No migration ownership transfer, shared service, new ledger or Charlie persistence subsystem.
- Preserve reviewable original SQL/code and required journal/snapshot/checksum files; attach input/version fingerprints, prompt answers, exact commands, stdout/stderr, exit status, fixture identity and actual assertions executed. Timestamp normalization belongs only in comparison evidence.
- Fixture evidence must demonstrate relevant nonempty seed, named target revision actually applied, exact expected rows and constraints. Empty schema diff, checksum match, preview SQL and successful command each answer narrower questions.
- Verify with actual selected DB/adapter and supplied fixture, including dirty/NULL/duplicate cases named in acceptance; do not substitute SQLite for PostgreSQL. Verify rerun and failure boundaries only to extent P requires. Test app compatibility with owner-supplied checks, not guessed deployment ordering.
- Include matching positive and negative controls: expected SQL/rows recognized; wrong backfill/drop-add rename or missing expected artifact fails corresponding assertion. Missing fixtures, skipped tests, unsupported edition and command failure remain explicit unverified outcomes, never passes.
- **Research result:** source-grounded mechanism shortlist and verification recipes. Execution performance, byte determinism and application-specific correctness remain unmeasured in this research-only task.

## Primary sources

- [A1] Alembic [1.20.0 license](https://github.com/sqlalchemy/alembic/blob/rel_1_20_0/LICENSE), [revision template](https://github.com/sqlalchemy/alembic/blob/rel_1_20_0/alembic/templates/generic/script.py.mako).
- [A2] Alembic [autogenerate limits, CHECK behavior and check command](https://alembic.sqlalchemy.org/en/latest/autogenerate.html).
- [A3] Alembic [offline SQL and revision ranges](https://alembic.sqlalchemy.org/en/latest/offline.html).
- [A4] Alembic [transaction configuration](https://alembic.sqlalchemy.org/en/latest/api/runtime.html), [1.20.0 autocommit source](https://github.com/sqlalchemy/alembic/blob/rel_1_20_0/alembic/runtime/migration.py).
- [D1] Pinned Drizzle [Kit manifest](https://github.com/drizzle-team/drizzle-orm/blob/drizzle-kit%400.31.11/drizzle-kit/package.json), [ORM manifest](https://github.com/drizzle-team/drizzle-orm/blob/drizzle-kit%400.31.11/drizzle-orm/package.json).
- [D2] Drizzle [generate docs](https://orm.drizzle.team/docs/drizzle-kit-generate), [pinned generation/writer/rename source](https://github.com/drizzle-team/drizzle-orm/blob/drizzle-kit%400.31.11/drizzle-kit/src/cli/commands/migrate.ts), [snapshot UUID/custom behavior](https://github.com/drizzle-team/drizzle-orm/blob/drizzle-kit%400.31.11/drizzle-kit/src/migrationPreparator.ts).
- [D3] Drizzle [check scope](https://github.com/drizzle-team/drizzle-orm/blob/drizzle-kit%400.31.11/drizzle-kit/src/cli/commands/check.ts), [PostgreSQL migration transaction](https://github.com/drizzle-team/drizzle-orm/blob/drizzle-kit%400.31.11/drizzle-orm/src/pg-core/dialect.ts).
- [P1] Prisma [7.10.0 release](https://github.com/prisma/orm/releases/tag/7.10.0), [license](https://github.com/prisma/orm/blob/7.10.0/LICENSE), [npm dist-tags](https://registry.npmjs.org/-/package/prisma/dist-tags).
- [P2] Current Prisma [contract migration generation](https://www.prisma.io/docs/orm/migrations/generating-a-migration), [TypeScript edits/recompilation](https://www.prisma.io/docs/orm/migrations/editing-a-migration); version boundary evidence, not v7 instructions.
- [P3] Prisma [v7 customization/rename/backfill](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations).
- [P4] Prisma [7.10.0 MigrateDev source](https://github.com/prisma/orm/blob/7.10.0/packages/migrate/src/commands/MigrateDev.ts), [MigrateDiff flags/exits](https://github.com/prisma/orm/blob/7.10.0/packages/migrate/src/commands/MigrateDiff.ts), [shadow replay](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/shadow-database).
- [P5] Prisma [transaction defaults](https://www.prisma.io/blog/prisma-migrate-dx-primitives), [7.10.0 renderer default](https://github.com/prisma/prisma-engines/blob/7.10.0/schema-engine/connectors/sql-schema-connector/src/sql_renderer.rs), [PostgreSQL renderer](https://github.com/prisma/prisma-engines/blob/7.10.0/schema-engine/connectors/sql-schema-connector/src/flavour/postgres/renderer.rs).
- [F1] Flyway [13.9.0 core license](https://github.com/flyway/flyway/blob/flyway-13.9.0/LICENSE.txt).
- [F2] Flyway [Enterprise generate, diff artifact and output](https://documentation.red-gate.com/flyway/reference/commands/generate).
- [F3] Flyway [validate scope/checksums](https://documentation.red-gate.com/flyway/reference/commands/validate).
- [F4] Flyway [transaction handling](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/migration-transaction-handling).
- [L1] Liquibase [5.0.4 FSL](https://github.com/liquibase/liquibase/blob/v5.0.4/LICENSE.txt), [4.33.0 Apache license](https://github.com/liquibase/liquibase/blob/v4.33.0/LICENSE.txt).
- [L2] Liquibase [Community 5.0.4 diff-changelog, direction, limits and editions](https://docs.liquibase.com/community/reference-guide-5-0-4/database-inspection-change-tracking-and-utility-commands/diff-changelog), [SQL preview](https://docs.liquibase.com/commands/update/update-sql.html).
- [L3] Liquibase [5.0.4 changeset transaction source](https://github.com/liquibase/liquibase/blob/v5.0.4/liquibase-standard/src/main/java/liquibase/changelog/ChangeSet.java), [time-based generated IDs](https://github.com/liquibase/liquibase/blob/v5.0.4/liquibase-standard/src/main/java/liquibase/diff/output/changelog/DiffToChangeLog.java), [runInTransaction](https://docs.liquibase.com/reference-guide/changelog-attributes/runintransaction).
- [L4] Liquibase [validate reach and tracking-table side effects](https://docs.liquibase.com/commands/utility/validate.html).
- [G1] Goose [v3.28.0 commands, SQL/Go migrations, annotations, transactions and MIT license](https://github.com/pressly/goose/blob/v3.28.0/README.md).
- [G2] Goose [validate implementation](https://github.com/pressly/goose/blob/v3.28.0/cmd/goose/main.go), [default version-store interface](https://github.com/pressly/goose/blob/v3.28.0/database/store.go).
- [T1] Ariga Atlas [v1.3.0 license](https://github.com/ariga/atlas/blob/v1.3.0/LICENSE), [Community versus standard/MSA/Pro](https://atlasgo.io/community-edition).
- [T2] Ariga Atlas [replay/diff, generated SQL, checksum and directory formats](https://atlasgo.io/versioned/diff).
- [T3] Ariga Atlas [lint scope and v0.38 entitlement change](https://atlasgo.io/versioned/lint).
- [T4] Ariga Atlas [migration fixture tests, expected results and Pro requirement](https://atlasgo.io/testing/migrate).
- [T5] Ariga Atlas [transaction modes/directives and DB limitations](https://atlasgo.io/versioned/apply).
