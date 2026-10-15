// @atlas/persist — test/scrub-declared-families.test.ts  (WP-3.5-a.PERSIST · PERSIST-10a — task #120)
//
// THE GATE FOR THE TWO FAMILIES THIS SEAT DECLARED, and for the seam rework that had to land first.
//
// `github_pat_` could not be declared under the previous seam, and the reason was not a missing pattern —
// it was a STATE THE SEAM COULD NOT REPRESENT. `ghp_AAAAAAgithub_` is a complete github-token match whose
// trailing `github_` is a strict prefix of `github_pat_`; `_` is not a github-token body character, so the
// match stops before the end of the stream while the bytes that must be re-decided are inside the
// `[REDACTED]` already emitted. The old seam split its carry into `raw`/`back` (emitted, rewritable) and
// `swallow`/`pending` (not emitted, absorbed into a redaction) and those were mutually exclusive, so it had
// to pick one. MEASURED on that seam with the family declared and the union lookahead in place:
//
//     ghp_AAAAAAgithub_pat_<22>   whole-buffer   [REDACTED][REDACTED]
//                                 byte-at-a-time [REDACTED]_pat_<22>      <- the PAT body, in the clear
//     gho_github_                 whole-buffer   [REDACTED]_
//                                 byte-at-a-time gho_github_              <- wrong at ALL 10 split offsets
//
// The seam now carries ONE undecided suffix and re-derives everything from a single scan, so a redaction
// whose extent is still provisional is just a carry that renders as `[REDACTED]`.
// FIXTURES. Every token here is obviously synthetic and carries a literal NOTAREAL marker, EXCEPT the AWS
// access key id `AKIAIOSFODNN7EXAMPLE` — AWS's own published documentation example, not a real key and never
// one, which is why it is safe to commit. Every fixture's exact bytes are asserted below, not eyeballed.

import { describe, it, expect } from "vitest"
import { scrub, admitToBuffer, seamCarryOf, seamRawCarryOf, MAX_SEAM_CARRY } from "../src/scrub.js"
import { canonicalise, renderPrefix, scanMatches, scrubString, seamCut, type Match } from "../src/scrub-scan.js"
import { FAMILIES, REDACTION, SHAPES, shapeOf } from "../src/scrub-shapes.js"
import { ORACLE_FAMILIES, credentialSpans, lcg, makeCase, referenceScrub } from "./adjacency-oracle.js"

const enc = new TextEncoder()
const dec = new TextDecoder()
const scrubText = (s: string): string => dec.decode(scrub(enc.encode(s)))

function admitAll(parts: readonly string[]): string {
  let buf: Uint8Array = new Uint8Array(0)
  for (const p of parts) buf = admitToBuffer(buf, enc.encode(p))
  return dec.decode(buf)
}

/** Obviously-synthetic tokens that still match the shipped shapes. */
const PAT_SEG1 = `NOTAREAL${"0".repeat(14)}` //  22 chars — the fine-grained PAT's first segment
const PAT_SEG2 = `SYNTHETICNOTAREALPATBODY${"0".repeat(35)}` // 59 chars — where the entropy actually lives
const PAT = `github_pat_${PAT_SEG1}_${PAT_SEG2}`
const AKID = "AKIAIOSFODNN7EXAMPLE" // AWS's published documentation example; not a real key
const GH = "ghp_SYNTHETICNOTAREALTOKEN01"
const SL = "xoxb-NOTAREAL-SLACKTOKEN-000"

/** EVERY split offset, byte-at-a-time, and every fixed-size prefix — exhaustive, never sampled. `pairs` also
 *  sweeps every PAIR of offsets (O(n^2) folds: reserved for the named cases). First disagreement, or none. */
