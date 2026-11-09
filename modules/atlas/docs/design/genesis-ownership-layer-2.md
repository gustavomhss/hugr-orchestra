# Genesis L2 — four parallel component-understanding contracts

Status: CONTRACTS; L1 accepted, L2 not yet accepted · 2026-11-05.
Input: [accepted L1 handoff](genesis-ownership-results/layer-1/README.md), manifest
`f92380d8f484b3bffe83e7e2c13e922e46d3a9aa62ac7f5b6264bf22cbef1d85`.
Source baseline: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`.
Judges remain [the same two persistent Terra sessions](genesis-ownership-judges.md).

## Shared contract

**Axioms:** GO-A1..7. Construct useful component understanding from accepted lower-layer knowledge,
not another source register or discovery campaign. Explain meaning and change consequences, not every line.

**Invariants:** GO-I1..8. Four independent jobs in parallel; no same-layer sibling is an input. Only the
coordinator-supplied accepted L1 bodies/excerpts and exact receipt metadata are evidence. No raw-source
browsing, tools, delegation, commands, provider calls, repository writes or implicit scope expansion.
Fresh miner sessions prevent their old raw-source prompts from leaking into the declared input boundary;
only judges persist across the whole campaign. Never create a new judge for a component.

Separate intended contract, observed behavior, interpretation, test definition and runtime proof. Preserve
scope and gaps: default LLM runner only; no hosted/distributed/provider-crash retry guarantees or invented
product rationale. A sibling L2 artifact cannot supply a missing premise. Missing required knowledge is
BLOCKED with a precise lower-layer evidence need, not a request to discover the repository.

**Inputs:** exact accepted L1 manifest/acceptance receipt metadata plus only the bodies named in the card.
Coordinator-selected test-row excerpts retain full parent-body digest and exact row text; they are excerpts,
not rewritten accepted artifacts. Original CANDIDATE labels in L1 bodies describe generation time; their
bounded acceptance comes from the supplied manifest and two judgment receipts, not a producer self-award.
The coordinator binds identities mechanically; never invent or compute a model-authored evidence hash.

**Output:** exactly one Markdown artifact, no outer fence or chat preamble. Header: exact card title;
`Status: CANDIDATE | BLOCKED`; `Layer: L2`; source revision; accepted L1 manifest ID; actual input handles
and digests. Sections: `## Purpose and responsibility`, `## Contract and state model`,
`## Conditions and failure boundaries`, `## Change impact and verification`, `## Coverage and gaps`.
The final table has one row per card criterion: ID, supported/blocked, section and exact missing premise.

Cite `L1:<handle>#<section> @ <parent-body-digest>` for interpreted lower-layer support and retain exact
underlying `repository/path:line-range @ sourceRevision` citations where material. No shortened revisions,
guessed source ranges, fabricated execution results or conflated receipt/artifact identities. Give concise
evidence-to-conclusion explanations, not private reasoning or a rewritten table of source facts.

**Quality standards:** QS-1..6. Coherent, conditional, accurate and useful for assessing a local change;
state what must stay true and why a violation matters. Do not turn source absence in one packet into
global absence. Distinguish declared guarantees from inspected implementation and unexecuted interleavings.
Preserve stage order, especially prompt insertion before transformation. No optional design proposals,
new APIs, publication claims, full-system composition or maintenance/skill protocol (those are later layers).

**Success:** a maintainer can reason about this component's responsibility, contract, state and bounded
failure/change consequences without re-mining source. Its direct use is named in the card, not word count.

**DoD and stop:** every criterion is supported from supplied inputs, or return BLOCKED naming the precise
missing lower knowledge. Perform one check against the fixed questions; no autonomous review/retry loop.
Return only the requested artifact. Completion is not acceptance; the coordinator consolidates all four,
then the SAME two Terra sessions judge the full L2 manifest. L3 cannot start before complete L2 acceptance.

## L2-AD — router-1

Model: `openrouter/stealth/crouton-alpha`. Output handle: `component-admission`.
Exact title: `Session input component — admission and retry`.
Inputs: accepted L1 authority, identity, entry/storage/execution bodies; exact test-definition row excerpts
from accepted L1 promotion/verification/reuse. No raw sources or other L2 jobs.
Primary boundary: facade/admission/retry. Persistence/projection internals belong to L2-PR; describe their
load-bearing boundary only, using supplied L1 evidence rather than depending on that sibling's answer.

- **Axioms/invariants:** shared/global contract. Durable admission is not provider execution or visibility.
- **Completeness AD-1:** purpose, caller responsibility, supported/explicitly excluded behavior.
- **AD-2:** normalization/default delivery, omitted/reused identity, admit-only receipt and wake boundary.
- **AD-3:** exact/conflicting retries and historical reconciliation, preserving provenance and retry versus
  projection comparisons; explain the consequence of changing them without inventing their design rationale.
- **AD-4:** conditional failure/reconciliation behavior and what acknowledgment does not guarantee.
- **AD-5:** coupled contracts and relevant supplied test assertions for identity/admission changes;
  distinguish definitions from run evidence and identify unproven cases without claiming new tests exist.
