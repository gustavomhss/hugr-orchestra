// @atlas/kernel — test/canonical.test.ts
//
// RED→GREEN transcription of the VISIBLE goldens for canonicalForm / id (KERNEL-1a/1b/1c, 8a/8b) plus the
// ∀-laws PROP-KERNEL-1 (identity determinism) and PROP-KERNEL-8 (identity stability). Golden ids
// (`id-9f2c`, …) are SYMBOLIC, so every assertion is RELATIONAL / encoder-agnostic (equality across
// key-order + NFC presentations; inequality for the named teeth mutant; rejection of a caller-supplied id)
// — never a specific hex digest. Held-out `-2` fixtures are NOT transcribed (GATE runs those).

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex } from "@noble/hashes/utils"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { canonicalForm, id, defaultEncoder } from "../src/index.js"
import { jsonObjArb, reorder, hasNfcKeyCollision } from "./arb.js"

const decode = (b: Uint8Array): string => new TextDecoder().decode(b)

describe("KERNEL-1/8 — canonical preimage & content-addressed identity (visible goldens)", () => {
  it("SCN-KERNEL-1a-1: id is the hash of the key-sorted canonical preimage, key-order invariant", () => {
    const ba = { b: 2, a: 1 } // presented b,a
    const ab = { a: 1, b: 2 }
    expect(id(ba)).toBe(id(ab)) // regardless of the presented key order (corpus vector id-9f2c)
    // teeth (breaks-on skips the key-sort → the b,a preimage would hash to a different id): the preimage
    // itself is the SORTED form, proving the sort ran.
    expect(decode(canonicalForm(ba))).toBe('{"a":1,"b":2}')
  })

  it("SCN-KERNEL-1b-1: a caller-supplied id that ≠ hash(canonicalForm) is not the content id (rejected)", () => {
    const obj = { a: 1 }
    const supplied = "acme-fact-001"
    const contentId = id(obj)
    // identity is computed, never asserted — the hand-rolled key is provably not the content id
    expect(contentId).not.toBe(supplied)
    // the id-check a store would run (`claimed === id(obj)`) therefore REJECTS the hand-rolled id
    const accepts = (o: unknown, claimed: string): boolean => id(o) === claimed
    expect(accepts(obj, supplied)).toBe(false)
    // teeth (breaks-on the kernel trusting the caller's id): the content id MUST equal hash(canonicalForm)
    expect(contentId).toBe(defaultEncoder.hash(canonicalForm(obj)))
  })

  it("SCN-KERNEL-1c-1: an NFC-omitting canonicalizer diverges — the conformance gate rejects the fork", () => {
    const composed = { café: "x" } //  é = U+00E9 (precomposed)
    const decomposed = { ["café"]: "x" } // e + U+0301 combining acute
    // conformance: my kernel maps both NFC-equivalent presentations to the ONE corpus id (no 2-CAS fork)
    expect(id(composed)).toBe(id(decomposed))
    // teeth (breaks-on divergence downgraded to a warning): an encoder that skips NFC forks the fact into
    // two distinct preimages — a real divergence the equality gate above turns into a hard build failure.
    const noNfc = (o: Record<string, string>): string => JSON.stringify(o)
    expect(noNfc(composed)).not.toBe(noNfc(decomposed))
  })

  it("SCN-KERNEL-8a-1: grounding/status/freshness are outside the canonical preimage", () => {
    const obj = { a: 1, grounding: ["prov"], status: "active", freshness: 1720000000 }
    const preimage = decode(canonicalForm(obj))
    // teeth (breaks-on canonicalForm including freshness): no side-index byte appears in the preimage
    expect(preimage).not.toMatch(/grounding|status|freshness/)
    expect(id(obj)).toBe(id({ a: 1 })) // the id is the id of the object WITHOUT the side-indexes
  })

  it("SCN-KERNEL-8b-1: perturbing the side-indexes leaves the Hash invariant (recompute never re-keys)", () => {
    const base = { a: 1, label: "acme" }
    const v1 = { ...base, grounding: ["s1"], status: "draft", freshness: 1 }
    const v2 = { ...base, grounding: ["s1", "s2"], status: "final", freshness: 999 }
    // teeth (breaks-on status leaking into the preimage): recomputing all three side-indexes moves no key
    expect(id(v1)).toBe(id(v2))
    expect(id(v1)).toBe(id(base))
  })
})

describe("PROP-KERNEL-1 — identity determinism (∀-law)", () => {
  it("id is deterministic & key-order invariant, and id ≡ blake3hex(canonicalForm)", () => {
    fc.assert(
      fc.property(jsonObjArb, (x) => {
        // The law is over the OUTCOME, not just the digest: the generator's key pool contains NFC-equivalent
        // tokens, so some objects are fail-closed REJECTS (KERNEL-1). Both presentations must reject too —
        // that is precisely the insertion-order leak, stated as a property instead of hidden by narrowing
        // the pool. Skipping the collision case here would make this ∀-law vacuous over exactly the inputs
        // that broke it.
        if (hasNfcKeyCollision(x)) {
          expect(() => id(x)).toThrow(/NFC key collision/)
          expect(() => id(reorder(x))).toThrow(/NFC key collision/) // rejection is presentation-invariant
          return
        }
        expect(id(x)).toBe(id(reorder(x))) // ∀ key-permutation ⟹ same id
        expect(id(x)).toBe(bytesToHex(blake3(canonicalForm(x)))) // id ≡ blake3hex(utf8(canonicalForm(x)))
      }),
    )
  })

  it("NFC-equivalent unicode encodings (key and value) collide on id", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(id({ [s.normalize("NFC")]: 1 })).toBe(id({ [s.normalize("NFD")]: 1 }))
        expect(id({ k: s.normalize("NFC") })).toBe(id({ k: s.normalize("NFD") }))
      }),
    )
  })

  it("a float in the preimage is a canonical-form violation and is rejected", () => {
    fc.assert(
      fc.property(
        fc.double().filter((n) => !Number.isInteger(n)),
        (f) => {
          expect(() => canonicalForm({ v: f })).toThrow()
        },
      ),
    )
  })
})