function firstSplitDisagreement(text: string, pairs = true): string | undefined {
  const want = scrubText(text)
  const byteAtATime = admitAll(text.split(""))
  if (byteAtATime !== want) return `byte-at-a-time -> ${JSON.stringify(byteAtATime)} != ${JSON.stringify(want)}`
  for (let i = 1; i < text.length; i++) {
    const two = admitAll([text.slice(0, i), text.slice(i)])
    if (two !== want) return `split@${String(i)} -> ${JSON.stringify(two)} != ${JSON.stringify(want)}`
    for (let j = i + 1; pairs && j < text.length; j++) {
      const three = admitAll([text.slice(0, i), text.slice(i, j), text.slice(j)])
      if (three !== want) return `split@${String(i)},${String(j)} -> ${JSON.stringify(three)}`
    }
  }
  for (const size of [1, 2, 3, 5, 7, 11, 13]) {
    let buf: Uint8Array = new Uint8Array(0)
    let acc = ""
    for (let p = 0; p < text.length; p += size) {
      acc += text.slice(p, p + size)
      buf = admitToBuffer(buf, enc.encode(text.slice(p, p + size)))
      if (dec.decode(buf) !== scrubText(acc)) return `prefix@${String(acc.length)} size ${String(size)}`
      if (seamCarryOf(buf) > MAX_SEAM_CARRY) return `emitted carry ${String(seamCarryOf(buf))} over bound`
      if (seamRawCarryOf(buf) > MAX_SEAM_CARRY) return `raw carry ${String(seamRawCarryOf(buf))} over bound`
    }
  }
  return undefined
}

/** Fails if any run of >= `minRun` consecutive bytes of `secret` survives anywhere in `text`. */
function assertNoSecretRun(text: string, secret: string, minRun = 8): void {
  for (let i = 0; i + minRun <= secret.length; i++) {
    for (let j = i + minRun; j <= secret.length; j++) {
      if (text.includes(secret.slice(i, j))) throw new Error(`secret run "${secret.slice(i, j)}" survived`)
    }
  }
}

// ── the fixtures' exact bytes ────────────────────────────────────────────────────────────────────────

describe("PERSIST-10a #120 — the fixtures are the bytes they claim to be", () => {
  it("segment lengths and exact byte codes, not an eyeballed literal", () => {
    // Any fixture that depends on exact bytes is checked as BYTES. A visual check has been fooled here
    // before (a heredoc and a `str.replace` both silently recomposed a case into vacuity).
    expect(PAT_SEG1.length).toBe(22)
    expect(PAT_SEG2.length).toBe(59)
    expect(PAT).toBe(`github_pat_${PAT_SEG1}_${PAT_SEG2}`)
    expect(PAT.length).toBe(11 + 22 + 1 + 59)
    expect(AKID.length).toBe(20)
    // every byte is 7-bit ASCII, so the latin1 view the scrubber scans is byte-for-byte the UTF-8 encoding
    for (const s of [PAT, AKID, GH, SL]) {
      expect(Array.from(enc.encode(s))).toEqual([...s].map((c) => c.charCodeAt(0)))
      expect(Math.max(...[...s].map((c) => c.charCodeAt(0)))).toBeLessThan(128)
    }
    expect(PAT.includes("NOTAREAL")).toBe(true)
    expect(AKID).toBe("AKIAIOSFODNN7EXAMPLE") // AWS's own documentation example, verbatim
  })
})

// ── OPEN ITEM 1: github_pat_ ─────────────────────────────────────────────────────────────────────────

