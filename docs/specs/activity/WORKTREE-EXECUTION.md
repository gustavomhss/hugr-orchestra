# WP-W1 execution anchor

Baseline: `e33ec35c3c`, with WP-R0 completed and exact-source hosted proof.
W1-A is preparing executable acceptance; W1-B-state and W1-B-read have not
started. All three tasks retain the six required quality fields in PLAN.md. No API/UI changes,
cleanup, process queries or owner-app/database operations belong to this WP.

## Frozen public contract

Core module/export: `@orchestra/core/activity-worktree`, namespace ActivityWorktree.
The compilable unavailable anchor currently throws explicitly from make. It
cannot fabricate an empty inventory or measured zero.

```ts
export interface Registration extends ProjectDirectories.Registration {
  readonly projectID: string
}
export interface Source {
  readonly registrations: () => Promise<ReadonlyArray<Registration>>
  readonly measure?: typeof ActivityDisk.measure
}
export interface Monitor {
  readonly snapshot: () => ActivityMonitor.WorktreeSnapshot
  readonly inventory: () => Promise<ActivityMonitor.WorktreeSnapshot>
  readonly read: (recordID: string) => Promise<ActivityMonitor.WorktreeSnapshot | undefined>
}
export function make(source: Source): Monitor
```

Wire values are canonical Schema definitions in activity-monitor.ts:
WorktreeRevision, WorktreeRecord and WorktreeSnapshot. Their stable identifiers
are domain-qualified. Optional attempt/logical/inventoryAt keys omit undefined.
The revision is a canonical decimal string without trailing newline, sign or
leading zero; it can represent values above Number.MAX_SAFE_INTEGER exactly.
WorktreeRecord carries opaque recordID, projectID, persisted registrationID,
directory, owner, optional DiskAttempt and last complete logical bytes/time.
Snapshot carries instanceID, snapshotRevision, readAt, optional inventoryAt,
source node.fs.lstat, coverage registered-git-worktrees, and full records.

## Fixed semantics

- snapshot is a deep copy of cached state, with no source query or walk. Before
  inventory has succeeded, inventoryAt is absent; empty records alone cannot be
  interpreted as a successful empty registry. Snapshot-only calls do not advance
  the revision; readAt records response time and does not reset sample age.
- inventory queries the injected authoritative registrations source through a
  serialized lane and publishes only a complete successful result. Concurrent
  inventory calls coalesce. Eligibility is exactly strategy git_worktree. Owner
  stays blank: R0 registrations contain no recorded session-owner provenance.
- Identity is projectID/directory/persisted registrationID. Unchanged rows retain
  recordID and old readings; unobserved reinsertion/strategy ABA retires them.
  Same paths in different projects remain distinct. Retired rows are removed,
  and lifetime reset creates independent instance/observation IDs.
- read selects an existing opaque row ID, never a submitted path. It performs
  fresh pre/post authoritative queries in the serialized lane; neither check
  reuses an inventory request admitted earlier. A retired result returns
  undefined and cannot populate a replacement. Each successful registry
  reconciliation updates inventoryAt and advances the revision; each published
  complete/partial attempt advances it as well. Returned full snapshots include
  every earlier committed change and cannot later be mutated by another read.
- Default measurement is ActivityDisk.measure with its existing cooperative
  10,000-entry/depth-64/two-second budgets and 32 reported gap details. Tests may
  decorate that real boundary for observation/barriers; no fake byte readings
  are accepted as integration proof. Partial attempts preserve the last complete
  value/time; a first partial attempt leaves logical absent. Neither a unique
  total, reclaimed bytes nor use proof is inferred.
- Same-row reads share one Promise. Four manual operations may be in flight
  across the instance, including pre/post validation. A fifth distinct valid
  row rejects with exported ReadCapacityError; unknown/retired IDs return
  undefined. Inventory and pure snapshots remain available while walks run.
  Rejection/retirement frees the slot. Walks can overlap, registry queries and
  state commits cannot. This cap does not cancel underlying OS I/O calls.
- Registry failure rejects without clearing cached rows, readings, inventoryAt
  or revision. The lane remains usable afterward. Successful empty inventory
  retires the old rows explicitly. Conflicting duplicate project/path tokens
  are invalid source data, not an empty registry. Source adapters must deliver
  an atomic full registry result; W2 owns actual HTTP auth and project selection.

## Acceptance and gate plan

W01/W02 are in activity-worktree.test.ts, W03 in activity-worktree-identity.test.ts,
and W04 in activity-worktree-concurrency.test.ts, all under Core test/, backed by
real ProjectDirectories services/SQLite and owned filesystem fixtures. They
cover cached/unread state, source and walker call counts, schema omission and
revision encoding; real hardlinks/symlink gaps/missing paths; cached retention
after actual registry SQL failure; cross-project and unobserved incarnation
replacement; bounded concurrent real walks, post-walk revalidation and immutable
ordered full snapshots. Their fixture helper has no production responsibilities.

The intended hosted pack is `bun run test:ci core test/activity-worktree.test.ts
test/activity-worktree-identity.test.ts test/activity-worktree-concurrency.test.ts
test/activity-disk.test.ts --os both`. Existing walker tests are the regression
floor; the four new cases must fail for unavailable behavior before either implementation task starts.
No hosted red result exists yet. Independent coverage review found and closed
fourteen specific oracle gaps, then returned two consecutive covers verdicts.
Separate bounded cold quality review approved each unit after fixing swallowed
inventory rejection and unbounded barrier cleanup. Final Core and Schema package typechecks passed. Guardrails: 0 gates, 1 previously reviewed R0
migration-ignore warning. No local product tests ran. Relay stop hook remains
unconfigured; reviews are manual, not mechanically enforced.

Review units: each of the three test files is reviewed separately (each under
400 changed lines); the shared fixture and unavailable anchors/export form a
separate bounded unit. Schema additions are reviewed separately. Runtime tasks
split pure state (activity-worktree-state.ts) from async coordination
(activity-worktree.ts); the private State anchor freezes snapshot/reconcile/get/
publish signatures, with both factories explicitly unavailable until red proof. No implementation worker is
dispatched until the exact anchor and baseline gates have passed. W2 and W3
remain pending; public Protocol/HttpApi and generated Client are unchanged.
