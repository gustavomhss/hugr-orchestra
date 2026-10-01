// @atlas/persist — test/scrub-cross-family.test.ts  (WP-3.5-a.PERSIST · PERSIST-10a — CROSS-FAMILY GATE)
//
// The adjacency fix gave the credential body a negative lookahead so it could not swallow the family prefix
// of the credential written immediately after it. That lookahead blocked the shape's OWN prefix — and with
// exactly one family declared, nothing could tell that apart from blocking ALL of them. The moment a second
// family exists the difference is a live secret leak:
//
//     ghp_<body>xoxb-<body>   own-family lookahead ->  [REDACTED]-<body>    (second body in the clear)
//                             union lookahead      ->  [REDACTED][REDACTED]
//
// Every byte-exact expectation below carries its own MUTANT: the checker is first shown to THROW on the
// un-redacted form, so it cannot rot into a check that passes because it can no longer fail.
//
// FIXTURES are obviously-synthetic and carry NOTAREAL markers. Nothing here is or resembles a real
// credential: `ghp_SYNTHETICNOTAREALTOKEN01`, `xoxb-NOTAREAL-SLACKTOKEN-000`.

import { describe, it, expect } from "vitest"
import { scrub, admitToBuffer } from "../src/scrub.js"
import {
  AMBIGUOUS_TAIL,
  ANY_FAMILY_PREFIX,
  FAMILIES,
  MAX_CANON_MATCH,
  MAX_PARTIAL,
  MAX_SEAM_CARRY,
  REDACTION,
  SHAPES,
} from "../src/scrub-shapes.js"

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Obviously-synthetic, shape-matching fixtures (never a real credential). */
const GH = "ghp_SYNTHETICNOTAREALTOKEN01"
const GH2 = "gho_NOTAREALSECRET0987654321"
const SL = "xoxb-NOTAREAL-SLACKTOKEN-000"
const SL2 = "xoxp-NOTAREAL-SECOND-TOKEN-1"

