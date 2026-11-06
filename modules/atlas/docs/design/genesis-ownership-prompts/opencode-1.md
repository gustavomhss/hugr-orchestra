# L1 opencode-1 — projection and execution evidence

RETIRED SLOT after owner reduced mining to four agents. Preserve as historical criteria; NOT DISPATCHABLE.
Its EX-1..6 work is now owned by router-2.

Model: `opencode/crouton-alpha-free`. Artifact handle: `L1-execution`.
Exact output title: `Session input base — projection and execution`.
Layer: L1. Depends on frozen evidence only; parallel with all other L1 seats.
Embed `common.md`; no sibling output, oracle or tools.

## Inputs

- `packages/core/src/session/projector.ts`: 283–311.
- `packages/core/src/session/execution.ts`: 12–38.
- `packages/core/src/session/run-coordinator.ts`: 10–19, 83–110.
- Coordinator-supplied exact baseline/blob/range identities.

## Axioms and invariants

Inherit shared contract and GO-A1..7/GO-I1..8. Keep durable events/history separate from process-local
execution. A service interface/comment is not an executed proof of scheduling or crash recovery.
No inferred distributed ownership, durable run identity or automatic provider retry.

## Required headings and completeness criteria

- `## Evidence register` — EX-1: locate Prompted vs PromptAdmitted projection behavior and visibility
  distinction. EX-2: locate wake/resume interface and explicit-run/coalesced-wake coordinator behavior.
  EX-3: preserve process-local scope and the limits of the supplied implementation excerpts.
- `## Reuse and conflicts` — EX-4: separate comments/interfaces from implemented branches and runtime
  evidence; expose missing required internals instead of claiming serialization from a method name.
- `## Boundary handoff` — EX-5: name projection/history and advisory-execution joins to reconcile
  with entry, identity and runner evidence only after consolidation.
- `## Coverage and gaps` — EX-6: each EX criterion has evidence or a precise BLOCKED gap.

## Success criteria

Later layers can locate the actual projection/execution evidence and avoid conflating durable input,
visible history and process-local scheduling without reconstructing these boundaries from unrelated files.

## Quality standards

Apply QS-1..6/shared standards. Preserve conditions and evidence strength; no atomicity guarantee from
adjacent calls, no invented crash-safe provider semantics or whole-Session ownership claim.

## DoD and stop

All EX-1..6 supported or explicitly BLOCKED. Return only the base register/handoff, not the integrated
flow or diagnosis procedure; no source changes, commands or delegation.
