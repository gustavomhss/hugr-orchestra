// @atlas/persist — test/transcript-store-redaction.test.ts  (WP-3.5-a.PERSIST · PERSIST-10a — STORE WIRING GATE)
//
// `scrub` was correct and UNREACHED. Every shipped scrub test calls `scrub` / `admitToBuffer` directly, and
// the two store tests that mention a credential call `store.put(scrub(seeded))` — the caller doing the work.
// Nothing anywhere exercised `store.put(rawBody)`, which is the call an ordinary caller writes, and which
// stored the credential VERBATIM. The store is put/fetch with no delete, so that record is permanent.
//
// This file gates the property the module now owns instead of documents:
//     there is no way to reach `objects` that does not pass through `scrub`.
// It is written against the PUBLIC surface only (`createTranscriptStore` / `toGitPointer` / `put` / `fetch`),
// never against internals, so it fails if the redaction is moved back out to the caller.
//
// FIXTURES are obviously-synthetic tokens that still match the shipped shape (a NOTAREAL marker) — nothing
// here resembles a credential a scanner should ever act on.

import { describe, it, expect } from "vitest"
import { createTranscriptStore, toGitPointer } from "../src/transcript-store.js"
import { scrub, admitToBuffer } from "../src/scrub.js"

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Obviously-synthetic, shape-matching fixtures (never a real credential). */
const SECRET = "ghp_SYNTHETICNOTAREALTOKEN01"
const SECRET_B = "gho_NOTAREALSECRET0987654321"

/** BYTE-level occurrence count — a decoded-substring check can be satisfied by the wrong string, and a NUL
 *  byte does not blind this one. The only absence primitive used below. */
function byteOccurrences(hay: Uint8Array, needle: string): number {
  const n = enc.encode(needle)
  let hits = 0
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer
    hits++
  }
  return hits
}

/** EXACT-BYTE equality against an expected literal. Factored out so its teeth can themselves be tested:
 *  an assertion that never had a chance to fail is the defect it is supposed to be catching. */
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
function assertNoSecretRun(buf: Uint8Array, secret: string, minRun = 8): void {
  for (let i = 0; i + minRun <= secret.length; i++) {
    for (let j = i + minRun; j <= secret.length; j++) {
      if (byteOccurrences(buf, secret.slice(i, j)) !== 0) {
        throw new Error(`secret run "${secret.slice(i, j)}" survived in the stored object`)
      }
    }
  }
}

/** put → fetch through the PUBLIC surface, exactly as an ordinary caller reaches the store. */
function roundTrip(body: Uint8Array): Uint8Array {
  const store = createTranscriptStore()
  return store.fetch(toGitPointer(store.put(body)))
}

/** Fold chunks through the redact-at-source write gate, as a streaming caller would. */
function admitAll(parts: readonly string[]): Uint8Array {
  let buf: Uint8Array = new Uint8Array(0)
  for (const p of parts) buf = admitToBuffer(buf, enc.encode(p))
  return buf
}

const PRE = "seat log line 7: agent exported "
const POST = " to env\n"
const RAW = `${PRE}${SECRET}${POST}`
const REDACTED_FORM = `${PRE}[REDACTED]${POST}`

describe("PERSIST-10a wiring — the assertions have teeth", () => {
  // Run every predicate this file trusts against UNSCRUBBED bytes FIRST and prove it fires. An "absent"
  // assertion that cannot fail proves nothing about the bytes it was pointed at.
  it("assertExactBytes FAILS on the unscrubbed body (proof the exact-byte check can fail)", () => {
    const raw = enc.encode(RAW)
    // the redacted expectation applied to raw bytes must throw — this is the mutant that must not survive
    expect(() => assertExactBytes(raw, REDACTED_FORM)).toThrow(/length|byte /)
    // ...and it must PASS on the genuine redacted form, so it is not simply always-throwing
    expect(() => assertExactBytes(enc.encode(REDACTED_FORM), REDACTED_FORM)).not.toThrow()
  })

  it("assertNoSecretRun FAILS on the unscrubbed body, passes on the redacted one", () => {
    expect(() => assertNoSecretRun(enc.encode(RAW), SECRET)).toThrow(/survived in the stored object/)
    expect(() => assertNoSecretRun(enc.encode(REDACTED_FORM), SECRET)).not.toThrow()
  })

  it("byteOccurrences counts exact bytes and is not blinded by a NUL", () => {
    expect(byteOccurrences(enc.encode(RAW), SECRET)).toBe(1)
    expect(byteOccurrences(enc.encode(REDACTED_FORM), SECRET)).toBe(0)
    const withNul = new Uint8Array([0x00, ...enc.encode(SECRET_B), 0x00])
    expect(byteOccurrences(withNul, SECRET_B)).toBe(1)
  })
})

