// @atlas/kernel — test/store.test.ts  (WP-1.2-a.KERNEL)
//
// RED→GREEN transcription of the VISIBLE store goldens SCN-KERNEL-3a-1 (single hash-keyed CAS across the
// three object kinds) + SCN-KERNEL-3b-1 (exactly one store) and the ∀-law PROP-KERNEL-3 (single-store
// totality). Golden `id-…` handles are SYMBOLIC ⇒ every assertion is RELATIONAL / encoder-agnostic (the
// content id is computed through the sealed seam `id`, never a hard-coded hex). Held-out `-2` fixtures are
// NOT transcribed (GATE runs those).

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import fc from "fast-check"
import type { Hash } from "@atlas/contracts"
import { id } from "../src/canonical.js"
import { createStore } from "../src/store.js"
import { jsonObjArb, hasNfcKeyCollision } from "./arb.js"

// Three distinct-content object kinds (CasObject is opaque `unknown` at layer 1).
const N = { kind: "node", anchor: "pkg/a.ts", slot: "fn:foo" }
const K = { kind: "fact", subject: "foo", predicate: "calls", object: "bar" }
const M = { kind: "memory", seat: "forge", note: "observed" }

describe("KERNEL-3 — the single content-addressed store (visible goldens)", () => {
  it("SCN-KERNEL-3a-1: all three object kinds key by hash in one CAS", () => {
    const store = createStore()
    const hN = store.put(N)
    const hK = store.put(K)
    const hM = store.put(M)
    // each is keyed by its OWN content hash (the sealed seam), not an insertion counter or a caller id
    expect(hN).toBe(id(N))
    expect(hK).toBe(id(K))
    expect(hM).toBe(id(M))
    // all three resolve from the single Cas=Map<Hash,CasObject>
    expect(store.get(hN)).toEqual(N)
    expect(store.get(hK)).toEqual(K)
    expect(store.get(hM)).toEqual(M)
    // teeth (breaks-on "Memory keyed by an insertion counter, not its hash — get(hash(M)) misses"):
    expect(store.get(id(M))).toEqual(M)
    // caller-supplied-id rejected: the key is the content hash, never a claimed handle
    const claimed = "mem-0001"
    expect(hM).not.toBe(claimed)
    expect(store.get(claimed as Hash)).toBeUndefined()
    // content-keyed dedup: re-putting equal content returns the same Hash (idempotent)
    expect(store.put(N)).toBe(hN)
  })

  it("SCN-KERNEL-3a-1: NFC/NFD aliases retain first raw object at shared hash", () => {
    const store = createStore()
    const nfc = { kind: "fact", subject: "caf\u00e9", predicate: "aliases", object: "first" }
    const nfd = { kind: "fact", subject: "cafe\u0301", predicate: "aliases", object: "first" }

    const h = store.put(nfc)
    expect(store.put(nfd)).toBe(h)
    expect(store.get(h)).toEqual(nfc)
  })

  it("SCN-KERNEL-3b-1: exactly one store exists across all kinds — no second store", () => {
    const store = createStore()
    store.put(N)
    store.put(K)
    store.put(M)
    // behavioural: every kind resolves through the one CAS (a second non-CAS side-store would miss)
    expect(store.get(id(N))).toEqual(N)
    expect(store.get(id(K))).toEqual(K)
    expect(store.get(id(M))).toEqual(M)
    // structural teeth (breaks-on "Memory routed to a second non-CAS side-store — store-count == 2"):
    // store.ts constructs EXACTLY ONE backing Map — a second store would be a second `new Map`.
    const src = readFileSync(fileURLToPath(new URL("../src/store.ts", import.meta.url)), "utf8")
    const stores = (src.match(/new Map\b/g) ?? []).length
    expect(stores).toBe(1)
  })
})

describe("PROP-KERNEL-3 — single-store totality (∀-law)", () => {
  const kindArb = fc.record({ kind: fc.constantFrom("node", "fact", "memory"), body: jsonObjArb })

  it("∀ mixed sequence of the three kinds: get(hash(x)) ≡ x through exactly one CAS", () => {
    fc.assert(
      fc.property(fc.array(kindArb, { maxLength: 24 }), (objs) => {
        const store = createStore()
        for (const o of objs) {
          // A body whose keys NFC-collide has NO canonical form (KERNEL-1). `put` stays TOTAL (KERNEL-7b):
          // it returns the honest-empty, non-resolving handle and stores NOTHING — so the CAS never mints an
          // insertion-order-dependent address, and the rejected object is not retrievable under any key.
          if (hasNfcKeyCollision(o)) {
            const empty = store.put(o)
            expect(empty).toBe("") // the honest-empty handle, not a digest
            expect(store.get(empty)).toBeUndefined() // nothing was stored under it
            continue
          }
          const h = store.put(o)
          expect(h).toBe(id(o)) // keyed by content, not kind/counter
          expect(store.get(h)).toEqual(o) // resolves from the single CAS
        }
      }),
    )
  })
})
