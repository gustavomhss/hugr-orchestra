// @atlas/persist — test/scrub-adjacent-store.test.ts  (WP-3.5-a.PERSIST · PERSIST-10a — ADJACENCY GATE)
//
// Two credentials written back to back, with nothing between them, used to collapse into ONE match: the
// greedy body of the first swallowed the four-character family prefix of the second, so the record kept
//     ghp_AAAAAAghp_BBBBBB  ->  [REDACTED]_BBBBBB
// and the second credential's entropy-bearing body shipped in the clear. The store is put/fetch with no
// delete, so such a record is permanent.
//
// Two things are gated here, because closing only the first is a REGRESSION dressed as a fix:
//   1. the whole-buffer path redacts BOTH credentials, byte-exactly;
//   2. so does a STREAMING caller — at every split offset, byte-at-a-time, and at fixed chunk sizes — and
//      the streamed buffer content-addresses to the SAME object as the whole-buffer one. A negative
//      lookahead cannot see across a chunk seam, so this leg is the one that fails if the seam machinery
//      was not extended with it.
//
// FIXTURES are obviously-synthetic, shape-matching tokens carrying a NOTAREAL marker — nothing here is or
// resembles a credential a scanner should ever act on.

import { describe, it, expect } from "vitest"
import { scrub, admitToBuffer, MAX_SEAM_CARRY, seamCarryOf } from "../src/scrub.js"
import { createTranscriptStore, toGitPointer } from "../src/transcript-store.js"

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Obviously-synthetic, shape-matching fixtures (never a real credential). */
const A = "ghp_SYNTHETICNOTAREALTOKEN01"
const B = "gho_NOTAREALSECRET0987654321"
const C = "ghu_THIRDNOTAREALTOKEN22222"
const BODY_A = A.slice(4)
const BODY_B = B.slice(4)
const BODY_C = C.slice(4)

/** BYTE-level occurrence count — a decoded-substring check can be satisfied by the wrong string, and a NUL
 *  byte does not blind this one. */
function byteOccurrences(hay: Uint8Array, needle: string): number {
  const n = enc.encode(needle)
  let hits = 0
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer
    hits++
  }
  return hits
}

/** EXACT-BYTE equality against an expected literal — factored out so its teeth can be tested. */
function assertExactBytes(actual: Uint8Array, expectedText: string): void {
  const want = enc.encode(expectedText)
  if (actual.length !== want.length) {
    throw new Error(`length ${actual.length} !== expected ${want.length}: ${JSON.stringify(dec.decode(actual))}`)
  }
  for (let i = 0; i < want.length; i++) {
    if (actual[i] !== want[i]) throw new Error(`byte ${i}: ${String(actual[i])} !== ${String(want[i])}`)
  }
}

/** Fails if any run of >= `minRun` consecutive bytes of `secret` survives anywhere in `buf`. */
function assertNoSecretRun(buf: Uint8Array, secret: string, minRun = 6): void {
  for (let i = 0; i + minRun <= secret.length; i++) {
    for (let j = i + minRun; j <= secret.length; j++) {
      if (byteOccurrences(buf, secret.slice(i, j)) !== 0) {
        throw new Error(`secret run "${secret.slice(i, j)}" survived`)
      }
    }
  }
}

function admitAll(parts: readonly string[]): Uint8Array {
  let buf: Uint8Array = new Uint8Array(0)
  for (const p of parts) buf = admitToBuffer(buf, enc.encode(p))
  return buf
}

const scrubText = (s: string): string => dec.decode(scrub(enc.encode(s)))

/** Every chunking this gate insists on: each split offset, byte-at-a-time, and the fixed sizes. */
function chunkings(s: string): readonly (readonly string[])[] {
  const out: (readonly string[])[] = [s.split("")]
  for (let off = 1; off < s.length; off++) out.push([s.slice(0, off), s.slice(off)])
  for (const size of [1, 2, 3, 5, 7, 11, 13]) {
    const parts: string[] = []
    for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size))
    out.push(parts)
  }
  return out
}

