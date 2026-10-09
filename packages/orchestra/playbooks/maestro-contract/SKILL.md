---
name: maestro-contract
description: Coordinate upstream shared-contract authoring, implementation scaffolds and seam verification. Use when one work unit consumes another or a shared boundary requires coordinated changes.
---

# Maestro Contract

## Trigger and rationale

Use for dependent slices, public schema changes, shared events or migrations crossing ownership.
Independent local edits need no contract ceremony. Upstream authors minimal shared contracts and
revisions under Maestro's assignment. Maestro coordinates decisions within owner authority, review,
adoption, actual implementation placement and seam verification. Workers retain local implementation
choices inside adopted constraints. A declared-surface freeze does not prove behavioral compatibility.

## Inputs

Observed producer/consumer sites and current source identity; current upstream proposal; exact adopted
decisions; acceptance evidence and Own pointers where applicable. Current static `own_*` facts dominate
maps/search; follow explicit drill pointers and HOLD stale Own state.

## Procedure

0. Before any authoring assignment or revision, inspect existing arm/completion bindings and governed
   state through available actual host inspection; do not guess tool/method names or assume no binding.
   Authoring precedes execution arming. Native Task calls `completion.beforeDispatch` for ordinary and
   governed dispatch, without an authoring exemption. Do not let authoring consume or inherit execution
   gates. If an active binding prevents authoring or required inspection is unavailable, HOLD through the
   existing owner process. No ordinary Task enters the active governed chain; do not invent disarm,
   fresh-Session escape or downgrade to normal. Repeat this inspection before later authoring revisions.
1. Supply current boundary facts to native `walt` and request the smallest load-bearing contract: exact
   signatures/types/errors, wire/event or DB/migration shapes, invariants, producer/consumer duties,
   source identities and seam-test oracles. Private algorithms remain implementation-owned. Do not
   create speculative interfaces or fill missing contract decisions yourself.
2. Coordinate required review and owner-required decisions. Return findings and changed source identity
   to upstream for revision. Adopt only the current proposal after required review; self-checks are not review.
3. Inspect upstream's actually available `contract-freezer`, `anchor-gen` and `seam-checker` evidence.
   These pure authoring helpers neither acquire arbitrary AST facts nor approve an interface. If needed,
   use your existing host verification tools against the adopted surface, preserving upstream authorship.
   Completed Core/V1 candidate bindings are not evidence of current-host deployment or actual V2
   application binding. Missing operations cannot be claimed as available or successful.
4. If parallel consumers need source scaffolding, coordinate implementation by the current source owner
   under exact permitted paths. `stub-gen` stays outside upstream's pure subset. Generated text is not
   a write receipt; inspect/apply under actual authority and compile in the actual project. Mark stubs:
   compilation of a stub is not production behavior. This transfers no backend charter or toolkit grant.
5. Coordinate actual compiler and integration tests; use `symbol-flow-check` only under existing host
   acquisition authority with actual diagnostics. Include meaningful negative/error cases; a second
   copy of the implementation is not an independent oracle. General code review considers architectural
   consequences as part of the whole delivery; no architecture-only reviewer or upstream self-approval.
6. Drift returns to upstream for contract revision and consumer impacts, through Maestro to the owner
   for owner-required choices. Coordinate renewed verification. Governed scope/context/approval changes
   retain the native lifecycle; a frozen hash replaces neither PlanRevision nor GROUNDED context, exact
   direct-owner approval or Task authorization. Preserve truthful provenance; do not relabel upstream
   fields to fit the current PlanRevision source enum.

## Exact tool sequence and checks

Use `maestro_arsenal_catalog` only for narrow discovery when needed. Call `maestro_arsenal_describe`
for each selected operation's exact inputSchema/effects before `maestro_arsenal_execute`.
Host owns permissions/placement; unavailable tools or acquisition stay UNKNOWN.
Compare the actual adopted shared/consumer paths with `git diff -- <shared-path> <consumer-path>`.
Resolve paths/suites before execution: `bun typecheck` in `packages/orchestra`; tests run on Actions via
`bun run test:ci orchestra <resolved-seam-suite>` from repository root. For public Protocol/Server HttpApi
changes run `bun run generate` in `packages/client`, never edit generated client source. Regenerate the
legacy JS SDK with `./packages/sdk/js/script/build.ts` from repository root when the change requires it.

## Success / fail

Success: current adopted contract binds the minimal seam, real consumers compile and real tests verify
behavior; stubs are identified/replaced before production completion. FAIL: drift, compile error,
behavioral mismatch, unresolved stub or failing check. UNKNOWN: missing acquisition/compiler/runner.
HOLD: stale Own or required authority/provenance unavailable. Return planning changes to upstream.

## Output schema

```text
{surface: [{sourcePointer, identity, declaration, producer, consumers, invariants}],
 frozenBinding: evidencePointer|null, anchors: [{slice, pointer}],
 stubs: [{path, status, permissionReceipt}], seamTests: [{command, cwd, status, evidence}],
 drift: [], unknowns: [], verdict: ready|fix-first|hold, next}
```

This coordination summary retains upstream proposal/version and observed evidence through existing
pointers. Keep anchors bounded to consumers; no new approval DTO or publication claim follows.