describe("PERSIST-10a #120 — github_pat_, the measured regression, at EVERY split offset", () => {
  const REGRESSIONS: readonly (readonly [string, string])[] = [
    // the exact two cases the previous seam failed, with the same synthetic bodies
    [`ghp_AAAAAA${PAT}`, "[REDACTED][REDACTED]"],
    ["gho_github_", "[REDACTED]_"],
    // …and one more byte of context UN-makes it: with `pat_` present, `github_pat_` matches in full at
    // index 4, so the union lookahead blocks the github-token body at ZERO characters and NOTHING is a
    // credential. Both paths agree on that too — which is the property, not "more redaction is better".
    ["gho_github_pat_", "gho_github_pat_"],
    ["gho_github_pa", "[REDACTED]_pa"],
    [`gho_AAAAAAgithub_pat_${PAT_SEG1}`, "[REDACTED][REDACTED]"],
    [PAT, "[REDACTED]"],
    [`token=${PAT} end`, "token=[REDACTED] end"],
    [`${PAT}${GH}`, "[REDACTED][REDACTED]"],
    [`${GH}${PAT}`, "[REDACTED][REDACTED]"],
    [`${SL}${PAT}`, "[REDACTED][REDACTED]"],
    [`${PAT}${SL}`, "[REDACTED][REDACTED]"],
    [`${PAT} ${AKID}`, "[REDACTED] [REDACTED]"],
  ]

  for (const [text, want] of REGRESSIONS) {
    it(`${JSON.stringify(text.slice(0, 28))}… : whole-buffer, and every split offset, agree`, () => {
      expect(scrubText(text)).toBe(want)
      const bad = firstSplitDisagreement(text)
      // teeth (breaks-on "a committed redaction cannot carry a provisional tail, so `github` is absorbed
      // into the preceding secret and `_pat_<body>` ships in the clear"):
      expect(bad).toBeUndefined()
    })
  }

  it("THE `_`-IN-BODY PROBLEM: the 59-character second segment is redacted, not shipped", () => {
    // A real fine-grained PAT is `github_pat_<22>_<59>`. Excluding `_` from the body would match through
    // the 22-character segment and leave the 59-character one — where the entropy is — in the clear. That
    // is the JWT defect wearing a different costume, and it is the whole reason `_` is a body character.
    const out = scrubText(`log: ${PAT} written`)
    expect(out).toBe("log: [REDACTED] written")
    assertNoSecretRun(out, PAT_SEG2)
    assertNoSecretRun(out, PAT_SEG1)
    // and the streaming path, at every offset
    expect(firstSplitDisagreement(`log: ${PAT} written`)).toBeUndefined()
    // teeth: the `_`-EXCLUDING declaration ships exactly that segment, byte-for-byte
    const withoutUnderscore = `log: ${PAT} written`.replace(/github_pat_[A-Za-z0-9]{22,}/g, REDACTION)
    expect(withoutUnderscore).toBe(`log: [REDACTED]_${PAT_SEG2} written`)
    expect(() => assertNoSecretRun(withoutUnderscore, PAT_SEG2)).toThrow(/survived/)
  })

  it("the DECLARED cost of `_` in the body: `_`-joined text after a PAT is absorbed", () => {
    // Symmetric with the Slack `-` cost, and bounded by the first non-body byte. Pinned so it can never be
    // discovered by surprise.
    expect(scrubText(`${PAT}_prod`)).toBe("[REDACTED]")
    expect(scrubText(`${PAT}_prod end`)).toBe("[REDACTED] end")
    expect(scrubText(`${PAT}_prod\nnext`)).toBe("[REDACTED]\nnext")
    expect(scrubText(`${PAT}="quoted"`)).toBe('[REDACTED]="quoted"')
    // and the GitHub-token family is unaffected — `_` still terminates ITS body
    expect(scrubText(`${GH}_prod`)).toBe("[REDACTED]_prod")
  })

  it("below the floor, a `github_pat_` fragment is NOT a credential and is NOT redacted", () => {
    // floor 22 = the first segment's length. A short fragment is not a token and must survive verbatim.
    expect(scrubText("github_pat_ABCDEFGH")).toBe("github_pat_ABCDEFGH")
    expect(scrubText(`github_pat_${"A".repeat(21)}`)).toBe(`github_pat_${"A".repeat(21)}`)
    expect(scrubText(`github_pat_${"A".repeat(22)}`)).toBe("[REDACTED]")
  })
})

// ── OPEN ITEM 2: AWS access key id ───────────────────────────────────────────────────────────────────

