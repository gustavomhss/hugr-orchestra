---
name: backend-data
description: "Data obligations for an assigned backend change: a query or write with its result mapping, writes bound to a supplied transaction, a persistence mapping, or one assigned schema or data migration phase. Load with backend-implement when the packet changes how data is read, written or transitioned. Not for choosing persistence design, isolation, a migration plan or rollout."
---

# Backend data

This skill adds data obligations to `backend-implement`, which you load first. It sits under your system prompt and never widens it. The packet decides scope, design, write paths and checks; where this skill and the packet disagree, follow the packet.

## When this applies

- Applies: an assigned query or write, result mapping, repository change, transaction binding, or a supplied migration phase.
- Does not apply: mapping data that is already loaded, or a persisted schema transition chosen only because SQL appears. A framework or ORM name, or a dependency elsewhere in the repository, does not establish the database, the driver, transaction membership or resource lifetime.
- Not yours: persistence topology, isolation level, a migration plan such as expand, backfill and contract, rollout order, recovery, and changes to applied migration history. Return a `packet` blocker that names the data owner.

## Inputs beyond the common packet

- The engine and its version; the driver, ORM and migration runner versions; the selected adapter; the current schema revision.
- Result, cardinality, null and conflict rules; predicates and tenant authority.
- The transaction owner, and isolation and retry semantics where they matter.
- For a migration phase: the starting revision, the target phase and its end state, the phase order, the meaning of renames, NULLs and defaults, batch limits and restart semantics when batching, which model or journal files may change, and populated fixtures.

Missing business meaning blocks that part of the work. Missing prewritten SQL does not: the SQL is yours.

## Select the reference

- [Query and result mapping](../backend-implement/references/data/query.md): assigned read or write semantics on the existing schema.
- [Atomic writes](../backend-implement/references/data/transaction.md): writes or invariants that must share one supplied transaction.
- [Assigned migration phase](../backend-implement/references/data/migration-phase.md): a persisted schema or data transition. Read it with [migration mode](../backend-implement/references/modes/migration.md).
- A cursor, batch or streamed result that holds database resources: [streams and batches](../backend-implement/references/lifetimes/streams.md).
- A write that must admit a job in the same transaction: [job admission](../backend-implement/references/lifetimes/jobs.md).

Exact driver, ORM and runner APIs live in the references your stack selects. Load none because the library merely appears in the repository.

Stack references: [Go](../backend-implement/references/languages/go.md), [Python](../backend-implement/references/languages/python.md), [JavaScript/TypeScript](../backend-implement/references/languages/js-ts.md), [Ruby](../backend-implement/references/languages/ruby.md), [PHP](../backend-implement/references/languages/php.md). Read only the packet's language.

## Common procedure

1. Establish the assigned boundary: which database, which handle, which transaction, and who commits or rolls back.
2. Bind every participating operation to that native handle. The same function, database URL or pool does not mean the same transaction.
3. Write parameterized SQL or builder expressions. Regenerate the selected bindings when their query inputs change.
4. Map native completion and errors into the supplied result, and propagate failure to the transaction owner. Never swallow an error and report success.
5. Close cursors, rows and batches, and release connections, in the order the driver requires.
6. Run only the assigned checks.

Keep four outcomes distinct: admission, database commit, external acceptance and recorded completion.

## Your choices and the caller's

Yours: concrete SQL, joins and parameterization; transaction-bound helper signatures; DTO mapping; cleanup structure; batch loops under the supplied limits; fixtures for assigned tests.

Not yours: unclear isolation or business semantics, writes that span stores without a supplied design, conflicting transaction ownership, backfill meaning, phase compatibility, an exception to the runner's transaction behavior, and any new dependency or driver. Each is a `packet` blocker that names the data or architecture owner.

## Checks

- Generated or typed query output is not evidence that business assertions passed. A tool that parses migrations does not apply them.
- Data semantics need the real engine: another engine cannot stand in for the selected one, and a transaction-managed test fixture can hide commit behavior.
- An empty-schema replay cannot establish backfill behavior; replay a populated predecessor when the packet assigns transition checks.
- Report only what you ran. Return the result as `backend-implement` describes.
