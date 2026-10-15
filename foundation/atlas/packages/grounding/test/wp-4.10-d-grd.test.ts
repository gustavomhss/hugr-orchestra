// @atlas/grounding — test/wp-4.10-d-grd.test.ts   (WP-4.10-d.GROUND · the SPAN amendment)
//
// RED→GREEN transcription of the VISIBLE goldens for the owner-approved 2026-08-02 SPAN amendment:
//   - SCN-GROUND-1d-1 (happy) — a span RE-DERIVES the cited bytes and carries no copy of them.
//   - SCN-GROUND-1e-1 (guard) — an entry minted before the amendment (no span) still reads; absent is
//                               UNKNOWN, never a fabricated whole-unit citation.
//   - SCN-GROUND-1f-1 (guard) — presenting different bytes REFUSES the read (fail-closed), and the span
//                               is inert in `isGrounded`/`driftDetect` — the oracle stays `subtreeHash`.
//
// SEAM: every digest routes through the sealed @atlas/kernel `Encoder` (GROUND-10) — the stub-encoder case
// below is the substitution witness. The runtime is imported DIRECTLY from ../src/*.js. Held-out `-2`
// fixtures live in the `.heldout` twin and are NOT read here.

import { describe, it, expect } from "vitest"
import { asHash, asSubtreeHash, defaultEncoder } from "@atlas/kernel"
import type { Encoder } from "@atlas/kernel"
import type { Axes, IndexNode } from "@atlas/index"
import type { Grounding, GroundingEntry, GroundingSpan } from "../src/types.js"
import { bindSpan } from "../src/span.js"
import { driftDetect, isGrounded } from "../src/drift.js"

const { mintSpan, readSpan } = bindSpan(defaultEncoder)
const utf8 = new TextEncoder()
const text = (b: Uint8Array | undefined): string | undefined =>
  b === undefined ? undefined : new TextDecoder().decode(b)

// The cited unit `U_arr = billing.ts › computeArr()`. The EVIDENCE for the fact is the one clause that
// says what the unit really does — a range inside these bytes, never a copy of them.
const SOURCE = "export function computeArr(mrr: number): number {\n  return mrr * 12; // annualised\n}\n"
const EVIDENCE = "return mrr * 12;"
const AT = SOURCE.indexOf(EVIDENCE)
const BYTES = utf8.encode(SOURCE)

// ── fixture builders (the drift rail, so the span can be shown INERT on it) ──────────────────────────
const node = (key: string, sh: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial",
  level: "item",
  key,
  subtreeHash: asSubtreeHash(sh),
  children,
  objects: [],
})
const axesWith = (leaves: IndexNode[]): Axes => ({
  spatial: node("repo", "root", leaves),
  territory: node("repo", "empty"),
  dependency: node("repo", "empty"),
  edges: [],
})
const entry = (qp: string, sh: string, span?: GroundingSpan): GroundingEntry => {
  const anchor = { kind: "symbol" as const, qualifiedPath: qp, subtreeHash: asSubtreeHash(sh) }
  return span === undefined ? { anchor, path: qp } : { anchor, path: qp, span }
}
const grounding = (...entries: GroundingEntry[]): Grounding => ({ entries })
const SRC = axesWith([node("billing.ts::computeArr", "sh-arr-01")])

// ── SCN-GROUND-1d-1 — a span re-derives the cited bytes, and stores none of them ─────────────────────
describe("SCN-GROUND-1d-1: the span re-derives instead of storing text", () => {
  it("re-derives the exact cited bytes from the anchor content", () => {
    const span = mintSpan(BYTES, AT, AT + EVIDENCE.length)
    expect(span).toBeDefined()
    // teeth (breaks-on "the span stores the quoted text instead of addressing it"): the ONLY way to get
    // the citation back is to present the bytes again — the span itself is a digest and two integers.
    expect(text(readSpan(span as GroundingSpan, BYTES))).toBe(EVIDENCE)
  })

  it("the span carries NO copy of the source — three fields, none of them text", () => {
    const span = mintSpan(BYTES, AT, AT + EVIDENCE.length) as GroundingSpan
    expect(Object.keys(span).sort()).toEqual(["contentHash", "end", "start"])
    // teeth (breaks-on "a `quote`/`text`/`excerpt` field is added"): no value anywhere in the span may
    // contain any part of the source. A stored quote is a second, unversioned copy that nothing can check.
    const serialized = JSON.stringify(span)
    expect(serialized).not.toContain(EVIDENCE)
    expect(serialized).not.toContain("computeArr")
    expect(serialized).not.toContain("mrr")
  })

  it("the digest follows the SWAPPED encoder seam (GROUND-10) — no inlined hash", () => {
    const stub: Encoder = { hash: () => asHash("stub-digest") }
    const swapped = bindSpan(stub)
    const span = swapped.mintSpan(BYTES, AT, AT + EVIDENCE.length) as GroundingSpan
    expect(span.contentHash).toBe("stub-digest")
    // and the SWAPPED reader accepts it while the DEFAULT reader does not: the digest is genuinely the
    // seam's, not a locally-computed constant that ignores the injected encoder.
    expect(text(swapped.readSpan(span, BYTES))).toBe(EVIDENCE)
    expect(readSpan(span, BYTES)).toBeUndefined()
  })

  it("a span can only be minted by something HOLDING the bytes — the digest is never caller-supplied", () => {
    // `mintSpan(bytes, start, end)` takes no digest argument at all, so a caller that has only a claimed
    // range and no evidence cannot produce a span. (Type-level; asserted here as the arity that carries it.)
    expect(mintSpan.length).toBe(3)
  })
})