describe("PROP-KERNEL-8 — identity stability (∀-law)", () => {
  it("perturbing grounding/status/freshness never re-keys; the preimage carries no side-index bytes", () => {
    fc.assert(
      fc.property(jsonObjArb, fc.anything(), fc.anything(), (x, g1, g2) => {
        if (hasNfcKeyCollision(x)) return // a rejected preimage has no id to hold stable (covered by PROP-KERNEL-1)
        const base = id(x)
        const p1 = { ...(x as object), grounding: g1, status: "a", freshness: 1 }
        const p2 = { ...(x as object), grounding: g2, status: "b", freshness: 2 }
        expect(id(p1)).toBe(base)
        expect(id(p2)).toBe(base)
        expect(decode(canonicalForm(p1))).not.toMatch(/"grounding"|"status"|"freshness"/)
      }),
    )
  })
})

// ── KERNEL-1 · the NFC key-collision fail-closed (regression) ───────────────────────────────────────
//
// NFC is applied to KEYS as well as values (ratified: REQ-KERNEL-1a, held-out SCN-KERNEL-1a-2). NFC is not
// injective, so two DISTINCT JavaScript keys can normalize to one. Before the guard those two keys both
// survived into the sorted entry list, the comparator returned 0 for the pair, and V8's stable sort
// therefore preserved their INSERTION order — emitting a duplicate-key preimage whose bytes depend on how
// the object happened to be built. MEASURED on base 80318d0: the SAME mapping
// {"cafe\u00e9" -> 1, "cafe\u0301" -> 2} hashed bcee1c10… when the composed key was assigned first and
// a065e84a… when the decomposed key was assigned first. Two digests for one logical value is a
// canonicalizer that is not canonical — the "two CAS objects for one fact" fork KERNEL-1 forbids, reached
// from the opposite direction to the float/escape splits, and the disposition the design surface mandates
// for such a divergence is fail-closed reject.
//
// Escapes (not literal characters) on purpose: the byte identity of these two keys IS the test, and a
// literal would be at the mercy of any editor or transport that silently re-normalizes the file.
const NFC_E = "caf\u00e9" // "café" — precomposed é (U+00E9), 4 code units
const NFD_E = "cafe\u0301" // "café" — e + combining acute (U+0301), 5 code units

describe("KERNEL-1 — an NFC key collision is a fail-closed canonical-form violation", () => {
  it("the two presentations really are distinct JS keys that NFC-collide (the premise)", () => {
    expect(NFC_E).not.toBe(NFD_E)
    expect(NFD_E.normalize("NFC")).toBe(NFC_E)
    const o: Record<string, number> = {}
    o[NFC_E] = 1
    o[NFD_E] = 2
    expect(Object.keys(o)).toHaveLength(2) // two distinct properties, one canonical key
  })

  it("rejects the collision instead of emitting an insertion-order-dependent preimage", () => {
    const composedFirst: Record<string, number> = {}
    composedFirst[NFC_E] = 1
    composedFirst[NFD_E] = 2
    const decomposedFirst: Record<string, number> = {}
    decomposedFirst[NFD_E] = 2
    decomposedFirst[NFC_E] = 1 // the SAME mapping, built in the other order

    // teeth (breaks-on "the canonicalizer normalizes keys without checking for a collision"): before the
    // guard BOTH of these returned a digest, and the two digests DIFFERED.
    expect(() => canonicalForm(composedFirst)).toThrow(/NFC key collision/)
    expect(() => canonicalForm(decomposedFirst)).toThrow(/NFC key collision/)
    expect(() => id(composedFirst)).toThrow(/canonical-form violation/)
    expect(() => id(decomposedFirst)).toThrow(/canonical-form violation/)
  })

  it("fires at every nesting level, and only on a genuine collision", () => {
    const nested = { a: 1, deep: { x: { [NFC_E]: 1, [NFD_E]: 2 } } }
    expect(() => id(nested)).toThrow(/NFC key collision/)
    // a single non-ASCII key in either presentation is NOT a collision — it still canonicalizes, and the
    // two presentations still agree (the ratified SCN-KERNEL-1a-2 behaviour is untouched by this guard).
    expect(id({ [NFC_E]: 1 })).toBe(id({ [NFD_E]: 1 }))
    // a key dropped BEFORE the preimage cannot collide in it: side-indexes (KERNEL-8) and undefined values.
    expect(() => id({ grounding: 1, a: 2 })).not.toThrow()
  })
})

// Module-graph anchor for SCN-KERNEL-2a-1 lives in encoder.test.ts; the source scan below keeps the
// canonicalizer itself off-seam (it must reach the digest only through the encoder, never import blake3).
describe("KERNEL-2a — canonicalForm holds no direct digest import", () => {
  it("canonical.ts imports no blake3/sha256/createHash directly", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/canonical.ts", import.meta.url)), "utf8")
    expect(src).not.toMatch(/blake3|sha256|createHash/)
  })
})
