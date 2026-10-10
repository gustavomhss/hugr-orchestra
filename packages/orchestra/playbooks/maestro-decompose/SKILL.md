---
name: maestro-decompose
description: Coordinate upstream acceptance coverage, decomposition review and adoption. Use for substantial multi-part work or before deciding whether to dispatch parallel slices; small Tasks stay lightweight.
---

# Maestro Decompose

## Trigger and rationale

Use when a demand spans responsibilities, shared writes or independently deliverable outcomes.
Native `archie` authors acceptance, decomposition, Tasks/WPs, dependencies and revisions. Maestro organizes
and decides within owner authority, supplies observed host facts, coordinates review/adoption, dispatches
and integrates. Missing planning content returns to upstream; Maestro does not invent it. Small Tasks
retain their current format and lifecycle, without compulsory WPs, compiler, arm or progressive steps.

## Inputs

Owner demand and settled decisions; observed baseline; project checks; verified ownership/context facts;
current upstream proposal, if any. Current static `own_*` facts dominate reconnaissance for canonical
units. Follow only explicit Own drill pointers; stale, missing, ambiguous or held Own state is HOLD.
Normal source inspection cannot substitute for governed GROUNDED evidence.

## Procedure

0. Before any authoring assignment or revision, inspect existing arm/completion bindings and governed
   state through available actual host inspection; do not guess tool/method names or assume no binding.
   Authoring precedes execution arming. Native Task calls `completion.beforeDispatch` for ordinary and
   governed dispatch, without an authoring exemption. Do not let authoring consume or inherit execution
   gates. If an active binding prevents authoring or required inspection is unavailable, HOLD through the
   existing owner process. No ordinary Task enters the active governed chain; do not invent disarm,
   fresh-Session escape or downgrade to normal. Repeat this inspection before later authoring revisions.
1. Gather the owner's request and constraints, actual baseline/placement, available checks, permissions
   and relevant read/write facts. Record observations and unknowns, not a newly authored partition.
   Run preserved-behavior baseline checks and capture meaningful failing evidence for new behavior when
   runnable. Separate preservation from red-to-green proof; untestable items remain judged by an
   accountable decision owner, never auto-green.
2. Assign native `archie` to author or revise requested acceptance, five criteria, coverage, bounded units,
   dependencies, conflicts, sizing and briefs. Supply actual facts and exact permitted paths. Small
   planning requests may return inline proposals; drafting them starts no execution Task.
3. Coordinate independent cold coverage critique where warranted using [suite-review.md](suite-review.md).
   Supply demand and acceptance evidence, not a conclusion to confirm. Record unavailable review as
   UNKNOWN. Send missing/vague/overreaching coverage findings to upstream for revision; do not repair
   the plan yourself. Self-checking and structural acceptance are not independent review or completeness.
4. Inspect the current proposal's acceptance owners, writes/reads, dependencies and shared-file handoffs.
   Return orphan acceptance, conflicting writes, cycles, oversized slices or unresolved design forks to
   upstream. Actual readiness/concurrency decisions stay with Maestro inside the adopted constraints;
   changing boundaries or dependencies requires an upstream revision. Load `maestro-contract` for seams.
5. Use available host operations to acquire scoped facts or verify the authored proposal. Upstream uses
   only its actually exposed pure authoring subset. Never forge native identity or assume candidate
   implementation proves current-host exposure; actual V2 application binding remains pending.
   `move-in`, `repo-mapper`, compiler acquisition in `decompose` and `symbol-flow-check` remain under
   existing Maestro/host authority; a host computation does not make Maestro the planner. Do not use
   them to create a substitute partition. Missing acquisition, partial extraction or compiler failure
   is a named failure/UNKNOWN, never empty success; send new evidence back to upstream.
6. Adopt the current proposal after required review under owner instructions, preserving actual author
   and source/baseline evidence. Resolve owner-required choices through the owner and request upstream
   revision. Select actual execution model/budget from host metadata under existing Task policy.
7. Keep `partitionPlan` distinct from work card and durable `PlanRevision`. Explicit governed execution
   retains admission, verified catalog/Own scope, GROUNDED context, validation, cold review, exact direct
   owner approval and authorization before Task. Current PlanRevision provenance cannot represent
   upstream-authored proposals; report that adoption blocker instead of relabeling them. Arsenal results
   record none of that authority. Continue with `maestro-pack` only when the relevant boundary is ready.
   When that governed boundary is supported, present the upstream-authored card with exactly one each
   of `## Completeness Criteria`, `## Success Criteria`, `## Invariants`, `## Quality Standards` and
   `## Definition of Done`, as the existing validation requires. Normal small Tasks gain no such ceremony.

## Exact tool sequence and evidence

Use `maestro_arsenal_catalog` only for narrow discovery when an operation is unknown. Call
`maestro_arsenal_describe` for each selected operation's exact inputSchema/effects before
`maestro_arsenal_execute`. Fill observed/schema-valid inputs;
never guess field names. An unavailable tool is UNKNOWN; ordinary tools may gather normal-flow facts,
but cannot claim the missing operation ran. Host owns placement, permissions and state directory.

Pin baseline with `git rev-parse HEAD` and `git status --short` in the actual worktree. In this repository,
tests run on Actions via `bun run test:ci orchestra <resolved-suite>` from repository root; typecheck is
`bun typecheck` in `packages/orchestra`. Record command, cwd, exit, evidence, baseline and skipped/missing
configurations. Use actual check results, not proposed oracles or an upstream `done` claim.

## Success / fail

Success: current upstream proposal has evidence owners, explicit dependencies/conflicts and observed
baseline; required review/adoption and actual host checks are recorded. FAIL: uncovered acceptance,
unresolved cycles/conflicts or failing checks. HOLD: stale ownership/grounding or unavailable required
authority, including truthful governed provenance. UNKNOWN: missing runner, review, acquisition or tool.
Never convert FAIL/HOLD/UNKNOWN to PASS; return planning findings for upstream revision.

## Output schema

The following is a coordination summary of authored content and observed host facts, not a new workflow DTO:

```text
{mode: normal|governed, baseline: {sha, cwd, evidence},
 acceptance: [{id, demandRef, oracle, baselineStatus, judged, owner}],
 coverageReview: {status, evidence, unresolved}, partitionPlan: artifactPointer|null,
 slices: [{id, writes, reads, ownsItems, hardDeps, contractDeps, model, budgetBasis}],
 conflicts: [{slices, verdict, evidence}], checks: [{operation, status, evidence}],
 decision: sequential|parallel|hybrid|hold, next, unknowns}
```

Retain proposal authorship/version in existing artifact/Session evidence pointers. Do not create a marker
tree. Scheduling the adopted partition is operational; re-slicing its content returns to upstream.
