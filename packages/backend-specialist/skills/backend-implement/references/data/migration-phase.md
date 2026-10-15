# Assigned migration phase

## Applicability

The owner supplies the exact starting revision, the target phase and the data transformation: a persisted schema conversion, a backfill or an index migration. The general procedure is [migration mode](../modes/migration.md); this card adds the data deltas.

## Non-trigger

- A read-time alias or default projection: that is a [query](query.md) change.
- Inventing an expand, backfill and contract plan, inferring a rename's meaning from a diff, running a rollout or recovery, or altering applied history.

## Inputs

- The selected runner, adapter and version, and the immutable history.
- The phase's dependencies and end state.
- Rename, NULL, default and conflict rules.
- Batch limits and commit and restart semantics, when batching is required.
- Which model, metadata or journal files may change, and populated fixtures.

## Steps

1. Author only the assigned phase. Ending a backfill-only phase does not authorize adding the final constraint.
2. Use the runner's scaffold for a data-only phase when the packet's recipe calls for one, then write the transformation SQL yourself.
3. Reconcile generated candidates with the supplied meaning. Autogenerate tools can report a column rename as a drop and an add; that is not the rename the owner asked for.
4. Keep a batched backfill in the owner-selected entrypoint, with the supplied restart semantics.
5. Replay the populated predecessor to the assigned endpoint with the existing runner.

## Tools and outputs

- The selected generator or scaffolder, and the native runner on the assigned disposable fixture.
- Output: only the assigned SQL, code and model metadata, plus phase evidence.

## Limits and checks

- Runners group transactions differently. One may commit all pending migrations in a single transaction; another commits one file at a time. Separate files or statement breakpoints do not imply separate commits.
- Some statements cannot run inside a transaction, such as PostgreSQL's `CREATE INDEX CONCURRENTLY`. A runner's opt-out annotation works only for that runner. If the assigned phase and runner conflict, return a `packet` blocker; never remove the transaction or switch runners yourself.
- Checks: exact values and phase-specific schema after replaying populated data. A wrong fill value, a destructive drop-and-add rename or a premature NOT NULL must fail them. Rerun and interruption checks only when assigned.
- SQL and bounded batch helpers are yours. Missing NULL meaning, required cross-phase compatibility or restart policy is a `packet` blocker.
