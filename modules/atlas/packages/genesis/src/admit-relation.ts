// @atlas/genesis — src/admit-relation.ts  (ADR-0015 D2 · WP-96-R — the relation family's admission legs)
//
// EXTRACTED from `admit-harness.ts` at the 400-LOC godfile ceiling when WP-96-R filled the relation stub with
// real admission (the exact sibling of the `admit-proposals.ts` extraction). The harness keeps the ADMISSION
// ENGINE (`admitRelation` — it owns the truth-door call + `scoreObviousness`, both module-private there); this
// file keeps the relation-specific PURE builders + refusals it consumes: the identity mint (`buildRelation`),
// the set-union/obviousness text (`relationClaimNorm`), the gate-0 well-formedness check (`relationEndpointsResolve`),
// and the two honest drop reasons. Nothing here casts an admission decision — that stays the harness's.
//
// NO NEW TRUTH RULE lives here: the relation reuses `deps.doors.grounded` (the advisory truth door) in the
// harness. This module only mints identity and shapes the node once the harness's door has said yes.

import type { ObviousnessScore, RelationKind, RelationNode, RelationWitness } from "@atlas/knowledge"
// The relation identity leg + its closed-vocabulary guard — the SEALED mint (`relationKey`) and the
// value-boundary membership check (`isKnownRelationKind`), consumed EXACTLY as the governed door does
// (governed-emit-identity.ts). Identity is minted from the proposal's endpoints, NEVER trusted off a payload.
import { relationKey, isKnownRelationKind } from "@atlas/knowledge"
import type { RelationProposal } from "./admit-proposals.js"

// The two honest, distinct relation refusals (ADR-0015 D2), mirroring the intrinsic door's gate-0/gate-1
// split (`relationWellFormed` then the truth door): a malformed triple has no address, an ungrounded one
// fails the citation. The `shape-not-yet-emitted` stub reason is GONE (deleted, not commented) so a
// resurrected stub cannot reach a ready-made string.
export const DROP_RELATION_MALFORMED =
  "malformed relation: endpointA/endpointB are not two DISTINCT non-empty unit keys, or relationKind is off the closed vocabulary (ADR-0015 D2 — no address to mint)"
export const DROP_RELATION_UNGROUNDED =
  "relation fails the truth door — an endpoint citation does not re-derive FRESH (GEN-12e / ADR-0015 D2, the 2-entry AND-fold)"

/** The canonical relation triple — the obviousness input AND the KNOW-4c set-union element. MIRRORS the
 *  governed door's `claimNormOf(node, 'relation')` (adapter-io/src/governed-emit-identity.ts:54-57) and the
 *  mine staging `claimNormOf` (cli/src/mine-decide.ts) verbatim, so a mined relation and a governed-emitted
 *  one score + dedup on byte-identical text. */
export function relationClaimNorm(p: RelationProposal): string {
  return `${p.endpointA} ${p.relationKind} ${p.endpointB}`
}

/** Gate-0 well-formedness for a relation (ADR-0015 D2). MIRRORS the door's `relationWellFormed`
 *  (governed-emit-identity.ts:72-81) and the `relationKey` refusal (relation-key.ts:65-70): two DISTINCT
 *  non-empty unit keys + a closed-vocabulary kind. Checked BEFORE the mint so `relationKey` — which THROWS a
 *  `MalformedRelationError` on the same conditions — is never reached with a triple it would reject, keeping
 *  `admit` total (no throw). Endpoints are typed `string` on the proposal, but the proposer is untrusted, so
 *  every leg is re-checked at the value boundary exactly as the door does. */
export function relationEndpointsResolve(p: RelationProposal): boolean {
  return (
    typeof p.endpointA === "string" &&
    p.endpointA.length > 0 &&
    typeof p.endpointB === "string" &&
    p.endpointB.length > 0 &&
    p.endpointA !== p.endpointB &&
    isKnownRelationKind(p.relationKind)
  )
}

/**
 * Construct the emitted RELATION node (ADR-0015 D2, WP-96-R) — the 2-ended sibling of `buildAdvisory`. Every
 * shared leg is byte-identical to the advisory build (obviousness REQUIRED per ADR-0012 TOTALITY, `freshness`
 * FRESH, `claims` empty); the relation-specific legs are the two location-free endpoints + `relationKind`, and
 * — the one real difference — `id` is MINTED by `relationKey(endpointA, relationKind, endpointB)`, NEVER
 * trusted from the proposal (KNOW-15b parity; the proposal carries no id leg at all). `authoring: 'RELATED'`
 * mirrors advisory's `'ADVISORY'`. `scope` is spread conditionally (absent stays ABSENT, never explicit
 * `undefined`) — the `governanceOf`/`exactOptionalPropertyTypes` discipline. The caller (`admitRelation`) has
 * already cleared `relationEndpointsResolve`, so `relationKey` cannot throw here.
 */
export function buildRelation(p: RelationProposal, obviousness: ObviousnessScore): RelationNode {
  return {
    kind: "relation",
    obviousness,
    id: relationKey(p.endpointA, p.relationKind, p.endpointB),
    tier: p.tier,
    relationKind: p.relationKind,
    endpointA: p.endpointA,
    endpointB: p.endpointB,
    grounding: p.grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
    ...(p.scope !== undefined ? { scope: p.scope } : {}),
  }
}

