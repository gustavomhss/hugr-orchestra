# Seat router-1 — admission contract

SUPERSEDED staffing contract; retained for L2 content requirements. NOT DISPATCHABLE.

Model: `openrouter/stealth/crouton-alpha`. Artifact handle: `admission`.
Exact output title: `Session input — admission and retry contract`.
Depends on: coordinator's mechanical evidence pack only. Parallel with router-2.
Shared execution contract: `common.md`, embedded by the coordinator, not fetched by the model.

## Inputs (only these selected ranges)

- `AGENTS.md`: V2 Session Core section at the pinned baseline.
- `docs/specs/v2/session.md`: 3–50.
- `packages/core/src/session.ts`: 491–517.
- `packages/core/src/session/input.ts`: 24–161, 200–252, 291–316.
- `packages/core/src/session/sql.ts`: 154–181.
- `packages/core/test/session-prompt.test.ts`: 145–165, 254–342, 344–387, 448–518, 541–586.

## Axioms and invariants for this scope

Inherit the shared axioms/invariants. Explain admission as a durable contract, not provider execution.
Keep retry identity, projection consistency and advisory wake responsibilities distinct. Do not author delivery
scheduling, hosted-engine behavior, a replacement API or a new recovery policy; router-2 owns delivery.

## Required headings and completeness criteria

- `## Purpose and boundary` — AD-1: explain the product-facing job and what an admission receipt does/does not establish; attribute intent to supplied decisions.
- `## Admission lifecycle` — AD-2: explain normalization/defaults at the facade, durable admission, admit-only behavior and the boundary to model-visible promotion.
- `## Identity and retries` — AD-3: specify exact retry/conflict dimensions, omitted versus reused IDs, and historical reconciliation/provenance requirements.
- `## Projection consistency` — AD-4: distinguish retry equivalence from projection matching, including any additional projection fields. Do not turn an implementation comparison into an invented product intention.
- `## Maintenance implications and verification` — AD-5: identify what must change together for identity/persistence edits, which supplied tests inspect those properties, and which runtime guarantees those test definitions do not prove without execution.
- `## Coverage and gaps` — AD-6: state exclusions, unsupported rationale and any missing evidence preventing a required conclusion.

## Success criteria

A maintainer can assess an admit-only caller or exact/conflicting retry change without discovering the
identity/persistence contract from source. The delivery seat can consume this artifact without restating it.

## Quality standards

Apply shared standards; prioritize identity, durable state and the distinction between receipt and execution.
Do not copy whole test bodies, list every field as trivia or certify concurrent behavior merely from test names.

## DoD and stop

All AD-1..6 have supported sections and citations or explicit BLOCKED gaps; no missing required question
is concealed by a filled heading. Return only this artifact. Do not write the integrated flow or final skill.