describe("PERSIST-10a #120 — AWS access key id: the ceiling is what makes the two paths agree", () => {
  it("a trailing body character is NOT absorbed, whole-buffer or chunked", () => {
    // MEASURED on the previous descriptor (bounded `full`, unbounded absorb): `[REDACTED]X` whole-buffer,
    // `[REDACTED]` once the final `X` landed in a later chunk — a disagreement at exactly one split offset
    // (20), which a sampled fuzz can miss and an exhaustive one cannot.
    expect(scrubText(`${AKID}X`)).toBe("[REDACTED]X")
    expect(firstSplitDisagreement(`${AKID}X`)).toBeUndefined()
    expect(admitAll([`${AKID}`, "X"])).toBe("[REDACTED]X") // the offset-20 split, spelled out
    expect(scrubText(AKID)).toBe("[REDACTED]")
    expect(scrubText(`AWS_ACCESS_KEY_ID=${AKID}\n`)).toBe("AWS_ACCESS_KEY_ID=[REDACTED]\n")
    expect(firstSplitDisagreement(`id=${AKID}XYZ end`)).toBeUndefined()
    expect(scrubText(`id=${AKID}XYZ end`)).toBe("id=[REDACTED]XYZ end")
  })

  it("teeth: the UNBOUNDED declaration of the same family over-redacts the trailing byte", () => {
    // The mutant is the DECLARATION, not a hand-written regex: the same family with `ceiling` dropped.
    const aws = FAMILIES[3]!
    const unbounded = shapeOf({ name: aws.name, prefix: aws.prefix, bodyBase: "upper", bodyExtra: "", floor: 16 })
    // it really is the shipped declaration minus the ceiling
    expect([aws.name, aws.bodyBase, aws.bodyExtra, aws.floor, aws.ceiling]).toEqual([
      "aws-access-key-id",
      "upper",
      "",
      16,
      16,
    ])
    expect(unbounded.ceiling).toBeUndefined()
    expect(`${AKID}X`.replace(unbounded.full, REDACTION)).toBe("[REDACTED]") // eats a non-secret byte
    expect(scrubText(`${AKID}X`)).toBe("[REDACTED]X") // …the shipped one does not
    // and the ceiling is 16 exactly, so 17 body characters is one match plus one plain byte
    expect(SHAPES[3]!.ceiling).toBe(16)
    expect(SHAPES[3]!.floor).toBe(16)
  })

  it("below the floor, an `AKIA` fragment survives verbatim", () => {
    expect(scrubText(`AKIA${"B".repeat(15)}`)).toBe(`AKIA${"B".repeat(15)}`)
    expect(scrubText(`AKIA${"B".repeat(16)}`)).toBe("[REDACTED]")
    expect(scrubText("AKIAiosfodnn7example")).toBe("AKIAiosfodnn7example") // lowercase is not the body class
  })
})

// ── the seam rework itself, and the mutant that proves the new step is load-bearing ──────────────────

/** A faithful re-fold of the shipped seam over the exported primitives, parameterised on the cut rule so
 *  the rule can be MUTATED. Checked against the real `admitToBuffer` before it is trusted. */
function foldWithCut(cut: (s: string, ms: readonly Match[]) => number, parts: readonly string[]): string {
  let emitted = ""
  let carry = ""
  let back = 0
  for (const p of parts) {
    const s = carry + p
    const matches = scanMatches(s)
    const at = cut(s, matches)
    const tail = canonicalise(s.slice(at))
    const provisional = scrubString(tail)
    // the MUTANT cut can land inside a match, where `renderPrefix`'s precondition does not hold — so the
    // mutant is rendered the only way that is defined there, by re-scrubbing the truncated head. That is
    // itself part of what the relaxation buys: with step (3) the two renderings coincide.
    const head = cut === seamCut ? renderPrefix(s, matches, at) : scrubString(s.slice(0, at))
    emitted = emitted.slice(0, emitted.length - back) + head + provisional
    back = provisional.length
    carry = tail
  }
  return emitted
}

/** The shipped cut MINUS step (3): the undecided region is allowed to start inside an already-matched
 *  span, which is exactly the state the previous two-field seam was stuck in. */
function cutWithoutRelaxation(s: string, matches: readonly Match[]): number {
  let at = s.length
  const last = matches[matches.length - 1]
  if (last !== undefined && last.end === s.length) at = last.start
  const window = Math.max(...SHAPES.map((sh) => sh.maxPartial))
  for (let p = Math.max(0, s.length - window); p < at; p++) {
    if (SHAPES.some((sh) => sh.partial.test(s.slice(p)))) {
      at = p
      break
    }
  }
  return at
}

