import squawk from "../../backend-toolkit/packs/squawk"

// Tagged v2.67.0 evidence (e5ddccc380). Rule objects carry only schema fields; source URLs stay in comments.
// Inventory is not emission: require-timeout-settings is a deprecated alias, and require-table-schema and
// ban-drop-trigger are opt-in. A warning is not a confirmed defect.

const DESCRIPTORS = [
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-concurrent-index-creation.md
  { rule: "require-concurrent-index-creation", triage: "require-concurrent-index-creation: normal creation blocks updates while allowing reads, and ignores an index on a table created in the same transaction. Confirm the live lock; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-concurrent-index-deletion.md
  { rule: "require-concurrent-index-deletion", triage: "require-concurrent-index-deletion: DROP INDEX takes ACCESS EXCLUSIVE; concurrent deletion waits on conflicting transactions. Confirm that wait on the deployed database; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/constraint-missing-not-valid.md
  { rule: "constraint-missing-not-valid", triage: "constraint-missing-not-valid: a new constraint scans the table and blocks writes; NOT VALID then validation changes the lock and scan. Confirm existing rows; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-field-with-default.md
  { rule: "adding-field-with-default", triage: "adding-field-with-default: a default can trigger a blocking rewrite. PG 11+ non-VOLATILE defaults differ from VOLATILE. Confirm server version and table size; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-foreign-key-constraint.md
  { rule: "adding-foreign-key-constraint", triage: "adding-foreign-key-constraint: validation scans and takes SHARE ROW EXCLUSIVE on both tables, blocking writes. Confirm both tables' data; NOT VALID then validation is the sourced alternative." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/changing-column-type.md
  { rule: "changing-column-type", triage: "changing-column-type: a type change can block access and break readers. A binary-coercible conversion can avoid a rewrite. Confirm readers and whether a rewrite runs." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-not-nullable-field.md
  { rule: "adding-not-nullable-field", triage: "adding-not-nullable-field: SET NOT NULL on an existing column may scan, fail on NULLs, or break old writers. A new NOT NULL column is a different rule. Confirm existing NULLs and writers." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-serial-primary-key-field.md
  { rule: "adding-serial-primary-key-field", triage: "adding-serial-primary-key-field: building the primary-key constraint can hold ACCESS EXCLUSIVE. Confirm that lock on the live table; the warning alone does not prove it." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/renaming-column.md
  { rule: "renaming-column", triage: "renaming-column: existing clients can break when a column is renamed. Confirm deployed callers still use the old name; the rename warning alone is not a confirmed break." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/renaming-table.md
  { rule: "renaming-table", triage: "renaming-table: existing app versions can depend on the old table name during deployment. Confirm those callers; the rename warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/disallowed-unique-constraint.md
  { rule: "disallowed-unique-constraint", triage: "disallowed-unique-constraint: adding UNIQUE directly blocks reads and writes while its index is built. Confirm table size and lock; a concurrent index then constraint is the sourced alternative." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-database.md
  { rule: "ban-drop-database", triage: "ban-drop-database: dropping a database can break existing clients. Confirm the actual target and intent; the statement alone does not prove a live outage." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-bigint-over-int.md
  { rule: "prefer-bigint-over-int", triage: "prefer-bigint-over-int: a 32-bit integer can hit its maximum. Confirm actual value growth and domain; the type warning alone does not prove overflow." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-bigint-over-smallint.md
  { rule: "prefer-bigint-over-smallint", triage: "prefer-bigint-over-smallint: a 16-bit integer can hit its maximum. The source suggests bigint and does not prove an overflow without existing data." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-identity.md
  { rule: "prefer-identity", triage: "prefer-identity: serial types complicate permissions and schema management; identity is standard SQL with different usability. Require actual harm and existing caller or permission constraints; a style warning is not confirmed." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-repack.md
  { rule: "prefer-repack", triage: "prefer-repack: VACUUM FULL and CLUSTER take ACCESS EXCLUSIVE and block reads and writes. Confirm that lock on the live table; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-robust-stmts.md
  { rule: "prefer-robust-stmts", triage: "prefer-robust-stmts: a partially applied migration may fail again on retry if statements are not robust to prior progress. Confirm the retry path and existing partial state." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-text-field.md
  { rule: "prefer-text-field", triage: "prefer-text-field: changing a varchar size can take a blocking lock. Text plus a check constraint is the sourced alternative. Confirm the lock and existing values." },
  // Tagged doc filename is prefer-timestamptz.md, not the catalog spelling.
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/prefer-timestamptz.md
  { rule: "prefer-timestamp-tz", triage: "prefer-timestamp-tz: timestamp without time zone drops the UTC offset. Confirm stored values and callers; the warning alone does not prove harm." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-char-field.md
  { rule: "ban-char-field", triage: "ban-char-field: character blank-pads and costs storage; text or varchar is suggested. This is not proof of incorrect output. Require actual harm and existing data or caller constraints." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-column.md
  { rule: "ban-drop-column", triage: "ban-drop-column: a dropped column can break clients still reading or writing it. Confirm staged rollout and dependencies; the drop warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-table.md
  { rule: "ban-drop-table", triage: "ban-drop-table: dropping a table breaks clients that still use it and removes its contents. Confirm those callers and the data; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-not-null.md
  { rule: "ban-drop-not-null", triage: "ban-drop-not-null: removing NOT NULL can expose clients to NULL where they relied on the constraint. Confirm those callers; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/transaction-nesting.md
  { rule: "transaction-nesting", triage: "transaction-nesting: PostgreSQL has no nested transactions; an implicit migration wrapper can make explicit BEGIN/COMMIT disruptive. Confirm that wrapper; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/adding-required-field.md
  { rule: "adding-required-field", triage: "adding-required-field: a new NOT NULL column without a default fails on a populated table and can break old INSERT callers. Confirm existing rows and callers." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-concurrent-index-creation-in-transaction.md
  { rule: "ban-concurrent-index-creation-in-transaction", triage: "ban-concurrent-index-creation-in-transaction: CREATE INDEX CONCURRENTLY is forbidden in a transaction, including one a migration tool supplies. Confirm that wrapper; a hit is not yet a live lock." },
  // No rule doc. https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/ignore.rs#L83-L128
  { rule: "unused-ignore", triage: "unused-ignore: an unknown suppression-rule name emits Rule::UnusedIgnore. Do not claim every unused valid suppression is detected. Confirm the name is unknown; this is not a migration defect by itself." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-create-domain-with-constraint.md
  { rule: "ban-create-domain-with-constraint", triage: "ban-create-domain-with-constraint: a domain check constraint has poor online-migration support and a later change can affect dependent columns. Confirm those columns; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-alter-domain-with-add-constraint.md
  { rule: "ban-alter-domain-with-add-constraint", triage: "ban-alter-domain-with-add-constraint: a domain constraint can be shared by many columns, so an online change is hard. Confirm actual dependents; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-truncate-cascade.md
  { rule: "ban-truncate-cascade", triage: "ban-truncate-cascade: TRUNCATE CASCADE also truncates tables that reference the target through foreign keys. Confirm those tables and their data; the warning alone does not." },
  // Deprecated alias of the two granular timeout rules. https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-timeout-settings.md
  { rule: "require-timeout-settings", triage: "require-timeout-settings: deprecated alias of require-lock-timeout and require-statement-timeout, still accepted in config and ignore comments. Do not claim a distinct rule is emitted by default." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-uncommitted-transaction.md
  { rule: "ban-uncommitted-transaction", triage: "ban-uncommitted-transaction: a transaction without COMMIT can make a migration look successful without applying its changes. Confirm the tool commits; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-enum-value-ordering.md
  { rule: "require-enum-value-ordering", triage: "require-enum-value-ordering: ADD VALUE without BEFORE/AFTER appends, which can violate an ordering the application relies on. Confirm that ordering; the warning alone does not." },
  // Opt-in. https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-table-schema.md
  { rule: "require-table-schema", triage: "require-table-schema: without an explicit schema, search_path can make the target ambiguous. Opt-in, not emitted by default. Confirm the path and that the rule is enabled." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/identifier-too-long.md
  { rule: "identifier-too-long", triage: "identifier-too-long: PostgreSQL truncates identifiers beyond 63 bytes, so the stored name can differ from the requested name. Confirm the byte length; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-concurrent-partition-detach.md
  { rule: "require-concurrent-partition-detach", triage: "require-concurrent-partition-detach: a normal detach takes ACCESS EXCLUSIVE and blocks reads and writes. CONCURRENTLY depends on the environment. Confirm version and lock." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-concurrent-reindex.md
  { rule: "require-concurrent-reindex", triage: "require-concurrent-reindex: REINDEX without CONCURRENTLY takes ACCESS EXCLUSIVE on the index's table. Confirm that blocking lock; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-lock-timeout.md
  { rule: "require-lock-timeout", triage: "require-lock-timeout: a lock timeout bounds time spent waiting to acquire locks. Inspect the migration's actual configuration; a missing setting is not a confirmed stall." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/require-statement-timeout.md
  { rule: "require-statement-timeout", triage: "require-statement-timeout: a statement timeout limits a long migration consuming database resources. Confirm the workload; a missing setting is not a confirmed overrun." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-duplicate-column-assignments.md
  { rule: "ban-duplicate-column-assignments", triage: "ban-duplicate-column-assignments: a repeated column declaration or assignment can produce a PostgreSQL runtime error. Confirm the statement; the warning alone does not prove it fails." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-view.md
  { rule: "ban-drop-view", triage: "ban-drop-view: dropping a view or materialized view can break queries from existing clients. Confirm those queries; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-function.md
  { rule: "ban-drop-function", triage: "ban-drop-function: dropping a function or procedure can break existing calls. Confirm actual callers; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-type.md
  { rule: "ban-drop-type", triage: "ban-drop-type: casts and parameters using the type can fail, and CASCADE can drop columns of that type. Confirm dependents and data; the warning alone does not." },
  // https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-default.md
  { rule: "ban-drop-default", triage: "ban-drop-default: an INSERT omitting a NOT NULL column can fail; on a nullable column it can insert NULL. Confirm callers and the constraint; the warning alone does not." },
  // Opt-in. https://github.com/sbdchd/squawk/blob/v2.67.0/docs/docs/ban-drop-trigger.md
  { rule: "ban-drop-trigger", triage: "ban-drop-trigger: dropping a trigger can silently change behavior such as audit rows or timestamps. Opt-in, not emitted by default. Confirm the trigger's effect and that the rule is enabled." },
] as const

export const RULES = DESCRIPTORS.map((entry) => entry.rule)

const catalogRule = (entry: (typeof DESCRIPTORS)[number]) => ({
  pack: "squawk" as const,
  rule: entry.rule,
  class: "contracts.data" as const,
  lens: "contracts" as const,
  severity: { "*": "P2" as const },
  triage: entry.triage,
  status: "probation" as const,
})

export const phase4 = {
  pack: {
    id: "squawk",
    tool: "squawk",
    version: squawk.version,
    pin: {
      source: "backend-toolkit/packs/squawk",
      integrity: Object.fromEntries(Object.entries(squawk.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: ["sql"],
    detection: { manifests: [], extensions: [".sql"], absent: [] },
    lane: "no-build",
    tiers: ["standard", "deep"],
    output: { format: "json", parser: "squawk" },
    cost: "low",
    network: { kind: "none" },
    scratchWrites: false,
    template: "squawk-json",
    lenses: ["contracts"],
    status: "probation",
  },
  rules: DESCRIPTORS.map(catalogRule),
  // Skill file is authored at 53b676f823; this branch does not copy that prose.
  language: {
    id: "sql",
    detection: { manifests: [], extensions: [".sql"], absent: [] },
    node: "team-stack-sql",
  },
} as const
