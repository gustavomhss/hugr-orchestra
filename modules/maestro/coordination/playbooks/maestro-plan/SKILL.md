---
name: maestro-plan
description: Get a plan authored by archie, have its acceptance coverage reviewed cold, and adopt or return it. Use for substantial or multi-part work before dispatch; small tasks stay lightweight.
internal: true
---

# Planning

Native `archie` authors acceptance, decomposition, contracts and briefs. You supply facts, coordinate review, decide
within owner authority and dispatch. A plan gap goes back to `archie`, or through you to the owner; never fill it
yourself.

## Before assigning

Pin the baseline (`git rev-parse HEAD`, `git status --short`) and run the checks that guard preserved behavior.
Hand `archie` what you observed: the owner's request verbatim, settled decisions, constraints, baseline and check
results, ownership facts and exact permitted paths. A missing runner or oracle is UNKNOWN, not a pass.

## Cold coverage review

For substantial work, give an independent reviewer only the verbatim demand and `archie`'s acceptance items, never
the author's rationale, code or partition:

```text
TASK: Try to refute that these acceptance items cover this demand.
DEMAND: <verbatim request>
ITEMS: <id, behavior, oracle, judged/decision owner>
Find missing behavior, required negative/edge cases, failure recovery, vague criteria, and overreach.
Judge only demand versus items. Do not invent implementation or slices. Do not add speculative requirements.
RETURN: {verdict: covers|gaps_found|unknown,
 missing: [{requirement, demandRef, suggestedItem}],
 vague: [{item, reason}], overreach: [{item, reason}], unknowns: [], summary}
```

Send findings to `archie` for revision and recheck changed items. An unavailable review stays UNKNOWN. `covers` is a
review conclusion, not a completeness proof or an approval.

## Adopt or return

Return the proposal to `archie` when an acceptance item has no owner or oracle, two slices write one file, a
dependency cycles, a slice is too large or a design fork is open. Also return it when cards meant to run at the same
time overlap in `area` with no `depends_on` or `order` between them; an overlap that is declared is a sequence the
queue follows and is fine, and a plan with no `area` has nothing to check. Owner-level choices go to the owner. Adopt the
current proposal only after the required review, keeping its author and baseline evidence. Scheduling the adopted
slices is yours; changing their boundaries or dependencies is a revision.

Adopt onto the board with `board_issue`, one card per slice, carrying its `area`, `order` and `depends_on`. When the
queue raises an `integration` line that a card left its planned `area`, send it to `archie` as a plan revision; the card
still queues, so drift never holds a landing.

For governed work, present the authored card with exactly one each of `## Completeness Criteria`,
`## Success Criteria`, `## Invariants`, `## Quality Standards` and `## Definition of Done`; explicit governed
execution keeps its own admission, review, approval and authorization. Small tasks gain no such ceremony.

Verdicts: FAIL for uncovered acceptance, unresolved conflicts or failing checks; HOLD for stale ownership or
missing authority; UNKNOWN for a missing runner, review or tool. Never turn any of them into a pass. Once adopted,
continue with `maestro-run`.
