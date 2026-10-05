// @atlas/knowledge — src/write/test-vacuity-key.ts  (ADR-0015 D5 · #95 — the single-anchor test-vacuity's identity leg)
//
// SHIPPED (WP-TV-1a): `testVacuityKey` is VALUE-imported by the seal path (`genesis/src/admit-test-vacuity.ts`
// → `buildSoundTestVacuity`) and the governed test-vacuity door (`adapter-io/src/governed-emit-test-vacuity.ts`),
// so it moved dead → live and its reference-model ledger entry was DELETED (its banner dropped with it).
//
// The 2-legged SIBLING of `negation-key.ts` (#99b), `relation-key.ts` (#99a) and `transition-key.ts` (#234).
// A test-vacuity fact is a single-anchor PROVEN record — "named test `testName` in unit `unitKey` has all its
// assertion-shaped calls inside `catch`" — whose identity binds the (unitKey, testName) PAIR. Identity is the
// exact (unit lineage, test name); a unit may hold MANY named vacuous tests, each its own address.
//
// Re-exported by `router.ts` (beside `negation-key.js`/`relation-key.js`/`transition-key.js`) so the package
// surface is unchanged, mirroring the #99a/#99b/#234 placement. Freshness lives elsewhere (the single unit-anchor
// grounding entry's `subtreeHash`, RE-RUN through `scanTestVacuity` at HEAD by reverify — Wave 1a). DIRECTED is
// n/a (a pair, not an ordered triple). See docs/design/95-test-vacuity-design.md and ADR-0015 D5.

import { asNodeKey, canonicalForm, defaultEncoder } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"

/**
 * THE REFUSAL a malformed test-vacuity fact earns — the 2-legged analogue of `MalformedRelationError`/
 * `MalformedNegationError`/`MalformedTransitionError`. A test-vacuity fact whose `unitKey` or `testName` is
 * not a non-empty string has no well-formed address and is refused (never a raw `TypeError` out of a door —
 * the door converts this to a fail-closed verdict). A NAMED class so a caller can discriminate this refusal
 * from an internal fault, exactly as the intrinsic/relation/negation/transition doors do.
 */
export const MALFORMED_TEST_VACUITY_REASON =
  "malformed test-vacuity: a test-vacuity identity is the pair (unitKey, testName), and one of the two is " +
  "not well-formed. unitKey must be a non-empty location-free unit key (a qualifiedPath), and testName must " +
  "be a non-empty test name string. Re-state the test-vacuity fact naming the unit lineage and the test it " +
  "is about"

export class MalformedTestVacuityError extends Error {
  constructor() {
    super(MALFORMED_TEST_VACUITY_REASON)
    this.name = "MalformedTestVacuityError"
  }
}

/**
 * The test-vacuity identity leg (ADR-0015 D5). `testVacuityKey(unitKey, testName) =
 * hash(canonicalForm({tv, u, t}))` — the (unitKey, testName) pair, minted through the SEALED kernel seam (no
 * raw hashing). The `tv` tag keeps the preimage SET disjoint from `negationKey`'s ({neg,t,s}),
 * `transitionKey`'s ({trn,u,b,a}), `relationKey`'s ({a,k,b}) and `nodeKey`'s ({a,s[,c]}) — no cross-family
 * address collision (the #103 discipline). A PAIR, not an ordered triple: DIRECTED is n/a. Pure + total: a
 * non-string/empty leg throws `MalformedTestVacuityError` (the door converts it to a fail-closed verdict),
 * never a raw `TypeError`. No LLM/clock/seq.
 */
export function testVacuityKey(unitKey: unknown, testName: unknown): NodeKey {
  if (typeof unitKey !== "string" || unitKey.length === 0) throw new MalformedTestVacuityError()
  if (typeof testName !== "string" || testName.length === 0) throw new MalformedTestVacuityError()
  return asNodeKey(defaultEncoder.hash(canonicalForm({ tv: unitKey, t: testName })))
}
