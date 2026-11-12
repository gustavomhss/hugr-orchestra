# WP-W1 execution anchor

Baseline: `e33ec35c3c`, with WP-R0 completed and exact-source hosted proof.
W1-A is complete with verified hosted red evidence. W1-B-state and W1-B-read
are implemented with approved independent source reviews and passing Core
typecheck; hosted green remains pending. All three tasks retain the six quality fields in PLAN.md.
No API/UI changes, cleanup, process queries or owner-app/database operations
belong to this WP.

## Frozen public contract

Core module/export: `@orchestra/core/activity-worktree`, namespace ActivityWorktree.
The acceptance baseline used a compilable unavailable anchor that threw from
make. The implementation now uses the same frozen signatures; no fabricated
empty inventory or measured zero substitutes for source failure.

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
Hosted red is verified below. Independent coverage review found and closed
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
publish signatures, with both factories kept explicitly unavailable until red proof was verified.
The reader worker was dispatched only after those gates passed. W2 and W3
remain pending; public Protocol/HttpApi and generated Client are unchanged.

## Initial hosted request (completed)

The reviewed acceptance is committed through `a0dedcecc4` and pushed to
activity-monitor. The exact requested Core tree is
`bca4d35a48aa2d45cfbb0ce3b98d92a2a3765039`; Schema tree is
`ef7da65d3a27715ef5b365733f513aba7562b843`.
The four-file Linux/Windows test:ci request completed uploading its snapshot
and waited for runner capacity (15 unrelated queued runs were observed).
The standard helper waits at most 30 minutes before creating its CI branch.
No duplicate request was started and no unrelated run was changed.

Local request log: `/tmp/activity-worktree-red-ci.log`; helper exit:
`/tmp/activity-worktree-red-ci.exit`. The expected baseline is four new
W01–W04 failures from the explicit unavailable constructor, with existing
ActivityDisk tests retaining their passing/platform-skip outcomes. A nonzero
helper exit alone is not red proof: inspect actual named hosted test outcomes,
Omni control and exact snapshot before implementation. Final typecheck receipts:
`/tmp/activity-worktree-final-{core,schema}-typecheck.exit`, both 0.

## Verified red and implementation gate

Run [43247422816](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43247422816)
completed with exactly W01–W04 failing on each OS because make threw
"Worktree disk collection is not implemented". Existing disk cases retained
10 passes on Linux and 7 passes/3 explicit skips on Windows. Both focused Omni
controls were not applicable: zero actual/delegated spawns, no Omni proof claim.
The fetched snapshot is 3c0f38b2691d41d56369d878fe9b77c8407f8f50; its complete
Core and Schema trees match the requested hashes above. Named outcomes appear
in worktree-baseline.json. No tests changed after this baseline.

State and coordinator now occupy separate bounded implementation units. The
lead owns pure state; a reader worker owns only the coordinator. Their frozen
seam preserves unchanged internal record references and rejects publication by
retired references. The state cold review approved atomic staging, identity,
BigInt revisions, deep copies and partial retention. Reader cold review approved and Core typecheck passed. The erroneous unused first reader Relay arm had an
incorrect expected SHA; it was replaced before dispatch with an arm containing
the exact verified 79b28e82d4833b6a520e98517d5254a1db45ee2d baseline.
No mechanical hook enforcement is claimed. No hosted green is claimed yet.

Implementation gates: both bounded source units received independent APPROVE
verdicts. Core bun typecheck passed (exit 0), and unchanged Schema retains its
previous passing exact-source typecheck. Completion guards passed with 0 gates
and the same reviewed R0 migration-ignore warning. The original four-file
acceptance suite is unchanged. Hosted green is the remaining W1 runtime gate.

## Pending implementation validation

Implementation commits: 0dfeb290f7 (pure state) and bcfbc3dbd9 (reader queue),
pushed with receipts at 5157d2ea3e. The unchanged four-file Linux/Windows
acceptance pack is active in test:ci. It uploaded only 14 changed files after
refreshing the correct fork/activity-monitor tracking reference; it is now
waiting for runner capacity (17 queued runs observed). Do not start a duplicate.
Log: /tmp/activity-worktree-green-ci.log; exit: /tmp/activity-worktree-green-ci.exit.
Requested Core tree: 896ecacedc92ec83d74aa7ec82046ac0c24571cf.
Requested Schema tree: ef7da65d3a27715ef5b365733f513aba7562b843.
The four tests and shared fixture match the fetched red snapshot byte-for-byte.
Expected successful totals are 14 passes on Linux and 11 passes/3 explicit skips
on Windows. Inspect named outcomes, focused Omni control and exact tested trees
before closing W1. Until then, neither a hosted green nor W1 completion is claimed.
The user-facing Worktrees table still has no manual reading API/button; W2/W3
own those integrations. No owner app/database/runtime was restarted or migrated.

## First implementation result and metadata correction

Run [43273027453](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43273027453)
ran the exact requested trees: Linux 13 pass/1 fail, Windows 10 pass/3 skip/1
fail. W02–W04 passed, retaining all previous disk outcomes. W01 reached its
schema assertion and failed: WorktreeRevision.ast.annotations.identifier was
undefined. No hosted green or W1 completion is claimed. Full named outcomes
are in worktree-first-validation.json.

Correction task (within W1-B-state):

- **Axioms:** the reusable decimal revision needs its domain-qualified scalar identifier; the test remains unchanged.
- **DoD:** move the identifier annotation before the pattern check, obtain independent source review, run Schema/Core typechecks and the unchanged hosted pack, then inspect named outcomes and tested trees.
- **Completeness criteria:** preserve the exact canonical decimal regex and wire type; the new request must execute W01's remaining validation assertions as well as W02–W04 and all disk regressions.
- **Invariants:** no oracle weakening, suppression, new skip, fabricated result or API/UI change; no local product tests.
- **Success criteria:** W01 passes its metadata and invalid/large revision assertions while previous passes stay green; W1 remains open until that proof exists.
- **Quality standards:** the installed Effect SchemaAST.annotate source confirms annotations after checks attach to the final check; placing it first preserves scalar metadata. Independent cold review approved this exact correction. Schema and Core typechecks passed; the unchanged hosted rerun is active.

## Corrected validation request

The metadata correction is committed/pushed as 3bf327f497. Its unchanged
four-file Linux/Windows request uploaded its snapshot and is waiting for runner
capacity (16 queued runs were observed). No duplicate scope was requested.
Log: /tmp/activity-worktree-green-metadata-ci.log; exit:
/tmp/activity-worktree-green-metadata-ci.exit. Requested Core tree remains
896ecacedc92ec83d74aa7ec82046ac0c24571cf; corrected Schema tree is
c125baa2144abcb969e3a1440b35413a7ebdf185. Core and Schema typechecks passed;
no local tests ran. W2-A preparations started after this snapshot was frozen,
in disjoint Protocol/Server/Client files; they are not part of this W1 proof.
