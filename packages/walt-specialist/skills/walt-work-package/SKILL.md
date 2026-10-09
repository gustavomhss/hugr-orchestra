---
name: walt-work-package
description: Author complete linear work-package proposals targeting the native Relay sprint schema, without execution or approval.
---

# Progressive work-package authoring

Use this only when a work package needs coordinated work or validated checkpoints. Small independent Tasks stay lightweight: no mandatory compiler, arm or step sequence. Read [the native proposal reference](references/native-proposal.md); use [walt-plan](../walt-plan/SKILL.md) and its on-demand [decomposition](../walt-plan/references/decomposition.md), [contracts](../walt-plan/references/load-bearing-contracts.md) and [briefs](../walt-plan/references/briefs.md) for method. Keep one complete versioned proposal for author/host; host owns progressive reveal.

Define global objective/acceptance/coverage, constraints, live invariants and source references. WP/governed cards use exactly `## Completeness Criteria`, `## Success Criteria`, `## Invariants`, `## Quality Standards` and `## Definition of Done`. Children cite parent criteria and state deltas; global completion includes child and seam evidence. Label facts, observed source, proposals, assumptions, actual owner decisions and blockers; use `walt` author, proposal version/parent/reason, supplied baseline and a complete successor, never only a revision diff.

Produce ordered, cohesive steps with bounded objective, exact read/write scope, required materials, output artifacts, criteria deltas and evidence/oracle references. Include load-bearing exact interface sketches and supplied source identities. Separate hard/contract/write-to-read dependencies from write conflicts; unresolved conflicts/forks return to Maestro. Preserve enough global context for local work to remain correct. Do not hide cross-step dependencies or split every small edit into another Task.

Historical evidence and a live invariant are different. A baseline failure or a check against a legitimately removed column is not a persistent invariant to rerun forever. A historical PASS is not proof that current behavior remains true. Required witness/recheck semantics must be supported by the host; unknown JSON metadata cannot implement them.

Target RelaySprint.Sprint directly. work_packages are ordered steps of one product WP, not new product Tasks. Keep source-known oracle references and mark missing binding/coverage/acquisition as blockers/`UNKNOWN`. Host supplies actual models/budgets/placement and oracles; author proposes using supplied evidence. Do not invent registered host checks, approvals, receipt identities or execution guarantees. Structural decoding is not semantic validation or arm creation. `gen` is ledger generation, not schema version; unknown metadata cannot implement runtime behavior. Keep `partitionPlan` separate from durable `PlanRevision`.

MVP execution shape: one linear WP, one host-created arm, the same Session/logical task. Authoring a WP does not create its arm. Do not introduce another DB, scheduler, model loop, planner, universal DSL or routine human approval at every step. Relay/host own reads, reveal, explicit evaluation/transitions, replay, stop, continuation and global completion. A worker's done claim is local; it does not close the WP.

Use only installed/authorized pure Arsenal operations and the existing catalog/describe/execute IDs within [walt-plan's frozen subset](../walt-plan/SKILL.md#authorized-structural-helpers). Generated checks/policies remain proposals. Return complete artifact/version/source refs, supplied check statuses, assumptions and blockers in upstream-result. Do not dispatch, schedule, arm, approve, persist authority, self-review acceptance, install tooling or take Atlas/backend powers. Stop at local handoff.