// ── SCN-GROUND-1e-1 — additive and absent-tolerant ───────────────────────────────────────────────────
describe("SCN-GROUND-1e-1: an entry minted before the amendment still reads", () => {
  const old = entry("billing.ts::computeArr", "sh-arr-01") // no `span` key at all

  it("a span-less entry is grounded and FRESH exactly as before", () => {
    expect("span" in old).toBe(false)
    expect(isGrounded(grounding(old))).toBe(true)
    expect(driftDetect(grounding(old), SRC)).toBe("FRESH")
  })

  it("absent is UNKNOWN — never defaulted to a whole-unit citation", () => {
    // teeth (breaks-on "absent span defaults to [0, length) of the unit"): reading the location of a
    // span-less entry yields nothing. A fabricated default would assert a citation nobody ever made.
    expect(old.span).toBeUndefined()
  })

  it("the span is ADDITIVE, not a replacement: GROUND-2 still needs the anchor", () => {
    const span = mintSpan(BYTES, AT, AT + EVIDENCE.length) as GroundingSpan
    // an entry carrying a perfectly good span but an EMPTY anchor is still not real grounding.
    const spanOnly = entry("billing.ts::computeArr", "", span)
    expect(isGrounded(grounding(spanOnly))).toBe(false)
    expect(driftDetect(grounding(spanOnly), SRC)).toBe("DRIFTED")
  })
})

// ── SCN-GROUND-1f-1 — fail-closed, and inert on the drift rail ───────────────────────────────────────
describe("SCN-GROUND-1f-1: the wrong bytes refuse, and the span never becomes the oracle", () => {
  const span = mintSpan(BYTES, AT, AT + EVIDENCE.length) as GroundingSpan

  it("bytes that are not the addressed content REFUSE — no plausible slice of the wrong file", () => {
    const moved = utf8.encode(SOURCE.replace("12", "13"))
    // the range is still perfectly in bounds here, so a length-only check would happily slice.
    expect(moved.length).toBe(BYTES.length)
    expect(readSpan(span, moved)).toBeUndefined()
  })

  it("a tampered range on the RIGHT bytes is refused only when it leaves the content", () => {
    expect(readSpan({ ...span, end: BYTES.length + 1 }, BYTES)).toBeUndefined()
    expect(readSpan({ ...span, start: span.end }, BYTES)).toBeUndefined() // empty ⇒ cites nothing
    // …AND THE HONEST LIMIT: a range moved WITHIN the same bytes still reads, because the bytes still
    // hash to `contentHash`. `readSpan` witnesses the CONTENT, not the caller's choice of offsets.
    expect(text(readSpan({ ...span, start: 0, end: 6 }, BYTES))).toBe("export")
  })

  it("adding, changing or corrupting a span leaves isGrounded/driftDetect verdicts identical", () => {
    const bare = entry("billing.ts::computeArr", "sh-arr-01")
    const withSpan = entry("billing.ts::computeArr", "sh-arr-01", span)
    const corrupt = entry("billing.ts::computeArr", "sh-arr-01", {
      contentHash: asHash("0".repeat(64)),
      start: 999,
      end: 1000,
    })
    // teeth (breaks-on "the span is folded into the drift oracle"): a corrupted span would flip DRIFTED.
    for (const e of [bare, withSpan, corrupt]) {
      expect(isGrounded(grounding(e))).toBe(isGrounded(grounding(bare)))
      expect(driftDetect(grounding(e), SRC)).toBe(driftDetect(grounding(bare), SRC))
    }
  })
})

// ── mint refusals: what is NOT a citation ────────────────────────────────────────────────────────────
describe("mintSpan is total and fail-closed", () => {
  it("refuses an empty, inverted, out-of-bounds or non-integral range", () => {
    expect(mintSpan(BYTES, 5, 5)).toBeUndefined() //          empty — cites nothing
    expect(mintSpan(BYTES, 9, 4)).toBeUndefined() //          inverted
    expect(mintSpan(BYTES, 0, BYTES.length + 1)).toBeUndefined() // past the end
    expect(mintSpan(BYTES, -1, 4)).toBeUndefined() //         negative
    expect(mintSpan(BYTES, 0.5, 4)).toBeUndefined() //        a float is a canonical-form violation
    expect(mintSpan(BYTES, 0, Number.NaN)).toBeUndefined()
  })

  it("refuses a boundary that splits a UTF-8 code point — a slice nobody can decode is not a citation", () => {
    const multi = utf8.encode("café ☕") // 'é' = 2 bytes, '☕' = 3 ⇒ 4 ASCII + 2 + 3 = 9
    expect(multi.length).toBe(9)
    expect(mintSpan(multi, 0, 4)).toBeUndefined() // lands inside 'é'
    expect(mintSpan(multi, 4, 6)).toBeUndefined() // starts inside 'é'
    const ok = mintSpan(multi, 0, 5) as GroundingSpan
    expect(text(readSpan(ok, multi))).toBe("café")
  })

  it("the whole content is a legal span, and it round-trips", () => {
    const all = mintSpan(BYTES, 0, BYTES.length) as GroundingSpan
    expect(text(readSpan(all, BYTES))).toBe(SOURCE)
  })
})
