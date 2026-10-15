# ADR-0009 — re-classification is an explicit, signed act on the existing door — not a new tool

- **Status:** Accepted (2026-08-01). Decision recorded now; implementation is task #88 and is sequenced
  after the `governance-class-is-a-node-property` branch integrates.
- **Owner-authorized:** the owner granted the lead full ownership and has restated that no debt or loose end
  is acceptable. ADR-0007 shipped a refusal that names re-classification as "a separate governed act" that
  _does not exist_ — a refusal pointing at a door that was never built is a loose end, and this closes it.
- **Amends:** nothing frozen. `GOVERNANCE_SURFACE` stays **5**, `WRITE_PATHS` stays
  `['atlas-emit','atlas-link']`. INV-TOOLS-1 / ADR-0003 untouched — see §"Why not a sixth tool".
- **Relates:** ADR-0007, KNOW-7 (a `T0` tier is never auto-_promoted_), KNOW-8 (a `T0` commit requires
  billy), KNOW-11a (owner-scoped writes), TOOLS-6 (a pack bounds `T2` out).

## Context

ADR-0007 made a write's governance class a property of the node it targets, and refuses any emit that
declares a weaker class than the node already carries. The refusal message says re-classification is a
separate governed act. **There is no such act.** So today the product can only ever ratchet a node stricter,
and two ordinary situations have no legitimate path:

- A node was classified `T0` in haste, or the code it anchors stopped being security-critical. Nothing can
  ever lower it. It stays `T0` forever, demanding billy for every future edit.
- A scope is reorganized. ADR-0007's first attempt used name equality here and **bricked every existing
  node** on an admin rename; that was replaced with membership against the incumbent's scope, which
  degrades to a recoverable `unauthorized` — recoverable, but only by keeping the old scope name declared
  forever. The node's stored scope still cannot be changed by anything.

Both are the same missing act: **moving a node between governance classes.**

## Decision

**Re-classification is `atlas-emit`, with the intent declared out-of-band and signed by `billy`.**

Three properties, and each one is load-bearing:

1. **Explicit intent.** A write that lowers a class must SAY it is a re-classification. ADR-0007 argued —
   correctly — that gating a silent downgrade on the stricter class is not enough, because _the signer was
   asked to approve a claim, not a declassification_, and since a pack bounds `T2` out, an approved
   declassification erases the invariant from every read as surely as deleting it. Explicit intent is what
   makes the signature mean the right thing. It does not weaken the monotonicity ADR-0007 bought; it makes
   the one exception visible.
2. **Out-of-band, never the payload.** The intent rides the composition-root channel that already carries
   `ATLAS_ACTOR` and `ATLAS_RATIFY_TOKEN` — env-sourced, never a field of the fact. This is not a style
   choice: the payload is attacker-authored JSON, and the whole of ADR-0007 exists because a gate read its
   own authority out of it. An intent flag in the payload would rebuild the confused deputy exactly.
3. **Signed at the STRICTER class.** The act clears the gate of the class being _left_, not the one being
   entered — declassifying `T0 → T2` requires `billy`, because the authority being spent is `T0`'s. Scope
   moves require authority in **both** the old and the new scope, mirroring what `atlas-link` already does
   across two endpoints.

The refusal message in `governed-emit.ts` changes from naming a nonexistent act to naming the real one.

## Why not a sixth tool

`GOVERNANCE_SURFACE` is frozen at 5 by INV-TOOLS-1 / ADR-0003, and ADR-0006 settled that the surface grows
by **progressive disclosure**, not by accretion — grounded in the measured tool-selection budget (accuracy
holds past ~30 candidates, so 5 is not the constraint; coherence is). But the deciding argument here is not
the budget, it is that **a sixth tool would be the wrong model of the act.** Re-classification writes a fact
at an anchor, through the truth gate, the authz gate and the ratify gate, and lands via `upsert` — it is an
emit in every respect except the direction it moves the class. Splitting it out would duplicate four gates
to vary one boolean, and would give an attacker a second door to study.

This is also why it is not a `doctor` sub-command or a planner: those compute payloads and persist nothing
(the `authoring ≠ writing` precedent). Re-classification genuinely writes.

## Consequences

- **A new fail-closed reason** on `atlas-emit` for a re-classification attempted without the intent, and the
  existing `governance-downgrade` message stops pointing at a door that does not exist.
- **Monotonicity becomes conditional, and must be re-stated wherever it is claimed.** ADR-0007 says the
  stored `tier` is monotone "so no later reader has to distrust it". After this it is monotone _except
  across a signed re-classification_. Anything that relies on the unconditional form — including the
  reasoning behind `pack-shape.ts` reading `fact.tier` directly — must be re-checked, not assumed. Recorded
  here because a quiet weakening of an invariant other code leans on is precisely how the original hole
  survived four days.
- **An audit question this ADR does NOT answer.** A declassification leaves no trace beyond the git history
  of `.atlas/`: the projection holds one current node and the prior bytes stay in CAS, but nothing records
  _that a class was deliberately lowered, by whom_. `supersededBy` exists for predicate lineage and is the
  obvious carrier, but extending it is a frozen-seam change and is **not** decided here. Stated as an open
  question with a name, not left implicit.
- **`.atlas/` remains a committed artifact**, so anyone who can land a commit can edit the projection
  directly and bypass every door. That is out of scope for this ADR and is the larger governance-root
  question — but it bounds how much any door-level control is worth, and it is dishonest to record this
  decision without saying so.