describe("PERSIST-10a #120 — the seam step this task added is load-bearing", () => {
  it("the mutant harness reproduces the SHIPPED fold exactly (so a difference means the rule, not the rig)", () => {
    for (const text of [`ghp_AAAAAA${PAT}`, "gho_github_x", `${GH}${SL}`, `x ${AKID}Y z`, "ghp_AAAAAghp_prod"]) {
      expect(foldWithCut(seamCut, text.split(""))).toBe(admitAll(text.split("")))
      expect(foldWithCut(seamCut, [text])).toBe(scrubText(text))
    }
  })

  it("WITHOUT the relaxation, the same corpus leaks — byte-exactly, at the byte-at-a-time chunking", () => {
    // `gho_github` is emitted as `[REDACTED]`; when the `_` arrives, the bytes to re-decide are INSIDE
    // that placeholder. Refusing to move the cut out to the enclosing match puts the cut at index 4 — in
    // the middle of a committed match — so the head is re-rendered as `scrub('gho_')` and the whole
    // credential comes back out IN THE CLEAR. That is a leak of a token this control claims to redact,
    // byte-exactly:
    expect(foldWithCut(cutWithoutRelaxation, "gho_github_x".split(""))).toBe("gho_github_x")
    expect(scrubText("gho_github_x")).toBe("[REDACTED]_x")
    expect(admitAll("gho_github_x".split(""))).toBe("[REDACTED]_x")
    // and it disagrees with the whole-buffer answer on the PAT case too
    const patCase = `ghp_AAAAAAgithub_${PAT_SEG1}`
    expect(foldWithCut(cutWithoutRelaxation, patCase.split(""))).not.toBe(scrubText(patCase))
    expect(admitAll(patCase.split(""))).toBe(scrubText(patCase))
  })

  it("seamCut NEVER lands strictly inside a match, and the head is never RIGHT-truncated", () => {
    // `renderPrefix` is only defined where no match straddles the cut, and it exists because re-scrubbing a
    // right-truncated head is unsound: a body's lookahead reads FORWARD, so cutting bytes off the end can
    // remove the prefix that blocked it. Witness, byte-exactly — the whole string has no credential in it,
    // its 15-byte prefix has one:
    expect(scrubText("ghp_AAAAAgithub_pat_XXXX")).toBe("ghp_AAAAAgithub_pat_XXXX")
    expect(scrubText("ghp_AAAAAgithub")).toBe("[REDACTED]")
    expect(firstSplitDisagreement("ghp_AAAAAgithub_pat_XXXX")).toBeUndefined()
    // and the precondition itself, over the corpus
    const rnd = lcg(31337)
    let inspected = 0
    let straddles = 0
    for (let i = 0; i < 2_000; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 })
      for (let k = 0; k <= c.text.length; k++) {
        const s = c.text.slice(0, k)
        const ms = scanMatches(s)
        const at = seamCut(s, ms)
        inspected++
        for (const m of ms) if (m.start < at && at < m.end) straddles++
      }
    }
    expect([inspected > 30_000, straddles]).toEqual([true, 0])
  })

  it("the per-chunk-isolation mutant (no seam at all) still fails, as it always did", () => {
    const isolated = (parts: readonly string[]): string => parts.map(scrubString).join("")
    expect(isolated(["ghp_ABC", "DEF end"])).toBe("ghp_ABCDEF end") // the split secret, verbatim
    expect(admitAll(["ghp_ABC", "DEF end"])).toBe("[REDACTED] end")
  })
})

// ── the generator actually reaches the new regions ───────────────────────────────────────────────────

