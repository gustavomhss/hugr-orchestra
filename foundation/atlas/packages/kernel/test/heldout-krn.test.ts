// @atlas/kernel — test/heldout-krn.test.ts  (MICROSCOPE GATE — held-out `-2` leg, authored by the cold-review seat)
//
// The author was BLINDED to these fixtures. Each case transcribes a `held_out: true` golden from
// docs/requirements/goldens-krn.md as a RELATIONAL / encoder-agnostic assertion (symbolic ids like
// `id-4b7e` are NOT asserted as literals) and runs against the author's src UNCHANGED. A pass ⟹ the impl
// generalized the frozen behaviour; a fail ⟹ it overfit the visible `-1` set.

import { describe, it, expect } from "vitest"
import { blake3 } from "@noble/hashes/blake3"
import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Hash } from "@atlas/contracts"
import { canonicalForm, id, defaultEncoder } from "../src/index.js"

const decode = (b: Uint8Array): string => new TextDecoder().decode(b)
const composed = "café" // café — é = U+00E9 (NFC / precomposed)
const decomposed = "café" // café — e + U+0301 combining acute (NFD)

describe("GATE held-out — SCN-KERNEL-1a-2: nested-key + NFC canonicalization", () => {
  it("a decomposed key + a reversed nested object id-collide with the NFC + fully-sorted form", () => {
    const presented = { [decomposed]: "x", a: { n: 2, m: 1 } }
    const canonical = { a: { m: 1, n: 2 }, [composed]: "x" }
    // relational: NFC on the key AND a sort at the NESTED level (not just top-level) → one id
    expect(id(presented)).toBe(id(canonical))
    // structural: the preimage is NFC-composed + sorted at every level ("a" < "café")
    expect(decode(canonicalForm(presented))).toBe(`{"a":{"m":1,"n":2},"${composed}":"x"}`)
  })
})

describe("GATE held-out — SCN-KERNEL-1b-2: a well-formed-but-wrong hex id is still rejected", () => {
  it("a plausible hash-shaped id that != hash(canonicalForm) is not the content id", () => {
    const obj = { kind: "node", label: "acme-hq" }
    const wrong = "id-0000" // well-formed-looking, but not the real digest
    const accepts = (o: unknown, claimed: string): boolean => id(o) === claimed
    expect(id(obj)).not.toBe(wrong)
    expect(accepts(obj, wrong)).toBe(false) // checked against hash(canonicalForm), not for shape
    expect(id(obj)).toBe(defaultEncoder.hash(canonicalForm(obj)))
  })
})

describe("GATE held-out — SCN-KERNEL-1c-2: escape/float divergence is blocked", () => {
  it("the solidus is one fixed (unescaped) escape policy — no `\\/` fork", () => {
    // a divergent encoder that emits `\/` forks the fact; the canonical subset fixes ONE policy ("/")
    expect(decode(canonicalForm({ p: "a/b" }))).toBe('{"p":"a/b"}')
    // and the fixed policy still escapes what JSON must (quote/backslash) — deterministic, single form
    expect(decode(canonicalForm({ p: 'a"\\b' }))).toBe('{"p":"a\\"\\\\b"}')
  })
  it("a float is a canonical-form violation (rejected, never silently forked)", () => {
    expect(() => canonicalForm({ v: 1.5 })).toThrow()
    expect(() => canonicalForm({ v: Number.POSITIVE_INFINITY })).toThrow()
  })
})

describe("GATE held-out — SCN-KERNEL-2a-2: no off-seam vendored digest on ANY kernel src path", () => {
  it("every kernel src file except the encoder seam is digest-free (incl. crypto.createHash)", () => {
    const dir = fileURLToPath(new URL("../src/", import.meta.url))
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && f !== "encoder.ts")
      .filter((f) =>
        /blake3|sha256|createHash|from ['"]node:crypto['"]|require\(['"]crypto['"]\)/.test(
          readFileSync(dir + f, "utf8"),
        ),
      )
    expect(offenders).toEqual([]) // 0 off-seam digest sites (a vendored sha256 anywhere off-seam fails)
  })
})

describe("GATE held-out — SCN-KERNEL-2b-2: a variable-LENGTH digest leaves the identity contract intact", () => {
  it("a shorter (4-byte) test digest through the seam preserves key-order identity; only bytes differ", () => {
    // NOTE: the head-tiebreak / merge arm of 2b-2 is EPIC-3 (no head()/merge in this WP's built surface);
    // this asserts the in-scope seam contract: correctness must not depend on the digest (even its length).
    const short4 = (b: Uint8Array): Hash => bytesToHex(blake3(b)).slice(0, 8) as Hash // 4-byte digest
    const idWith = (h: (b: Uint8Array) => Hash, o: unknown): Hash => h(canonicalForm(o))
    const ba = { b: 2, a: 1 }
    const ab = { a: 1, b: 2 }
    expect(idWith(short4, ba)).toBe(idWith(short4, ab)) // key-order identity holds under it
    expect(idWith(short4, ab).length).not.toBe(id(ab).length) // genuinely a different length
    expect(idWith(short4, ab)).not.toBe(id(ab)) // only the digest bytes differ
  })
})

describe("GATE held-out — SCN-KERNEL-2c-2: the empty string defaults to the BLAKE3 empty digest", () => {
  it('hash("") is the blake3 empty digest, not sha256 (kills a hard-coded blake3("abc") overfit)', () => {
    const empty = utf8ToBytes("")
    expect(defaultEncoder.hash(empty)).toBe(bytesToHex(blake3(empty)))
    expect(defaultEncoder.hash(empty)).not.toBe(bytesToHex(sha256(empty)))
  })
})

describe("GATE held-out — SCN-KERNEL-8a-2: a nested grounding array is outside the preimage", () => {
  it("grounding/status/freshness are omitted while the nested content field is kept + sorted", () => {
    const obj = {
      grounding: [{ src: "a" }, { src: "b" }],
      status: "active",
      freshness: 1720000000,
      content: { n: 2, m: 1 },
    }
    const preimage = decode(canonicalForm(obj))
    expect(preimage).not.toMatch(/grounding|status|freshness/) // all three side-indexes omitted
    expect(preimage).toBe('{"content":{"m":1,"n":2}}') // nested content kept + sorted
    expect(id(obj)).toBe(id({ content: { m: 1, n: 2 } }))
  })
})

describe("GATE held-out — SCN-KERNEL-8b-2: recomputing freshness + grounding leaves the Hash invariant", () => {
  it("marking stale→fresh and appending a grounding source perturbs no key", () => {
    const base = { a: 1, label: "acme-hq" }
    const stale = { ...base, freshness: 1, grounding: ["s1"] }
    const fresh = { ...base, freshness: 999, grounding: ["s1", "s2"] }
    expect(id(stale)).toBe(id(fresh))
    expect(id(stale)).toBe(id(base))
  })
})
