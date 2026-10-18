// @atlas/persist — test/scrub-adjacent-fuzz.test.ts  (WP-3.5-a.PERSIST · PERSIST-10a — ADJACENCY FUZZ)
//
// WHY THIS FILE EXISTS. The shipped differential sweep injects EXACTLY ONE token per case, so two credentials
// with nothing between them are never generated and the whole ADJACENCY class is unreachable by it. A
// generator that cannot reach the failing region is indistinguishable from a passing test — and that is
// precisely how `ghp_AAAAAAghp_BBBBBB` -> `[REDACTED]_BBBBBB` survived a green suite: the greedy body of the
// first credential swallowed the second one's family prefix and shipped its entropy-bearing body in the clear.
//
// THE SAME MISTAKE, ONE LEVEL UP. The fix for that was a negative lookahead on the body class — but it blocked
// only the shape's OWN family prefix, and the corpus contained only ONE family, so the corpus could not tell
// an own-family lookahead from a union one. The moment a second family is declared, `ghp_AAAAAA` +
// `xoxb-BBBBBB` merges exactly as before. This generator therefore draws the family of EVERY token
// independently, so runs are CROSS-FAMILY, and the known-bad below is the own-family lookahead itself. FOUR
// families now (#120 added `github_pat_` + AWS); per-family evidence in scrub-declared-families.test.ts.
// The generator carries its own GROUND TRUTH from the construction — not from the implementation:
//   * every injected body must be absent from the output          (LEAK)
//   * every clean piece must survive verbatim                     (OVER-REDACTION)
//   * the output must equal the constructed expectation           (EXACT)
//   * an independent, regex-free scanner must agree with it       (the generator itself is checked)
//
// FIXTURES are obviously-synthetic: every token body is randomly generated from the seeded LCG and the
// fixed near-miss pieces are hand-written markers. Nothing here is or resembles a real credential.

import { describe, it, expect } from "vitest"
import { scrub, admitToBuffer } from "../src/scrub.js"
import {
  BODY_OPENING_PIECES,
  CLEAN_PIECES,
  ORACLE_FAMILIES,
  chunkRandomly,
  credentialSpans,
  hasCredentialShape,
  isBodyChar,
  lcg,
  makeCase,
  referenceScrub,
  wouldDisturb,
} from "./adjacency-oracle.js"

const enc = new TextEncoder()
const dec = new TextDecoder()

const scrubText = (s: string): string => dec.decode(scrub(enc.encode(s)))

function admitAll(parts: readonly string[]): string {
  let buf: Uint8Array = new Uint8Array(0)
  for (const p of parts) buf = admitToBuffer(buf, enc.encode(p))
  return dec.decode(buf)
}

function occurrences(hay: string, needle: string): number {
  let n = 0
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) n++
  return n
}

/** THE KNOWN-BAD, kept inside the suite so the corpus is provably able to fail: the shape set as it would be
 *  written with each family blocking only ITS OWN prefix — a silent reopening of the cross-family defect. */
function ownFamilyOnly(s: string): string {
  const bad: RegExp[] = [
    /gh[pousr]_(?:(?!gh[pousr]_)[A-Za-z0-9]){6,}/g,
    /xox[baprs]-(?:(?!xox[baprs]-)[A-Za-z0-9-]){6,}/g,
    /github_pat_(?:(?!github_pat_)[A-Za-z0-9_]){22,}/g,
    /AKIA(?:(?!AKIA)[0-9A-Z]){16}/g,
  ]
  let out = s
  for (const re of bad) out = out.replace(re, "[REDACTED]")
  return out
}

interface Tally {
  cases: number
  leak: number
  over: number
  residual: number
  mismatch: number
  generator: number
}

const blank = (): Tally => ({ cases: 0, leak: 0, over: 0, residual: 0, mismatch: 0, generator: 0 })

