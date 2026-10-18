# Orchestra — Team & Phases (the separation of concerns)

> The owner's directive: **one specialist owns product, architecture, specification and planning;
> Maestro owns orchestration.** These upstream disciplines use distinct procedures inside one member,
> rather than separate personas. There is no architecture-only review seat. This document is the
> canonical map of who owns what.

Current identity contract: upstream routes as `archie`, profile `upstream`, assets under
`packages/archie-specialist`, config `agent.archie.name`. This supersedes the earlier label-only naming
rule; no active old-ID alias is defined. Source status and candidate pins in the following paragraph
describe pre-correction implementation evidence, not qualification of the renamed runtime. See
[NAMING-CORRECTION.md](../../../specs/upstream-specialist/NAMING-CORRECTION.md).

The unified upstream ownership below is the owner's target contract. Native upstream registration, the
`upstream` profile projection, central config/environment name resolution, packaged skills/assets and the
proposal-result card/projection are implemented and reviewed. Core/V1 restricted Arsenal authoring bindings
and `UpstreamProposal.inspect` are now implemented in unlanded candidate
`ff3b57d4a6323a150949072d06ad379f666a65af`; this is not deployment or domain qualification. Actual V2
application binding, Maestro's planning-method transfer and W6 immutable publication/revision, actual
upstream provenance and applicable native approved-scope binding remain mandatory pending integration;
real qualification remains pending. This document installs none of those bindings. The architecture-only
reviewer is removed from the candidate native roster;
historical references are not new seats or aliases of the unified specialist. This map grants no runtime
capability; charter and roster lists are not semantic execution enforcement. See the
[Maestro/runtime handoff](../../../specs/upstream-specialist/maestro-planning-handoff.md) for source pins,
exact transfer text and remaining ownership boundaries.

## 1. The phase map

```
  SPECIFY      product → architecture → spec → Tasks / WPs / roadmap  ← one specialist
       │ versioned proposal, assumptions, evidence and blockers
  ORCHESTRATE assign → review/adopt → dispatch → integrate            ← Maestro
       │ exact adopted work and host-bound authority
  EXECUTE     produce implementation artifacts                        ← generators
  VERIFY      judge deliverables adversarially                        ← evaluators
  SUPPORT     explore / research / maintain documentation              ← support seats
```

**The load-bearing separation:** the upstream specialist authors product, architecture, specifications,
plans, decomposition, Tasks/WPs and briefs; Maestro organizes and decides within the owner's authority,
coordinates review/adoption, dispatches and integrates. An unresolved upstream decision returns to that
specialist or, when it needs owner input, through Maestro to the owner. Maestro does not fill a planning
gap by inventing the missing specification or silently changing the adopted plan.

## 2. The disciplines & their personas

### The unified product, architecture, specification and planning specialist

There is one upstream member. The former Product Definer and separate Architect mandates are consolidated
here. The architecture-only review mandate is retired, not transferred to this member.

| Persona | Phase    | Discipline                                                                                                                                                                                                         | Kit (placeholder) |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| **the Upstream Specialist** — `archie` | Product / architecture / specification / planning | Proposes product definition, technical architecture, precise requirements and acceptance, Tasks/WPs, briefs and roadmaps within Maestro's assignment. Returns artifacts, evidence and blockers to Maestro. | `NORTHSTAR` |

The unified specialist's default public label lives in `UPSTREAM_DEFAULT_LABEL`, not its routing identity.
Like every team member except Maestro, its display name is configurable through the host's central name
resolution (`agent.archie.name`, overridden by `HUGR_UPSTREAM_NAME`); prompts consume the resolved label.
Refer to the member by role or stable ID in code and documents. The native profile key is `upstream`; the
current ID `archie` is the active Atlas `curatedBy` producer key; stored historical curator records are
not rewritten or accepted as an active alias. Registration and name-binding evidence belongs to the
reviewed pre-correction candidate, not a renamed-runtime deployment or domain qualification. The kit name remains a placeholder; this
contract grants no Atlas memory or toolkit ownership.