describe("PERSIST-10a wiring — put() cannot store an unscrubbed credential", () => {
  it("THE REGRESSION: store.put(rawBody) — no scrub at the call site — stores redacted bytes", () => {
    const store = createTranscriptStore()
    // The call an ordinary caller writes. Before the wiring this stored the credential VERBATIM.
    const h = store.put(enc.encode(RAW))
    const stored = store.fetch(toGitPointer(h))

    // teeth (breaks-on "`put` stores the body as offered; redaction is the caller's job"):
    assertExactBytes(stored, REDACTED_FORM)
    expect(byteOccurrences(stored, SECRET)).toBe(0)
    expect(dec.decode(stored)).toBe(REDACTED_FORM)
  })

  it("fetch() cannot recover the secret — not whole, and not in runs of >= 8 bytes", () => {
    const stored = roundTrip(enc.encode(RAW))
    expect(byteOccurrences(stored, SECRET)).toBe(0)
    // teeth (breaks-on "only the head of the credential is redacted; the greedy tail is stored raw"):
    expect(() => assertNoSecretRun(stored, SECRET)).not.toThrow()
  })

  it("a caller who has never heard of `scrub` cannot get a raw credential in, by any body shape", () => {
    const shapes = [
      `${SECRET}`,
      `prefix ${SECRET}`,
      `${SECRET} suffix`,
      `two ${SECRET} and ${SECRET_B} here`,
      `at the very end: ${SECRET_B}`,
      `Authorization: token ${SECRET}\nX-Other: ${SECRET_B}\n`,
    ]
    for (const s of shapes) {
      const stored = roundTrip(enc.encode(s))
      expect(byteOccurrences(stored, SECRET)).toBe(0)
      expect(byteOccurrences(stored, SECRET_B)).toBe(0)
      expect(() => assertNoSecretRun(stored, SECRET)).not.toThrow()
      expect(() => assertNoSecretRun(stored, SECRET_B)).not.toThrow()
    }
  })

  it("the git POINTER never digests the raw body — the hash addresses what is STORED", () => {
    const store = createTranscriptStore()
    const h = store.put(enc.encode(RAW))
    const stored = store.fetch(toGitPointer(h))
    // re-putting the fetched bytes yields the SAME hash: the pointer content-addresses its own return value,
    // so the digest was never taken over the secret.
    expect(store.put(stored)).toBe(h)
    expect(JSON.stringify(toGitPointer(h))).not.toContain(SECRET)
  })
})

describe("PERSIST-10a wiring — CONTROL (a): non-secret bodies round-trip byte-identical", () => {
  const CLEAN = [
    "seat brief\nLLM: reasoned\ntool: read(x)\nresult: 0..255 bytes retained in full\n",
    "ordinary transcript line with no credential at all\n",
    "near-miss: ghp_ABCDE has only five token chars, so it is NOT a credential shape",
    "near-miss: gha_ABCDEFGH is not a member of the ghp/gho/ghu/ghs/ghr family",
    "boundary bait: gh gho gho_ gho_1 gho_12345 all stop short of the floor",
    "utf-8 bytes and a tab: cafeé — quoted “x”\ttab\n",
    "a large transcript body — ".repeat(64),
  ]

  it("every clean body is byte-identical after put/fetch", () => {
    for (const text of CLEAN) {
      const src = enc.encode(text)
      // teeth (breaks-on "the wiring over-redacts, truncates, or normalises an ordinary body"):
      expect(Array.from(roundTrip(src))).toEqual(Array.from(src))
      expect(roundTrip(src).length).toBe(src.length)
    }
  })

  it("raw non-UTF8, high and NUL bytes survive put/fetch unchanged", () => {
    const raw = new Uint8Array([
      ...enc.encode("another agent total context\nbytes 0..255\n"),
      0x00,
      0xff,
      0x7f,
      0xfe,
      0x80,
    ])
    expect(Array.from(roundTrip(raw))).toEqual(Array.from(raw))
  })

  it("an empty body still round-trips", () => {
    expect(Array.from(roundTrip(new Uint8Array(0)))).toEqual([])
  })
})

