// @atlas/kernel — test/encoder.test.ts
//
// RED→GREEN transcription of the VISIBLE encoder-seam goldens (KERNEL-2a/2b/2c) + PROP-KERNEL-2 (encoder
// substitution). The default seam is BLAKE3 (asserted against an independently-computed blake3), and the
// substitution law is checked by running a non-digest contract (key-order identity) under three encoders.
// Golden ids are symbolic ⇒ all cross-encoder assertions are relational. Held-out `-2` fixtures untouched.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { blake3 } from "@noble/hashes/blake3"
import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Hash } from "@atlas/contracts"
import { canonicalForm, id, defaultEncoder } from "../src/index.js"
import { jsonObjArb, reorder, hasNfcKeyCollision } from "./arb.js"

const shaHash = (b: Uint8Array): Hash => bytesToHex(sha256(b)) as Hash
const b3Hash = (b: Uint8Array): Hash => bytesToHex(blake3(b)) as Hash

describe("KERNEL-2 — the swappable encoder seam (visible goldens)", () => {
  it("SCN-KERNEL-2a-1: every id is produced through the seam (0 off-seam digest sites)", () => {
    const obj = { a: 1, b: 2 }
    // behavioural: id is EXACTLY seam.hash(canonicalForm) — there is no parallel digest path
    expect(id(obj)).toBe(defaultEncoder.hash(canonicalForm(obj)))
    // module-graph audit: only the encoder seam may import a raw digest primitive
    const canon = readFileSync(fileURLToPath(new URL("../src/canonical.ts", import.meta.url)), "utf8")
    const barrel = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8")
    // teeth (breaks-on a node-builder importing blake3 directly): no digest primitive outside encoder.ts
    expect(canon).not.toMatch(/blake3|sha256|createHash/)
    expect(barrel).not.toMatch(/blake3|sha256|createHash/)
  })

  it("SCN-KERNEL-2b-1: swapping the digest changes only the digest bytes, no other contract", () => {
    const ba = { b: 2, a: 1 }
    const ab = { a: 1, b: 2 }
    const idWith = (h: (b: Uint8Array) => Hash, o: unknown): Hash => h(canonicalForm(o))
    // the non-digest contract (key-order identity) holds identically under BOTH encoders …
    expect(idWith(b3Hash, ba)).toBe(idWith(b3Hash, ab))
    expect(idWith(shaHash, ba)).toBe(idWith(shaHash, ab))
    // … and ONLY the digest bytes differ between the two encoders
    // teeth (breaks-on a non-digest contract depending on the encoder)
    expect(idWith(b3Hash, ab)).not.toBe(idWith(shaHash, ab))
  })

  it("SCN-KERNEL-2c-1: the unconfigured seam defaults to BLAKE3", () => {
    const abc = utf8ToBytes("abc")
    // teeth (breaks-on the default resolving to SHA-256)
    expect(defaultEncoder.hash(abc)).toBe(bytesToHex(blake3(abc)))
    expect(defaultEncoder.hash(abc)).not.toBe(bytesToHex(sha256(abc)))
  })
})

describe("PROP-KERNEL-2 — encoder substitution (∀-law)", () => {
  it("every non-digest contract is invariant under encoder swap; the unconfigured seam ≡ blake3", () => {
    const encoders: Array<(b: Uint8Array) => Hash> = [defaultEncoder.hash.bind(defaultEncoder), b3Hash, shaHash]
    fc.assert(
      fc.property(jsonObjArb, (x) => {
        // An NFC key collision is rejected by canonicalForm BEFORE any encoder runs — the rejection is a
        // property of the preimage, so it must hold under EVERY digest fn, presented either way.
        if (hasNfcKeyCollision(x)) {
          expect(() => canonicalForm(x)).toThrow(/NFC key collision/)
          expect(() => canonicalForm(reorder(x))).toThrow(/NFC key collision/)
          return
        }
        for (const h of encoders) {
          // non-digest contract: canonical (key-order-invariant) identity holds under EVERY digest fn
          expect(h(canonicalForm(x))).toBe(h(canonicalForm(reorder(x))))
        }
        // the unconfigured seam resolves to blake3(canonicalForm)
        expect(defaultEncoder.hash(canonicalForm(x))).toBe(bytesToHex(blake3(canonicalForm(x))))
      }),
    )
  })
})
