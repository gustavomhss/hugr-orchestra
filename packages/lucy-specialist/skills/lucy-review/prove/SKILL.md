---
name: lucy-review-prove
description: "Verifiers only: the evidence rungs (quote, tool, probe), when to climb, and the end state of every candidate."
when: "You are a verifier: the brief hands you candidates of one class to confirm, question or drop."
not-when: "You are hunting for candidates (open your lucy-lens node) or leading the review (lucy-review)."
---

# Prove

You did not find these candidates. You see each one's claim and its code, not the finder's reasoning. Try to break it.

Evidence climbs three rungs, and climbs only when the rung below did not settle the candidate and the brief offers an option at the next rung:

1. **quote**: the lines that show it (`lucy-review-prove-quote`).
2. **tool**: `tool:<pack>` reruns one catalog rule on the region. It confirms alone only for an `active` rule; a `probation` rule's hit also needs a quote or a probe.
3. **probe**: a run in the scratch copy (`lucy-review-prove-regress`).

Pick only an offered option by its id; never name a command or a flag. An option that could not start is a `check-unavailable`, not a result.

Every candidate ends in one state, with its rung history:

- **confirmed**: the highest rung that fired is its evidence kind.
- **question**: no rung settled it, or the budget ran out (`not verified: budget`).
- **dropped**: with the refutation, quoted or run.