**Owner correction, 2026-10-07:** the unified specialist is subordinate to Maestro, like the backend
specialist. It owns product definition, architecture, specification and planning inside the supplied
assignment: goals, scope proposals, technical alternatives and contracts, acceptance criteria, tasks/WPs,
briefs, roadmaps and revisions. It may propose the decisions the assignment asks it to develop; proposals
are not owner instructions or approvals. Unresolved material choices and contradictions return through
Maestro as blockers or decision requests. It does not implement product code, dispatch workers, integrate
changes or take over review. Maestro supplies the assignment and coordinates execution of the returned
plan rather than authoring or replanning it itself. This supersedes the earlier split between the Product
Definer, Architect and specification specialist, and the TechLead planning responsibilities of Maestro.

#### Planning authorship and operational ownership

| Work | Unified specialist | Maestro, reviewers and host |
| --- | --- | --- |
| Product definition | Frames the problem, intended users/outcomes, priorities, scope and alternatives within the assignment; separates owner facts from proposed decisions. | Maestro supplies the owner's request and constraints and carries material decision requests and answers. The owner retains product authority. |
| Architecture | Proposes technical design, interfaces, data/flow models, prerequisite constraints, alternatives and trade-offs; grounds claims in supplied/current evidence. | Maestro carries decisions to the owner when required. Implementation agents build the adopted design; general code review assesses architectural consequences as part of the whole deliverable. |
| Specification and acceptance | Drafts requirements, the five criteria, proposed oracles, edge/failure cases, coverage and explicit assumptions from the assignment. | Maestro supplies the owner's request and decisions; independent reviewers evaluate coverage when required. The author cannot certify its own acceptance. |
| Work packages and roadmap | Defines bounded WPs, proposed write/read sets, dependency DAG, ordering, milestones, sizing, risks and revisions against the adopted product and architecture. | Maestro coordinates observed readiness and actual concurrency without changing the plan's dependencies or scope. |
| Briefs and check plans | Authors execution briefs, context requirements, proposed checks and estimates from supplied host facts; distinguishes estimates from observed results. | Maestro supplies actual placement, available agents and model/capacity facts. Maestro and the host select the actual execution model, bind permissions/checks and dispatch. |
| Shared contracts | Specifies adopted interface decisions, invariants, error outcomes and producer/consumer obligations. | Unresolved decisions return to the specialist or owner through Maestro. Implementation agents create source scaffolds; general reviewers and the host validate the resulting seams. |
| Failure or changed input | Revises the affected specification, Task/WP, brief or roadmap after receiving the evidence and bounded revision request. | Maestro reports actual execution evidence and requests revision; it may pause, cancel or resume eligible work, but cannot silently re-slice, weaken acceptance or replan. |

#### Handoff and acceptance

The specialist returns a versioned **proposal** with artifact references, source/baseline identity where
available, requirement-to-Task/WP/check coverage, assumptions and blockers. It may check its own artifacts,
but cannot declare independent review, owner approval, dispatch authorization or implementation completion.
Drafting a Task/WP never starts a runtime `Task` or child Session.

Maestro routes any required independent review, returns findings to the author for revision, and adopts only
the current version after any required review under the owner's instructions. Material product or architecture
choices that require owner input return through Maestro. There is no separate architecture review service;
self-checking a design is not independent review. `partitionPlan` (the code-partition artifact), a work card
and durable `PlanRevision` are distinct: planning content comes from the specialist; the host persists and
validates records while Maestro coordinates the existing lifecycle. Adoption must retain actual upstream
authorship and evidence. Current `PlanRevision` field provenance accepts only `stakeholder`, `maestro` or
`orientation`; it cannot yet represent upstream proposal authorship. Do not disguise that gap by relabeling
upstream content as an owner fact, Maestro-authored content or observed orientation. This remains a
host/schema integration blocker, not a new source value granted by prose.

