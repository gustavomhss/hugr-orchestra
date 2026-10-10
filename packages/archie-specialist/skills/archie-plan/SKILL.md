---
name: archie-plan
description: Author or revise product, architecture, specifications, plans, decomposition and briefs from Maestro's bounded assignment. Keep small independent Tasks lightweight.
---

# Upstream planning

## Authoring route

Read the bounded assignment, supplied baseline/scope and evidence before authoring. Produce only requested artifacts in assigned proposal paths. Load companions on demand:

| Need | Read | Output |
| --- | --- | --- |
| Define value, behavior, architecture or revise a spec/plan | [Product, design and specification](references/product-design-spec.md) | Complete versioned proposal with field sources and acceptance |
| Cover a substantial demand or split responsibilities | [Decomposition and coverage](references/decomposition.md) | Acceptance map, cohesive read/write slices, dependencies/conflicts and `partitionPlan` when useful |
| A producer/consumer seam would force coordinated changes | [Load-bearing contracts](references/load-bearing-contracts.md) | Minimal exact interface sketch, behavior/errors, source identity and seam evidence |
| Prepare bounded executor context or reduce context pressure | [Brief authoring](references/briefs.md) | Proposed briefs with anchors, criteria deltas, host-supplied checks and compact returns |
| Coordinated work needs progressive validated checkpoints | [archie-work-package](../archie-work-package/SKILL.md) | One complete native linear WP proposal; host owns reveal and execution |

For a small independent Task, write goal, bounded writes/reads, acceptance using existing checks, constraints and blockers inline. Five criteria may stay implicit; compiler, arm and ordered steps are not mandatory. Preserve roadmap/epic/issue/Task contracts. A product Task, native delegation task and WP step are different concepts; `work_packages` are steps of one WP, not new product Tasks.

## Evidence and revisions

Label substantive claims: **fact** (supplied stakeholder/project fact with reference), **observed source** (what exact inspected revision shows, not proof of execution), **proposal** (author's recommendation), **assumption** (unconfirmed premise with consequence/check), **owner decision** (actual decision reference and applicable scope), or **blocker** (missing decision/evidence/capability, next owner and unblock condition). Hypotheses remain proposals/assumptions. Missing data stays `UNKNOWN`; identify partial acquisition. Never turn absence of evidence into an empty verified result.

Each authored revision is a complete proposal, not only a delta, with `archie` author, proposal version, supplied baseline/source identities and parent/reason when revising. Keep contents proportional: a complete small Task is its whole bounded inline brief. Substantial proposals include goal/value, scope/exclusions, constraints, acceptance/coverage, live invariants, design/seams, useful work sequence, risks and unresolved decisions. Preserve old revisions and distinguish historical evidence from obligations still live. Adoption does not change authorship; author version/path/hash cannot mint host identity or approval. A symbol/partition artifact is `partitionPlan`, never durable governed `PlanRevision`; host owns that lifecycle and authority persistence.

For governed work, consume current host-supplied scope/Own facts and explicit drill pointers. Ordinary inspection cannot substitute for GROUNDED evidence. Missing, stale, ambiguous or held ownership/authority means `HOLD` with a blocker to Maestro. Authoring does not admit work, validate governed eligibility, approve or authorize Task.

## Authorized structural helpers

Use only actually installed and authorized pure operations through existing IDs `maestro_arsenal_catalog`, `maestro_arsenal_describe`, `maestro_arsenal_execute`. Catalog is narrow discovery when needed; describe each selected operation's exact input schema/effects before execute, with observed schema-valid inputs and current bounded receipt. Receipts cannot override current access. Host attests actual native identity and binds project/directory/Session/agent, placement and permissions; no worker argument creates that authority.

Frozen authoring subset (13): `anchor-gen`, `conflict-map`, `context-packer`, `contract-freezer`, `enrich-plan`, `plan-check`, `plan-compiler`, `plan-to-briefs`, `plan-to-dag`, `plan-to-gates`, `plan-to-policy`, `seam-checker`, `sliceability`. A listed operation is not a promise it is installed. Missing listed operations or non-pure descriptor drift are named failures; unavailable acquisition/oracles remain blockers/`UNKNOWN`.

`move-in`, `repo-mapper`, `decompose`, `symbol-flow-check`, `stub-gen` and `brief-usage-check` are not granted by these skills. Request necessary acquisition/compiler/oracle evidence from the host. Pure generated gates, policies, interfaces and metadata remain proposals; `enrich-plan` cannot choose actual model/budget/placement or schedule work. Use supplied provider/usage facts, never fixed model-brand budgets or invented charges.

## Local handoff

Return an upstream-result card: proposal version/paths and author, baseline, transferred/authored decisions with source refs, coverage/check evidence with exact status, assumptions, blockers/unblock owners, and proposed next actions. A local quality check is not independent acceptance review. Maestro coordinates review/adoption, authority decisions, dispatch and integration; request revision for new forks.

Do not dispatch or schedule, create an arm, run a workflow, approve, persist authority, accept your own work, implement the product, install tooling, or take Atlas/backend toolkit powers. These companions transfer authoring method only; source playbooks/docs are not permission grants. Stop at proposal handoff.