/** Score one produced output against the construction's ground truth. */
function score(
  t: Tally,
  c: { text: string; expected: string; bodies: readonly string[]; clean: readonly string[] },
  actual: string,
): void {
  t.cases++
  // the generator itself is under test: the construction and the independent regex-free scanner must agree
  if (referenceScrub(c.text) !== c.expected) t.generator++
  if (actual !== c.expected) t.mismatch++
  // LEAK — an injected body survives in the clear although the correct output does not contain it
  for (const body of c.bodies) {
    if (occurrences(actual, body) > occurrences(c.expected, body)) {
      t.leak++
      break
    }
  }
  // OVER-REDACTION — a non-secret piece the correct output keeps is missing from the actual output
  for (const piece of new Set(c.clean)) {
    if (occurrences(actual, piece) < occurrences(c.expected, piece)) {
      t.over++
      break
    }
  }
  if (hasCredentialShape(actual)) t.residual++
}

// ── the generator's own teeth ────────────────────────────────────────────────────────────────────────

describe("PERSIST-10a adjacency — the GENERATOR reaches the failing region", () => {
  it("the shipped sweep alphabet can inject only ONE token — this one injects runs of 2+ adjacent", () => {
    const rnd = lcg(20260801)
    let withAdjacentPair = 0
    let maxRun = 0
    for (let i = 0; i < 5000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 })
      // an adjacent pair is literally two family prefixes with only body characters between them
      const spans = credentialSpans(c.text)
      for (let k = 1; k < spans.length; k++) {
        if (spans[k]!.start === spans[k - 1]!.end) {
          withAdjacentPair++
          break
        }
      }
      maxRun = Math.max(maxRun, spans.length)
    }
    // teeth (breaks-on "the generator still emits at most one token per case, so adjacency is unreachable"):
    expect(withAdjacentPair).toBeGreaterThan(1000)
    expect(maxRun).toBeGreaterThanOrEqual(2)
  })

  it("the generator reaches CROSS-FAMILY adjacency, and every family is both first and second", () => {
    const rnd = lcg(20260801)
    let crossAdjacent = 0
    const asFirst = new Set<string>()
    const asSecond = new Set<string>()
    for (let i = 0; i < 20_000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 })
      const spans = credentialSpans(c.text)
      for (let k = 1; k < spans.length; k++) {
        const prev = spans[k - 1]!
        const cur = spans[k]!
        if (cur.start === prev.end && cur.family !== prev.family) {
          crossAdjacent++
          asFirst.add(prev.family)
          asSecond.add(cur.family)
        }
      }
    }
    // teeth (breaks-on "the corpus draws one family, so an own-family lookahead is indistinguishable from
    // the union one and the cross-family leak is unreachable" — this was 0 for the single-family corpus):
    expect(crossAdjacent).toBeGreaterThan(2_000)
    expect([...asFirst].sort()).toEqual(ORACLE_FAMILIES.map((f) => f.name).sort())
    expect([...asSecond].sort()).toEqual(ORACLE_FAMILIES.map((f) => f.name).sort())
  })

  it("the generator reaches CONTINGENT matches — bodies that END on a strict family prefix", () => {
    const rnd = lcg(555)
    let contingent = 0
    let longAmbiguity = 0
    for (let i = 0; i < 20_000; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 })
      for (const span of credentialSpans(c.text)) {
        const text = c.text.slice(span.start, span.end)
        // does the match end on something that could be the head of another family's prefix?
        for (const g of ORACLE_FAMILIES) {
          for (let k = g.prefix.length - 1; k >= 1; k--) {
            const run = text.slice(text.length - k)
            if (run.length !== k) continue
            let ok = true
            for (let q = 0; q < k; q++) if (!(g.prefix[q] as string).includes(run[q] as string)) ok = false
            if (!ok) continue
            contingent++
            if (k >= 4) longAmbiguity++ // `xoxb`/`gith…` — an ambiguous run long enough to straddle a seam
            k = 0
          }
        }
      }
    }
    // teeth (breaks-on "bodies are drawn from a flat alphabet, so a body never ends on `github`/`ghp` and
    // the contingent-match branch of the seam is never exercised"):
    expect(contingent).toBeGreaterThan(5_000)
    expect(longAmbiguity).toBeGreaterThan(500)
  })

  it("the construction and the independent regex-free scanner agree on every case", () => {
    const rnd = lcg(777)
    for (let i = 0; i < 20000; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 })
      // teeth (breaks-on "the expected output is derived from the implementation, so it cannot disagree"):
      expect(referenceScrub(c.text)).toBe(c.expected)
    }
  })

  it("the scanner has teeth: it SEES a credential of each family, and is not blinded by the placeholder", () => {
    expect(hasCredentialShape("x ghp_ABCDEFGH y")).toBe(true)
    expect(hasCredentialShape("x xoxb-ABCDEFGH y")).toBe(true)
    expect(hasCredentialShape("x github_pat_ABCDEFGH y")).toBe(false) // eight body chars: below floor 22
    expect(hasCredentialShape(`x github_pat_${"A".repeat(22)} y`)).toBe(true) // …at the floor it IS one
    expect([hasCredentialShape("x AKIAIOSFODNN7EXAMPLE y"), hasCredentialShape("x AKIAIOSFODNN7EXAMPL y")]).toEqual([
      true,
      false,
    ])
    expect(hasCredentialShape("x ghp_ABCDE y")).toBe(false) // five body chars: below the floor
    expect(hasCredentialShape("x gha_ABCDEFGH y")).toBe(false) // not a family member
    expect(hasCredentialShape("x xoxq-ABCDEFGH y")).toBe(false) // not a slack family member
    expect(hasCredentialShape("[REDACTED]_BBBBBB")).toBe(false) // the leaked FORM is shapeless, hence the body check
    expect(credentialSpans("ghp_AAAAAAghp_BBBBBB").length).toBe(2)
    expect(referenceScrub("ghp_AAAAAAghp_BBBBBB")).toBe("[REDACTED][REDACTED]")
    expect(referenceScrub("ghp_ABCDEF_prod")).toBe("[REDACTED]_prod") // the `_suffix` bytes are NOT secret
    // CROSS-FAMILY: the scanner cuts the first body at the second family's prefix
    expect(credentialSpans("ghp_AAAAAAxoxb-BBBBBB").length).toBe(2)
    expect(referenceScrub("ghp_AAAAAAxoxb-BBBBBB")).toBe("[REDACTED][REDACTED]")
    expect(referenceScrub("xoxb-AAAAAAghp_BBBBBB")).toBe("[REDACTED][REDACTED]")
    // the un-making case: a trailing `ghp` becomes a prefix and BOTH candidates fall below the floor
    expect(referenceScrub("ghp_AAAAAghp_prod")).toBe("ghp_AAAAAghp_prod")
  })

  it("the STABILITY RULE is real: it rejects exactly the appends that would re-cut a committed token", () => {
    expect(wouldDisturb("ghp_AAAAAghp", "_prod")).toBe(true) // completes a prefix inside the body
    expect(wouldDisturb("ghp_AAAAAghp", "XYZ")).toBe(false) // stays body
    expect(wouldDisturb("ghp_AAAAAAxoxb", "-XXXXXX")).toBe(true)
    expect(wouldDisturb("ghp_AAAAAAxoxb", "ghp_BBBBBB")).toBe(false) // a NEW token, not a re-cut
    expect(wouldDisturb("log line ", "ghp_ABCDEFGH")).toBe(false)
  })

  it("every clean piece is safe where it is used, and none is itself a credential", () => {
    for (const piece of CLEAN_PIECES) {
      // opens on a character that is not a body character of ANY family, so it can never be absorbed
      for (const f of ORACLE_FAMILIES) expect(isBodyChar(f, piece, 0)).toBe(false)
      expect(hasCredentialShape(piece)).toBe(false)
    }
    for (const piece of BODY_OPENING_PIECES) {
      // these DO open on a body character — used only after a family that cannot reach them
      expect(ORACLE_FAMILIES.some((f) => isBodyChar(f, piece, 0))).toBe(true)
      expect(hasCredentialShape(piece)).toBe(false)
    }
  })
})