Normal work gains no mandatory governed ceremony. Explicit governed work retains its existing admission,
exact revision/context/validation/review/direct-owner-approval/authorization and dispatch-intent bindings
before execution; the proposal supplies none. A structural inspector or authoring receipt does not establish
semantic completeness, immutable publication or approved scope. W6 must bind the materialized revision and
scope to actual upstream evidence and host authority; later author edits are new proposals, not inherited
approval.

**Owner scope clarification, 2026-10-08:** Roadmaps, epics, issues and Tasks retain their current identities,
semantics, formats and lifecycles; progressive WPs introduce no compulsory nesting or numeric routing threshold.
A Task remains a smaller, lightweight work unit, distinct from the native `task` delegation tool, child Session
and logical task ID. It is not automatically wrapped in a WP, compiler, arm, steps or extra ceremony; clear
acceptance, normal checks and genuinely requested governed requirements still apply. A WP step is not a Task.
WP authoring, executor revelation and evidence-backed validation/transition are separate contracts over
existing Relay and host infrastructure, not a replacement hierarchy or new execution engine. Progressive
steps do not introduce a per-step human approval ceremony.

### The Conductor — ORCHESTRATE · kit `PODIUM`

The Conductor is the orchestration layer, driven in a Session by Maestro — kit **`PODIUM`** (the podium
the conductor works from; ratified 2026-07-16). It assigns decomposition of the adopted design into disjoint,
contract-bound Tasks/WPs to the unified specialist, dispatches the returned work using specialist-authored
briefs with host-bound placement and permissions, coordinates the return-firewall and GAN review contract,
and integrates. The foundation's `packages/orchestrator` and `docs/design/orchestration.md` references
describe the orchestration design, not proof of installed host capabilities. Its per-member Memory
(task/pr/project plus the **logbook**) is a foundation model; the runtime Atlas Memory boundary currently
supports only `backend`, not Maestro or upstream. Backend ownership and charter remain unchanged.

### Downstream — the existing seat roster (EXECUTE / VERIFY / SUPPORT)

The roster is fixed and named, so role is known (no self-declared `role` field — §ARCHITECTURE 5.1):

| Seat      | Phase                 | Discipline                                                                  | Kit        |
| --------- | --------------------- | --------------------------------------------------------------------------- | ---------- |
| `backend` | EXECUTE (generator) | backend execution — transcribes anchor code, never designs                  | FORGE      |
| `patty`   | EXECUTE (generator) | frontend execution — against a frozen design-token contract                 | ATELIER    |
| `lucy`    | VERIFY (evaluator)  | general cold code review — mechanical evidence, including architectural consequences of the whole deliverable | MICROSCOPE |
| `billy`   | VERIFY (evaluator)  | security — proves exploitability with taint paths + PoC-as-gate             | FORTRESS   |
| `frankie` | VERIFY (evaluator)  | process-audit — replays the hash-chain; proves "sealed=green" is real       | GAVEL      |
| `jimmy`   | SUPPORT (explorer)  | exploration/research — grounded invariants, adversarially contested         | COMPASS    |
| `rosie`   | SUPPORT             | documentation-gardening — re-checks prose against code                      | GREENHOUSE |

## 3. The GAN review contract

A **generator's** WP (`backend`/`patty`) is **not sealable** under the foundation contract until a matching
**evaluator** (`lucy`/`billy`/`frankie`) returns a passing ResultCard. Maestro coordinates the owner's
"cold-review every returning agent" requirement. This roster states review ownership; it does not itself
prove runtime sealing, semantic enforcement or that a reviewer has passed a particular delivery.

## 4. Why this separation matters (the v1 failure it fixes)

In v1 the lead did everything, so product/spec/architecture were _implicit_ — invented on the fly,
never ratified, never navigable. That is exactly why "99% of the dream product was missing or sloppy":
nobody _owned_ defining it. Orchestra assigns the upstream disciplines to one subordinate specialist with
an explicit handoff, so Maestro orchestrates adopted work rather than improvising its product, architecture
or plan.
