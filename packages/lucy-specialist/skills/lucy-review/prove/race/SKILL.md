---
name: lucy-review-prove-race
description: "The race probe: a race-instrumented run of the test that drives the concurrent path, only where the catalog offers it."
when: "A concurrency candidate whose brief offers probe:race."
not-when: "No probe:race is offered, or the lines alone settle the candidate (open lucy-review-prove-quote)."
---

# Race

## Applicability

`probe:race` is offered only for Go. You choose the test that drives the concurrent path. The host runs a fixed race-instrumented command in the scratch copy. You never name a binary or a flag, and you do not install a toolchain.

Other offered options stay on their own leaves. A quote is `lucy-review-prove-quote`. A reproduction test is `lucy-review-prove-regress`.

## Reading the result

1. The excerpt must show the test reached the concurrent path, not a setup or compile error. A failure before the path is the wrong reason: fix the target, not the claim.
2. A detector report on that path confirms the candidate.
3. A pass confirms nothing unless the run exercised the path the finding names. A quiet pass is a question, not a drop.
4. `race-detector-absent` means this file has no detector. It is not a pass and not a fail. Climb to quote or `probe:test`.
5. Any other `not-run` is a `check-unavailable`, never a pass or a fail.

## End state

Confirmed with `probe` evidence: the option id `probe:race`, the result and the artifact the probe returned. Dropped only with a run that refutes the trigger. Otherwise a question, with the probe that would settle it.

## Limits

- One test, not the package's whole suite.
- Anything written in the copy is discarded with it.
