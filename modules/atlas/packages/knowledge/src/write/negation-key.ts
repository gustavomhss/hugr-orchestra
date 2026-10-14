// @atlas/knowledge — src/write/negation-key.ts  (ADR-0015 D3 · #99b — the scoped-negative's identity leg)
//
// The 3-legged SIBLING of `relation-key.ts` (#99a). A negation is `¬∃` over a relation within a CLOSED
// scope — "within scope S under edge-model E, no `relationKind`-edge targets X". Its identity binds the
// (relationKind, target, scope) triple: `(¬calls, X)` in scope `src/payments` is a DIFFERENT fact than in
// scope `src/`, because the negative is only as strong as the scope it was proven closed over (contract §1).
// So `scope` is an IDENTITY leg, not merely a grounding anchor — two negations over the same (kind, X) at
// different scopes are distinct nodes.
//
// Re-exported by `router.ts` (beside `relation-key.js`) so the package surface is unchanged, mirroring the
// #99a placement. Freshness lives elsewhere (the ONE grounding entry at the scope directory + `driftDetect`'s
// insertion-sensitive scope Merkle, §3). See docs/design/99b-negation-fact-contract.md.

import { asNodeKey, canonicalForm, defaultEncoder } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
// The closed relation vocabulary + its total-over-unknown guard are OWNED by relation-key.ts (the #99a
// leg): a negation NEGATES a relation, so it shares the exact same closed `RelationKind` set. Imported, not
// restated — THE ONE runtime copy (#152 discipline).
import { isKnownRelationKind } from "./relation-key.js"

/**
 * THE REFUSAL a malformed negation earns — the 3-legged analogue of `MalformedRelationError`. A negation
 * whose target or scope is not a non-empty string, or whose kind is outside the closed relation vocabulary,
 * has no well-formed address and is refused (never a raw `TypeError` out of a door — the door converts this
 * to a fail-closed verdict / an `AbstainedRecord`). A NAMED class so a caller can discriminate this refusal
 * from an internal fault, exactly as the intrinsic and relation doors do.
 *
 * No self-check (unlike `relationKey`'s `a === b`): `target` and `scope` are DIFFERENT KINDS of key — a
 * location-free GLOBAL symbol vs. a DIRECTORY scope — so they can never denote "the same endpoint twice".
 * A target that happens to string-equal a scope is not a degenerate negation, just an unusual one.
 */
export const MALFORMED_NEGATION_REASON =
  "malformed negation: a negation identity is the triple (relationKind, target, scope), and one of the " +
  "three is not well-formed. target must be a non-empty GLOBAL symbol key (the location-free X the " +
  "negative is about), scope must be a non-empty DIRECTORY key (the closed scope S the witness ranges " +
  "over), and relationKind must be one of the closed vocabulary members. Re-state the negation naming the " +
  "symbol it is about and the scope it was proven closed over with a supported kind"

export class MalformedNegationError extends Error {
  constructor() {
    super(MALFORMED_NEGATION_REASON)
    this.name = "MalformedNegationError"
  }
}

/**
 * The negation identity leg (ADR-0015 D3). `negationKey(kind, target, scope) = hash(canonicalForm({neg,
 * t, s}))` — the (relationKind, target, scope) triple, minted through the SEALED kernel seam (no raw
 * hashing). The `neg` tag keeps the preimage SET disjoint from `relationKey`'s ({a,k,b}) and `nodeKey`'s
 * ({a,s[,c]}) — no cross-family address collision (the #103 discipline). DIRECTED by construction (a
 * negation is not symmetric). Pure + total: a non-string/empty `target` or `scope`, or an off-vocabulary
 * `kind`, throws `MalformedNegationError` (the door converts it to a fail-closed verdict / abstention),
 * never a raw `TypeError`. No LLM/clock/seq.
 *
 * An `AbstainedRecord` reuses the SAME address so a later successful negation at the same question
 * SUPERSEDES the abstention (the honest lifecycle: "couldn't decide" → later "decided false").
 */
export function negationKey(kind: unknown, target: unknown, scope: unknown): NodeKey {
  if (typeof target !== "string" || target.length === 0) throw new MalformedNegationError()
  if (typeof scope !== "string" || scope.length === 0) throw new MalformedNegationError()
  if (!isKnownRelationKind(kind)) throw new MalformedNegationError()
  return asNodeKey(defaultEncoder.hash(canonicalForm({ neg: kind, t: target, s: scope })))
}