describe("PERSIST-10a adjacency — the assertions have teeth", () => {
  // Every predicate this file trusts is first pointed at the UN-REDACTED form and shown to fire. The
  // mutant that matters here is the LEAKED form, not merely the raw one: `[REDACTED]_BBBBBB` is what a
  // green suite used to accept.
  it("assertExactBytes FAILS on the raw body and on the LEAKED form, passes on the redacted one", () => {
    const raw = enc.encode(`x ${A}${B} y`)
    const leaked = enc.encode(`x [REDACTED]_${BODY_B} y`)
    expect(() => assertExactBytes(raw, "x [REDACTED][REDACTED] y")).toThrow(/length|byte /)
    expect(() => assertExactBytes(leaked, "x [REDACTED][REDACTED] y")).toThrow(/length|byte /)
    expect(() => assertExactBytes(enc.encode("x [REDACTED][REDACTED] y"), "x [REDACTED][REDACTED] y")).not.toThrow()
  })

  it("assertNoSecretRun FAILS on the LEAKED form — the second body is what ships in the clear", () => {
    // teeth for the whole file: if this predicate could not see `[REDACTED]_BBBBBB` as a leak, every
    // "no secret survived" assertion below would be an always-passing check.
    expect(() => assertNoSecretRun(enc.encode(`[REDACTED]_${BODY_B}`), B)).toThrow(/survived/)
    expect(() => assertNoSecretRun(enc.encode(`x ${A}${B} y`), B)).toThrow(/survived/)
    expect(() => assertNoSecretRun(enc.encode("x [REDACTED][REDACTED] y"), B)).not.toThrow()
    expect(() => assertNoSecretRun(enc.encode("x [REDACTED][REDACTED] y"), A)).not.toThrow()
  })

  it("the fixtures really are adjacent, and each is a credential on its own", () => {
    expect(`${A}${B}`).not.toContain(" ")
    expect(scrubText(A)).toBe("[REDACTED]")
    expect(scrubText(B)).toBe("[REDACTED]")
    expect(scrubText(C)).toBe("[REDACTED]")
  })
})

describe("PERSIST-10a adjacency — THE DEFECT: two adjacent credentials, whole buffer", () => {
  it("both are redacted; neither body survives; the leaked FORM is absent", () => {
    const out = scrub(enc.encode(`log ${A}${B} end`))
    // teeth (breaks-on "the first credential's greedy body swallows the second's family prefix"):
    assertExactBytes(out, "log [REDACTED][REDACTED] end")
    expect(byteOccurrences(out, BODY_B)).toBe(0)
    expect(byteOccurrences(out, `[REDACTED]_${BODY_B}`)).toBe(0)
    assertNoSecretRun(out, A)
    assertNoSecretRun(out, B)
  })

  it("THREE adjacent credentials collapse to three placeholders, not one", () => {
    const out = scrub(enc.encode(`${A}${B}${C}`))
    assertExactBytes(out, "[REDACTED][REDACTED][REDACTED]")
    for (const body of [BODY_A, BODY_B, BODY_C]) expect(byteOccurrences(out, body)).toBe(0)
  })

  it("adjacency through a single `_` separator keeps the separator and redacts both", () => {
    assertExactBytes(scrub(enc.encode(`${A}_${B}`)), "[REDACTED]_[REDACTED]")
    assertExactBytes(scrub(enc.encode(`${A}_${B}_${C}`)), "[REDACTED]_[REDACTED]_[REDACTED]")
  })

  it("CONTROL — 0 over-redaction is preserved: a sub-floor prefix before a real token is NOT eaten", () => {
    // `ghp_ABCDE` has five body characters: below the {6,} floor, so it is NOT a credential and must
    // survive verbatim even when a real credential is written immediately after it.
    // teeth (breaks-on "the body class was widened to [A-Za-z0-9_], which eats non-secret bytes"):
    assertExactBytes(scrub(enc.encode(`ghp_ABCDE${A}`)), "ghp_ABCDE[REDACTED]")
    assertExactBytes(scrub(enc.encode(`${A}_prod`)), "[REDACTED]_prod")
    assertExactBytes(scrub(enc.encode(`${A}_prod${B}_dev`)), "[REDACTED]_prod[REDACTED]_dev")
    assertExactBytes(scrub(enc.encode("gha_ABCDEFGH")), "gha_ABCDEFGH") // wrong family, untouched
  })
})