describe("PERSIST-10a #120 — the corpus REACHES the regions its law quantifies over", () => {
  it("the independent oracle declares the same four families, and agrees case by case", () => {
    expect(ORACLE_FAMILIES.map((f) => f.name)).toEqual(FAMILIES.map((f) => f.name))
    const rnd = lcg(120)
    for (let i = 0; i < 20_000; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 })
      // teeth (breaks-on "the expectation is derived from the implementation, so it cannot disagree"):
      expect(referenceScrub(c.text)).toBe(c.expected)
      expect(scrubText(c.text)).toBe(c.expected)
    }
  })

  it("it produces github-pat bodies containing `_`, AWS matches at the ceiling, and `github`-tailed bodies", () => {
    const rnd = lcg(4242)
    let patWithUnderscoreBody = 0
    let awsAtCeiling = 0
    let awsFollowedByBodyChar = 0
    let bodyEndingInStrictPatPrefix = 0
    for (let i = 0; i < 30_000; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 })
      for (const span of credentialSpans(c.text)) {
        const text = c.text.slice(span.start, span.end)
        if (span.family === "github-pat" && text.slice(11).includes("_")) patWithUnderscoreBody++
        if (span.family === "aws-access-key-id") {
          if (text.length === 20) awsAtCeiling++
          if (/^[0-9A-Z]/.test(c.text.slice(span.end, span.end + 1))) awsFollowedByBodyChar++
        }
        if (span.family !== "github-pat" && /(?:g|gi|git|gith|githu|github)$/.test(text)) {
          bodyEndingInStrictPatPrefix++
        }
      }
    }
    // teeth (breaks-on "the generator draws bodies from a flat alphabet, so the two-segment PAT, the AWS
    // ceiling and the cross-family `github` tail are all unreachable and the law is vacuous over them"):
    expect(patWithUnderscoreBody).toBeGreaterThan(500)
    expect(awsAtCeiling).toBeGreaterThan(500)
    expect(awsFollowedByBodyChar).toBeGreaterThan(20)
    expect(bodyEndingInStrictPatPrefix).toBeGreaterThan(500)
  })

  it("EVERY split offset over an adversarial alphabet dense in all four families", () => {
    const alpha = "gghhppoussrr__xxoobbaa--iittuuAAKKII00119!= [REDACTED]".split("")
    const tokens = [GH, SL, PAT, AKID, "gho_github_", `ghp_AAAAAA${PAT}`]
    const rnd = lcg(20260802)
    const fails: string[] = []
    let worstRaw = 0
    for (let n = 0; n < 300; n++) {
      let s = ""
      const len = 1 + Math.floor(rnd() * 24)
      for (let i = 0; i < len; i++) s += alpha[Math.floor(rnd() * alpha.length)] as string
      if (rnd() < 0.5) {
        const tk = tokens[Math.floor(rnd() * tokens.length)] as string
        const at = Math.floor(rnd() * (s.length + 1))
        s = s.slice(0, at) + tk + s.slice(at)
      }
      const bad = firstSplitDisagreement(s, s.length <= 40)
      if (bad !== undefined && fails.length < 5) fails.push(`${JSON.stringify(s)} :: ${bad}`)
      let buf: Uint8Array = new Uint8Array(0)
      for (const ch of s) {
        buf = admitToBuffer(buf, enc.encode(ch))
        worstRaw = Math.max(worstRaw, seamRawCarryOf(buf))
      }
    }
    expect(fails).toEqual([])
    // the corpus really did drive the carry up near its bound, so "never exceeded" is not vacuous
    expect(worstRaw).toBeGreaterThan(20)
    expect(worstRaw).toBeLessThanOrEqual(MAX_SEAM_CARRY)
  })

  it("an UNBOUNDED github-pat body is canonicalised, not buffered — the DoS this rules out", () => {
    let buf = admitToBuffer(new Uint8Array(0), enc.encode(`head github_pat_${PAT_SEG1}`))
    for (let i = 0; i < 32; i++) {
      buf = admitToBuffer(buf, enc.encode("Z".repeat(64 * 1024)))
      expect(seamRawCarryOf(buf)).toBeLessThanOrEqual(MAX_SEAM_CARRY)
      expect(seamCarryOf(buf)).toBeLessThanOrEqual(MAX_SEAM_CARRY)
    }
    buf = admitToBuffer(buf, enc.encode(" tail"))
    expect(dec.decode(buf)).toBe("head [REDACTED] tail")
    expect(dec.decode(buf).includes("ZZZZZZZZ")).toBe(false)
    // canonicalisation is what made that possible, and it preserves the answer
    const long = `github_pat_${PAT_SEG1}${"Z".repeat(500)}github`
    expect(canonicalise(long).length).toBeLessThan(long.length)
    expect(scrubString(canonicalise(long))).toBe(scrubString(long))
    expect(scrubString(`${canonicalise(long)}_pat_${PAT_SEG1}`)).toBe(scrubString(`${long}_pat_${PAT_SEG1}`))
  })
})