describe("PERSIST-10a wiring — CONTROL (c): already-redacted content is not corrupted", () => {
  it("a body legitimately containing [REDACTED]abc123 survives byte-identical", () => {
    const text = "a line that literally contains the placeholder [REDACTED]abc123 already"
    const src = enc.encode(text)
    // teeth (breaks-on "the store re-scrubs and eats the token characters after a placeholder"):
    assertExactBytes(roundTrip(src), text)
    expect(Array.from(roundTrip(src))).toEqual(Array.from(src))
  })

  it("DOUBLE-SCRUB is a no-op: put(scrub(b)) and put(b) are the same object", () => {
    const store = createTranscriptStore()
    const src = enc.encode(RAW)
    // the old call shape (caller scrubs) and the new one (store scrubs) converge on one hash
    expect(store.put(scrub(src))).toBe(store.put(src))
    // and scrubbing the STORED bytes again changes nothing
    const stored = store.fetch(toGitPointer(store.put(src)))
    expect(Array.from(scrub(stored))).toEqual(Array.from(stored))
  })

  it("put is still idempotent on equal bodies (one object, one hash)", () => {
    const store = createTranscriptStore()
    const b = enc.encode(RAW)
    expect(store.put(b)).toBe(store.put(Uint8Array.from(b)))
  })
})

describe("PERSIST-10a wiring — CONTROL (d): chunk-independence holds THROUGH the store", () => {
  it("the stored bytes and hash do not depend on how the caller chunked the body", () => {
    const store = createTranscriptStore()
    const whole = `${PRE}${SECRET}${POST}`
    const reference = store.put(enc.encode(whole))
    expect(dec.decode(store.fetch(toGitPointer(reference)))).toBe(REDACTED_FORM)

    for (let off = 1; off < whole.length; off++) {
      // a streaming caller folds through the write gate, then puts the accumulated buffer
      const folded = store.put(admitAll([whole.slice(0, off), whole.slice(off)]))
      // teeth (breaks-on "the stored object depends on the caller's chunk boundaries"):
      expect(folded).toBe(reference)
      expect(Array.from(store.fetch(toGitPointer(folded)))).toEqual(Array.from(store.fetch(toGitPointer(reference))))
    }
  })

  it("byte-at-a-time and multi-secret streams converge on the same stored object", () => {
    const store = createTranscriptStore()
    const whole = `a ${SECRET} b ${SECRET_B} c`
    const reference = store.put(enc.encode(whole))
    expect(store.put(admitAll(whole.split("")))).toBe(reference)
    for (const size of [1, 2, 3, 5, 7, 11, 13]) {
      const parts: string[] = []
      for (let i = 0; i < whole.length; i += size) parts.push(whole.slice(i, i + size))
      expect(store.put(admitAll(parts))).toBe(reference)
    }
    expect(byteOccurrences(store.fetch(toGitPointer(reference)), SECRET)).toBe(0)
    expect(byteOccurrences(store.fetch(toGitPointer(reference)), SECRET_B)).toBe(0)
  })
})

describe("PERSIST-10a wiring — TOTAL and fail-closed", () => {
  // Bytes that cannot be read are WITHHELD, never forwarded. `put` must not throw and must not widen what
  // is stored; `fetch`'s existing not-found throw must survive untouched.
  const MALFORMED: unknown[] = [null, undefined, 0, 42, "", "ghp_ABCDEFGH", {}, [], NaN, true, () => 0]

  it("put never throws on malformed input, and stores nothing wider than empty", () => {
    const store = createTranscriptStore()
    for (const m of MALFORMED) {
      expect(() => store.put(m as Uint8Array)).not.toThrow()
      const stored = store.fetch(toGitPointer(store.put(m as Uint8Array)))
      // teeth (breaks-on "a non-byte input is stringified and stored"): the string 'ghp_ABCDEFGH' is in the
      // list precisely so a stringifying coercion would surface as a stored secret.
      expect(stored.length).toBe(0)
    }
  })

  it("a non-Uint8Array byte container is read and scrubbed, not dropped and not passed through", () => {
    const store = createTranscriptStore()
    const asInt8 = new Int8Array(enc.encode(`x ${SECRET} y`))
    const stored = store.fetch(toGitPointer(store.put(asInt8 as unknown as Uint8Array)))
    assertExactBytes(stored, "x [REDACTED] y")
  })

  it("fetch still throws for an unknown pointer (existing behaviour unchanged)", () => {
    const store = createTranscriptStore()
    expect(() => store.fetch({ sha: "not-a-stored-object" as never, store: "cas" })).toThrow(
      /transcript large-object not found/,
    )
  })
})