describe("PERSIST-10a adjacency — CHUNK INDEPENDENCE across the seam", () => {
  const CASES: readonly (readonly [string, string])[] = [
    [`log ${A}${B} end`, "log [REDACTED][REDACTED] end"],
    [`${A}${B}`, "[REDACTED][REDACTED]"],
    [`${A}${B}${C}`, "[REDACTED][REDACTED][REDACTED]"],
    [`${A}_${B}`, "[REDACTED]_[REDACTED]"],
    [`ghp_ABCDE${A}`, "ghp_ABCDE[REDACTED]"],
    [`${A}_prod${B}`, "[REDACTED]_prod[REDACTED]"],
    ["x" + A + B + "!" + C + ".", "x[REDACTED][REDACTED]![REDACTED]."],
  ]

  for (const [text, expected] of CASES) {
    it(`every chunking of ${JSON.stringify(text.slice(0, 34))}… yields the same bytes`, () => {
      const whole = scrub(enc.encode(text))
      assertExactBytes(whole, expected)
      for (const parts of chunkings(text)) {
        const folded = admitAll(parts)
        // teeth (breaks-on "the lookahead cannot reach across a chunk seam, so a streaming caller still
        // admits `[REDACTED]_BBBBBB`"):
        assertExactBytes(folded, expected)
        expect(Array.from(folded)).toEqual(Array.from(whole))
        assertNoSecretRun(folded, A)
        assertNoSecretRun(folded, B)
      }
    })
  }

  it("the invariant holds at EVERY PREFIX for sizes 1/2/3/5/7/11/13 (no deferred flush)", () => {
    const text = `head ${A}${B} mid ${A}_${B} tail`
    for (const size of [1, 2, 3, 5, 7, 11, 13]) {
      let buf: Uint8Array = new Uint8Array(0)
      let acc = ""
      for (let i = 0; i < text.length; i += size) {
        const part = text.slice(i, i + size)
        buf = admitToBuffer(buf, enc.encode(part))
        acc += part
        // teeth (breaks-on "the buffer only converges at the end; mid-stream it holds something else"):
        assertExactBytes(buf, scrubText(acc))
        expect(seamCarryOf(buf)).toBeLessThanOrEqual(MAX_SEAM_CARRY)
      }
      assertExactBytes(buf, `head [REDACTED][REDACTED] mid [REDACTED]_[REDACTED] tail`)
    }
  })

  it("THE CONTINGENT SEAM: a sub-floor prefix is not committed to before the deciding byte arrives", () => {
    // `ghp_ABCDEghp` is a credential ONLY while its trailing `ghp` counts as body. One more byte (`_`)
    // turns those three bytes into the family prefix of the NEXT credential and un-makes the match, which
    // is why they cannot be decided at the seam and why the carry bound is not simply `maxPartial`.
    const text = `ghp_ABCDE${A}`
    const at = "ghp_ABCDEghp".length // the split that puts the seam exactly inside the ambiguity
    expect(text.slice(0, at)).toBe("ghp_ABCDEghp")
    expect(scrubText(text.slice(0, at))).toBe("[REDACTED]") // alone, it IS a credential
    const partial = admitToBuffer(new Uint8Array(0), enc.encode(text.slice(0, at)))
    // fail-closed: what the buffer holds mid-stream is the SCRUBBED reading, never the raw candidate
    assertExactBytes(partial, "[REDACTED]")
    expect(seamCarryOf(partial)).toBeLessThanOrEqual(MAX_SEAM_CARRY)
    // ...and the next byte retro-actively un-makes it, without over-redacting the sub-floor prefix
    assertExactBytes(admitToBuffer(partial, enc.encode(text.slice(at))), "ghp_ABCDE[REDACTED]")
  })

  it("the memory bound holds while streaming adjacent credentials byte-at-a-time", () => {
    const text = `${A}${B}${C}${A}_${B}`
    let buf: Uint8Array = new Uint8Array(0)
    let worst = 0
    for (const ch of text) {
      buf = admitToBuffer(buf, enc.encode(ch))
      worst = Math.max(worst, seamCarryOf(buf))
    }
    expect(worst).toBeLessThanOrEqual(MAX_SEAM_CARRY)
    // 74 = MAX_CANON_MATCH (43) + MAX_PARTIAL (32) - 1 — the derivation is written out in scrub-seam.test.ts.
    expect(MAX_SEAM_CARRY).toBe(74)
    assertExactBytes(buf, "[REDACTED][REDACTED][REDACTED][REDACTED]_[REDACTED]")
  })
})

