// @atlas/genesis — src/admit-transition.ts  (ADR-0015 D4 · #234 — the transition family's admission legs)
//
// The EXACT sibling of `admit-negation.ts` (#99b) and `admit-relation.ts` (#99a): the harness keeps the
// ADMISSION ENGINE (`admitTransition`), this file keeps the transition-specific PURE builders + refusal it
// consumes — the identity mint (`buildTransition`) and the gate-0 well-formedness check (`transitionWellFormed`).
// Nothing here casts an admission decision.
//
// WHY THE TRANSITION BUILD ADMITS JUSTIFIED WITH NO ORACLE (D-T1, the whole design). A transition is an
// IMMUTABLE ADVISORY HISTORICAL record — "unit `unitKey` returned A at the before-rev, returns B at the
// after-rev". There is NO mechanical HEAD oracle for it: it was true and STAYS true (a closed valid-time
// interval), so nothing at HEAD can re-prove OR refute it. So — unlike `admitRelation`, which calls
// `trySoundRelation` for a `proven` seal — `admitTransition` calls NO truth door and NO sound oracle: it mints
// the `transitionKey` identity, grounds DIRECTLY on the two rev-pair entries the proposer already resolved from
// REAL revs (unlike the negation door, which CONSTRUCTS a scope-Merkle grounding), stamps `seal:'justified'` +
// the contestable `derivation`, and hands over the finished node. It is `justified`, NEVER `proven` (a model
// read the two bodies and derived the change; that ground is contestable, not machine-re-runnable). The one
// honest failure mode is a malformed identity — a missing leg, or two IDENTICAL rev content hashes (a zero
// interval spans no transition) — which is DROPPED here (gate-0), never admitted.

import type { TransitionNode } from "@atlas/knowledge"
// The transition identity leg — the SEALED mint (`transitionKey`). Identity is minted from the proposal's
// (unitKey, shaBefore, shaAfter), where the two shas are the two rev entries' `subtreeHash`es; NEVER trusted
// off a payload (the proposal carries no id leg at all — KNOW-15b parity).
import { transitionKey } from "@atlas/knowledge"
import type { TransitionProposal } from "./admit-proposals.js"

// The ONE honest transition drop (ADR-0015 D4, #234). A malformed identity has no address to mint. There is
// deliberately NO `ungrounded`/`abstain` reason: a transition carries its own two rev-pair entries (it grounds
// on the revs it spans, never on HEAD), and its truth is not a live question anything can decide — so the only
// way to fail is a malformed identity. The `shape-not-yet-emitted` stub reason never existed here.
export const DROP_TRANSITION_MALFORMED =
  "malformed transition: the identity triple (unitKey, shaBefore, shaAfter) is not well-formed — unitKey must " +
  "be a non-empty unit key, and the two rev entries must each carry a non-empty content hash (subtreeHash) that " +
  "are DISTINCT (shaBefore === shaAfter spans no interval — the unit did not change across the two revs, so it " +
  "is not a transition). A malformed triple has no address to mint (ADR-0015 D4 — MalformedTransitionError's " +
  "conditions, checked here so `transitionKey` never throws out of the total `admit`)"

/** The two rev content hashes a transition's identity binds — read off the two grounding entries' anchors. A
 *  transition's `shaBefore`/`shaAfter` ARE the unit's `subtreeHash` at each rev (content-addressed, D-T2), so
 *  the single source of truth for both the identity and the grounding is the two entries the proposer resolved.
 *  Total over an untrusted proposal: a missing/malformed entry yields an empty string, which `transitionWellFormed`
 *  refuses BEFORE the mint. */
export function transitionShas(p: TransitionProposal): { shaBefore: string; shaAfter: string } {
  const b = p.refBefore?.anchor?.subtreeHash
  const a = p.refAfter?.anchor?.subtreeHash
  return { shaBefore: typeof b === "string" ? b : "", shaAfter: typeof a === "string" ? a : "" }
}

/**
 * Gate-0 well-formedness for a transition (ADR-0015 D4). MIRRORS `transitionKey`'s own refusal conditions
 * (transition-key.ts): a non-empty `unitKey`, and two rev entries whose content hashes are each a non-empty
 * string AND DISTINCT. Checked BEFORE the mint so `transitionKey` — which THROWS `MalformedTransitionError` on
 * the same conditions — is never reached with a triple it would reject, keeping `admit` total (no throw). The
 * `shaBefore === shaAfter` refusal is HERE (not an abstention): two identical rev content hashes mean the unit
 * did not change, so there is no transition to state — a malformed identity, not an undecidable one.
 */
export function transitionWellFormed(p: TransitionProposal): boolean {
  if (typeof p.unitKey !== "string" || p.unitKey.length === 0) return false
  const { shaBefore, shaAfter } = transitionShas(p)
  return shaBefore.length > 0 && shaAfter.length > 0 && shaBefore !== shaAfter
}

/**
 * Construct the emitted TRANSITION node (ADR-0015 D4, #234) — the 2-rev historical sibling of `buildNegation`/
 * `buildRelation`. `id` is MINTED by `transitionKey(unitKey, shaBefore, shaAfter)` over the two rev content
 * hashes, NEVER trusted (the proposal carries no id leg). The caller (`admitTransition`) has already cleared
 * `transitionWellFormed`, so `transitionKey` cannot throw here.
 *
 * `grounding` is the TWO rev-pair entries the proposer resolved from REAL revs — entry[0] anchors the unit at
 * the before-rev, entry[1] at the after-rev — carried DIRECTLY (the door constructs nothing for a transition,
 * unlike a negation). `freshness: 'FRESH'` is STAMPED AT EMIT and never re-checked (D-T2): a historical record
 * is a true statement about the past regardless of HEAD. `seal: 'justified'` + `derivation` name the contestable
 * ground (a model read the two bodies), NEVER `proven` (D-T1). `authoring: 'TRANSITIONED'` is the mint value;
 * the lineage HEAD/predecessor verdict is DERIVE-ON-READ (D-T3, read/transitions.ts). `derivation` is spread
 * conditionally so an absent ground stays ABSENT (exactOptionalPropertyTypes discipline), never fabricated.
 */
export function buildTransition(p: TransitionProposal): TransitionNode {
  const { shaBefore, shaAfter } = transitionShas(p)
  return {
    kind: "transition",
    id: transitionKey(p.unitKey, shaBefore, shaAfter), // MINTED over the two rev content hashes, never trusted
    tier: p.tier,
    unitKey: p.unitKey,
    shaBefore,
    shaAfter,
    grounding: { entries: [p.refBefore, p.refAfter] }, // the rev-pair, carried DIRECTLY (D-T2) — no door construction
    freshness: "FRESH", // STAMPED at emit, never re-checked (D-T2)
    claims: [],
    authoring: "TRANSITIONED", // the mint value; lineage head/predecessor is derive-on-read (D-T3)
    seal: "justified", // ADR-0017 — a transition is ALWAYS justified, NEVER proven (D-T1)
    ...(typeof p.scope === "string" && p.scope.length > 0 ? { scope: p.scope } : {}), // KNOW-11a authz scope — the governed door authorizes against it (absent-tolerant)
    ...(typeof p.derivation === "string" && p.derivation.length > 0 ? { derivation: p.derivation } : {}),
  }
}
