// @atlas/grounding — test/wp-4.10-d-grd.heldout.test.ts   (WP-4.10-d.GROUND · HELD-OUT twins)
//
// The independent second fixture family for the SPAN amendment: a DIFFERENT unit (`pricing.ts ›
// computeVat()`), different evidence, different offsets, and a range sweep instead of one hand-picked
// citation. Same frozen behaviour, no new behaviour invented.
//   - SCN-GROUND-1d-2 (held-out) — the span re-derives on an unrelated fixture, and over EVERY legal range.
//   - SCN-GROUND-1f-2 (held-out) — an edit anywhere in the addressed bytes refuses the read, including one
//                                  that leaves the length identical and lands OUTSIDE the cited range.

import { describe, it, expect } from "vitest"
import { defaultEncoder } from "@atlas/kernel"
import type { GroundingSpan } from "../src/types.js"
import { bindSpan } from "../src/span.js"

const { mintSpan, readSpan } = bindSpan(defaultEncoder)
const utf8 = new TextEncoder()
const dec = new TextDecoder()

const SOURCE = "export const computeVat = (net: number) => net * 0.2; // NOT 0.19 since 2021\n"
const BYTES = utf8.encode(SOURCE)
const EVIDENCE = "NOT 0.19 since 2021"
const AT = SOURCE.indexOf(EVIDENCE)

describe("SCN-GROUND-1d-2 (held-out): re-derivation on an independent fixture", () => {
  it("the cited comment comes back byte-exact", () => {
    const span = mintSpan(BYTES, AT, AT + EVIDENCE.length) as GroundingSpan
    expect(dec.decode(readSpan(span, BYTES))).toBe(EVIDENCE)
  })

  it("EVERY legal range round-trips — the citation is a function of the bytes, not of this one offset", () => {
    // ASCII fixture, so every boundary is a code-point boundary: the sweep is total over legal ranges.
    let checked = 0
    for (let s = 0; s < BYTES.length; s += 7) {
      for (let e = s + 1; e <= BYTES.length; e += 11) {
        const span = mintSpan(BYTES, s, e) as GroundingSpan
        expect(dec.decode(readSpan(span, BYTES))).toBe(SOURCE.slice(s, e))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it("no range of any size carries the text with it", () => {
    for (const [s, e] of [
      [0, 6],
      [AT, AT + EVIDENCE.length],
      [0, BYTES.length],
    ]) {
      const span = mintSpan(BYTES, s as number, e as number) as GroundingSpan
      expect(JSON.stringify(span)).not.toContain(SOURCE.slice(s as number, e as number))
    }
  })
})

describe("SCN-GROUND-1f-2 (held-out): the wrong bytes never yield a citation", () => {
  const span = mintSpan(BYTES, AT, AT + EVIDENCE.length) as GroundingSpan

  it("an edit OUTSIDE the cited range still refuses — the span addresses the whole content", () => {
    const edited = utf8.encode(SOURCE.replace("net * 0.2", "net * 0.3"))
    expect(edited.length).toBe(BYTES.length) // same length, same offsets — only a hash can tell
    expect(readSpan(span, edited)).toBeUndefined()
  })

  it("empty bytes, truncated bytes and appended bytes are all refused", () => {
    expect(readSpan(span, new Uint8Array(0))).toBeUndefined()
    expect(readSpan(span, BYTES.slice(0, BYTES.length - 1))).toBeUndefined()
    expect(readSpan(span, utf8.encode(`${SOURCE}\n`))).toBeUndefined()
  })

  it("a span whose digest was swapped for another real content digest is refused", () => {
    const other = utf8.encode("unrelated file contents\n")
    const otherSpan = mintSpan(other, 0, 9) as GroundingSpan
    expect(readSpan({ ...span, contentHash: otherSpan.contentHash }, BYTES)).toBeUndefined()
  })
})
