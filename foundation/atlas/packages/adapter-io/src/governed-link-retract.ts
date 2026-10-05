// @atlas/adapter-io — src/governed-link-retract.ts  (A-D3 / task #83: the RETRACTION MODE's vocabulary)
//
// `atlas-link --retract` withdraws a previously asserted `sameAs` equivalence. It is a MODE of the existing
// governed link door, NOT a sixth tool, and this module holds the three refusals that are specific to that
// mode — split out of `governed-link.ts` for the same reason `governed-emit-reasons.ts` was split out of the
// emit door: one protocol, one place its reason names are minted, and a 400-line ceiling that is a real cap.
//
// ── WHY A MODE AND NOT A NEW DOOR (the decision, so nobody re-litigates it from the diff) ─────────────────
// INV-TOOLS-1 was already amended from a COUNT ("exactly 5 tools") to a PROPERTY — every write goes through a
// governed door (invariant-register.md:300 and the TLS closing line at :318, ADR-0003). INV-TOOLS-15 (:315)
// scopes `sameAs` to the PROJECTION SIDECAR medium, explicitly not the store-row medium. A retraction that
// rides the existing `atlas-link` leg therefore adds NO new door and NO new medium: `GOVERNANCE_SURFACE`
// stays 5, `WRITE_PATHS` stays `{atlas-emit, atlas-link}`, and no ratified invariant moves. A sixth tool
// would have moved TOOLS-1's measurable and required a real amendment for a capability that is the SAME
// governed act on the SAME carrier in the opposite direction.
//
// ── THE THREE REFUSALS, AND WHY EACH IS A REFUSAL RATHER THAN A SILENT SUCCESS ────────────────────────────
// Each carries a NAMED DISCRIMINANT — the text before the first `:` — because that is the channel every
// transport reproduces byte-for-byte and the one this repo compares by EQUALITY (`reasonOf`, @atlas/tools
// `fault.ts`). Refusal constants here quote one another's *concepts* but never one another's *strings*, so
// no discriminant is a prefix or substring of another and a substring assertion cannot be one-directionally
// blind the way it has been on this surface before.

/** The DISCRIMINANTS — exported so a test compares a value for equality instead of matching prose. */
export const RETRACT_NOT_LINKED = "not-linked"
export const RETRACT_ALREADY_RETRACTED = "already-retracted"
export const RETRACT_RETRACTED_PAIR = "retracted-pair"

/**
 * Retracting a pair that was NEVER asserted.
 *
 * REFUSED, not a silent no-op, for two separate reasons. (1) HONESTY: a retraction is an APPEND, so
 * accepting this would durably record the withdrawal of an equivalence nobody ever asserted — a record of
 * an act that did not happen, which is the same class of lie as deleting the edge would be. (2) DENIAL: the
 * retraction marker LATCHES (see {@link RETRACTED_PAIR_REASON}), so a pre-emptive retraction of an unlinked
 * pair would let an authorized-but-hostile actor make a FUTURE legitimate `atlas-link` land and then not
 * merge — a write door reporting `linked:true` over an edge the read fold ignores. Refusing closes that.
 */
export const NOT_LINKED_REASON =
  `${RETRACT_NOT_LINKED}: there is no asserted sameAs equivalence between these two nodes to withdraw. A ` +
  "retraction is APPENDED to the stored relation, so accepting one here would record the withdrawal of an " +
  "assertion that was never made — and would pre-emptively latch a pair that a later governed link could " +
  "then no longer merge. Link the pair first if you meant to assert it."

/**
 * Retracting a pair that is ALREADY retracted. REFUSED.
 *
 * THE JUSTIFICATION THIS COMMENT USED TO GIVE WAS FALSE, and it is corrected rather than quietly dropped. It
 * said `linked:true` from this door means "this act changed the stored relation". It does not: re-asserting
 * an ALREADY-ASSERTED pair returns `{linked:true}` and publishes a fresh, byte-identical generation — three
 * times running, measured. So the rule was never universal; it was applied to one mode only.
 *
 * THE REAL REASON, and it is narrower and honest: this is a DELIBERATE ASYMMETRY with the assert path, taken
 * because the two acts have different operational meaning. A retraction is a CORRECTIVE act — it is made
 * after something went wrong — so reporting "done" for an act that did nothing invites an operator to
 * believe they have withdrawn a pair they did not actually target (a mistyped nodeKey answers exactly like a
 * successful second retraction). An assertion is not corrective, and its idempotent success predates this
 * work and is NOT changed here. Distinct from {@link NOT_LINKED_REASON} on purpose: "you never linked these"
 * and "you already unlinked these" send an operator to two different places.
 *
 * The asymmetry is RECORDED, not resolved. Making the assert path refuse a redundant re-link (or making this
 * one succeed) would be a defensible follow-up; both are behaviour changes to a governed door and neither is
 * smuggled in under a comment. `governed-link-retract.test.ts` pins the assert path's measured behaviour so
 * this note cannot drift back into a claim the code does not keep.
 */
export const ALREADY_RETRACTED_REASON =
  `${RETRACT_ALREADY_RETRACTED}: this sameAs equivalence has already been withdrawn; the retraction is ` +
  "recorded on both endpoints and the read fold already refuses to merge across it. Nothing to do."

/**
 * ASSERTING a pair that is currently retracted. REFUSED.
 *
 * This is the branch that would otherwise have made the whole door lie, and it is MANDATORY rather than
 * stylistic — unlike {@link ALREADY_RETRACTED_REASON}, which is a judgement call. The rule it enforces is the
 * one this door does keep everywhere: **`linked:true` is never returned when the relation the caller asked
 * for does not hold afterwards.** Re-asserting an already-asserted pair satisfies that (nothing changed, but
 * `a ≡ b` does hold, which is why that path is allowed to be idempotent). Re-asserting a RETRACTED pair does
 * not: `linkSameAs`'s `withPeer` is idempotent and a retraction never removes the peer from `sameAs`, so the
 * write would be a structural NO-OP reported as `linked:true` while `deriveSameAs` goes on ignoring the edge
 * — the door claiming an equivalence that no reader will ever observe.
 *
 * WHY A LATCH IS THE RIGHT SHAPE, and the asymmetry that justifies it. Un-retracting would mean DELETING the
 * retraction marker, which destroys exactly the evidence A-D3 exists to preserve. So retraction is monotone:
 * once withdrawn, an unordered pair stays withdrawn. The cost of a WRONG retraction is that one asserted
 * equivalence is lost — local, bounded, visible in the query envelope, and reachable again by linking either
 * endpoint to a different key. The cost of a WRONG assertion is what opened A-D3: the relation is transitive,
 * so a bad merge is unbounded and contagious on every read forever. Permanence in the SPLITTING direction
 * buys bounded truth; permanence in the MERGING direction is the defect. A latch is permanence in the safe
 * one. (Re-assertion of a retracted pair is a distinct governance act with its own evidence requirements and
 * is deliberately NOT built here — it is refused visibly rather than half-built silently.)
 */
export const RETRACTED_PAIR_REASON =
  `${RETRACT_RETRACTED_PAIR}: this sameAs equivalence was asserted and then RETRACTED, and a retraction is ` +
  "monotone — re-asserting it would require deleting the retraction record, which is the evidence that the " +
  "withdrawal happened. Both the original assertion and its withdrawal stay on the rows. If the two nodes " +
  "really do name the same fact, that is a new claim and needs a new pair of keys, not a silent un-erase."
