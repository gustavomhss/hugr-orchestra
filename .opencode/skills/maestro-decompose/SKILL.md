---
name: maestro-decompose
description: Acceptance coverage, work-package slicing, and dependency planning. Use for substantial multi-part work or before deciding whether to delegate parallel slices; small covered edits use existing checks.
---

# Maestro Decompose

## Trigger and rationale

Use when a demand spans responsibilities, shared writes, or several independently deliverable outcomes.
Completeness comes from demand-to-evidence coverage, not from a convincing decomposition.
Normal work stays lightweight: a small covered edit needs existing checks, not a wave or new suite.
Lead owns scope, architecture, acceptance judgment, routing, and integration; implementation latitude remains explicit.
Pre-deciding boundaries reduces ambiguity; it cannot guarantee zero decisions or deterministic correctness.

## Inputs

Current demand; observed baseline; project checks; acceptance items; owned write paths and read dependencies.
For approved canonical units, current static `own_*` facts dominate repository reconnaissance.
Follow only explicit Own drill pointers; stale, missing, ambiguous, or held Own state means HOLD.
Normal source inspection is available, but cannot substitute for governed GROUNDED evidence.

## Procedure

1. Name each requested outcome and its oracle. Reuse existing tests for preserved behavior.
   For new behavior, capture a meaningful failing baseline before implementation when runnable.
   Separate baseline-passing preservation checks from red-to-green proof; neither replaces the other.
   Mark untestable items `judged` with an accountable decision owner; never auto-green them.
2. Write the five criteria for each unit: Completeness, Success, Invariants, Quality and Definition of Done.
   Small work keeps them implicit. An epic, a work package or governed work writes them under
   `## Completeness Criteria`, `## Success Criteria`, `## Invariants`, `## Quality Standards` and
   `## Definition of Done`; governed work cards must use exactly these headings, and validation rejects a card
   without them. A child cites its parent's criteria and states only what it adds or changes; the parent closes
   only after its children and the seam between them pass. Add a journey (the path of a user, a call or a
   payload), an example or a counter-example only when it makes a criterion checkable; needing several of them
   suggests splitting the unit.
3. For substantial multi-package work, obtain independent cold coverage critique using
   [suite-review.md](suite-review.md). Give demand and acceptance items, not your plan or reasoning.
   Resolve missing, vague, and overreaching items. Recheck after changes; two unchanged gap-free rounds
   are a useful stopping rule for broad discovery, not proof of completeness or ceremony for small work.
   If review is unavailable, record UNKNOWN and preserve the unresolved coverage decision.
4. Slice by responsibility, not line ranges. Each acceptance item has an owner; no orphan or scope-creep slice.
   Remove shared registries/manifests from worker ownership when existing project structure permits.
   Shared non-append writes require sequencing or re-slicing. Append-only union still needs integration review.
   Write-to-read edges are dependencies, not write conflicts; load `maestro-contract` for load-bearing seams.
5. Use selected Arsenal operations below where helpful. Inspect returned coverage and diagnostics.
   Missing acquisition, partial extraction, invalid input, or compiler failure cannot mean an empty success.
6. Size by cohesive concepts, uncertainty, working set, and review cost. Split oversized nodes; combine
   tiny coupled nodes when handoff costs dominate. Resolve architectural forks before dispatch; workers
   surface new forks rather than silently widen scope. Choose model/budget from actual host provider metadata.
7. Keep the symbol/partition artifact named `partitionPlan`. It is not durable prompt `PlanRevision`.
   Explicit governed mode still requires native admission, verified catalog scope/Own IDs, grounded context,
   validation, review, exact direct-user approval binding, and authorization before Task.
   Arsenal planning neither records that lifecycle nor grants its authority.

## Exact tool sequence

Use `maestro_arsenal_catalog` only if the registered operation is unknown.
For each selected operation, call `maestro_arsenal_describe` to acquire its exact inputSchema and effects
before `maestro_arsenal_execute`. Fill only observed/schema-valid inputs; do not infer field names here.
If a tool or operation is unavailable, report UNKNOWN; ordinary tools may gather normal-flow facts,
but cannot claim the missing operation ran. Host supplies project placement, state directory, and permissions.

| Operation | Use and boundary |
| --- | --- |
| `move-in`, `repo-mapper` | Scoped reconnaissance; record explicit coverage and unknowns |
| `sliceability` | Graph-based decomposition advice, not a dispatch decision |
| `decompose` | Explicit acquisition plus compiler-verified decomposition; require diagnostics |
| `plan-compiler` | Pure symbol/partition/edge assembly from supplied facts |
| `conflict-map` | Compare actual write sets and read dependencies |
| `plan-check` | Check acceptance ownership, references, and partition validity |
| `symbol-flow-check` | Actual compiler evidence across slices; absence of diagnostics is not proof |
| `enrich-plan`, `plan-to-dag` | Attach dispatch metadata, identify layers/cycles; lead chooses scheduling |

Baseline commands run in the actual project/worktree; resolve `<package>` and `<suite>` before dispatch:

```sh
git rev-parse HEAD
git status --short
```

In this repository, from `packages/opencode`: `bun test <suite> --timeout 30000` and `bun typecheck`.
Record command, cwd, exit, evidence pointer, baseline identity, and skipped/missing configurations.

## Success / fail

Success: demand has evidence owners; dependencies and conflicts are explicit; baseline is observed;
partition checks and scoped acquisition have actual results; lead accepts remaining judged items explicitly.
FAIL: missing acceptance ownership, cyclic unresolved dependencies, conflicting writes, or failing checks.
HOLD: governed grounding/authority unavailable. UNKNOWN: missing runner, review, acquisition, or tool.
Never turn FAIL/HOLD/UNKNOWN into PASS. Fix the cause or report an explicit unresolved decision.

## Output schema

```text
{mode: normal|governed, baseline: {sha, cwd, evidence},
 acceptance: [{id, demandRef, oracle, baselineStatus, judged, owner}],
 coverageReview: {status, evidence, unresolved}, partitionPlan: artifactPointer|null,
 slices: [{id, writes, reads, ownsItems, hardDeps, contractDeps, model, budgetBasis}],
 conflicts: [{slices, verdict, evidence}], checks: [{operation, status, evidence}],
 decision: sequential|parallel|hybrid|hold, next, unknowns}
```

Keep the decision record outside volatile chat using existing artifact/output pointers. Do not create a
repository marker tree or load every playbook. Re-slicing changes the partition, not the original demand.
