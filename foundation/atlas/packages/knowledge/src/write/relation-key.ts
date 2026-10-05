// @atlas/knowledge — src/write/relation-key.ts  (ADR-0015 D2 · #99a — the 2-ended fact's identity leg)
//
// EXTRACTED from `router.ts` at the 400-LOC godfile ceiling, along a cohesive boundary (the relation identity
// is its own concern, exactly as `closed-slot.ts` extracted the closed-slot refusal). Re-exported by
// `router.ts` so the package surface is unchanged. The intrinsic identity (`nodeKey`/`primaryAnchorId`) stays
// in `router.ts`; this is its 2-ended SIBLING.
//
// A relation spans two units generally in different files; the intrinsic `primaryAnchorId` computes their
// common `::` prefix, which is EMPTY across files and is REFUSED as a wildcard (`DegenerateAnchorError`, the
// #103 fix). That refusal is correct FOR an intrinsic fact and must stay; a relation instead names BOTH
// endpoints in its preimage, so its address is collision-free without any common ancestor. Identity is the
// ordered pair + kind (direction matters); freshness is elsewhere (the two grounding entries + `driftDetect`'s
// AND-fold). See docs/design/99a-relation-fact-contract.md.

import { asNodeKey, canonicalForm, defaultEncoder } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import type { RelationKind } from "../types.js"

/** The closed relation vocabulary as a RUNTIME list (the value-boundary companion to the erased `RelationKind`
 *  type — mirrors `PREDICATE_SLOTS`). CLOSED: a new kind is a `cv` bump. THE ONE runtime copy. */
export const RELATION_KINDS: readonly RelationKind[] = ["depends-on", "calls"]
const RELATION_KIND_SET: ReadonlySet<string> = new Set(RELATION_KINDS)

/** Closed-vocabulary membership guard for a relation kind. TOTAL over `unknown` (mirror `isKnownSlot`): a
 *  non-string, an off-vocabulary string, an object or an absent value all answer `false` at the value
 *  boundary where the erased `RelationKind` type stops helping. */
export function isKnownRelationKind(kind: unknown): kind is RelationKind {
  return typeof kind === "string" && RELATION_KIND_SET.has(kind)
}

/**
 * THE REFUSAL a malformed relation earns — the 2-ended analogue of `DegenerateAnchorError`. A relation whose
 * endpoints are not two distinct non-empty unit keys, or whose kind is outside the closed vocabulary, has no
 * well-formed address and is refused (never a raw `TypeError` out of a door). A NAMED class so a caller can
 * discriminate this refusal from an internal fault, exactly as the intrinsic door does.
 *
 * WHY DISTINCTNESS IS ENFORCED (`a === b`): a self-relation `(X, depends-on, X)` is either vacuous or a
 * different KIND of fact (a self-recursion property is an intrinsic predicate about X, groundable the normal
 * way). Admitting it here would put a one-endpoint fact through the two-endpoint identity, whose second
 * freshness leg would be a duplicate of the first — a 2-entry AND-fold that is really a 1-entry check wearing
 * a relation's clothes. Refused so a relation always means what it says: two units, one directed edge.
 */
export const MALFORMED_RELATION_REASON =
  "malformed relation: a relation identity is the ordered pair (endpointA, relationKind, endpointB), and one " +
  "of the three is not well-formed. endpointA and endpointB must each be a non-empty unit key (a " +
  "qualifiedPath), they must be DISTINCT (no self-relation — that is an intrinsic predicate about one unit, " +
  "not a two-ended fact), and relationKind must be one of the closed vocabulary members. Re-state the " +
  "relation naming both units it connects with a supported kind"

export class MalformedRelationError extends Error {
  constructor() {
    super(MALFORMED_RELATION_REASON)
    this.name = "MalformedRelationError"
  }
}

/**
 * The relation identity leg (ADR-0015 D2). `relationKey(A, kind, B) = hash(canonicalForm({a, k, b}))` — the
 * ORDERED endpoint pair + kind, minted through the SEALED kernel seam (no raw hashing). DIRECTED:
 * `(A, depends-on, B) ≠ (B, depends-on, A)` — endpoints are NOT sorted. Collision-free by construction: the
 * preimage names both endpoints, so #103's empty-common-ancestor wildcard cannot arise. Pure + total: a
 * malformed triple throws `MalformedRelationError` (the door converts it to a fail-closed verdict), never a
 * raw `TypeError`. No LLM/clock/seq.
 */
export function relationKey(a: unknown, kind: unknown, b: unknown): NodeKey {
  if (typeof a !== "string" || a.length === 0) throw new MalformedRelationError()
  if (typeof b !== "string" || b.length === 0) throw new MalformedRelationError()
  if (a === b) throw new MalformedRelationError() // no self-relation — see MALFORMED_RELATION_REASON
  if (!isKnownRelationKind(kind)) throw new MalformedRelationError()
  return asNodeKey(defaultEncoder.hash(canonicalForm({ a, k: kind, b })))
}