/** BYTE-level occurrence count — a decoded-substring check can be satisfied by the wrong string. */
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
      const run = secret.slice(i, j)
      if (byteOccurrences(buf, run) !== 0) {
        throw new Error(`secret run "${run}" (len ${run.length}) survived in the buffer`)
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

/** Every chunking discipline the seam has to survive, applied to one text. */
function everyChunking(text: string): { label: string; parts: readonly string[] }[] {
  const out: { label: string; parts: readonly string[] }[] = []
  out.push({ label: "byte-at-a-time", parts: text.split("") })
  for (let off = 1; off < text.length; off++) {
    out.push({ label: `split@${off}`, parts: [text.slice(0, off), text.slice(off)] })
  }
  for (const size of [1, 2, 3, 5, 7, 11, 13]) {
    const parts: string[] = []
    for (let p = 0; p < text.length; p += size) parts.push(text.slice(p, p + size))
    out.push({ label: `size-${size}`, parts })
  }
  return out
}

// ── the assertions' own teeth ────────────────────────────────────────────────────────────────────────

describe("PERSIST-10a cross-family — the checkers can fail", () => {
  it("assertExactBytes and assertNoSecretRun THROW on the un-redacted form (mutant)", () => {
    const raw = enc.encode(`token=${GH}${SL} end`)
    expect(() => assertExactBytes(raw, "token=[REDACTED][REDACTED] end")).toThrow()
    expect(() => assertNoSecretRun(raw, GH)).toThrow(/survived in the buffer/)
    expect(() => assertNoSecretRun(raw, SL)).toThrow(/survived in the buffer/)
    // and they PASS on the correct form, so they are not simply always-throwing
    const done = scrub(raw)
    expect(() => assertExactBytes(done, "token=[REDACTED][REDACTED] end")).not.toThrow()
    expect(() => assertNoSecretRun(done, GH)).not.toThrow()
    expect(() => assertNoSecretRun(done, SL)).not.toThrow()
  })

  it("the leaked FORM the own-family lookahead produces is caught by these checkers (mutant)", () => {
    // `[REDACTED]-NOTAREAL-SLACKTOKEN-000` — the placeholder is present, so a naive "is there a placeholder"
    // check would pass it. The body check does not.
    const leaked = enc.encode(`token=[REDACTED]-NOTAREAL-SLACKTOKEN-000 end`)
    expect(() => assertNoSecretRun(leaked, SL)).toThrow(/survived in the buffer/)
    expect(() => assertExactBytes(leaked, "token=[REDACTED][REDACTED] end")).toThrow()
  })
})

// ── the declaration itself ───────────────────────────────────────────────────────────────────────────

describe("PERSIST-10a cross-family — the lookahead is the UNION of all declared families", () => {
  it("every shape blocks every family prefix, not just its own", () => {
    expect(FAMILIES.map((f) => f.name)).toEqual(["github-token", "slack-token", "github-pat", "aws-access-key-id"])
    expect(ANY_FAMILY_PREFIX).toBe("(?:gh[pousr]_|xox[baprs]-|github_pat_|AKIA)")
    for (const shape of SHAPES) {
      // teeth (breaks-on "the body lookahead names only the shape's own family prefix"):
      expect(shape.full.source).toContain(ANY_FAMILY_PREFIX)
      // the sticky atom the leftmost scan uses is the SAME source — one definition, two flags
      expect(shape.at.source).toBe(shape.full.source)
      expect(shape.at.flags).toBe("y")
      for (const f of FAMILIES) {
        expect(ANY_FAMILY_PREFIX).toContain(f.prefix.map((p) => (p.length === 1 ? p : `[${p}]`)).join(""))
      }
    }
  })

  it("GATE (1) PREFIX DISJOINTNESS — no two families can open at the same position", () => {
    // What replaced "no non-alphanumeric before the last prefix position". That old rule existed to keep a
    // per-shape ambiguous-tail derivation sound; the seam no longer derives one (it carries the raw
    // undecided suffix and re-scans), so the rule is dead. What the LEFTMOST scan needs instead is that at
    // most one family can start at any position — otherwise "the match at i" is not well defined and the
    // answer depends on declaration order, which is the exact defect the union lookahead was introduced to
    // kill one level up.
    const canBothOpen = (a: readonly string[], b: readonly string[]): boolean => {
      for (let k = 0; k < Math.min(a.length, b.length); k++) {
        if (![...(a[k] as string)].some((c) => (b[k] as string).includes(c))) return false
      }
      return true
    }
    for (let i = 0; i < FAMILIES.length; i++) {
      for (let j = i + 1; j < FAMILIES.length; j++) {
        expect([FAMILIES[i]!.name, FAMILIES[j]!.name, canBothOpen(FAMILIES[i]!.prefix, FAMILIES[j]!.prefix)]).toEqual([
          FAMILIES[i]!.name,
          FAMILIES[j]!.name,
          false,
        ])
      }
    }
    // teeth: the predicate really does catch an overlapping pair — a hypothetical `gh[po]_` would collide
    // with `gh[pousr]_` on `ghp_`/`gho_`, and `gh` alone would collide with every member of the family
    expect(canBothOpen(["g", "h", "pousr", "_"], ["g", "h", "po", "_"])).toBe(true)
    expect(canBothOpen(["g", "h", "pousr", "_"], ["g", "h"])).toBe(true)
    // …and it does NOT fire on the pairs that differ at some position (`ghp_` vs `github_pat_` at index 1)
    expect(canBothOpen(["g", "h", "pousr", "_"], ["g", "i", "t", "h"])).toBe(false)
  })

  it("GATE (2) REDACTION FITS — every family is at least as long as the placeholder it becomes", () => {
    // The seam emits `scrub(carry)` into the buffer and remembers its LENGTH as the rewritable window. That
    // window can only be bounded by the raw carry if redaction never LENGTHENS the text — i.e. if no family
    // can match fewer bytes than `[REDACTED]` occupies. A hypothetical `ab_XY` family would break the bound
    // silently, so it fails here instead.
    for (const shape of SHAPES) expect([shape.name, shape.minFull >= REDACTION.length]).toEqual([shape.name, true])
    expect(REDACTION.length).toBe(10)
    expect(Math.min(...SHAPES.map((s) => s.minFull))).toBe(10) // github-token, exactly at the floor
  })

  it("GATE (3) A PREFIX-FREE FILLER exists for every family", () => {
    // Canonicalising a multi-megabyte absorbed body means padding with a body character. If that character
    // could appear in a family prefix, the padding could INVENT a prefix that was never written. Every
    // family declared today gets `0`, because no declared prefix contains a digit.
    const prefixChars = new Set(FAMILIES.flatMap((f) => f.prefix.flatMap((set) => [...set])))
    for (const shape of SHAPES) {
      expect([shape.name, shape.filler]).toEqual([shape.name, "0"])
      expect(prefixChars.has(shape.filler)).toBe(false)
    }
  })

  it("GATE (4) the derived bounds are arithmetic on the declaration, and self-consistent", () => {
    for (const shape of SHAPES) {
      expect(shape.maxPartial).toBe(shape.minFull - 1)
    }
    // github-token 4+6, slack-token 5+6, github-pat 11+22, aws 4+16
    expect(SHAPES.map((s) => s.minFull)).toEqual([10, 11, 33, 20])
    expect(SHAPES.map((s) => s.maxPartial)).toEqual([9, 10, 32, 19])
    // AMBIGUOUS_TAIL = |github_pat_| - 1: the longest run that can still be a STRICT family prefix
    expect(AMBIGUOUS_TAIL).toBe(10)
    // maxCanon: unbounded -> minFull + AMBIGUOUS_TAIL ; bounded -> |prefix| + ceiling
    expect(SHAPES.map((s) => s.maxCanon)).toEqual([20, 21, 43, 20])
    expect(SHAPES.map((s) => s.ceiling)).toEqual([undefined, undefined, undefined, 16])
    expect(MAX_PARTIAL).toBe(32)
    expect(MAX_CANON_MATCH).toBe(43)
    expect(MAX_SEAM_CARRY).toBe(MAX_CANON_MATCH + MAX_PARTIAL - 1)
    expect(MAX_SEAM_CARRY).toBe(74)
  })
})

// ── the gate ─────────────────────────────────────────────────────────────────────────────────────────

describe("PERSIST-10a cross-family — adjacent credentials of DIFFERENT families", () => {
  const CASES: readonly {
    readonly name: string
    readonly text: string
    readonly want: string
    readonly secrets: readonly string[]
  }[] = [
    { name: "github then slack", text: `${GH}${SL}`, want: "[REDACTED][REDACTED]", secrets: [GH, SL] },
    { name: "slack then github", text: `${SL}${GH}`, want: "[REDACTED][REDACTED]", secrets: [SL, GH] },
    {
      name: "github slack github",
      text: `${GH}${SL}${GH2}`,
      want: "[REDACTED][REDACTED][REDACTED]",
      secrets: [GH, SL, GH2],
    },
    {
      name: "slack github slack",
      text: `${SL}${GH}${SL2}`,
      want: "[REDACTED][REDACTED][REDACTED]",
      secrets: [SL, GH, SL2],
    },
    { name: "framed", text: `log: ${GH}${SL} written`, want: "log: [REDACTED][REDACTED] written", secrets: [GH, SL] },
    { name: "separated by _", text: `${GH}_${SL}`, want: "[REDACTED]_[REDACTED]", secrets: [GH, SL] },
  ]

  for (const c of CASES) {
    it(`${c.name}: whole-buffer redacts BOTH, byte-exactly`, () => {
      const got = scrub(enc.encode(c.text))
      // teeth (breaks-on "the first body swallows the second family's prefix, so the second ships as
      // `[REDACTED]-<body>`"):
      assertExactBytes(got, c.want)
      for (const s of c.secrets) {
        expect(byteOccurrences(got, s)).toBe(0)
        assertNoSecretRun(got, s)
      }
    })

    it(`${c.name}: EVERY chunking folds to the identical bytes`, () => {
      const reference = enc.encode(c.want)
      for (const { label, parts } of everyChunking(c.text)) {
        const got = admitAll(parts)
        // teeth (breaks-on "the union lookahead cannot see across a chunk seam, so a streaming caller
        // still admits the second credential's body"):
        try {
          assertExactBytes(got, c.want)
        } catch (e) {
          throw new Error(`${label}: ${(e as Error).message}`)
        }
        expect(Array.from(got)).toEqual(Array.from(reference))
        for (const s of c.secrets) assertNoSecretRun(got, s)
      }
    })

    it(`${c.name}: the invariant holds at EVERY PREFIX, not only at the end`, () => {
      for (const size of [1, 2, 3, 5, 7, 11, 13]) {
        let buf: Uint8Array = new Uint8Array(0)
        let acc = ""
        for (let p = 0; p < c.text.length; p += size) {
          const part = c.text.slice(p, p + size)
          buf = admitToBuffer(buf, enc.encode(part))
          acc += part
          expect(dec.decode(buf)).toBe(scrubText(acc))
        }
      }
    })
  }
})

describe("PERSIST-10a cross-family — the contingent tail, across families", () => {
  it("a github body ending in `xoxb` is a credential only until the `-` arrives", () => {
    // `ghp_ABCDExoxb` is a complete github-token match ONLY while `xoxb` counts as body; drop those four
    // bytes and the body is five characters, one short of the floor. One more byte decides it.
    const stem = "ghp_ABCDExoxb"
    expect(scrubText(stem)).toBe("[REDACTED]") // alone, it IS a credential
    // ...and the `-` un-makes it, promoting `xoxb-` to the head of a SLACK credential
    expect(scrubText(`${stem}-ABCDEF`)).toBe("ghp_ABCDE[REDACTED]")
    // the streaming path must agree at every split, including the one placed inside the ambiguity
    for (const { label, parts } of everyChunking(`${stem}-ABCDEF`)) {
      const got = dec.decode(admitAll(parts))
      if (got !== "ghp_ABCDE[REDACTED]") throw new Error(`${label}: ${JSON.stringify(got)}`)
    }
    // mid-stream the buffer holds the SCRUBBED reading, never the raw candidate
    const partial = admitToBuffer(new Uint8Array(0), enc.encode(stem))
    assertExactBytes(partial, "[REDACTED]")
    assertExactBytes(admitToBuffer(partial, enc.encode("-ABCDEF")), "ghp_ABCDE[REDACTED]")
  })

  it("a slack body ending in `ghp` is a credential only until the `_` arrives", () => {
    const stem = "xoxb-ABCDEghp"
    expect(scrubText(stem)).toBe("[REDACTED]")
    expect(scrubText(`${stem}_ABCDEF`)).toBe("xoxb-ABCDE[REDACTED]")
    for (const { label, parts } of everyChunking(`${stem}_ABCDEF`)) {
      const got = dec.decode(admitAll(parts))
      if (got !== "xoxb-ABCDE[REDACTED]") throw new Error(`${label}: ${JSON.stringify(got)}`)
    }
  })
})

describe("PERSIST-10a cross-family — the DECLARED Slack over-redaction", () => {
  // `-` is both the Slack segment separator and, necessarily, a Slack body character: a real token is
  // `xoxb-<id>-<id>-<secret>`, so excluding `-` would match only the first segment and ship the trailing
  // entropy-bearing segment in the clear. The cost is that hyphen-joined NON-secret text immediately after
  // a Slack token is absorbed. This test pins that cost so it can never be discovered by surprise.
  it("hyphen-joined text after a Slack token IS absorbed — the accepted cost, pinned", () => {
    expect(scrubText("xoxb-A1B2C3-not-part-of-token")).toBe("[REDACTED]")
    // it stops at the first non-body byte, so the damage is bounded and never reaches the next line
    expect(scrubText("xoxb-A1B2C3-not-part-of-token end of line")).toBe("[REDACTED] end of line")
    expect(scrubText("xoxb-A1B2C3-not-part\nnext line")).toBe("[REDACTED]\nnext line")
    expect(scrubText('xoxb-A1B2C3-not="quoted"')).toBe('[REDACTED]="quoted"')
    // and the streaming path over-redacts identically — the cost does not depend on chunking
    for (const { parts } of everyChunking("xoxb-A1B2C3-not-part-of-token end of line")) {
      expect(dec.decode(admitAll(parts))).toBe("[REDACTED] end of line")
    }
  })

  it("the GitHub family is NOT affected — `-` and `_` terminate its body", () => {
    expect(scrubText("ghp_A1B2C3D4-not-part-of-token")).toBe("[REDACTED]-not-part-of-token")
    expect(scrubText("ghp_A1B2C3D4_prod")).toBe("[REDACTED]_prod")
  })

  it("the KNOWN pre-existing absorption of trailing alphanumerics is unchanged by this seat", () => {
    // Not introduced here and not fixed here: `{6,}` is unbounded, so trailing token characters are eaten.
    expect(scrubText("ghp_A1B2C3D4foo")).toBe("[REDACTED]")
    expect(scrubText("xoxb-A1B2C3D4foo")).toBe("[REDACTED]")
  })
})

describe("PERSIST-10a cross-family — an undeclared shape is NOT redacted, and says so", () => {
  it("only the declared families are covered — everything else passes through verbatim", () => {
    // The honest scope. These are all real credential shapes; none is declared, so none is redacted.
    for (const undeclared of [
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.NOTAREALSIGNATURE", // JWT — multi-segment, `.` is not a body char
      "-----BEGIN PRIVATE KEY-----NOTAREAL-----END PRIVATE KEY-----", // PEM — needs a terminator field
      "aws_secret_access_key=NOTAREALwJalrXUtnFEMIK7MDENGbPxRfiCYNOTAREAL", // AWS SECRET — no prefix at all
    ]) {
      expect(scrubText(undeclared)).toBe(undeclared)
    }
  })

  it("the two families this seat DECLARED are covered — and that is what changed", () => {
    // `github_pat_` and `AKIA` were on the undeclared list above until this seat reworked the seam. They
    // are here, in the same file, so the scope claim and its complement cannot drift apart.
    expect(scrubText("github_pat_11ABCDEFG0abcdefghij_KLMNOPQRSTUVWXYZ012345")).toBe("[REDACTED]")
    expect(scrubText("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED]")
  })
})
