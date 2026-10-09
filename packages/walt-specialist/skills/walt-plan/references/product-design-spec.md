# Product, design and specification authoring

Read when the assignment asks what/why, technical design, a specification, a roadmap or a plan revision. This is an authoring procedure; ratification, durable records and authority remain with their actual owners.

## Inputs and source discipline

Start with verbatim demand, supplied current scope/baseline, stakeholder constraints, observed behavior/source, existing requirements/design/acceptance and host evidence. Use the claim labels in [walt-plan](../SKILL.md). Cite each factual field to a bounded source identity; do not treat a design document's proposed tool or state machine as installed runtime.

If behavior/design already exists, recover its clauses and acceptance first. Quote the source clause, retain its ID, mark derived requirements/scenarios, and expose contradictions instead of silently reconciling them. Observed implementation is evidence of what exists, not owner approval of what ought to exist. New behavior stays visibly proposed. Missing source, owner or a decision yielding incompatible outcomes becomes a blocker; ordinary local uncertainty may remain an explicit assumption.

## 1. Define the outcome

1. Name the user/agent's job and current pain from supplied traces or evidence. A useful job map is Define → Locate → Prepare → Confirm → Execute → Monitor → Modify → Conclude; use only relevant steps, not a mandatory eight-part form.
2. State observable outcome/value and its measure, population, conditions and evidence basis. Proposed target thresholds stay proposals until the owner decides them. Do not invent performance/adoption figures or rank pain without instrumentation.
3. Write a compact working-backwards PR/FAQ when product discovery needs it: who benefits, problem, current workaround, promised outcome, proposed mechanism; then what must be true, why this beats the workaround, top failure reasons and genuinely new capability. Example quotes are illustrative, not customer testimony.
4. Cover four risks: value, usability, feasibility and viability/maintenance appetite. Tie each risk to an outcome/job step and propose evidence that can retire it. Propose the riskiest feasibility spike first; host decides placement, budget and whether it runs. No supplied experiment means no retired risk.
5. State appetite, constraints, exclusions and what the smallest useful outcome leaves for later. Do not add speculative requirements merely to fill a template.

## 2. Design the mechanism

Map each outcome/functional requirement to its mechanism/design parameter. Use a small coupling matrix when several outcomes share mechanisms: name where a change would force other parts to change. Every design choice cites an outcome, job-map step or risk it retires; unsupported choices remain questions or are removed.

Draw boundaries around decisions most likely to change. Describe layers, ownership, data/control flow and failure/recovery behavior; distinguish supplied decisions from recommended ones. Sketch exact load-bearing seams using [contracts](load-bearing-contracts.md), not speculative future APIs or frozen private algorithms. Compare meaningful alternatives and explain rejection, tradeoffs, constraints and evidence limits.

For a non-obvious architecture decision, author an ADR proposal: title, status `proposed`, context, proposed decision, consequences, alternatives/reasons and sources. Do not edit an accepted ADR or label a new one accepted; propose a successor with a supersession link for the owner to decide.

## 3. Specify and cover behavior

For substantial specs, build a bounded register of normative clauses/behavioral obligations, IDs, source anchors and unwanted behaviors. Distinguish observable behavioral constraints from definitions/naming rules; exclusions/exemptions need reasons and an owner, not silent removal from coverage.

Derive a singular requirement per source clause; retain the exact quoted clause and a source link. Where EARS fits, use one `shall` per requirement with explicit trigger/precondition and outcome. A compound invariant may require several requirements sharing its ID. A source contradiction is a design defect to return, not license to author an unseen rule.

Link each requirement to concrete happy-path and relevant negative/edge/recovery acceptance scenarios, then an existing or proposed oracle. Use Given/When/Then examples when they make behavior checkable. Reuse source acceptance; do not create a second independent-looking copy of the same logic. Keep bidirectional trace: demand/clause → requirement → acceptance → slice/step → evidence. A complete table is traceability, not proof that demand itself was fully captured; use [coverage critique](decomposition.md#coverage-and-criteria) for substantial work.

Choose a verification method proportional to the problem using host-supplied evidence: examples/contracts, exhaustive finite cases, PBT/reference models, or a formal model only when high-consequence failure, combinatorial state and affordable upkeep justify it. Propose the method/oracle and its limits; do not author tests or claim a model/compiler ran outside the assignment. Requirements, models and scenarios are derived views of the clause, not extra authority sources.

## 4. Plan the smallest useful work

Use a lightweight Task for small independent changes. For a broad roadmap, group requirements into outcome-driven vertical epics with goal trace and explicit acceptance ownership. Split oversized epics into the fewest cohesive still-vertical children; the children must preserve the parent's requirement/acceptance set without orphans or accidental duplicate ownership. Story mapping, a small vertical release slice or a SPIDR split is a technique, not a compulsory artifact.

Describe dependency-ordered Now/Next/Later horizons from explicit prerequisite edges, not invented dates or host scheduling. For implementation slices, follow [decomposition](decomposition.md): responsibility/module boundaries within the outcome, minimal seam contracts, shared-write exclusions, and local latitude. Do not copy Atlas-specific module counts, lexicographic tie-breaks or mandatory one-module rules into unrelated work.

## 5. Emit a complete versioned proposal

Use the project's existing artifact shape. Include:

- `walt` author, author proposal version, input/baseline/source refs, scope supplied by host, and status `proposed`.
- Goal/value, constraints/non-goals, acceptance and coverage links, live invariants, design/mechanisms/seams and alternatives.
- Cohesive work units/dependencies, risks, assumptions and blockers with decision owner/unblock condition.
- For successors: parent artifact/version, change source/reason and field-level diff **plus the full successor proposal**. Preserve prior bytes/artifacts; refresh source identities after drift. Previous approval does not travel to new bytes, scope or context.

Keep five exact headings for an epic, WP or governed card as specified in [decomposition](decomposition.md#coverage-and-criteria); small Tasks keep criteria implicit. Author versions are not schema versions, durable `PlanRevision` IDs, publication or approval. Return a material decision question to Maestro with choices/consequences and required source; do not decide outside supplied authority or persist approval invalidation yourself.

## Source method and limits

Source pin for this transfer: `abf7a72c77fcaeee1206400a8270b2581ae9839c`.

- [Product-design rubric](../../../../../foundation/atlas/docs/method/product-design.md), “The four phases”, “Templates” and “Anti-overhead”: outcome/job/risk trace, PR/FAQ, four risks, coupling matrix and ADR lineage. Its Ratify stage is an owner handoff here, not worker authority; its self-review shortcut cannot replace independent acceptance.
- [Decomposition protocol](../../../../../foundation/atlas/docs/DECOMPOSITION-PROTOCOL.md), “The single-source chain”, “Atomization”, S1–S3 and C/S4: recover/derive clauses, requirement/scenario links, vertical roadmap and seams. Its Atlas-specific state machine and future gates are source design, not granted runtime.
- [Draft-plan](../../../../../specs/hugr-maestro/methods/draft-plan.md), “Frame Contract Material” / “Build Proposed Revision”, and [revise-plan](../../../../../specs/hugr-maestro/methods/revise-plan.md), “Frame Delta” / “Build Successor”: field provenance, complete revisions and visible assumptions. Their durable write/guard capabilities are proposed host lifecycle, not callable upstream tools.
- [Validate-plan](../../../../../specs/hugr-maestro/methods/validate-plan.md), “Purpose” / “Reconstruct Required Checks”: structural eligibility cannot decide semantic coverage or approval; a missing/empty validation instrument cannot produce success.