describe("PERSIST-10a adjacency — THROUGH the content-addressed store", () => {
  it("put(raw adjacent body) stores the redacted bytes — the caller never scrubs", () => {
    const store = createTranscriptStore()
    const raw = enc.encode(`seat log: exported ${A}${B} to env\n`)
    const stored = store.fetch(toGitPointer(store.put(raw)))
    // teeth (breaks-on "`put` stores the body as offered" / "only the first credential is redacted"):
    assertExactBytes(stored, "seat log: exported [REDACTED][REDACTED] to env\n")
    for (const body of [BODY_A, BODY_B]) expect(byteOccurrences(stored, body)).toBe(0)
    assertNoSecretRun(stored, A)
    assertNoSecretRun(stored, B)
  })

  it("EVERY chunking content-addresses to the SAME object as the whole body", () => {
    const store = createTranscriptStore()
    const text = `log ${A}${B} end`
    const reference = store.put(enc.encode(text))
    assertExactBytes(store.fetch(toGitPointer(reference)), "log [REDACTED][REDACTED] end")
    for (const parts of chunkings(text)) {
      const folded = store.put(admitAll(parts))
      // teeth (breaks-on "the stored object depends on the caller's chunk boundaries"):
      expect(folded).toBe(reference)
    }
    // and the leaked object is a DIFFERENT hash — proving the equality above is not vacuous
    expect(store.put(enc.encode(`log [REDACTED]_${BODY_B} end`))).not.toBe(reference)
  })

  it("a caller who never heard of `scrub` cannot get an adjacent pair in, by any body shape", () => {
    const store = createTranscriptStore()
    const shapes = [
      `${A}${B}`,
      `${B}${A}`,
      `prefix ${A}${B}`,
      `${A}${B} suffix`,
      `${A}${B}${C}`,
      `${A}_${B}`,
      `Authorization: token ${A}${B}\nX-Other: ${C}${A}\n`,
      `ghp_ABCDE${A}${B}`,
    ]
    for (const s of shapes) {
      const stored = store.fetch(toGitPointer(store.put(enc.encode(s))))
      for (const secret of [A, B, C]) {
        expect(byteOccurrences(stored, secret)).toBe(0)
        assertNoSecretRun(stored, secret)
      }
      expect(byteOccurrences(stored, `[REDACTED]_${BODY_B}`)).toBe(0)
    }
  })

  it("double-scrub is still a no-op on an adjacent pair (put(scrub(b)) === put(b))", () => {
    const store = createTranscriptStore()
    const raw = enc.encode(`two ${A}${B} here`)
    expect(store.put(scrub(raw))).toBe(store.put(raw))
    const stored = store.fetch(toGitPointer(store.put(raw)))
    expect(Array.from(scrub(stored))).toEqual(Array.from(stored))
  })
})
