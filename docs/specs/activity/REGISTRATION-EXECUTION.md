# WP-R0 execution anchor

Baseline: `03aadc3a75` (planning corrections). R0-A and R0-B are complete on
the activity-monitor branch, with hosted red-to-green evidence. Existing project list/get and public output remain unchanged. The
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

The acceptance baseline used explicit unavailable errors for those methods;
the current implementation reads persisted tokens through actual queries.
It never substitutes a fabricated empty registry for a failure. The final acceptance
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

## Hosted baseline and implementation receipt

Authoritative request: `bun run test:ci core test/activity-registration.test.ts
test/project-copy.test.ts test/project-directories.test.ts --os both`.
After shared-runner, network and rate-limit delays, the backoff request produced
[the expected red baseline](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43163118453),
snapshot `27e56db610d23cb8e82e5211633f170020565cb5`. Each of Linux/Windows ran
22 tests: 15 pass and seven intended failures (G01–G04 plus three strengthened
ProjectCopy cases). G01 found no migration; the other failures hit explicit
unavailable anchors. Both Omni controls passed, with 52 real spawns and zero
delegated spawns per platform. The workflow cleaned its snapshot branch.
`registration-baseline.json` preserves the actual named outcomes. Nonzero exit
is expected baseline evidence, not a successful production validation.

R0-B now implements persisted IDs, transactional strategy renewal (including
empty strings), no-op preservation, internal projections and the generated/new
customized migration. G01 was further strengthened with an exact large SQLite
integer preservation check; that additional assertion was not in the red run.
INSERT…SELECT keeps legacy fields inside SQLite while UUIDs are allocated in
the supplied transaction. Existing public Protocol/HttpApi did not change;
Client generation is not required. Core's migration artifacts were generated.

Generator and `bun script/migration.ts --check` passed. Final Core typecheck
passed (`/tmp/activity-registration-final-typecheck.exit`, 0). Formatting and
diff checks passed. Independent cold review approved the source and precision
delta. Guardrails have zero gates and one disclosed guardrail-ignore-added
warning: migration-destructive permits an ignore on the rebuild's DROP line;
the source copies every old field first in the transaction, and the independent
reviewer confirmed that reason. No rule/approval label was changed.

The first implementation run,
[43205125191](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43205125191),
passed all 22 tests on Linux. Windows passed 21 and failed G04 during fixture
disposal with EBUSY, after reaching the temporary-directory cleanup. Both Omni
controls passed with 79 actual spawns and zero delegated spawns. This is a
failed overall gate, not a cross-platform pass.

The SQLite layer really closes its connection through its scope finalizer.
The test now uses the repository's existing tmpdir fixture, which retries only
EBUSY with bounded GC/backoff and still throws for other errors or a persistent
lock. No assertion, test timeout, shared helper or production code changed in
this cleanup correction. Independent review approved it; final Core typecheck
passed (`/tmp/activity-registration-cleanup-typecheck.exit`, 0).

The authoritative retry,
[43228040756](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43228040756),
passed all 22 tests on each of Linux and Windows, with zero failures. Both Omni
controls passed with 79 real spawns and zero delegated spawns per OS; the
workflow cleaned its temporary branch and the helper exited 0. Snapshot:
`f29dac14de9af72a4d3403f7f3febfe1307de3a9`. The fetched snapshot matches the
entire current Core tree exactly: `c8a25f60a8a70eddb3da18f8ac6d75e07686e4df`.

The full hosted logs were compared by actual test name against the red baseline:
all seven former failures per OS became passes, all fifteen former passes
remained passing, and no test disappeared or changed names. Structured outcomes
are in registration-validation.json. G01's later precision assertion is
explicitly recorded as additional coverage, not an independently executed red
assertion. These are focused package/fixture gates, not full-suite or installed
desktop acceptance.

The lead inspected source, reviews and exact-scope evidence and closes WP-R0.
WP-W1/W2/W3 and the remaining product requirements remain outstanding. This
closure does not authorize merge, release, owner database migration or app/server
restart. No local product tests ran. The authoritative helper receipt is
`/tmp/activity-registration-green-cleanup-ci.exit` (0).
