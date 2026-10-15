// @atlas/genesis — src/admit-negation.ts  (ADR-0015 D3 · WP-96-N — the negation family's admission legs)
//
// The EXACT sibling of `admit-relation.ts` (WP-96-R): the harness keeps the ADMISSION ENGINE (`admitNegation`),
// this file keeps the negation-specific PURE builders + refusal it consumes — the identity mint (`buildNegation`)
// and the gate-0 well-formedness check (`negationTripleResolves`). Nothing here casts an admission decision.
//
// WHY THE NEGATION BUILD IS SHORTER THAN THE RELATION BUILD, stated so a reviewer does not read the absence as
// a missing gate. A negation's TRUTH is a closed-world completeness question — "no `relationKind`-edge targets X
// within the CLOSED scope S" — and it is SOUND only relative to whether S is closed. That decision needs the N0
// completeness feed + the live scope Merkle, which live at the DOOR, not here (contract F4: the abstention law
// is the DOOR's job, never re-implemented in genesis). So `admitNegation` does NOT call a truth door and does
// NOT score obviousness: it mints the identity legs the door will ground and hands over a CANDIDATE. The door
// then constructs the §3 scope-directory grounding, stamps `edgeModel`, and either ADMITS or files an honest
// `AbstainedRecord` (scope-open / target-not-global / scope-empty). The candidate's `grounding`/`edgeModel` are
// therefore placeholders the door OVERWRITES (governed-emit-negation.ts) — never trusted from here.
//
// The two honest failure modes match the relation's split in SHAPE but not in SITE: a malformed triple has no
// address and is DROPPED here (gate-0, this file); a well-formed-but-undecidable negative earns a durable
// ABSTENTION at the door. That is exactly one drop reason in genesis, deliberately — the second failure mode is
// the door's abstention, not a second genesis drop.

import type { NegationNode } from "@atlas/knowledge"
// The negation identity leg + the closed-vocabulary guard — the SEALED mint (`negationKey`) and the
// value-boundary membership check (`isKnownRelationKind`), consumed EXACTLY as the governed door does
// (governed-emit-negation.ts). Identity is minted from the proposal's (relationKind, target, scope), NEVER
// trusted off a payload — the proposal carries no id leg at all (KNOW-15b parity).
import { negationKey, isKnownRelationKind } from "@atlas/knowledge"
import type { NegationProposal } from "./admit-proposals.js"

// The ONE honest negation drop (ADR-0015 D3, WP-96-N). The `shape-not-yet-emitted` stub reason is GONE
// (deleted, not commented) so a resurrected stub cannot reach a ready-made string. There is deliberately no
// `ungrounded`/`abstain` reason here: a well-formed negative's undecidability is the DOOR's abstention (F4).
export const DROP_NEGATION_MALFORMED =
  "malformed negation: the identity triple (relationKind, target, scope) is not well-formed — target and scope " +
  "must each be a non-empty string and relationKind must be a closed-vocabulary member (depends-on | calls). " +
  "A malformed triple has no address to mint (ADR-0015 D3 — MalformedNegationError's conditions, checked here " +
  "so `negationKey` never throws out of the total `admit`)"

/**
 * Gate-0 well-formedness for a negation (ADR-0015 D3). MIRRORS the door's gate-0.1 shape check
 * (governed-emit-negation.ts) and `negationKey`'s own refusal conditions (negation-key.ts:59-61): a non-empty
 * GLOBAL target key + a non-empty scope directory + a closed-vocabulary kind. Checked BEFORE the mint so
 * `negationKey` — which THROWS `MalformedNegationError` on the same conditions — is never reached with a triple
 * it would reject, keeping `admit` total (no throw). No self-check (unlike `relationEndpointsResolve`'s
 * `a === b`): `target` (a location-free symbol) and `scope` (a directory) are DIFFERENT KINDS of key and can
 * never denote "the same endpoint twice". The `local `-vs-global test is NOT here — it is an ABSTENTION at the
 * door (`target-not-global`), not a malformed refusal, because a local target is well-formed, just out of v1.
 */
export function negationTripleResolves(p: NegationProposal): boolean {
  return (
    typeof p.target === "string" &&
    p.target.length > 0 &&
    typeof p.scope === "string" &&
    p.scope.length > 0 &&
    isKnownRelationKind(p.relationKind)
  )
}

/**
 * Construct the emitted NEGATION CANDIDATE (ADR-0015 D3, WP-96-N) — the scoped-negative sibling of
 * `buildRelation`. `id` is MINTED by `negationKey(relationKind, target, scope)` over the WITNESS scope, NEVER
 * trusted (the proposal carries no id leg). The caller (`admitNegation`) has already cleared
 * `negationTripleResolves`, so `negationKey` cannot throw here. `authoring: 'NEGATED'` mirrors relation's
 * `'RELATED'`.
 *
 * `grounding` and `edgeModel` are PLACEHOLDERS (`{ entries: [] }` / `''`): the DOOR constructs the §3
 * scope-directory Merkle grounding and stamps the extractor release AT ADMIT (governed-emit-negation.ts),
 * overwriting both — the candidate carries the IDENTITY legs (the triple), not the grounding, exactly as bobby
 * F4 froze it ("NO grounding: the governed door constructs it"). Emitting a fabricated grounding here would be a
 * citation nobody derived. `authzScope` is carried from the proposal ONLY when present (the F3 split); the MINED
 * path stamps it downstream (`decideStaging`, mine-decide.ts), a human proposal omits it and authz falls back to
 * the witness `scope`. Spread conditionally so absent stays ABSENT (exactOptionalPropertyTypes discipline).
 */
export function buildNegation(p: NegationProposal): NegationNode {
  return {
    kind: "negation",
    id: negationKey(p.relationKind, p.target, p.scope), // MINTED over the WITNESS scope, never trusted
    tier: p.tier,
    relationKind: p.relationKind,
    target: p.target,
    scope: p.scope, // the WITNESS directory — the identity leg AND the abstention-law scope (both the door's)
    grounding: { entries: [] }, // PLACEHOLDER — the door constructs the §3 scope-Merkle grounding at admit
    edgeModel: "", //            PLACEHOLDER — the door stamps the extractor release at admit (§3 clause 4)
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
    ...(p.authzScope !== undefined ? { authzScope: p.authzScope } : {}),
  }
}
