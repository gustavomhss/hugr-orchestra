// @atlas/grounding — test/wp-4.10-d-grd.units.test.ts   (WP-4.10-d.GROUND · task #159)
//
// RED→GREEN transcription of the VISIBLE goldens added by task #159:
//   - SCN-GROUND-1g-1 (guard) — a multi-byte character BEFORE the anchored unit does not move the
//                               citation, and the UTF-16 offset a parser reports is NOT the byte offset
//                               this type declares. The mis-unit read is shown to be UNREFUSED.
//   - SCN-GROUND-1g-2 (guard) — a `file`-kind entry carries no span at all, and the digest survives the
//                               UTF-8 round trip for well-formed input while refusing malformed input.
// Plus the two measurements this card was required to PIN rather than assert:
//   - Q1: the span is OUT of fact identity (`grounding` never reaches the canonical preimage, KERNEL-8).
//   - the per-`StructRef.kind` semantics stated on `GroundingSpan`.
//
// WHY AN ASCII FIXTURE WOULD PROVE NOTHING: for pure ASCII, UTF-8 bytes, UTF-16 code units and code
// points are all the same number, so every wrong-unit bug reads clean. Every fixture here is chosen so
// the three counting systems DISAGREE.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, defaultEncoder, id, canonicalForm } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { GroundingEntry } from "../src/types.js"
import { bindSpan } from "../src/span.js"

const { mintSpan, readSpan } = bindSpan(defaultEncoder)
const utf8 = new TextEncoder()
const utf16 = (s: string): number => s.length
const bytesOf = (s: string): number => utf8.encode(s).length
const decode = (b: Uint8Array | undefined): string | undefined =>
  b === undefined ? undefined : new TextDecoder().decode(b)

// `B_uni` — the anchored unit is preceded by a 3-byte `é`, a 3-byte `☕` and a 4-byte astral `🚀`, so the
// unit's UTF-16 offset and its UTF-8 byte offset differ. This is the shape #182 will mint from.
const B_UNI_SRC =
  "// café ☕ — a multi-byte prefix that sits BEFORE the anchored unit\n" +
  'const emoji = "🚀 launch";\n' +
  "export function validaçãoDePagamento(valor: number): boolean {\n" +
  "  return valor > 0;\n" +
  "}\n"
const UNIT = "export function validaçãoDePagamento(valor: number): boolean {\n  return valor > 0;\n}"
const B_UNI = utf8.encode(B_UNI_SRC)

describe("SCN-GROUND-1g-1 — the offsets are UTF-8 BYTES, and the parser does not count them", () => {
  it("the fixture actually makes the three counting systems disagree (else this file proves nothing)", () => {
    expect(utf16(B_UNI_SRC)).not.toBe(bytesOf(B_UNI_SRC))
    expect([...B_UNI_SRC].length).not.toBe(bytesOf(B_UNI_SRC))
  })

  it("addressed BY BYTE OFFSET, the citation comes back byte-for-byte identical to the unit", () => {
    const start = bytesOf(B_UNI_SRC.slice(0, B_UNI_SRC.indexOf(UNIT)))
    const span = mintSpan(B_UNI, start, start + bytesOf(UNIT))
    expect(span).toBeDefined()
    // byte-identical, not merely "looks right": compare the raw bytes.
    const got = readSpan(span!, B_UNI)
    expect(got).toBeDefined()
    expect(Array.from(got!)).toEqual(Array.from(utf8.encode(UNIT)))
    expect(decode(got)).toBe(UNIT)
  })

  it("the UTF-16 offset a parser reports is 7 LESS than the byte offset, and citing with it is NOT refused", () => {
    const u16Start = B_UNI_SRC.indexOf(UNIT) //          what `web-tree-sitter`/`String.slice` count
    const byteStart = bytesOf(B_UNI_SRC.slice(0, u16Start)) // what `GroundingSpan` declares
    expect(byteStart - u16Start).toBe(7) // é(+1) ☕(+2) —(+2) 🚀(+2) — measured, not assumed

    // THE HAZARD, executed: mint from the UTF-16 value as if it were a byte offset.
    const wrong = mintSpan(B_UNI, u16Start, u16Start + utf16(UNIT))
    expect(wrong).toBeDefined() //                    minting SUCCEEDS — nothing rejects a mis-unit offset
    const slice = decode(readSpan(wrong!, B_UNI))
    expect(slice).toBeDefined() //                    reading SUCCEEDS — the digest cannot detect this
    expect(slice).not.toBe(UNIT) //                   …and it is the WRONG text
    expect(slice!.startsWith('unch";\nexport function')).toBe(true) // shifted by exactly 7 bytes
  })

  it("`splitsCodePoint` is NOT the safety net — it rejects only a mid-code-point boundary", () => {
    const u16Start = B_UNI_SRC.indexOf(UNIT)
    expect((B_UNI[u16Start] as number) & 0xc0).not.toBe(0x80) // a valid boundary, so the guard passes it
    // …whereas a boundary INSIDE the astral 🚀 is refused, which is the guard's actual (narrower) job.
    const inRocket = bytesOf(B_UNI_SRC.slice(0, B_UNI_SRC.indexOf("🚀"))) + 1
    expect(mintSpan(B_UNI, inRocket, inRocket + 4)).toBeUndefined()
  })
})

