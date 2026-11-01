---
name: lucy-review-prove-regress
description: "The probe rung in the scratch copy: fail-before/pass-after on a hunk, base-versus-head differential runs, and the reproduction test, type check and script options."
when: "A candidate whose class names this proof node, a new or changed test that needs fail-before/pass-after, or a claim only a run can settle with a probe option offered."
not-when: "The lines alone settle the candidate (lucy-review-prove-quote), or no probe option is offered: the candidate becomes a question."
---

# Regress

## Applicability

Probes run in a host-made scratch copy of the reviewed tree, never in the reviewed worktree. You choose the option and its target; the host runs a fixed runner. A probe answers one question: does this trigger make this code fail.

## Options

**`probe:regress`: fail-before/pass-after.** Target a production hunk and the test that claims to cover it. The host reverts the hunk in the copy and runs the test on both trees.
- Red on the reverted tree, green on head: the test covers the hunk. A test candidate is dropped.
- Green on both: the test has no teeth for that hunk. A `class:tests.weak-oracle` candidate is confirmed.
- Red on head: the change breaks its own test. Confirmed at P1 or above.

**`probe:regress`: differential.** Target an input and run base and head on it. A difference the intent does not state is a regression; a difference the intent states is the change working, and the candidate is dropped with the intent line.

**`probe:test`: reproduction test.** Write the smallest test that drives the trigger through the public entry point the finding names, in the repository's own test style. It must fail on head. Its text becomes the finding's `suggestedTest`.

**`probe:typecheck`.** For a claim that a caller, an implementation or a declared type no longer matches the change. A type error at the line the finding names confirms it.

**`probe:script`.** A short script, when no test harness can reach the trigger. Print the observed value beside the expected one.

## Reading the result

1. Check that the run reached the trigger. The excerpt must show the assertion or the observed value, not a setup error. A reproduction test that fails to compile, import or start fails for the wrong reason: fix the test, not the claim.
2. A pass on head proves nothing about the trigger unless the run exercised it.
3. `not-run` (toolchain absent, sandbox refusal, an option not built) is a `check-unavailable`, never a pass or a fail.
4. A result that depends on time, order or a shared resource the test does not control is not evidence; say so and make the candidate a question.
5. A fixture or a double proves wiring, not how the real dependency behaves. Say when only a fixture covers the path.

## End state

Confirmed with `probe` evidence: the option id, the result and the artifact the probe returned. Dropped with the run that refuted it. Otherwise a question, with the probe that would settle it.

## Limits

- One question per probe. Never run a whole suite; the repository's own gates are `pack:repo`, not a probe.
- Anything you wrote in the copy is discarded with it; attach a reproduction test to the finding as text.
