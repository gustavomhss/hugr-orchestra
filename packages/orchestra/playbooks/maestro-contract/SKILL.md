---
name: maestro-contract
description: Freeze minimal shared interfaces, provide anchor code and stubs, and verify integration seams. Use when one work package consumes another or a shared boundary would force coordinated changes.
---

# Maestro Contract

## Trigger and rationale

Use for dependent slices, public schema changes, shared events, or migration shapes crossing ownership.
Independent local edits do not need a contract ceremony. Lead decides architecture and shared surfaces;
workers retain local implementation choices within those constraints. A freeze detects declared drift,
not all behavioral incompatibility, and cannot guarantee deterministic integration.

## Inputs

Observed producer/consumer sites; selected slices; exact shared declarations; acceptance evidence;
current source identity and Own pointers when canonical ownership applies.
Current static `own_*` facts dominate maps/search; follow explicit drill pointers and HOLD stale Own state.

## Procedure

1. Freeze an item only when it crosses a current slice boundary AND changing it would force another
   slice to change. Freeze the smallest load-bearing surface: signatures, public types/errors,
   wire/event formats, or shared DB/migration shapes. Private helpers/local algorithms stay free.
   Avoid speculative future interfaces and freezing internal implementation.
2. Record declaration source identity, exact signatures, behavioral invariants, error outcomes,
   serialization/version assumptions, producer, consumers, and seam-test oracle.
   Source pointers must still match the source revision they describe; refresh after drift.
3. Use `contract-freezer` to bind canonical declared-surface drift, then `anchor-gen` for exact
   shared-surface briefing. Neither acquires arbitrary AST facts or approves a changed interface.
4. If parallel consumers need provider scaffolding, select `stub-gen`. It returns scaffold text;
   inspect it and use native edit authority to apply only approved paths. Compile in the actual project.
   Mark stub behavior explicitly; compilation of a stub is not proof of production behavior.
5. Compare declared signatures with `seam-checker`, then run real compiler and integration tests.
   For cross-slice symbol flows use `symbol-flow-check` with actual acquisition/diagnostics.
   Use negative/error-path cases and goldens where independently meaningful; do not duplicate
   the implementation into a second oracle and call agreement independent evidence.
6. A drift finding returns to lead for contract revision, consumer updates, and renewed verification.
   In governed mode, scope/context/approval changes follow existing native lifecycle; a frozen hash
   cannot replace `PlanRevision`, GROUNDED context, direct-user approval, or Task authorization.

## Exact tool sequence and checks

Use `maestro_arsenal_catalog` only for narrow discovery when the needed operation is unknown.
Call `maestro_arsenal_describe` for each selected operation's exact inputSchema/effects before
`maestro_arsenal_execute`. Do not invent argument shapes or treat unavailable operations as delivered.
Host owns permissions and placement; generated text is not a write receipt.

```sh
git diff -- <shared-path> <consumer-path>
```

Resolve actual paths and package suite before execution. In `packages/orchestra`: `bun typecheck`;
tests run on Actions from the repository root: `bun run test:ci orchestra <seam-suite>`.
If public Protocol/Server HttpApi changes, run `bun run generate` from `packages/client`;
never edit generated client source directly. For legacy JS SDK, use `./packages/sdk/js/script/build.ts`
from repository root when its regeneration is required by the change.

## Success / fail

Success: minimal declared seam is bound, consumers compile against it, real seam tests verify behavior,
and any stubs are identified/replaced before claiming production completion.
FAIL: signature drift, consumer compile error, behavioral mismatch, unresolved stub, or failing check.
UNKNOWN: acquisition/compiler/runner unavailable; missing diagnostics cannot mean PASS.
HOLD: stale Own identity or missing governed approval/context. Report precise blocker, never bypass it.

## Output schema

```text
{surface: [{sourcePointer, identity, declaration, producer, consumers, invariants}],
 frozenBinding: evidencePointer|null, anchors: [{slice, pointer}],
 stubs: [{path, status, permissionReceipt}], seamTests: [{command, cwd, status, evidence}],
 drift: [], unknowns: [], verdict: ready|fix-first|hold, next}
```

Keep exact anchors bounded to each consumer; point to deeper artifacts rather than copying all interfaces.