// ── the measurement ──────────────────────────────────────────────────────────────────────────────────
// DO NOT TRADE THESE FOR WALL-CLOCK. #120 briefly cut them to 140k/28k on the theory that four families made
// each case too dear for the 10s cap. Both halves were wrong: measured on THIS branch the counts below run in
// 8.1s and 7.5s (the cap never bound), while the cut removed 31% of all adjacent pairs and 4.3x of the four
// ordered pairs master already covered — `github-token -> github-pat`, the adjacency of the taproot defect
// this file exists for, fell from 4,261 to 2,983. Cases are dearer (+32% in-suite, ~2.5x isolated: the two
// disagree on a contended box, so no single figure is quoted) and longer (mean 53.7 -> 68.4 chars). If the
// cap ever binds, the lever is the cap; scrub-declared-families.test.ts is ADDITIVE and buys back no sample.
const N_WHOLE = 200_000
const N_FOLD = 40_000

describe(`PERSIST-10a adjacency — WHOLE-BUFFER scrub, ${String(N_WHOLE)} adjacency cases`, () => {
  it("0 leaks, 0 over-redactions, 0 residual shapes, 0 exact mismatches", () => {
    const rnd = lcg(20260801)
    const t = blank()
    for (let i = 0; i < N_WHOLE; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 })
      score(t, c, scrubText(c.text))
    }
    // teeth (breaks-on "a credential body swallows the family prefix of the credential that follows it,
    // so the second body ships in the clear as `[REDACTED]_BBBBBB`"):
    expect(t).toEqual({ cases: N_WHOLE, leak: 0, over: 0, residual: 0, mismatch: 0, generator: 0 })
  })

  it("the metric has teeth: the KNOWN-BAD greedy shape scores as a leak on the same cases", () => {
    // The shipped-before-the-fix regex, inlined so the measurement can be shown to be capable of failing.
    const bad = (s: string): string => s.replace(/gh[pousr]_[A-Za-z0-9]{6,}/g, "[REDACTED]")
    const rnd = lcg(20260801)
    const t = blank()
    for (let i = 0; i < 20_000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 })
      score(t, c, bad(c.text))
    }
    expect(t.leak).toBeGreaterThan(5_000) // the class the shipped sweep could not reach
    expect(t.generator).toBe(0)
  })

  it("the metric has teeth ACROSS families: the OWN-FAMILY lookahead scores as a leak", () => {
    // The regression this corpus exists to prevent: each family blocking only its own prefix. It is a
    // perfectly good fix for SAME-family adjacency and it silently ships the second body whenever the two
    // credentials belong to DIFFERENT families.
    const rnd = lcg(20260801)
    const t = blank()
    for (let i = 0; i < 20_000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 })
      score(t, c, ownFamilyOnly(c.text))
    }
    expect(t.leak).toBeGreaterThan(1_000)
    expect(t.generator).toBe(0)
    // and the concrete shape of the failure, byte-exactly
    expect(ownFamilyOnly("ghp_AAAAAAxoxb-BBBBBB")).toBe("[REDACTED]-BBBBBB")
    expect(scrubText("ghp_AAAAAAxoxb-BBBBBB")).toBe("[REDACTED][REDACTED]")
    expect(scrubText("xoxb-AAAAAAghp_BBBBBB")).toBe("[REDACTED][REDACTED]")
  })

  it("the own-family lookahead is also ORDER-DEPENDENT — the union one is not", () => {
    // A second, quieter defect of blocking only a shape's own prefix: because `scrub` applies one pass per
    // shape, a body that swallows another family's prefix makes the OUTPUT depend on the order the shapes
    // happen to be declared in. `xoxb-AAAAAAghp_BBBBBB` redacts both when the github pass runs first (it
    // removes `ghp_BBBBBB`, leaving a clean slack token behind) and leaks when the slack pass runs first
    // (its body eats `ghp`, leaving `[REDACTED]_BBBBBB`). With the union lookahead no body can swallow
    // another family's prefix, matches cannot overlap, and the passes commute.
    const pass = (s: string, res: readonly RegExp[]): string => {
      let out = s
      for (const re of res) out = out.replace(re, "[REDACTED]")
      return out
    }
    const gh = /gh[pousr]_(?:(?!gh[pousr]_)[A-Za-z0-9]){6,}/g
    const sl = /xox[baprs]-(?:(?!xox[baprs]-)[A-Za-z0-9-]){6,}/g
    const text = "xoxb-AAAAAAghp_BBBBBB"
    expect(pass(text, [gh, sl])).toBe("[REDACTED][REDACTED]")
    expect(pass(text, [sl, gh])).toBe("[REDACTED]_BBBBBB") // same code, other order, secret in the clear
    expect(pass(text, [gh, sl])).not.toBe(pass(text, [sl, gh]))
    // the shipped union shapes commute: same answer either way, and it is the correct one
    const ghU = /gh[pousr]_(?:(?!(?:gh[pousr]_|xox[baprs]-))[A-Za-z0-9]){6,}/g
    const slU = /xox[baprs]-(?:(?!(?:gh[pousr]_|xox[baprs]-))[A-Za-z0-9-]){6,}/g
    expect(pass(text, [ghU, slU])).toBe(pass(text, [slU, ghU]))
    expect(pass(text, [ghU, slU])).toBe(scrubText(text))
  })
})

