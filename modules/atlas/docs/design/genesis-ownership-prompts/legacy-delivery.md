# Seat router-2 — delivery contract

SUPERSEDED staffing contract; retained for L2 content requirements. NOT DISPATCHABLE.

Model: `openrouter/stealth/crouton-alpha`. Artifact handle: `delivery`.
Exact output title: `Session input — default-runner delivery contract`.
Depends on: coordinator's mechanical evidence pack only. Parallel with router-1.
Shared execution contract: `common.md`, embedded by the coordinator.

## Inputs (only these selected ranges)

- `AGENTS.md`: V2 Session Core section at the pinned baseline.
- `docs/specs/v2/session.md`: 155–185.
- `packages/core/src/session/input.ts`: 318–391.
- `packages/core/src/session/runner/llm.ts`: 185–239, 616–642.
- `packages/core/src/session/sql.ts`: 154–181.
- `packages/core/test/session-prompt.test.ts`: 364–404.

## Axioms and invariants for this scope

Inherit the shared axioms/invariants. Explain eligibility and ordering, not admission idempotency or the
provider's internals. Never infer hosted-engine steering or crash-safe provider retry from this default-runner slice.

## Required headings and completeness criteria

- `## Purpose and boundary` — DE-1: explain why delivery mode matters to the visible conversation and distinguish supported behavior from excluded engines/recovery.
- `## Steer eligibility and ordering` — DE-2: explain the captured admission cutoff, pending-row selection, ordering and publication boundary.
- `## Queue eligibility and ordering` — DE-3: explain queue selection relative to continuation and steers, FIFO ordering, how many queued inputs are promoted at a boundary, and what is reevaluated next.
- `## Turn preconditions and allowance` — DE-4: identify relevant pre-promotion governance/context preconditions, new-input allowance reset and the effect of promotion on the next request; avoid overclaiming provider success.
- `## Maintenance implications and verification` — DE-5: explain consequences of changing selectors/order/continuation; distinguish supplied executable test definitions from runtime cases still requiring verification.
- `## Coverage and gaps` — DE-6: disclose excluded behaviors, missing evidence and unsupplied intent rather than invent them.

## Success criteria

A maintainer can distinguish a scheduling optimization from a delivery-contract change, predict which
input becomes eligible next and identify the checks that must accompany a change.

## Quality standards

Apply shared standards; describe concrete eligibility/ordering with conditions, not an unconditional
“every input is processed” story. Do not duplicate router-1's retry explanation or design backpressure/recovery.

## DoD and stop

All DE-1..6 have evidence-backed sections or precise BLOCKED gaps. Return only this contract;
do not produce another discovery report, integrated flow or implementation patch.
