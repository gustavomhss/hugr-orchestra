# WP-R0 execution anchor

Baseline: `03aadc3a75` (planning corrections). R0-A is active; R0-B has not
started. Existing project list/get and public output remain unchanged. The
owner's installed application/database are outside this work.

## Frozen internal consumer surface

The compiled anchor in Core ProjectDirectories adds:

```ts
export interface Registration extends Directory {
  readonly registrationID: string
}

// Added to Interface alongside the existing methods:
readonly listRegistrations: (projectID: ProjectSchema.ID) => Effect.Effect<ReadonlyArray<Registration>>
readonly getRegistration: (input: {
  projectID: ProjectSchema.ID
  directory: AbsolutePath
}) => Effect.Effect<Registration | undefined>
```

The initial implementation of those two methods dies with an explicit
unavailable error. It never returns a fabricated empty registry. This is a
compilable acceptance anchor, not the completed feature. The final acceptance
Core typecheck passed after the rollback proof fixes (GOMAXPROCS=2); receipt:
`/tmp/activity-registration-acceptance-sealed-typecheck.exit`, exit 0. No local
product tests ran. The frozen interface itself did not change.

## Acceptance ownership and quality review

- G01: actual migration, four legacy directory rows across two projects,
  unrelated payload preservation, constraints on both fresh/upgraded schemas,
  migration idempotence, reopening migrated IDs and foreign-key cascade.
- G02: same-path remove/reinsert and strategy ABA without observing intermediate
  states; equal timestamps cannot hide replacement.
- G03: ignored duplicate, unchanged replacement, null/empty/string transitions,
  update/insertion rollback and committed removal. Rollback checks require the
  exact intentional failure; assertion defects cannot masquerade as success.
- G04: reopened file database, exact persisted/internal token equality,
  directory/strategy shape, actual Project.Service.directories output, old
  list/get/codec output and no reader mutation.
- Three strengthened ProjectCopy tests cover target create/remove, automatic
  source registration/reuse, and refresh discovery/strategy renewal/no-op/prune.
  UUID presence is asserted before identity inequality to prevent vacuous passes.

The independent coverage critic found gaps, which were added, then returned
two consecutive covers verdicts. A later proof-strengthening sweep still
returned covers. A separate cold quality reviewer found swallowed transaction
assertions and an undefined prior ID comparison; both were fixed and inspected.
The reviewer approved the two bounded units separately: the new acceptance
file plus explicit anchors, and the existing ProjectCopy test delta.

## Producer/migration decisions for R0-B

1. Add snake_case registration_id to ProjectDirectoryTable: nonnull, globally
   unique and nonempty. An ORM insertion default calls crypto.randomUUID for
   compatibility with existing typed fixture inserts; there is no SQL default.
   Raw SQL omitting the token must fail. Production writer remains create/remove.
2. create supplies one newly generated token in the same INSERT/upsert as its
   row/strategy write. An actual replacement updates both fields atomically;
   ignored/no-op writes do not replace the existing token. Test input.strategy
   against undefined explicitly: empty string is a valid distinct strategy.
3. Internal queries select the persisted registration_id as registrationID,
   preserving directory decoding and optional strategy semantics. Existing
   public projections continue to select only directory/strategy.
4. Use the existing Core migration generator with name
   activity_registration_identity. Customize only the new migration for legacy
   backfill inside its provided transaction: preserve all five existing fields,
   generate each token with crypto.randomUUID, preserve the composite primary
   key and project foreign key/cascade, and install matching constraints.
   Regenerate/check the fresh schema and migration registry; never edit their
   generated output or old migrations manually.
5. Audit all production writes and callers again. Current writes are in
   ProjectDirectories; ProjectCopy delegates through it, including refresh's
   explicit transaction argument. The existing test-only raw Drizzle inserts
   receive their insertion default; they are not additional production writers.

## Gate receipt — pending baseline

Authoritative request: `bun run test:ci core test/activity-registration.test.ts
test/project-copy.test.ts test/project-directories.test.ts --os both`.
Log: `/tmp/activity-registration-red-sealed-ci.log`; exit file uses the same
prefix. The earlier request was stopped while waiting for runner capacity,
before a CI branch/run existed, so the corrected suite could be captured.

No red runtime result exists yet. The helper uploaded a frozen snapshot and
may wait up to thirty minutes behind unrelated queued workflows. Do not start
R0-B or claim an executed red-to-green transition until the hosted baseline
reports the intended missing-behavior failures on Linux and Windows. The sole
post-upload source change before the superseded request stopped was a type-only
nonnull assertion; the sealed request includes the complete corrected suite.

After the baseline: implement R0-B, run the same hosted pack plus migration
generator checks and final package typecheck, independently review each bounded
diff, and record exact snapshots/run URLs here and in RECOVERY.md. Local product
tests, owner database migration and owner app/server restart remain prohibited.