describe(`PERSIST-10a adjacency — CHUNK INDEPENDENCE, ${String(N_FOLD)} adjacency cases`, () => {
  it("a random chunking folds to exactly the whole-buffer result, and to the ground truth", () => {
    const rnd = lcg(31337)
    const t = blank()
    let foldDiff = 0
    for (let i = 0; i < N_FOLD; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 })
      const folded = admitAll(chunkRandomly(c.text, rnd))
      if (folded !== scrubText(c.text)) foldDiff++
      score(t, c, folded)
    }
    // teeth (breaks-on "the lookahead cannot reach across a chunk seam, so a streaming caller still
    // admits `[REDACTED]_BBBBBB`"):
    expect(foldDiff).toBe(0)
    expect(t).toEqual({ cases: N_FOLD, leak: 0, over: 0, residual: 0, mismatch: 0, generator: 0 })
  })

  it("BYTE-AT-A-TIME (the realistic streaming case) over 4k adjacency cases", () => {
    const rnd = lcg(4242)
    const t = blank()
    for (let i = 0; i < 4_000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 })
      score(t, c, admitAll(c.text.split("")))
    }
    expect(t).toEqual({ cases: 4_000, leak: 0, over: 0, residual: 0, mismatch: 0, generator: 0 })
  })

  it("EVERY split offset of an adjacent pair folds to the whole-buffer result", () => {
    const rnd = lcg(99)
    for (let i = 0; i < 200; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 2 })
      const reference = scrubText(c.text)
      for (let off = 1; off < c.text.length; off++) {
        expect(admitAll([c.text.slice(0, off), c.text.slice(off)])).toBe(reference)
      }
      expect(reference).toBe(c.expected)
    }
  })

  it("fixed chunk sizes 1/2/3/5/7/11/13 agree at EVERY prefix, not only at the end", () => {
    const rnd = lcg(1234)
    for (let i = 0; i < 200; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 })
      for (const size of [1, 2, 3, 5, 7, 11, 13]) {
        let buf: Uint8Array = new Uint8Array(0)
        let acc = ""
        for (let p = 0; p < c.text.length; p += size) {
          const part = c.text.slice(p, p + size)
          buf = admitToBuffer(buf, enc.encode(part))
          acc += part
          // the invariant holds at EVERY prefix — there is no deferred flush
          expect(dec.decode(buf)).toBe(scrubText(acc))
        }
        expect(dec.decode(buf)).toBe(c.expected)
      }
    }
  })

  it("CROSS-FAMILY cases specifically: every split offset, byte-at-a-time, fixed sizes", () => {
    const rnd = lcg(8675309)
    let crossCases = 0
    for (let i = 0; crossCases < 400 && i < 20_000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 })
      if (c.familiesUsed < 2) continue
      crossCases++
      const reference = scrubText(c.text)
      expect(reference).toBe(c.expected)
      expect(admitAll(c.text.split(""))).toBe(reference)
      for (let off = 1; off < c.text.length; off++) {
        expect(admitAll([c.text.slice(0, off), c.text.slice(off)])).toBe(reference)
      }
      for (const size of [1, 2, 3, 5, 7, 11, 13]) {
        const parts: string[] = []
        for (let p = 0; p < c.text.length; p += size) parts.push(c.text.slice(p, p + size))
        expect(admitAll(parts)).toBe(reference)
      }
    }
    // teeth (breaks-on "no case in the corpus mixes families, so the cross-family seam is never streamed"):
    expect(crossCases).toBe(400)
  })
})
