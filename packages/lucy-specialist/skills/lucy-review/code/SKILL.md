---
name: lucy-review-code
description: "Code profile: a worker result tree or a diff, its entry checks, the repository's own gates and the phase 1 overlays (docs, concurrency)."
when: "The routing record's profile is `code`: a worker result tree or a diff at the governed code stage."
not-when: "A plan or spec before implementation (open lucy-review-plan), or a round after FIX_FIRST (open lucy-review-rereview)."
---

# Code review

## Applicability

A worker result tree or a diff, judged against the intent and acceptance the brief carries. You lead: the lens children hunt and the verifiers prove; you run entry and the final turn. When the brief says you also hunt and verify (the Quick tier), read the routed lens nodes yourself and verify by quote only.

## Entry checks

1. Read the diff with its intent. A change that is mostly generated files, or whose files do not match the stated intent, is `blocked`, not reviewed.
2. Identify generated output by its marker or its generator config. Review the generator's input, not the output.
3. Find each changed public symbol's callers with code search before you write the context sheet; a caller that relies on the old behaviour is an invariant.
4. Note which tests the change adds or edits. Each one gets a fail-before/pass-after proof downstream, so list them in the context sheet.

## Repository gates

`pack:repo` runs the gates the base revision declares (guards, linters, generated-file checks). They are written rules and their rules are `active`, so a failing gate on a changed line is a finding with `tool` evidence. A gate that could not run is a `check-unavailable` on the card, never a pass. A change that grows an allowlist, a ledger or a suppression is itself a finding against the rule that ledger protects.

## Overlays

**`overlay:docs`** (routed by path, binding). Every changed statement about behaviour must hold in the code at head: commands, flags, option names, defaults, paths and examples. Open the code each statement describes. A contradiction is `class:docs.contradiction` with both quotes; the fix goes to the docs seat. A docs-only change with no contradiction and no broken written rule approves.

**`overlay:concurrency`** (suggested by content). Confirm it with the quote that creates shared work: a lock, a spawn, `Promise.all` over shared state, a goroutine, a `Deferred`, a second wake path. Decline it only with a quote that shows a single actor or a bound, for example "one batch, line 58". A declined suggestion stays on the card.

You may add an overlay the host did not suggest, with the quote that justifies it. Only the overlays the routing record can name exist.

## Limits

- Do not review lines outside the change except as a caller or a cause the change reaches.
- A missing toolchain or a refused probe is coverage, never a silent pass.