describe("SCN-GROUND-1g-2 — a `file` anchor carries no span; the digest survives the UTF-8 round trip", () => {
  const site = (kind: StructRef["kind"]): StructRef => ({
    kind,
    qualifiedPath: "src/pay.ts",
    subtreeHash: asSubtreeHash("sh-pay-01"),
  })

  it("a `file`-kind entry has NO span key — not `0..len`, not `0..0`, not a sentinel", () => {
    // The shape the shipped mine path produces (measured on the built binary, task #159).
    const entry: GroundingEntry = { anchor: site("file"), path: "src/pay.ts" }
    expect("span" in entry).toBe(false)
    expect(entry.span).toBeUndefined()
    // and the degenerate values the rule forbids are refused by the minter itself:
    expect(mintSpan(B_UNI, 0, 0)).toBeUndefined() // empty cites nothing
  })

  it("an entry for a sub-file kind MAY carry one, and it round-trips", () => {
    const start = bytesOf(B_UNI_SRC.slice(0, B_UNI_SRC.indexOf(UNIT)))
    const span = mintSpan(B_UNI, start, start + bytesOf(UNIT))
    const entry: GroundingEntry = { anchor: site("symbol"), path: "src/pay.ts", span: span! }
    expect(decode(readSpan(entry.span!, B_UNI))).toBe(UNIT)
  })

  it("WELL-FORMED UTF-8 round-trips byte-exactly — astral and NFD both", () => {
    for (const s of ["ascii only\n", "// café ☕ 🚀\n", "// café NFD-decomposed\n"]) {
      const re = utf8.encode(s) //          decode-then-encode, as the shipped reader does
      const raw = Buffer.from(s, "utf8") // the file's stored bytes
      expect(Buffer.compare(raw, Buffer.from(re))).toBe(0)
      const span = mintSpan(re, 0, re.length)
      expect(decode(readSpan(span!, new Uint8Array(raw)))).toBe(s) // reads against the RAW bytes
    }
  })

  it("MALFORMED UTF-8 does NOT round-trip, and the read REFUSES rather than citing wrong bytes", () => {
    const raw = Buffer.concat([Buffer.from('const a = "', "utf8"), Buffer.from([0xff]), Buffer.from('";\n', "utf8")])
    const re = utf8.encode(raw.toString("utf8")) // 0xFF -> U+FFFD, two bytes longer
    expect(re.length).toBe(raw.length + 2)
    const span = mintSpan(re, 0, re.length)
    expect(readSpan(span!, re)).toBeDefined() //                 the bytes that were cited
    expect(readSpan(span!, new Uint8Array(raw))).toBeUndefined() // the raw file: fail-closed

    // The refusal above is attributable to the LENGTH, so on its own it would survive deleting the digest
    // check entirely (measured: mutant M2, task #159). This leg makes the DIGEST do the work — same length,
    // different content, every offset still in bounds.
    const twin = utf8.encode(raw.toString("utf8").replace("const", "CONST"))
    expect(twin.length).toBe(re.length)
    expect(readSpan(span!, twin)).toBeUndefined()
  })
})

describe("the span is OUT of fact identity (KERNEL-8) — measured, so no store migration is implied", () => {
  const anchor: StructRef = { kind: "symbol", qualifiedPath: "src/a.ts::charge", subtreeHash: asSubtreeHash("sh-1") }
  const fact = (span?: GroundingEntry["span"]): Record<string, unknown> => ({
    kind: "advisory",
    tier: "T2",
    claimNorm: "charge validates the amount",
    grounding: { entries: [span === undefined ? { anchor, path: "src/a.ts" } : { anchor, path: "src/a.ts", span }] },
  })

  it("adding, changing or removing a span leaves the fact id BIT-IDENTICAL", () => {
    const a = id(fact() as never)
    const b = id(fact({ contentHash: defaultEncoder.hash(B_UNI), start: 7, end: 12 }) as never)
    const c = id(fact({ contentHash: defaultEncoder.hash(utf8.encode("other")), start: 0, end: 3 }) as never)
    expect(b).toBe(a)
    expect(c).toBe(a)
    // …and the preimage is byte-identical, which is the REASON, not a coincidence of hashing.
    expect(
      Array.from(canonicalForm(fact({ contentHash: defaultEncoder.hash(B_UNI), start: 7, end: 12 }) as never)),
    ).toEqual(Array.from(canonicalForm(fact() as never)))
  })

  it("CONTROL — a field INSIDE the preimage does move the id, so the assertion above is live", () => {
    const a = id(fact() as never)
    const moved = id({ ...fact(), claimNorm: "charge validates the AMOUNT" } as never)
    expect(moved).not.toBe(a)
  })
})
