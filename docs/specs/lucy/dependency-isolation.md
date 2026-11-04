# Lucy phase 1: dependency snapshot isolation repair

## Status and scope

Lead-accepted implementation target; this document does not implement or verify it.
Observed baseline: `caa10de54feee5adb56bc9b6773acdae419f625e`.
This repairs the accepted phase 1 dependency-resolution defect; it is not phase 3,
an architecture reopening, or an amendment to the approved build-plan scope.
No owner decisions remain: the lead selected the policy caps below.

## Observed facts at the baseline

- `packages/core/src/research-toolkit/probe/snapshot.ts` materializes literal Git
  blobs, then links original dependency directories into the snapshot.
- Its dependency list is `node_modules`, `.venv`, and `target`, not `venv`.
  Grafts are attempted at the repository root and beside reviewed `package.json` files.
- A workspace symlink can reach live source. Linking only direct workspace packages
  differently is insufficient: a third-party package's realpath can make its own
  workspace import resolve through the original dependency graph.
- `ReviewScratch.resolve` currently rejects lexical and physical escapes; this
  protects `revert` and base-test borrowing from writes through original links.
- `ProbeAssets` resolves package metadata and executable entries physically.
  `ProbeRunners` chooses closed runners and writes scripts outside the snapshot.
- Review and research probes call `ToolSafetySandbox.confine` with `write: []`.
  That denies child writes outside the confine scratch, not general repository reads.
  Windows confined probe execution is currently unsupported.
- Reviewed `maxBytes` excludes linked dependencies. Snapshot `files` counts reviewed
  paths, not a dependency inventory. Neither fact is a dependency performance measure.

## Mandatory dependency and acceptance seam

Backend is preparing a separate, actual cancellation regression and scoped writer
slice in `packages/core/src/review-toolkit/snapshot-mutation.ts`.
Its declared target is `Writer` as a `Context.Reference` and `writeSnapshot`, used
by `ReviewScratch.revert` and `probe.baseStep`, including forward and undo writes.
These are planned changes, not observed functionality at this baseline.

Dependency implementation must base on that verified cancellation slice, or integrate
it first, before modifying `scratch-copy.ts`. Never replace or bypass its scoped
write boundary. `ReviewScratch.resolve` still checks roots and dependency exclusions
before any write; the writer boundary does not grant filesystem authority.
No code dispatch until the exact dependency baseline and this acceptance seam are
frozen: cancellation during forward or undo writes must finish the protected write
and required restoration before permit release or scratch cleanup can race them.
The lead must retain the cancellation slice's verification evidence, not its self-report.

## Proposed design: one backend work package

Replace live directory grafts with a shadow dependency graph under the snapshot.
Create independent directories and hardlink regular dependency files; recreate
symlinks against the shadow or reviewed workspace, never against live workspace code.
Preserve nested dependency lookup topology, including transitive dependencies and
relative `.bin` links. Do not solve this with resolver flags or direct links alone.

Classify every dependency link against explicit source dependency roots and reviewed
workspace paths. Workspace destinations map to the corresponding reviewed snapshot
path, not to live bytes. A missing reviewed target is a named refusal, never a live
fallback. Dependency-to-dependency links stay within the projected graph.
Out-of-closure destinations are unsupported; do not recursively import arbitrary
host directories. Preserve reviewed entries; reject conflicting grafts rather than
overwrite them or traverse an existing symlink parent to create a destination.

Preflight entry types, destinations, link chains and caps before publishing a usable
graph. Reject lexical traversal, physical escapes, cycles and unsupported entry types.
Use containment checks aware of platform path semantics, not string-prefix checks.
Never chmod, truncate, rewrite or otherwise mutate a shared dependency inode.
Hardlink errors, including cross-device or permission failures, are named refusals;
there is no hardcopy fallback. Existing scopes remove partial and completed shadows.

## Frozen smallest interface and host write paths

Keep `ProbeSnapshot.create` inputs unchanged. Add this required snapshot property:

```ts
readonly dependencyRoots: readonly string[]
```

These are canonical absolute shadow dependency roots, not original source roots.
Every hardlinked dependency file must lie under one of them. Do not make the field
optional or silently interpret missing metadata as authorization to mutate.

`ReviewScratch.resolve(snapshot, file)` retains lexical and physical containment
checks and additionally rejects dependency-root membership at both stages.
Resolve the deepest existing ancestor for missing descendants. Check aliases into
dependencies as well as direct dependency paths; check lexical dependency paths even
when a workspace symlink would physically resolve back into reviewed source.
Retain the existing `scratch-path-outside: <file>` denial for these excluded paths.

