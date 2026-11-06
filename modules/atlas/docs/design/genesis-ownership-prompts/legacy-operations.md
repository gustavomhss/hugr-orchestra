# Seat luna-2 — maintenance procedure

SUPERSEDED staffing contract; retained for L4 content requirements. NOT DISPATCHABLE.

Model: `openai/gpt-6-luna`. Artifact handle: `operations`.
Exact output title: `Session input — safe maintenance procedure`.
Depends on: flow, admission AND delivery, coordinator-validated for this step.
Shared execution contract: `common.md`, embedded by the coordinator.

## Inputs

- Complete `flow`, `admission`, `delivery` candidates and receipts, with their evidence/coverage sections.
- Existing verification evidence only: `packages/core/test/session-prompt.test.ts`:
  145–165, 254–342, 344–404, 448–518, 541–586.
- Verification execution policy supplied by the coordinator: tests run through `bun run test:ci core
  test/session-prompt.test.ts`; no local test execution/model calls by this seat. This is a proposed
  change-scoped regression command, not proof of full runner/Atlas acceptance.

## Axioms and invariants for this scope

Inherit the shared axioms/invariants. Turn established understanding into a work procedure, not another
architecture exploration. Preserve unknowns and scope boundaries; no new product policy or recovery design.

## Required headings and completeness criteria

- `## Before making a change` — OP-1: give the scope/intent checks and exact Atlas subjects to consult before editing; distinguish behavioral change from implementation refactor.
- `## Change procedure` — OP-2: specify checks for admission/retry edits, delivery/ordering edits and projection/visibility edits, including coupled contracts and conditions to preserve.
- `## Diagnosis procedure` — OP-3: give a safe evidence-led sequence for uncertain retry or pending visibility, with decision points and required observations; no unconditional replay/provider retry.
- `## Verification procedure` — OP-4: map change categories to inspected tests and missing required runtime scenarios, including failures/concurrency. State commands only when supplied; no invented test filenames or claims that a test name alone proves behavior.
- `## Stop and escalation conditions` — OP-5: identify unavailable context, contested intent and excluded recovery/hosted paths; ask for the precise missing knowledge rather than starting discovery.
- `## Coverage and gaps` — OP-6: map all maintenance categories to their supporting upstream contracts and declare unsupported required procedure steps.

## Success criteria

A maintainer can plan an edit, choose relevant verification and stop safely on a missing guarantee;
the final skill can refer to this procedure instead of carrying the full technical explanation.

## Quality standards

Apply shared standards. Use actionable steps and decision points, not vague “be careful/run tests” advice.
Reference existing knowledge for explanation; do not duplicate it or propose new CI/infrastructure features.

## DoD and stop

All OP-1..6 are actionable and supported or explicitly BLOCKED. Return only the procedure; do not run
commands, implement Session changes or evaluate held-out consumer questions.