/**
 * The proven relation's WITNESS, read off the proposal's SOUND-ORACLE legs (`relationKind` + `target` +
 * `sourceScope`) — the 2-ended sibling of `witnessOf` (admit-harness.ts). Present iff the proposal carries BOTH
 * resolved legs; ABSENT for an advisory relation (no oracle legs → no seal). Pure + total. The legs are the ones
 * the mechanical projection (WP-R3) derived from a `resolved DepEdge`, NOT the endpoint unitKeys, so the witness
 * is never read off model/endpoint prose — it is exactly what reverify (WP-R5) re-runs `verifyRelation` against.
 */
export function relationWitnessOf(p: RelationProposal): RelationWitness | undefined {
  if (typeof p.target !== "string" || p.target.length === 0) return undefined
  if (typeof p.sourceScope !== "string" || p.sourceScope.length === 0) return undefined
  return { relationKind: p.relationKind, target: p.target, sourceScope: p.sourceScope }
}

/**
 * CLAIM-DERIVED-FROM-WITNESS for the relation family (AR-6) — the stored SENTENCE generated from the SAME
 * resolved legs `relationWitnessOf` reads, never from the endpoint pair or model prose. EXPORTED (TRAVEL-BY-
 * REPROOF) so a re-verifier holding only a stored `RelationWitness` re-derives the sentence a `proven` seal is
 * required to carry and can demand byte equality. Mirrors `claimNormFromWitness` (admit-harness.ts) verbatim in
 * discipline; wording is deliberately conservative — "references", never "calls": `verifyRelation` reuses
 * `reverseCallers`, which witnesses a cross-unit SCIP REFERENCE (imports and type positions count), and this
 * sentence must not repeat the known-lying `callers` name. Pure + total.
 */
export function relationClaimNormFromWitness(w: RelationWitness): string {
  return `${w.sourceScope} ${w.relationKind} ${w.target} (witnessed cross-unit reference, sound oracle)`
}

/**
 * The PROVEN relation node (#99 sound relation, ADR-0018, WP-96-R2) — the sealed sibling of `buildRelation` and
 * the 2-ended analogue of `buildSound` (admit-harness.ts). BYTE-IDENTICAL to `buildRelation` except for the two
 * fields that name the proof: `seal:'proven'` and the re-runnable `witness`. Identity is STILL minted by
 * `relationKey` (never trusted off the payload); the caller (`admitRelation`) has already cleared
 * `relationEndpointsResolve`, so `relationKey` cannot throw here. Only reached for a `depends-on` edge whose
 * `verifyRelation` verdict was `proven` (the oracle abstains on any other kind — AR-5 — so a `calls` relation can
 * never carry this seal). Pure + total.
 */
export function buildSoundRelation(
  p: RelationProposal,
  witness: RelationWitness,
  obviousness: ObviousnessScore,
): RelationNode {
  return {
    kind: "relation",
    obviousness,
    id: relationKey(p.endpointA, p.relationKind, p.endpointB),
    tier: p.tier,
    relationKind: p.relationKind,
    endpointA: p.endpointA,
    endpointB: p.endpointB,
    grounding: p.grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
    seal: "proven",
    witness,
    ...(p.scope !== undefined ? { scope: p.scope } : {}),
  }
}

/**
 * The relation SOUND-ADMIT decision (#99, ADR-0018, WP-96-R2) — extracted from `admitRelation` so the harness
 * keeps only the truth-door + dispatch and this module owns the whole relation node shape. Returns a
 * `proven`-sealed `RelationNode` IFF the proposal carries the resolved oracle legs (`relationWitnessOf`) AND the
 * injected sound `verifyRelation` PROVES the directed edge; otherwise `undefined` — the caller falls through to
 * the advisory `buildRelation`. ABSTAIN ≠ REFUTE: a `calls` kind (AR-5), a local/unresolvable target
 * (AR-3/AR-17), no witnessed reference in scope, or no leg wired all return `undefined` (advisory, never a
 * drop). `score` is the harness's obviousness scorer bound to its private door predicate; the claim text it
 * scores is DERIVED FROM THE WITNESS (AR-6), never endpoint/model prose. Pure + total.
 */
export function trySoundRelation(
  p: RelationProposal,
  verifyRelation:
    | ((
        relationKind: RelationKind,
        target: string,
        sourceScope: string,
        endpointA: string,
        endpointB: string,
      ) => "proven" | "abstain")
    | undefined,
  score: (claimNorm: string) => ObviousnessScore,
): RelationNode | undefined {
  const witness = relationWitnessOf(p)
  if (witness === undefined || verifyRelation === undefined) return undefined
  // A relation is a unit→unit edge (TWO anchors): the oracle binds BOTH endpoint FILES to the witnessed edge
  // (endpointA a real referrer, endpointB the definer), so the proposal's endpoints are passed alongside the
  // witness legs. The stored witness needs no endpoints — the RelationNode already carries them for reverify.
  if (verifyRelation(witness.relationKind, witness.target, witness.sourceScope, p.endpointA, p.endpointB) !== "proven")
    return undefined
  return buildSoundRelation(p, witness, score(relationClaimNormFromWitness(witness)))
}
