# L1 router-2 — entry, storage, projection and execution evidence

Model: `openrouter/stealth/crouton-alpha`. Artifact handle: `L1-entry-storage-execution`.
Exact output title: `Session input base — entry storage projection and execution`.
Layer: L1. Depends on frozen evidence only; parallel with all other L1 seats.
Embed `common.md`; no sibling result, oracle or tools.

## Inputs

- `packages/core/src/session.ts`: 491–517.
- `packages/core/src/session/sql.ts`: 154–181.
- `packages/schema/src/session-input.ts`: 12–25.
- `packages/core/src/session/projector.ts`: 283–311.
- `packages/core/src/session/execution.ts`: 12–38.
- `packages/core/src/session/run-coordinator.ts`: 10–19, 83–110.
- Exact baseline/blob/range identities supplied by the coordinator.

## Axioms and invariants

Inherit shared contract and GO-A1..7/GO-I1..8. Separate public vocabulary, facade actions and durable
schema carriers. A field/index or adjacent call is evidence, not proof of transactional guarantees,
provider success or every caller's behavior. Preserve durable events/history versus process-local
execution; no distributed ownership or automatic provider retry guarantee. No source/schema changes.

## Required headings and completeness criteria

- `## Evidence register` — ES-1: locate facade normalization/defaults, admission invocation, conflict
  conversion and advisory wake condition. ES-2: locate durable input fields/indexes/sequence carriers
  and the admission receipt vocabulary; explain the limited fact each supplied definition establishes.
- `## Reuse and conflicts` — ES-3: distinguish directly reusable definitions from conclusions requiring
  admission/projector/coordinator internals not supplied here; flag any internal mismatch with citations.
- `## Boundary handoff` — ES-4: identify entry→admission, admission→wake and row→receipt joins to
  reconcile during consolidation, without speculating on unseen implementations.
- `## Coverage and gaps` — ES-5: account for all ES criteria, unavailable atomicity/concurrency evidence
  and any missing required excerpt. Do not report test execution.

Additional owned criteria in the SAME headings (not a second output): EX-1 locates Prompted versus
PromptAdmitted projection and visibility behavior; EX-2 locates wake/resume and explicit-run/coalesced-wake
coordinator evidence; EX-3 preserves process-local limits; EX-4 distinguishes comments/interfaces,
implemented branches and runtime proof; EX-5 names entry/projection/execution joins with exact evidence;
EX-6 accounts for every EX criterion or precise missing input. Put EX-1..3 in Evidence register, EX-4 in
Reuse and conflicts, EX-5 in Boundary handoff and EX-6 in Coverage and gaps. Do not infer serialization
from a method name or crash safety from adjacent calls.

## Success criteria

The consolidated base can locate the exact facade/storage/receipt evidence and its limits without
losing the admission/execution distinction or omitting the schema vocabulary.

## Quality standards

Apply QS-1..6/shared standards. Select load-bearing facts, not a field dump. Cite actual supplied lines;
do not invent a new public API or claim the schema definition implements admission.

## DoD and stop

All ES-1..5 AND EX-1..6 supported or explicitly BLOCKED. Return only this L1 register/handoff; no component
explanation, implementation patch or sibling discovery.
