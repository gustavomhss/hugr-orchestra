# Durable state and transaction boundaries

Read when correctness depends on admission, commit, projection, concurrency or external effects. Do not infer atomicity from a transaction-shaped helper name.

## Find the durable unit

Identify authoritative state, owner, key, constraints and commit boundary. Follow actual writes and reads, including lazy reconciliation, projections and caches. Determine which operations participate in the same connection/transaction and which occur afterward. A file publication, network effect and database commit are not automatically one atomic operation.

Separate process-local coordination from durable identity. A lock can serialize work in one process while providing no post-crash recovery, cross-process exclusion or exactly-once provider execution. A durable pending input may survive when its advisory wake does not; recovery behavior needs an explicit owner and contract.

## Analyze interleavings

Choose interleavings that can change the answer: two same-key admissions, stale revision updates, crash before/after commit, partial publication, and retry following lost response. Read unique keys, optimistic bases, isolation level, conflict translation and retry conditions. A read-before-write check without a durable constraint may not establish exclusivity.

Specify the actual database/runtime version and adapter when behavior depends on isolation, locking or conflict handling. SQLite, PostgreSQL and other engines have distinct transaction semantics; use the applicable engine's official versioned documentation and implementation rather than transporting a generic guarantee.

For an outbox/event publication path, determine what is committed together, who drains, when delivery is acknowledged and how destination duplication is handled. A record of intent is not the external effect. For projections, check replay identity, ordering and whether rebuild reads authoritative events or mutable metadata.

## Evaluate invariants, not function names

Examples of useful questions are: can two writers both admit this identity; does a stale update conflict rather than overwrite; can a committed event have an unavailable artifact; what remains pending after crash? A structural possibility is an inference until an actual controlled observation or contract establishes its behavior.

Retain support for each seam, relevant exceptions and any contrary implementation path through [corpus](corpus.md). Source/test definitions show intended paths. Observed race/crash results need exact inputs, build, resources and returned evidence; do not manufacture them.

## Missing proof

If reading cannot distinguish implementations, specify the smallest qualified executor probe: exact two-writer schedule or crash point, inputs, expected durable rows/effects for each rival, controls and cleanup scope. Do not run SQL/shell or mutate live/product state through another capability.

Use [retry](retry-idempotency.md) when reconciliation crosses attempts, and [boundaries](boundaries.md) when effects cross transport. Close with the evidenced guarantee's scope, residual failure window and discriminator—not a blanket “transactional” verdict or architectural approval.