- **AD-6:** trace every criterion, scope and inherited gaps without redoing integration or writing a runbook.
- **Success/quality:** a maintainer can assess admit-only or retry edits through this explanation and its
  evidence, without confusing receipt, projection and execution. Apply all shared standards.
- **DoD:** AD-1..6 supported or precisely BLOCKED; one artifact, no sibling discovery or code changes.

## L2-PR — router-2

Model: `openrouter/stealth/crouton-alpha`. Output handle: `component-projection`.
Exact title: `Session input component — persistence and projection`.
Inputs: accepted L1 authority, entry/storage/execution, identity bodies; exact test-definition row excerpts
from accepted L1 promotion/verification/reuse. No raw sources or sibling results.
Primary boundary: durable row/receipt/projector, not a duplicate facade tutorial or full execution flow.

- **Axioms/invariants:** shared/global contract. Durable input, promoted input and visible user history
  are distinct; an index/schema declaration does not prove every transaction or runtime interleaving.
- **Completeness PJ-1:** responsibility, durable carriers, receipt vocabulary and relevant boundaries.
- **PJ-2:** admission/pending/promotion projection states and event/sequence transitions; label intended
  atomic visibility separately from the inspected projector call sites and missing helper implementation.
- **PJ-3:** retry versus projection-matching fields, context/time/sequence checks and their change consequences.
- **PJ-4:** conflicts, fallback/insertion conditions and what source definitions do not establish at runtime.
- **PJ-5:** schema/event/projection/identity coupling and actual supplied verification assertions; no invented
  migration implementation, rollback policy or claim of a test run.
- **PJ-6:** criterion trace, unavailable guarantees, boundaries and a precise lower-layer need if required.
- **Success/quality:** a maintainer can assess a receipt, projection or persistence edit without treating
  matching hashes, adjacent calls or schema fields as transactional proof. Apply all shared standards.
- **DoD:** PJ-1..6 supported or precisely BLOCKED; one scoped component explanation, not an L3 flow.

## L2-DE — luna-1

Model: `openai/gpt-6-luna`. Output handle: `component-delivery`.
Exact title: `Session input component — delivery and provider-turn boundary`.
Inputs: accepted L1 authority and promotion/verification/reuse bodies. No raw source or sibling results.
Primary boundary: eligibility/promotion/default-runner turn, not admission identity or execution placement.

- **Axioms/invariants:** shared/global contract. Preserve conditional stage order and default-runner scope;
  no inevitable-processing, provider-success or hosted-engine guarantee.
- **Completeness DL-1:** purpose/responsibility and the intended steer/queue distinction.
- **DL-2:** cutoff/eligibility/order, one-at-a-time queues, steer selection, continuation/idle reevaluation.
- **DL-3:** pre-promotion checks, positive-promotion counter reset, step limit, history/request boundary and
  MAX_STEPS_PROMPT insertion BEFORE transformation; distinguish intended allowance from observed code.
- **DL-4:** conditional refusal/failure/non-progress boundaries and what runtime observations are absent.
- **DL-5:** change consequences and matching supplied test definitions; separate uncovered runtime scenarios
  from demonstrated defects or nonexistent tests. No new flow outside this component.
- **DL-6:** complete trace and inherited unknowns without certifying all compaction/provider outcomes.
- **Success/quality:** a maintainer can predict supported eligibility and assess an ordering/allowance edit
  without treating a pending row as provider failure. Apply all shared standards.
- **DoD:** DL-1..6 supported or precisely BLOCKED; one local explanation, no final maintenance procedure.

## L2-EX — luna-2

Model: `openai/gpt-6-luna`. Output handle: `component-execution`.
Exact title: `Session input component — execution coordination and verification`.
Inputs: accepted L1 authority and entry/storage/execution bodies; exact test-definition row excerpts
from accepted L1 promotion/verification/reuse. No raw sources or sibling results.
Primary boundary: process-local coordinator/service responsibility, not provider delivery or crash recovery.

- **Axioms/invariants:** shared/global contract. Interface statements, observed run/wake branches and actual
  executed evidence remain distinct. No durable drain identity, distributed ownership or automatic replay.
- **Completeness EC-1:** process-global Session-ID service versus Location-scoped execution responsibilities,
  marking owner constraints separately from what the supplied implementations actually show.
- **EC-2:** explicit run/join versus advisory wake/coalescing; conditions and visible limits of drain internals.
- **EC-3:** runtime-only active state, interruption contract and post-restart ambiguity; do not treat this
  campaign's interrupted calls as a regression test for the scoped Orchestra source behavior.
- **EC-4:** input/history/execution boundary and excluded hosted/distributed/provider-retry semantics;
  identify missing implementation rather than infer it from a method name.
- **EC-5:** local coordination change consequences and evidence-based verification obligations; distinguish
  supplied prompt-wake fixture assertions from missing scheduler/concurrency executions.
- **EC-6:** trace all criteria and inherited gaps; scope stops remain explicit and actionable.
- **Success/quality:** a maintainer knows what a wake/run/active observation can establish and what it cannot,
  and which responsibility a local coordination edit affects. Apply all shared standards.
- **DoD:** EC-1..6 supported or precisely BLOCKED; no integrated diagnosis runbook or unsupported recovery policy.
