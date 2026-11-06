# Seat luna-1 — integrated flow

SUPERSEDED staffing contract; retained for L3 content requirements. NOT DISPATCHABLE.

Model: `openai/gpt-6-luna`. Artifact handle: `flow`.
Exact output title: `Session input — admission to visible execution`.
Depends on: admission AND delivery, both coordinator-validated for this construction step.
Shared execution contract: `common.md`, embedded by the coordinator.

## Inputs

- Complete `admission` and `delivery` candidates with their exact receipts and retained evidence references.
- Base evidence: `packages/core/src/session/projector.ts`: 283–311;
  `packages/core/src/session/execution.ts`: 12–38;
  `packages/core/src/session/run-coordinator.ts`: 10–19, 83–110.
- `docs/specs/v2/session.md`: 3–50, 155–185; pinned V2 Session Core owner constraints.
- No other raw source. Do not fetch a missing upstream citation; report the needed bounded evidence instead.

## Axioms and invariants for this scope

Inherit the shared axioms/invariants. Compose lower-layer understanding; do not independently re-mine it.
Separate durable input, visible history and process-local execution. Do not resolve upstream disagreements silently.

## Required headings and completeness criteria

- `## End-to-end responsibility` — FL-1: connect the product job and division of responsibility from facade through admission, promotion/projection and advisory execution.
- `## States and transitions` — FL-2: describe admitted/pending/promoted distinctions, what is durable, and which transitions expose model-visible history; preserve retry/delivery conditions from upstream.
- `## Execution boundaries and change impact` — FL-3: explain wake versus explicit resume, process-local serialization and what is not guaranteed after a crash; map a change in each boundary to the other contracts that need checking.
- `## Failure interpretation and disagreements` — FL-4: distinguish insufficient runtime observation from a demonstrated defect. Identify contradictions/missing evidence by exact upstream section and source, not an invented unified answer.
- `## Verification map` — FL-5: route each cross-boundary obligation to supplied evidence/check definitions or an explicit missing verification need. Do not claim atomicity from merely adjacent function calls.
- `## Coverage and gaps` — FL-6: account for required/excluded flows and upstream coverage, preserving every gap affecting the integrated result.

## Success criteria

A maintainer can reason about admitted-but-not-visible input, retry effects and cross-boundary change
impact through this flow and its lower-layer references, without reconstructing Session architecture from source.

## Quality standards

Apply shared standards. Add integration meaning: do not concatenate admission/delivery or invent a
durable “run” identity, exactly-once provider guarantee or hosted-engine behavior.

## DoD and stop

All FL-1..6 are supported and cross-references resolve within supplied inputs, or return BLOCKED with
the conflicting/missing prerequisite. Return only this flow; never reinterpret unavailable source to unblock it.
