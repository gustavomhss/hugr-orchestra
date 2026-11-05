# Squawk 2.67.0 rule evidence

Source-only packet for the exact `RULES` in `packages/core/src/review/catalog/phase4.ts` at
`8307aabb1b`. The [tagged upstream tree](https://api.github.com/repos/sbdchd/squawk/git/trees/v2.67.0?recursive=1)
was enumerated first (response not truncated); the linked tagged docs and source were fetched read-only.
Each row paraphrases source behavior, not an assertion that the warning proves a live defect.
No deployed PostgreSQL version, data size, workload, framework or rollout is assumed. Class,
severity, scope and triage remain lead decisions; no runtime catalog is changed here.

## Rule-by-rule tagged evidence

Each link points to the exact upstream `v2.67.0` source, not the current documentation site.

| Catalog rule and tagged source | Source behavior / qualification for triage |
|---|---|
| [require-concurrent-index-creation](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-concurrent-index-creation.md) | Normal creation blocks updates while allowing reads; the rule ignores indexes on tables created in the same transaction. |
| [require-concurrent-index-deletion](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-concurrent-index-deletion.md) | Normal DROP INDEX takes ACCESS EXCLUSIVE; concurrent deletion waits for conflicting transactions. |
| [constraint-missing-not-valid](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/constraint-missing-not-valid.md) | New constraints normally scan the table and block writes; NOT VALID followed by validation changes the lock/scan path. |
| [adding-field-with-default](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-field-with-default.md) | A default can trigger a blocking table rewrite; upstream distinguishes PG 11+ non-VOLATILE defaults from VOLATILE defaults. |
| [adding-foreign-key-constraint](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-foreign-key-constraint.md) | Validation scans and takes SHARE ROW EXCLUSIVE on both tables, blocking writes; upstream proposes NOT VALID then separate validation. |
| [changing-column-type](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/changing-column-type.md) | Type changes can block access and break readers; upstream notes binary-coercible conversions can avoid a rewrite. |
| [adding-not-nullable-field](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-not-nullable-field.md) | Setting an existing column NOT NULL may scan/fail on NULLs or break old writers; adding a new NOT NULL column belongs to a different rule. |
| [adding-serial-primary-key-field](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-serial-primary-key-field.md) | Building a primary-key constraint can hold ACCESS EXCLUSIVE; upstream suggests building an index then using it for the constraint. |
| [renaming-column](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/renaming-column.md) | Existing clients can break when a column is renamed; application-level rename or staged migration may avoid the break. |
| [renaming-table](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/renaming-table.md) | Existing app versions can depend on the old table name during deployment. |
| [disallowed-unique-constraint](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/disallowed-unique-constraint.md) | Adding UNIQUE directly blocks reads/writes while its index is built; upstream describes a concurrent index then constraint. |
| [ban-drop-database](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-database.md) | Dropping a database can break existing clients; assess the actual target and intent. |
| [prefer-bigint-over-int](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-bigint-over-int.md) | A 32-bit integer can hit its maximum; need actual value growth and domain to assess risk. |
| [prefer-bigint-over-smallint](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-bigint-over-smallint.md) | A 16-bit integer can hit its maximum; source suggests bigint rather than proving a particular overflow. |
| [prefer-identity](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-identity.md) | Serial types complicate permissions and schema management; identity columns are standard SQL with different usability. |
| [prefer-repack](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-repack.md) | VACUUM FULL and CLUSTER require ACCESS EXCLUSIVE, blocking reads and writes during the operation. |
| [prefer-robust-stmts](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-robust-stmts.md) | A partially applied migration may fail again on retry if its statements are not robust to prior progress. |
| [prefer-text-field](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-text-field.md) | Changing a varchar size can require a blocking lock; upstream discusses text plus a check constraint as an alternative. |
| [prefer-timestamp-tz](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-timestamptz.md) | A timestamp without time zone drops the UTC offset; the tagged doc's filename is `prefer-timestamptz`, not the catalog spelling. |
| [ban-char-field](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-char-field.md) | The doc warns about blank-padding/storage costs of `character` and suggests text or varchar; this is not proof of incorrect output. |
| [ban-drop-column](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-column.md) | A dropped column can break clients still reading or writing it; verify staged rollout and dependencies. |
| [ban-drop-table](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-table.md) | Dropping a table breaks clients that still use it and removes its contents. |
| [ban-drop-not-null](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-not-null.md) | Removing NOT NULL can expose clients to NULL where they previously relied on the constraint. |
| [transaction-nesting](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/transaction-nesting.md) | PostgreSQL does not support nested transactions; an implicit migration wrapper can make explicit BEGIN/COMMIT disruptive. |
| [adding-required-field](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-required-field.md) | A new NOT NULL column without a default fails on populated tables and can break old INSERT callers. |
| [ban-concurrent-index-creation-in-transaction](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-concurrent-index-creation-in-transaction.md) | CREATE INDEX CONCURRENTLY is not allowed in a transaction, including one supplied by a migration tool. |
| [unused-ignore](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/ignore.rs#L83-L128) | **Source, not a rule doc:** an unknown suppression-rule name emits `Rule::UnusedIgnore` with `unknown name`; do not claim every unused valid suppression is detected. |
| [ban-create-domain-with-constraint](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-create-domain-with-constraint.md) | Reusable domains with check constraints have poor online-migration support; changing a domain constraint can affect dependent columns. |
| [ban-alter-domain-with-add-constraint](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-alter-domain-with-add-constraint.md) | Domain constraints can be shared by many columns, making online constraint changes difficult; check actual dependencies. |
| [ban-truncate-cascade](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-truncate-cascade.md) | TRUNCATE CASCADE also truncates tables referencing the selected tables through foreign keys. |
| [require-timeout-settings](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-timeout-settings.md) | Deprecated alias for `require-lock-timeout` and `require-statement-timeout`, still accepted in config and ignore comments; do not claim a distinct default emitted rule. |
| [ban-uncommitted-transaction](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-uncommitted-transaction.md) | A transaction without COMMIT can make a migration appear successful without applying its changes. |
| [require-enum-value-ordering](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-enum-value-ordering.md) | ADD VALUE without BEFORE/AFTER appends; this can violate an ordering meaningful to the application. |
| [require-table-schema](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-table-schema.md) | Without an explicit schema, `search_path` can make the target ambiguous; opt-in per tagged [linter](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/lib.rs#L124-L133). |
| [identifier-too-long](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/identifier-too-long.md) | PostgreSQL truncates identifiers beyond 63 bytes, so the resulting name can differ from the requested name. |
| [require-concurrent-partition-detach](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-concurrent-partition-detach.md) | A normal detach takes ACCESS EXCLUSIVE and prevents reads/writes; applicability of CONCURRENTLY depends on actual environment. |
| [require-concurrent-reindex](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-concurrent-reindex.md) | REINDEX without CONCURRENTLY takes a blocking ACCESS EXCLUSIVE lock on the index's table. |
| [require-lock-timeout](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-lock-timeout.md) | A lock timeout bounds time spent waiting to acquire locks; inspect the migration's actual configuration. |
| [require-statement-timeout](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-statement-timeout.md) | A statement timeout helps limit long-running migrations consuming database resources. |
| [ban-duplicate-column-assignments](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-duplicate-column-assignments.md) | Repeated declaration or assignment of a column can produce a PostgreSQL runtime error. |
| [ban-drop-view](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-view.md) | Dropping a view or materialized view can break queries from existing clients. |
| [ban-drop-function](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-function.md) | Dropping a function or procedure can break existing calls; assess actual callers. |
| [ban-drop-type](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-type.md) | Casts and parameters using the type can fail; CASCADE can also drop columns of that type. |
| [ban-drop-default](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-default.md) | An INSERT omitting a NOT NULL column can fail; for a nullable column it can silently insert NULL. |
| [ban-drop-trigger](https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-trigger.md) | Dropping a trigger can silently change behavior such as audit rows or timestamps; this rule is opt-in. |

## Scope and verification limits

- The tagged [rule enum, names and opt-in/alias logic](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/lib.rs#L74-L140)
  distinguish inventory from the rules actually run. `require-timeout-settings` expands to the two
  granular rules; `require-table-schema` and `ban-drop-trigger` are opt-in. Do not assume all 45 emit.
- The tagged [README example](https://github.com/sbdchd/squawk/blob/v2.67.0/README.md#usage) shows
  a non-concurrent index warning; the specific docs above source both the required-column and
  concurrent-index traps. Recommendations require actual deployed environment and data context.
- All linked rule-document fetches returned HTTP 200; `unused-ignore` has no matching doc in the
  enumerated tree and is supported above by its fetched source instead. No other source failure was
  observed in these requested rows. This is not binary conformance or a completed runtime catalog.
- No binaries, tests, CI, generator, install, benchmark or evaluation ran for this packet.
