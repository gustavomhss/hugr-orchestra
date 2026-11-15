# Genesis → ownership: global transition plan

Status: L1–L4 RESEARCH HANDOFFS ACCEPTED · 2026-11-05. No production publication or global acceptance.
Accepted cumulative chain: [research entry point](genesis-ownership-results/README.md).
Owner-requested Sol L4 rerun with explicit operational coverage is also accepted:
[expanded skill candidates](genesis-ownership-results/layer-4-sol/README.md). Same small Session-input pilot;
the huge repository has not been processed as a whole, and real consumer ownership remains unproven.
Investigation baseline: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085` (`genesis-run-fix`).
Execution must pin its own baseline and inspect intervening changes before freezing WPs.
Canonical execution queue and historical obligations: [recovery worklist](genesis-recovery-worklist.md).
Owner: “ok, faz os ajustes e pode executar”. Execute in the order below; this is not permission to spend
an unspecified model budget or bypass the early value checkpoint. No independent approval/test pass is inferred.
Concrete freeze/fit work: [Session-input slice contract](genesis-ownership-slice.md).
Seat-level work and prompt contracts: [mining seats](genesis-ownership-seats.md); size from those contracts, not arbitrary quotas.
Current receipts: [accepted L1 base](genesis-ownership-results/layer-1/README.md) and [four L2 contracts](genesis-ownership-layer-2.md).
The owner reduced mining to four after OpenCode free-limit failures. Earlier budget/authorization stops
below record preparation constraints; subsequent explicit owner execution directives released the named
candidate jobs, not a hard currency guarantee or unlimited spending. Unresolved provider attempts/usage
remain unsettled. None of the layer receipts waives AC-08 or the remaining production/global obligations.

## 1. Outcome, boundary and authority

Deliver a repository-owned representation of deep code AND product understanding, built cumulatively and
maintained incrementally, whose normal entry point is ownership/maintenance documentation and skills.
Consumers establish understanding through Atlas rather than repeating source discovery. This does not
forbid opening source to make an edit; it requires the knowledge needed to decide and verify the edit
to be available without reconstructing it from source. Acceptance below tests that distinction explicitly.

The first delivery is a complete vertical slice, not repository-wide ownership or completion of the old campaign.
Proposed slice: durable Session prompt admission and promotion in the default LLM runner: exact/conflicting
retries, admit-only behavior, steer/queue boundaries and the persistence/execution distinction. Entry evidence:
`packages/core/src/session/input.ts`, `session/runner/llm.ts` under the same source root, `docs/specs/v2/session.md`,
and the V2 Session rules in root `AGENTS.md`. These are starting points, not a claimed exhaustive dependency list.
Provider internals, execution-host-specific delivery, UI and clustered recovery are outside implementation scope;
their relevant boundaries must be stated, not generalized from default-runner behavior.

Before implementation, freeze the slice's exact inputs, boundary, required outputs and acceptance answers.
It must contain existing knowledge, knowledge requiring construction and a conflicting-or-missing-input case.
Use a clearly labelled fixture for a conflict if the real slice has none; never alter authoritative sources to invent one.
Do not hide available documentation merely to manufacture a cold start. Withheld acceptance answers are not producer inputs.
If this scope lacks those properties, amend the scope here for owner review; do not silently grow it to all Sessions.

Authority: owner statements establish product intent; inspected implementation establishes observed behavior;
existing docs/skills/tests are attributed evidence, not automatically current truth. Interpretations remain
contestable. An intent/implementation conflict is recorded and held where it affects acceptance, never silently resolved.
Historical ADRs are superseded explicitly, never rewritten. This draft does not silently supersede frozen Atlas contracts.

## 2. Global axioms

| ID | Axiom |
| --- | --- |
| GO-A1 | The product is transferable ownership: purpose, behavior, constraints, decisions, impact and safe maintenance; claim count is not delivery. |
| GO-A2 | Construction is cumulative; intermediate knowledge is persistent and independently useful, not disposable model scratch. |
| GO-A3 | Consumption starts small: skills prescribe work and when/how to consult a scoped index; depth is pulled recursively as needed. Skills are not link inventories. |
| GO-A4 | Code/product changes enter their affected knowledge surfaces; unchanged validated knowledge is reused. Initial construction and maintenance use the same dependency/validation semantics. |
| GO-A5 | Knowledge and source evolve together through Git, governed publication and CI consistency controls. Freshness, semantic validity and authority are different properties. |
| GO-A6 | Mechanize what tools can determine; pay models for interpretation/composition that tools cannot supply. Bound execution before starting it and preserve useful completed work. |
| GO-A7 | Extend the existing Atlas with the minimum justified mechanisms; no parallel store, governance system or general-purpose orchestration framework by default. |

These are the transition plan's acceptance axioms, not renumberings of existing Atlas `A-*` laws.
Existing security, identity, dependency-direction and governed-write contracts remain applicable.

## 3. Architecture decisions and restraint

Knowledge has four logical levels: verifiable base → local understanding → integrated understanding →
operational ownership/maintenance. They are NOT four mandatory calls, packages, services or documents per component.
Scope and depth are independent. Shared flows may consume several local artifacts; consumers may enter any useful level.
Each required artifact must name the need it serves; redundant intermediate output is not required for symmetry.

Owner execution topology: complete ONE layer at a time with FOUR mining seats working in parallel
inside that layer. Consolidate and validate the whole finite scope before releasing the next layer.
All four consume the same accepted prior-layer manifest, with disjoint assignments; no same-layer sibling
output is a dispatch prerequisite. This supersedes the earlier cross-layer seat DAG, not cumulative dependencies.
Use at most two persistent `openai/gpt-6.1-terra` judge sessions throughout the campaign; reuse session IDs,
not fresh judges per task. [Seat contracts](genesis-ownership-seats.md) and [judge protocol](genesis-ownership-judges.md)
bind the first-layer partition, consolidation, fixed acceptance and durable handoff. Later-layer partitions
freeze only after the preceding layer is accepted. The owner reduced the former six miners to four
after both OpenCode free routes failed; redistribute their work, do not reduce knowledge coverage.

The base incorporates source structure, mechanically derived facts, relevant tests/configuration, existing docs,
skills and owner decisions. Upper levels normally consume validated lower knowledge and scoped declared evidence;
a discovered gap becomes a bounded lower-level work item, not an undeclared whole-repository reread.
Missing critical context stops dependent publication; it does not trigger an autonomous discovery loop.

Before adding a schema, express actual slice artifacts with existing Atlas types/storage/doors. Document the
specific incompatibility requiring each extension. Keep a common artifact envelope only as far as needed:
stable identity, scope/kind, body reference, input versions, build dependencies, validation and explicit gaps.
Do not force a whole explanation into an advisory claim; do not turn every paragraph into a new node family.
Start artifact-granular. Section-level invalidation or semantic-equivalence detection requires measured justification.

Separate build dependencies from navigation references. The former invalidate outputs; the latter guide consultation.
The index must route by scope AND reader need (behavior, contracts, decisions, maintenance, evidence), using
existing deterministic retrieval where possible. Resolve exact identities, expose misses/truncation and allow
direct depth access; neither raw path hierarchy alone nor a mandatory layer-by-layer ritual is sufficient.

Initial build and incremental update share recipes and receipts. A changed input makes dependents candidates
for revalidation/rebuild; deterministic checks may discharge the change without a model. Distinguish the
consumer-visible result (body, authority, validity, gaps and any evidence identity the consumer relies on)
from execution receipts/input versions. Propagation stops only when the validated result's canonical
identity is unchanged; equal prose alone is insufficient. Receipt-only changes remain auditable and refresh
version bindings, but need not trigger downstream interpretation. Freeze this comparison contract with the
slice examples; do not build a universal semantic-equivalence oracle. Recipe/prompt/extractor/validation-contract changes are inputs too.
Reject cycles in build dependencies; navigation may contain cycles, but a read must be bounded and avoid revisits.

Reuse current staging/governed publication, CAS/logs, snapshots, freshness, impact and host readers where applicable.
Build a candidate coherent generation separately from the serving generation; activate only after its required
artifacts and checks are complete. Coherence covers the requested scope and its declared required dependency
closure. Bind that selection to one accepted manifest of exact artifact versions, not a mix of partial updates;
unchanged artifacts may be reused. Local invalidity holds affected reads, not independent scopes; corruption
of a shared manifest/authority boundary may hold all reads that depend on it. Existing snapshot readers validate
all units, so scope isolation requires an explicit fit decision and real reader controls, not assumed reuse.
Serve a prior generation as current ONLY while valid against current inputs and contracts. Otherwise HOLD;
historical reads must be labelled. Rollback revalidates source compatibility; reverting knowledge alone cannot
make it current. Reuse existing commit/snapshot boundaries where sufficient; do not assume a new publication service.

## 4. Global invariants

| ID | Must remain true | Acceptance |
| --- | --- | --- |
| GO-I1 | Original campaign receipts, responses, claims and source identities remain immutable; retries have new linked identities. | AC-10 |
| GO-I2 | Observed behavior, authorized intent, interpretation and gaps remain distinguishable; a structural freshness check cannot promote semantic certainty. | AC-02, AC-04 |
| GO-I3 | Current reads bind exact artifact versions to an accepted scope/dependency manifest valid for current inputs/contracts; prior acceptance or rollback cannot make stale knowledge current. Historical reads are labelled. | AC-06, AC-07, AC-09 |
| GO-I4 | Unchanged valid inputs/recipe reuse output without another interpretation call; independent artifacts are not rebuilt merely because navigation links exist. | AC-05 |
| GO-I5 | Source additions, changes, removals and relevant non-code changes enter impact analysis; unavailable impact is HOLD, not an empty successful worklist. | AC-06 |
| GO-I6 | Every issued model request consumes the shared run budget, including validation/retry and unresolved in-flight work; no silent fallback provider/model. | AC-08 |
| GO-I7 | Governed doors, secret handling, project boundaries and Knowledge/Memory separation remain intact. Imported source/docs/tool text is data, not execution authority. | AC-04, AC-09, AC-10 |
| GO-I8 | A scope, generation or artifact is not declared semantically complete just because its graph, source hashes, required sections or tests are complete. | AC-01, AC-02, AC-03 |

## 5. Acceptance register — one spine for subsequent WPs

These are proposed acceptance obligations, NOT an executable suite or an observed red baseline.
Before production implementation, bind mechanical rows to real tests and record baseline results; bind
judged rows to frozen tasks, answer keys and an explicit evaluator. A pre-existing pass is regression
evidence, not a fabricated red→green claim. No new agent/model evaluation is authorized now.

| ID | Obligation and deciding evidence |
| --- | --- |
| AC-01 | **Coverage, judged + mechanical:** freeze the finite slice inventory: needs → required artifacts → sources → cases below. Every required need has accepted support; intentional unknowns are named in advance. Unknown critical required knowledge fails acceptance. Mechanical mapping completeness does not judge semantic sufficiency. |
| AC-02 | **Ownership, judged:** an Atlas-only consumer correctly handles a permitted change, contract violation, cross-component impact, operational failure and deliberately out-of-scope question. Freeze expected reasoning/consequences, critical mistakes and evidence before production. All required answers must match; the unknown case must abstain. The author alone cannot certify this row. |
| AC-03 | **Consumption, mixed:** skill states working protocol and index usage; actual index reads reach purpose, behavior, constraints, decisions, impact, verification and evidence within fixed task-specific read/context bounds. A routine task stops shallow; a deeper task reaches supporting knowledge. Each intermediate artifact has a direct-use case. Validate real readers, not only Markdown links. |
| AC-04 | **Construction, mixed:** real paths ingest existing knowledge and construct missing understanding; labelled stale/conflicting/missing/malicious-source fixtures are handled without inventing intent, hiding conflict, granting authority or publishing unsupported required content. A canned final document cannot satisfy the producer test. |
| AC-05 | **Reuse, mechanical:** identical inputs/recipe produce a cache hit with zero proposer calls; an independent edit preserves unrelated result identities and call counts. Equal prose with changed authority/validity/gaps MUST propagate; a receipt-only change refreshes bindings without new downstream interpretation. An unchanged validated consumer-visible result stops downstream rebuild. Build dependency edits invalidate dependents, unlike navigation-only links. |
| AC-06 | **Incremental correctness, mixed:** behavior edit, added/removed source, intent-doc change and recipe change produce the independently expected affected set. Rebuilds restore required knowledge; mutation controls omit an edge/input and must fail. Detecting staleness alone is insufficient. |
| AC-07 | **Publication/recovery, mechanical:** inject failure between generation and activation, interrupt/resume, and concurrent reads. A separate reader observes only a complete accepted manifest valid for current inputs/contracts or HOLD. A failed rebuild after source drift cannot fall back to stale knowledge as current. Resume reuses durable completions; rollback rejects incompatible source bindings; historical reads are labelled. |
| AC-08 | **Economy, mechanical + approval:** one run ledger/reservation governs production, evaluation, retries and concurrent calls. Synthetic checks precede real calls. If real adapter conformance requires a paid call, it needs a bounded explicit authorization first, charged to the same global envelope. Only a conforming route may run the real slice. Report limits, usage and unsettled calls; no bytes-to-token or call-count-to-dollar fiction. |
| AC-09 | **Git/CI/host, mechanical:** changed declared input, new input under registered scope, missing artifact, broken index reference, incompatible dependency version and invalid generation are rejected at intended gates/readers. A local invalid unit holds its required closure while an independent valid scope remains readable; shared manifest corruption holds its dependent reads. Known-good/bad controls use actual entry points. Report workflow scope and branch-protection enforcement separately. |
| AC-10 | **Preservation/migration, mechanical + review:** baseline inventory of protected campaign objects remains exact; old producers cannot publish into the new accepted scope accidentally. Stage new outputs without consumer authority, activate explicitly, preserve old accepted state for rollback and keep unrelated scopes usable. Generated boundaries change only through their generators. |

AC-02's oracle may inspect source/tests; the consumer cannot. Permit explicit product/owner sources in
the producer input; no hidden human rewriting of the answer. Prepare known-scope cases for regression and
separate held-out maintenance cases for evaluation, with their answer keys withheld from the producer.
Use owner evaluation or a separately authorized independent evaluator; self-review is not independence.
Semantic testing demonstrates the fixed cases, not universal correctness for arbitrary future tasks.

## 6. Completeness criteria (CC)

| ID | Complete only when | Acceptance |
| --- | --- | --- |
| CC-1 | Scope, sources, gaps, existing/missing knowledge and the finite required-artifact inventory are frozen. | AC-01, AC-04 |
| CC-2 | The slice is constructed cumulatively and every required level is persisted, directly usable and reachable through the real index/skill path. | AC-03, AC-04 |
| CC-3 | Product purpose, behavior, contracts, decisions, impact and safe maintenance are supported, not merely titled. | AC-02 |
| CC-4 | Initial build, invalidation, rebuild, reuse and relevant additions/removals/non-code inputs work end to end. | AC-05, AC-06 |
| CC-5 | Coherent publication, reader verification, failure recovery and rollback work without weakening governance. | AC-07, AC-09, AC-10 |
| CC-6 | Execution economics are enforced/reported to the stated adapter guarantee and the approved run reconciles. | AC-08 |
| CC-7 | Compatibility, generated surfaces, applicable docs/skills/guides and old-campaign obligations have explicit dispositions; expansion is not silently claimed complete. | AC-09, AC-10 |

## 7. Success criteria (SC)

- **SC-1 — ownership:** AC-02 passes all frozen required cases without a critical mistake or source discovery by the consumer.
- **SC-2 — progressive use:** AC-03 meets the read/context limits frozen before evaluation; routine use does not require loading the full graph.
- **SC-3 — incrementality:** AC-05/06 preserve independent knowledge and reconcile the expected affected set; unchanged work incurs no new interpretation calls.
- **SC-4 — economics:** separately report initial construction, validation, incremental update and daily reads; stay within the approved envelope and never call missing usage zero. No savings percentage without a comparable measured baseline, and no rerun of old mining merely to obtain one.
- **SC-5 — consistency:** AC-07/09 demonstrate coherent accepted reads and refusal of the specified invalid states, without asserting CI proves semantic truth.

Quantitative budgets and task-specific read limits must be filled before the relevant evaluation; until
then those criteria are NOT satisfied. Do not invent targets from historical prompt bytes or model marketing.

## 8. Quality standards (QS)

- **QS-1 Fidelity:** preserve evidence and disagreements; use correct epistemic labels; no unsupported product rationale.
- **QS-2 Operational utility:** concise skills prescribe actions; index entries state what a deeper artifact answers; explanations/procedures are readable, scoped and non-redundant.
- **QS-3 Simplicity:** every new mechanism names an acceptance need existing code cannot satisfy; no speculative framework, per-layer agent, vector store, bespoke database or mandatory deepening loop.
- **QS-4 Engineering:** repository style/dependency boundaries, generated-code discipline, safe persistence, input validation and secret handling; no global test hacks or duplicated implementation in tests.
- **QS-5 Evidence:** actual implementation/reader controls, anti-vacuity mutations where relevant, bounded semantic review and explicit scope of proof; review a fixed bar, not endless optional improvements.
- **QS-6 Economy:** scoped evidence packs, shared validated context, deterministic derivation first, reusable completions and honest accounting; no automatic retry/refinement campaign.

## 9. Execution order, authorization and stops

Stages below are milestones, not dispatch-ready WPs. Later WPs may be cut only after the scope and
acceptance contract are frozen; each must have exact files, baseline, dependencies and its acceptance subset.

1. **Freeze:** slice inventory, concrete output examples, navigation walkthrough, held-out cases, authority rules and limits. Reconcile changed normative contracts through explicit supersession; do not write another speculative architecture survey.
2. **Fit and demonstrate value:** map examples to existing Atlas surfaces and freeze result/receipt comparison, source-compatible rollback and scope-isolated reader seams. Bind acceptance controls and record baseline verdicts. Before generalizing the producer/update/publication machinery, use the minimum existing path for a bounded real-construction demonstration against the frozen ownership cases, only after separate budget authorization. This advances part of the planned evaluation, not another campaign; charge it to the same envelope and retain reusable outputs. Without authorization, stop at contracts/mechanical controls and mark semantic feasibility unproven.
3. **Build vertically:** after the value checkpoint is accepted, implement cumulative construction, index access and operational outputs for the slice. Deterministic/synthetic adapters prove mechanics, never substitute for the checkpoint's real construction/semantic evidence.
4. **Close maintenance:** implement affected-set propagation, bounded execution, candidate-generation activation, real reader/gate integration, recovery and compatibility controls. Shared write surfaces run serially; only contract-bound, write-disjoint work may later run in parallel.
5. **Evaluate and land:** within the separately approved envelope, evaluate the integrated slice on reserved held-out cases, reuse eligible checkpoint evidence/completions instead of repeating them, and reconcile all costs/evidence. Run grouped scoped CI/typechecks/guards and one final integrated epic. Land through repository review/merge policy, not a self-report.

Hard stops: unresolved critical source conflict; incomplete impact/acceptance; untrusted/mixed generation;
unapproved spend; incapable/unmetered adapter relative to the promised guarantee; preservation mismatch;
failure of the fixed cases. A stop returns the exact blocker and preserved state; it does not start new discovery/review rounds.

Budget approval must name provider/model, scope, production/evaluation/retry allowance and allowed calls in
flight. A request reserves a conservative enforceable bound before dispatch. Actual usage settles it;
unresolved calls retain their reservation until resolved, never become free on timeout. State separately
provider-enforced limits, estimates and post-hoc metering. Refuse a route that cannot meet the approved
guarantee; a token/call limit is not automatically a hard currency cap. No fallback provider/model.
Order: no-model checks → separately bounded adapter-conformance authorization if a real call is necessary
→ conformance result → release the authorized slice allowance only if the route conforms. Conformance is
part of, not additional to, the global envelope. Failure preserves its receipt and blocks production.
The owner subsequently selected a local six-worker roster (two Crouton Alpha/OpenRouter, two GPT-6 Luna,
two Crouton Alpha/OpenCode); exact catalog IDs and readiness are recorded in the slice contract. This
replaces the Luna-only selection for NEW work, never original Grok receipts. Catalog visibility is not
adapter conformance, quota verification or an approved total execution budget.

Repository expansion is a SEPARATE authorization after slice acceptance: finite domain/flow inventory,
required ownership coverage, estimated/approved budget and ordered backlog. Rank prioritizes that inventory;
it does not erase cold areas or turn a skeleton into completed ownership. No repository-wide mining now.

## 10. Global Definition of Done and WP inheritance

The slice is DONE only when ALL hold:

- **DOD-1:** CC-1..7 and SC-1..5 have explicit evidence/verdicts; judged rows have named acceptance, not inferred approval from tests.
- **DOD-2:** all applicable invariants and QS-1..6 are reviewed; known-bad controls demonstrate relevant gates can reject defects.
- **DOD-3:** real consumers use accepted artifacts through the index/skill path; end-to-end update/publication/recovery, not only isolated modules, is verified.
- **DOD-4:** scoped remote tests, package-local typechecks, generated checks where applicable and `bun run check:guards --base origin/dev` are reconciled; one final epic covers the integrated bundle. Never report unrun gates as green.
- **DOD-5:** real authorized usage/cost and unresolved requests reconcile; no unapproved calls, silent fallback or budget reset between stages.
- **DOD-6:** docs/skills/operator guidance, migration/rollback and historical obligation dispositions are accurate; independent review is complete before landing and only verified owned resources are cleaned.
- **DOD-7:** owner acceptance and governed integration are recorded. Code complete, tested, semantically accepted and landed are distinct states. No silent waiver; a failed criterion remains open or an explicit owner amendment changes this contract.

Every WP MUST contain axioms, invariants, completeness criteria, success criteria, quality standards and
DoD for its scope. Cite global IDs; state local specializations and verification, never weaken/copy-drift
global laws. Include exact inputs/outputs, allowed writes/exclusions, baseline, frozen seams, acceptance
IDs, evidence and stop conditions. Each global acceptance obligation has explicit ownership; integration
obligations stay assigned, never disappear between WPs. WP completion does not imply plan completion.

## Evidence anchors and current limits

The existing per-site controller and arm union are in `packages/cli/src/mine.ts`, `mine-arms.ts` and
`packages/genesis/src/run-controller.ts`; they are not cumulative semantic layers. Own composition/rendering
is in `packages/retrieval/src/own.ts`, `own-artifact.ts` and `packages/adapter-io/src/own-source.ts`.
Reuse candidates include `packages/index/src/own-impact.ts`, `packages/retrieval/src/own-snapshot.ts`,
`harness/gates/own-snapshot-guard.mjs`, and root `.github/workflows/atlas-{guard,worklist}.yml`.
The runtime reader is `modules/maestro/coordination/src/v2/{atlas-source.ts,tools/atlas.ts}` at repository root.
The CLI subprocess economic limitation is explicit in `packages/adapter-io/src/llm.ts`.
These are inspected starting points, not frozen WP write lists or claims of current CI enforcement.

This plan addresses the author's adversarial findings: biased slice, mandatory layers, premature schema,
ambiguous source authority, subjective acceptance, incomplete propagation, overstated budget guarantees,
unbounded expansion and ambiguous migration. A subsequent author review required explicit result/receipt
identity, source-compatible fallback/rollback, scope-isolated coherence and an early bounded value checkpoint;
those corrections are now in architecture, acceptance and execution order. This is NOT independent approval.
No production code/tests/gates were changed. Document-structure/whitespace checks and the existing local
`check:guards --base origin/dev` runner were executed; these do not execute this plan's acceptance.
The owner subsequently authorized execution in stage order. Paid execution/delegation has no approved
envelope; no new mining, publication, old-run artifact reconciliation or final integration is claimed here.
