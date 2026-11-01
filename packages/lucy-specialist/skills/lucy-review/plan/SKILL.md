---
name: lucy-review-plan
description: "Plan profile: a plan, spec or work package reviewed before implementation, by requirement quality, coverage of the intent and plan alignment."
when: "The routing record's profile is `plan`: a plan, spec, work package or brief at the governed plan stage."
not-when: "A diff or worker result tree (open lucy-review-code), or a later round of an earlier review (open lucy-review-rereview)."
---

# Plan review

## Applicability

The artifact is a proposal: a plan, specification, work package or brief, before any code exists. The evidence is almost always a quote, from the artifact and from the request it answers. A verdict here gates implementation, so REJECT means the plan needs a new round and FIX_FIRST means a bounded revision fixes it.

## Inputs

- The owner's request, the settled decisions and the constraints the brief carries.
- The artifact at its exact revision.
- The code the plan cites, read at the base revision to confirm what it says is there.

## Checks

1. **Coverage.** Map every intent line and acceptance criterion to the step, contract or check that delivers it. A criterion with no step, or a step whose check cannot fail, is a finding of `class:plan.coverage`. Quote the criterion and the step, or write that no step names it.
2. **Requirement quality.** Each requirement must be necessary, unambiguous, verifiable, consistent with the others, feasible and traceable to the request (NASA Systems Engineering Handbook, Appendix C). A requirement that fails one is `class:plan.requirement`. Name the attribute it fails; "vague" is not a rule.
3. **Observed claims.** A claim that code exists, behaves a way or lives at a path must hold at the base revision. Open the cited `path:line`. A claim the code contradicts is `class:plan.requirement` with both quotes.
4. **Order and seams.** A contract a later step consumes must be frozen before that step starts. A dependent step scheduled before its producer, or two steps that write the same file without an order, is `class:plan.coverage`.
5. **Settled decisions.** A plan that reopens a decision the brief marks settled, or invents an owner decision, breaks a written rule: quote both.

## Severity

- P1: an acceptance criterion with no delivering step; a requirement no check could verify; a contradiction with a settled decision or with the code.
- P2: an unordered seam or an ambiguous requirement with a narrow consequence.
- REJECT, not FIX_FIRST, when the approach cannot meet the intent at all and a revision inside the plan would not fix it.

## Limits

- Judge the plan against its request, not against the plan you would write. A different design is not a finding.
- A missing input the plan needs (an owner fact, a source) is a question or a `blocked` entry, never a guess.
