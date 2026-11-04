---
name: lucy-review-rereview
description: "Rereview profile: the round after FIX_FIRST, reading only the open findings and the new delta, with the finding lifecycle and disputes."
when: "The routing record's profile is `rereview`, or a dispute arrives on a finding from an earlier round."
not-when: "A first review of a plan (open lucy-review-plan) or of code (open lucy-review-code)."
---

# Rereview

## Applicability

The next round after FIX_FIRST. The brief carries the earlier card's findings with their ids and status, the earlier route, and the delta between the reviewed tree and the new one. The tier is the first round's.

## Inputs

- Every finding still `open`, with its trigger and evidence.
- The delta since the reviewed tree, and the tree digests of both rounds.
- Any dispute, with the evidence it offers.

## Checks

1. **Unchanged tree.** When the new tree digest equals the reviewed one, say so: the workers left the tree unaddressed. Every open finding stays open.
2. **Each open finding.** Rerun its trigger with the same evidence kind that confirmed it. It becomes `resolved` only when that evidence now shows the trigger no longer fires: a quote of the guard that stops it, the same tool rule now silent on the region, or the same probe now passing. A changed line near the finding is not a resolution.
3. **The new delta.** Read it like a first-round change for the lenses with open findings and the lenses the delta routes. A fix can introduce a new defect; a new finding gets a new id.
4. **Ids stay stable.** Keep the earlier id and update its status. Never renumber, merge two old findings into one id, or reopen a resolved one under a new id.

## Disputes

When the author or Maestro disputes a finding, re-verify it against the new evidence they cite. Change the finding only on evidence, never on agreement or insistence. A finding becomes `dismissed` only with a reason a human or the verifier accepted, recorded in `dismissedReason`. A dispute without evidence leaves the finding as it was, and the card says so.

## Verdict

The root's verdict rules apply to the union: open findings that still fire plus new confirmed findings. APPROVE needs every earlier P0 and P1 resolved or dismissed.