Reviewed blob/clone writes complete before dependency grafting. Graph construction
only creates owned directories, hardlinks and remapped symlinks. Afterwards:
- `ReviewScratch.revert` forward/undo writes use the cancellation slice's writer.
- Base-test borrowing, restoration, and removal use its scoped mutation boundary.
- Both paths first use `ReviewScratch.resolve`; neither may mutate dependency files.
- Runner scripts remain in runner scratch, not snapshot dependency directories.
- Confined execution retains `write: []`; grant no shadow or original dependency writes.

## Frozen policy caps and unsupported outcomes

The following are lead-selected safety policies, NOT performance measurements:
- At most **100000 graph entries**, counting every projected directory, file and link.
- At most **32 MiB** cumulative UTF-8 bytes of destination paths relative to snapshot
  root, counting each projected entry once; 32 MiB means `32 * 1024 * 1024` bytes.
- At most **8 concurrent filesystem operations**, including traversal and creation.
- At most **40 symlink hops** per resolution chain; detect cycles independently.

All roots share these budgets; aliases do not reset them. Bound inventory accumulation
as it is discovered, before allocating an unbounded listing. Boundary values are
inclusive. Preserve existing reviewed-tree `maxBytes` and reviewed `files` semantics;
dependency logical file sizes remain outside that byte cap. Shadow metadata and
hardlink directory entries consume resources; no latency, RSS or disk-size promise
is implied. Existing runner timeout/output/RSS/attempt policies remain unchanged.

Use `Probe.Error` refusals with stable named reasons: `snapshot-dependency-cap`,
`snapshot-dependency-workspace-missing`, `snapshot-dependency-path-outside`,
`snapshot-dependency-cycle`, `snapshot-dependency-link-depth`,
`snapshot-dependency-layout-unsupported`, and `snapshot-dependency-hardlink-failed`.
Name the affected path and cap/error detail without falling back to original links.
On Windows, use supported contained link semantics or refuse explicitly; lack of
link privilege/support never authorizes a live graft. Probe execution remains
unsupported where the existing confine API refuses it; do not add unconfined fallback.

## Limits of the claim

This repairs link-mediated dependency resolution, not complete runtime hermeticity.
`.venv` editable mechanisms such as `.pth`, `.egg-link`, generated import finders or
embedded absolute paths are not made historical merely by shadowing symlinks.
Do not rewrite these executable/text loaders as a guessed compatibility fix.
A detected repository-directed editable-loader layout outside the supported link
graph receives `snapshot-dependency-layout-unsupported`, not claimed isolated evidence.
This is not a complete detector for arbitrary executable loaders or absolute imports.
Code can explicitly import/read a live absolute path under the existing read policy;
do not promise that only historical code executes. Neither limitation justifies
silently disabling ordinary workspace probes or retaining unsafe live-directory grafts.

## RED acceptance cases for subsequent implementation

Extend `packages/core/test/review-toolkit/{scratch-copy,probe}.test.ts` with real
temporary repositories/dependencies and actual implementation calls, not duplicate logic:
- Direct workspace import distinguishes base, head and dirty worktree values/digests.
- An external dependency importing that workspace selects the same reviewed value;
  include nested installations and actual CJS/ESM resolution, not only direct imports.
- A workspace present only live is refused with the named missing-target outcome.
- Positive controls retain ordinary external packages and ordinary workspace probes.
- Reject `..`, absolute escapes, sibling-prefix tricks, escaping symlink chains/cycles,
  dependency-parent escapes, missing dependency descendants and source aliases into dependencies.
- Execute `.bin` entries remotely, checking remapped relative links and executable modes.
- Attempt host revert and base borrowing/restoration/removal against dependency paths
  and aliases; assert refusal before the scoped writer can modify shared inodes.
- Compare original repository AND dependency bytes, modes and link targets before/after
  success, refusal, cancellation and cleanup; retain the cancellation regression seam.
- Attempt confined child writes to original dependencies and shadow hardlinks; assert
  denial with a real jail, not a skipped test or a mock confinement result.
- Exercise each exact cap boundary and overrun, shared budgets, cycles/depth, unsupported
  entries, escaping links, hardlink failure and partial-graph scope cleanup.
- Cover editable-loader refusal/limitations and Windows construction-or-named-refusal;
  separately assert existing Windows probe unsupported behavior without live fallback.
All runtime execution is remote via scoped `bun run test:ci`; require a real-jail
Linux lane for confinement assertions. No local tests, builds or benchmarks are implied.

## Independent cold-critic checklist

Give a separate critic the frozen spec, implementation diff and remote evidence:
- Trace both direct and third-party-transitive realpaths to reviewed workspace bytes.
- Trace every host write/undo/delete through `resolve` and the verified scoped writer;
  demonstrate that dependency hardlinks cannot be mutated, including through aliases.
- Challenge missing targets, graph escapes, budget accounting, Windows and loader claims;
  require positive controls and distinguish executed assertions from skipped cases.
- Confirm scope stayed phase 1, no hardcopy/live fallback appeared, and no hermeticity
  claim exceeds the limited dependency-resolution guarantee above.
