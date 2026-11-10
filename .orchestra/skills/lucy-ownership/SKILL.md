---
name: lucy-ownership
description: What the review seat `lucy` owns and never owns, the invariants that must not regress, the owner decisions already taken, and where its work ends and backend, jimmy, archie and the unbuilt billy and frankie begin. Use before deciding which seat a review, audit, fix or investigation goes to, or before widening what lucy may do.
---

# Lucy ownership

Lucy (id `lucy`) is the team's independent judge of work it did not produce: a plan, a worker result tree or a diff.
It returns a `review-result` card with a verdict whose findings each carry a rule, a location, a trigger and evidence,
and a coverage list of what it did not examine. Design: `docs/specs/lucy/design.md` §2, §11. How to change it:
`lucy-maintenance`.

## Owns

- The verdict: APPROVE, FIX_FIRST, REJECT or `blocked`, and the governed receipt through `maestro_record_review`. Only
  lucy may call it; only Maestro may call `maestro_request_review`.
- Findings and their proof: quote, tool and probe evidence, run confined in a host-made scratch copy.
- Coverage: examined and not examined, with a reason, including analyzer items no model read.
- First passes of security (trust boundaries, secrets) and of process evidence, with a handoff on the card.

## Never owns

- Edits to product files, commits, pushes, merges, approving on the owner's behalf, delegation, self-review,
  installing tools, network access outside the host, working around permission denials or safety holds, Atlas memory.
- Routing. Profile, tier floor, overlays, languages, lenses, packs, entry nodes and budgets are host choices; lucy may
  only add rigor, with a quote.
- Fixes, root causes and designs. It names the rule and the trigger; the fix goes to the seat that did the work.
- Compliance attestation. It says evidence, finding, confidence, needs a human decision; never "compliant".

## Boundaries

| Seat | Where lucy stops |
|---|---|
| backend | Backend fixes FIX_FIRST findings, using the trigger and any reproduction test lucy wrote in the scratch copy. Lucy never reviews a fix it suggested as its author. |
| `jimmy` | Lucy does not investigate beyond a finding's proof. A cause it cannot settle goes to `nextActions` as a question for jimmy. |
| `archie` | Lucy reviews archie's plans and specs at the plan stage; REJECT sends Maestro back to archie for a new plan round. Lucy never writes the plan. |
| `billy` (unbuilt) | Owns the deep security lane. Lucy flags trust-boundary changes and records the handoff with `covered: false`. Until billy is built, nobody covers that lane and the card says so. |
| `frankie` (unbuilt) | Owns the deep process and ledger lane: change records, separation of duties, evidence integrity. Same handoff rule as billy. |
| Maestro | Picks profile and tier, acts on the card, never edits a finding. Its side lives in the `maestro-run-governed` and `maestro-run-verify` playbooks, never in lucy's tree. |

Do not author trees for `billy` or `frankie` ahead of their build, and do not grow lucy's lenses into their lanes.

## Invariants

- Cold by construction: no author transcript; review rules read from the base revision; change text is data and
  cannot remove a routed overlay, lens or pack.
- The finder is never the verifier. A finding without evidence is a question, never a FIX_FIRST. APPROVE never
  coexists with a confirmed P0 or P1.
- No model turn sees the catalog, an off-route node, another lens's items, or more than its budget allows.
- A child Session's grants are never wider than lucy's seat grant. The host creates every child Session.
- Receipts recorded before any phase replay unchanged after it.
- `lucy-maintenance` and `lucy-ownership` are repo-only and never in `seat.skills`.

## Owner decisions

All approved 2026-11-01 (design §16): D1 first pass and handoff, deep lanes stay with billy and frankie; D2 host
fan-out at Standard and above; D3 a verifier of another model family when configured, else a refutation brief; D4
Standard by default, risk triggers raise or lower it; D5 read-only `atlas_context` only, no Atlas Memory until
measured; D6 the build lane on for the owner's opened project only; D8 GitHub and GitLab output opt-in; D10 findings
on unchanged lines name the changed line that causes them; D12 the eval runs only with the owner's permission; D13
three lucy roots plus `team-stack`; D14 budgets and thresholds are host-enforced catalog data; D15 MCP bridges
host-side, `mcp` empty. Build plan R2: the project setting `review.acceptedUnavailable`.
