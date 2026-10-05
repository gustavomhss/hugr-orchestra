// @atlas/kernel — test/arb.ts  (NOT a *.test.ts — shared fast-check arbitraries, never run as a suite)
//
// Bounded JSON generators for the KERNEL-1/2/8 ∀-laws.
//
// THE KEY POOL DELIBERATELY CONTAINS NFC-EQUIVALENT TOKENS ("é" U+00E9 and "e"+U+0301, "ñ" and "n"+U+0303),
// so two generated keys CAN normalize to one. It used to be narrowed to plain ASCII with the note that a
// collision "would make key-order invariance genuinely ambiguous" — but that ambiguity was the BUG, not a
// generator problem: NFC is not injective, so without a guard both keys reached the sorted preimage, the
// comparator returned 0 for the pair, and V8's stable sort leaked INSERTION ORDER into the digest. Excluding
// the case from the generator merely hid it. The law is stated instead: the OUTCOME (a digest, or a
// fail-closed rejection) is a function of the key SET, so it is invariant under presentation order either
// way. Keys still never spell a side-index name (grounding/status/freshness) — the pool cannot form them.

import fc from "fast-check"

/** NFC-equivalent pairs are IN the pool on purpose — see the header. */
const KEY_TOKENS = ["a", "b", "c", "d", "é", "é", "ñ", "ñ"]
const keyArb = fc.array(fc.constantFrom(...KEY_TOKENS), { minLength: 1, maxLength: 3 }).map((parts) => parts.join(""))
const leafArb = fc.oneof(fc.constant(null), fc.boolean(), fc.integer(), fc.string())
const d1 = fc.oneof(leafArb, fc.array(leafArb, { maxLength: 4 }), fc.dictionary(keyArb, leafArb, { maxKeys: 4 }))
const d2 = fc.oneof(leafArb, fc.array(d1, { maxLength: 4 }), fc.dictionary(keyArb, d1, { maxKeys: 4 }))

/** An arbitrary JSON *object* (integers only — floats are a canonical-form violation), up to depth 3. */
export const jsonObjArb = fc.dictionary(keyArb, d2, { maxKeys: 6 })

/** The keys `canonicalForm` actually serializes: side-indexes (KERNEL-8) and `undefined` values are dropped
 *  BEFORE the collision guard, so a faithful predicate must drop them too. */
const SIDE_INDEX: ReadonlySet<string> = new Set(["grounding", "status", "freshness"])

/**
 * Does `v` (recursively) contain an object whose SERIALIZED keys are not distinct under NFC — the case
 * `canonicalForm` fails CLOSED on (KERNEL-1)? Reachable because the key pool above is deliberately wide.
 */
export function hasNfcKeyCollision(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasNfcKeyCollision)
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>
    const keys = Object.keys(o).filter((k) => !SIDE_INDEX.has(k) && o[k] !== undefined)
    if (new Set(keys.map((k) => k.normalize("NFC"))).size !== keys.length) return true
    return keys.some((k) => hasNfcKeyCollision(o[k]))
  }
  return false
}

/** Re-present a JSON value with every object's keys in reverse order (recursively). Same content, a
 *  different key-order presentation — the canonical form must be invariant to it. */
export function reorder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reorder)
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).reverse()) out[k] = reorder(o[k])
    return out
  }
  return v
}
