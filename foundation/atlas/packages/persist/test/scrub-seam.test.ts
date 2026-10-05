// @atlas/persist — test/scrub-seam.test.ts  (WP-3.5-a.PERSIST · PERSIST-10a — CHUNK-SEAM GATE)
//
// The three shipped scrub tests all admit the whole secret in ONE chunk, so none of them could ever see the
// defect this file closes: `admitToBuffer` scrubbed each chunk in isolation, and a credential split across
// two admits survived VERBATIM in the buffer. `TranscriptStoreApi` is put/fetch only — there is no delete —
// so a secret admitted that way is permanent.
//
// The property under test is CHUNK INDEPENDENCE:
//     for every way a byte stream is cut,  chunks.reduce(admitToBuffer, empty) === scrub(whole)
// It subsumes "no leak" in both directions: a leak breaks it, and so does over-redaction.
//
// FIXTURES are obviously-synthetic tokens that still match the shipped shape — a sequential alphabet run
// and a literal NOTAREAL marker — so nothing here resembles a credential a scanner should ever act on.

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { scrub, admitToBuffer, MAX_SEAM_CARRY, seamCarryOf } from "../src/scrub.js"

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Obviously-synthetic, shape-matching fixtures (never a real credential). */
const SECRET_A = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345" // 36 chars, sequential alphabet
const SECRET_B = "gho_SYNTHETICNOTAREAL0123456789" //  31 chars, different family + length

/** BYTE-level occurrence count. Asserting on decoded text can be satisfied by the wrong string; this
 *  compares the exact bytes, and is the only absence check used below. */
function byteOccurrences(hay: Uint8Array, needle: string): number {
  const n = enc.encode(needle)
  let hits = 0
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer
    hits++
  }
  return hits
}

/** The absence assertion under test, factored out so its TEETH can themselves be tested. Fails if any
 *  run of >= `minRun` consecutive bytes of `secret` survives anywhere in `buf`. */
function assertNoSecretRun(buf: Uint8Array, secret: string, minRun = 8): void {
  for (let i = 0; i + minRun <= secret.length; i++) {
    for (let j = i + minRun; j <= secret.length; j++) {
      const run = secret.slice(i, j)
      if (byteOccurrences(buf, run) !== 0) {
        throw new Error(`secret run "${run}" (len ${run.length}) survived in the buffer`)
      }
    }
  }
}

/** Fold a chunk list through the write gate exactly as a caller would. */
function admitAll(parts: readonly string[]): Uint8Array {
  let buf: Uint8Array = new Uint8Array(0)
  for (const p of parts) buf = admitToBuffer(buf, enc.encode(p))
  return buf
}

const PRE = "log line: token="
const POST = " end of line"

describe("PERSIST-10a seam — the absence assertion has teeth", () => {
  // The lesson this gate exists to obey: an "absent" assertion that never had a chance to find anything is
  // worthless. Run it against UNSCRUBBED bytes and prove it fires, before trusting it below.
  it("assertNoSecretRun FAILS on unscrubbed bytes (proof the assertion can fail)", () => {
    const raw = enc.encode(`${PRE}${SECRET_A}${POST}`)
    expect(() => assertNoSecretRun(raw, SECRET_A)).toThrow(/survived in the buffer/)
    // and it passes on the redacted form, so it is not simply always-throwing
    expect(() => assertNoSecretRun(scrub(raw), SECRET_A)).not.toThrow()
  })

  it("byteOccurrences counts exact bytes, not a decoded substring coincidence", () => {
    expect(byteOccurrences(enc.encode(`x${SECRET_A}y`), SECRET_A)).toBe(1)
    expect(byteOccurrences(enc.encode("x[REDACTED]y"), SECRET_A)).toBe(0)
    // a NUL byte in the record does not blind the check
    const withNul = new Uint8Array([0x00, ...enc.encode(SECRET_B), 0x00])
    expect(byteOccurrences(withNul, SECRET_B)).toBe(1)
  })
})

describe("PERSIST-10a seam — a secret split across admits never enters the buffer", () => {
  for (const [name, SECRET] of [
    ["A", SECRET_A],
    ["B", SECRET_B],
  ] as const) {
    it(`secret ${name}: EVERY split offset 1..len-1 admits zero secret bytes`, () => {
      const leaks: number[] = []
      for (let off = 1; off < SECRET.length; off++) {
        const buf = admitAll([PRE + SECRET.slice(0, off), SECRET.slice(off) + POST])
        if (byteOccurrences(buf, SECRET) !== 0) leaks.push(off)
      }
      // teeth (breaks-on "admitToBuffer scrubs each chunk in isolation" — this listed 1..9 before the fix):
      expect(leaks).toEqual([])
    })

    it(`secret ${name}: no run of >=8 secret bytes survives at any split offset`, () => {
      for (let off = 1; off < SECRET.length; off++) {
        const buf = admitAll([PRE + SECRET.slice(0, off), SECRET.slice(off) + POST])
        // teeth (breaks-on "only the head of the secret is redacted; the greedy tail is admitted raw"):
        expect(() => assertNoSecretRun(buf, SECRET)).not.toThrow()
      }
    })

    it(`secret ${name}: split into THREE chunks at every pair of offsets stays clean`, () => {
      for (let a = 1; a < SECRET.length; a++) {
        for (let b = a + 1; b < SECRET.length; b++) {
          const buf = admitAll([PRE + SECRET.slice(0, a), SECRET.slice(a, b), SECRET.slice(b) + POST])
          expect(byteOccurrences(buf, SECRET)).toBe(0)
          expect(() => assertNoSecretRun(buf, SECRET)).not.toThrow()
        }
      }
    })

    it(`secret ${name}: byte-at-a-time streaming (the worst case) stays clean`, () => {
      const whole = `${PRE}${SECRET}${POST}`
      const buf = admitAll(whole.split(""))
      expect(byteOccurrences(buf, SECRET)).toBe(0)
      expect(() => assertNoSecretRun(buf, SECRET)).not.toThrow()
    })
  }
})

describe("PERSIST-10a seam — THE INVARIANT: output does not depend on chunking", () => {
  for (const [name, SECRET] of [
    ["A", SECRET_A],
    ["B", SECRET_B],
  ] as const) {
    it(`secret ${name}: for every split point, admit-fold === scrub(whole)`, () => {
      const whole = `${PRE}${SECRET}${POST}`
      const reference = dec.decode(scrub(enc.encode(whole)))
      expect(reference).toBe(`${PRE}[REDACTED]${POST}`)
      for (let off = 1; off < whole.length; off++) {
        const got = dec.decode(admitAll([whole.slice(0, off), whole.slice(off)]))
        // teeth (breaks-on "the scrubbed output depends on how the caller happened to chunk the stream"):
        expect(got).toBe(reference)
      }
    })
  }

  it("the invariant holds at EVERY PREFIX, not only at the end (no deferred flush)", () => {
    const whole = `a ${SECRET_A} b ${SECRET_B} c`
    for (const size of [1, 2, 3, 5, 7, 11, 13]) {
      let buf: Uint8Array = new Uint8Array(0)
      let acc = ""
      for (let i = 0; i < whole.length; i += size) {
        const part = whole.slice(i, i + size)
        buf = admitToBuffer(buf, enc.encode(part))
        acc += part
        expect(dec.decode(buf)).toBe(dec.decode(scrub(enc.encode(acc))))
      }
    }
  })

  it("differential sweep over adversarial content and random chunkings", () => {
    // Dense in the characters that build and break the shape, so near-misses are common.
    const alphabet = "gghhpousr__AZaz09 !=[]REDACTED".split("")
    let seed = 20260801
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let t = 0; t < 3000; t++) {
      let s = ""
      const n = 1 + Math.floor(rnd() * 40)
      for (let i = 0; i < n; i++) s += alphabet[Math.floor(rnd() * alphabet.length)]
      if (rnd() < 0.5) {
        const at = Math.floor(rnd() * (s.length + 1))
        const fam = "pousr"[Math.floor(rnd() * 5)]
        s = `${s.slice(0, at)}gh${fam}_${"ABCDEFGHIJ".slice(0, Math.floor(rnd() * 11))}${s.slice(at)}`
      }
      const parts: string[] = []
      let p = 0
      while (p < s.length) {
        const len = 1 + Math.floor(rnd() * 5)
        parts.push(s.slice(p, p + len))
        p += len
      }
      expect(dec.decode(admitAll(parts))).toBe(dec.decode(scrub(enc.encode(s))))
    }
  })
})

describe("PERSIST-10a seam — CONTROL (a): non-secret content passes through byte-identical", () => {
  const CLEAN = [
    "ordinary transcript line with no credential at all\n",
    "near-miss: ghp_ABCDE has only five token chars, so it is NOT a credential shape",
    "near-miss: gha_ABCDEFGH is not a member of the ghp/gho/ghu/ghs/ghr family",
    "boundary bait: gh gho gho_ gho_1 gho_12345 all stop short of the floor",
    "a line that literally contains the placeholder [REDACTED]abc123 already",
    "utf-8 bytes and a tab: cafeé — quoted “x”\ttab\n",
  ]

  it("every clean fixture is byte-identical whole, and at EVERY split offset", () => {
    for (const text of CLEAN) {
      const src = enc.encode(text)
      // whole-buffer scrub changes nothing
      expect(Array.from(scrub(src))).toEqual(Array.from(src))
      for (let off = 1; off < text.length; off++) {
        const buf = admitAll([text.slice(0, off), text.slice(off)])
        // teeth (breaks-on "the seam logic over-redacts, or swallows bytes after a placeholder"):
        expect(Array.from(buf)).toEqual(Array.from(src))
      }
    }
  })

  it("raw non-UTF8 and NUL bytes survive the seam unchanged", () => {
    const raw = new Uint8Array([0x00, 0xff, 0x7f, 0x67, 0x68, 0x70, 0x5f, 0x00, 0xfe, 0x80])
    for (let off = 1; off < raw.length; off++) {
      let buf: Uint8Array = new Uint8Array(0)
      buf = admitToBuffer(buf, raw.subarray(0, off))
      buf = admitToBuffer(buf, raw.subarray(off))
      expect(Array.from(buf)).toEqual(Array.from(raw))
    }
  })
})

describe("PERSIST-10a seam — CONTROL (b): the shipped single-chunk behaviour is unchanged", () => {
  const SHIPPED_1 = "ghp_A1B2C3D4E5F6"
  const SHIPPED_2 = "ghp_9Q8W7E6R5T4Y"

  it("the three shipped scenarios still hold verbatim", () => {
    // SCN-PERSIST-10a-a-1 / -2
    expect(dec.decode(scrub(enc.encode(`call log: agent used token ${SHIPPED_1} at line 7`)))).toBe(
      "call log: agent used token [REDACTED] at line 7",
    )
    expect(dec.decode(scrub(enc.encode(`Authorization: token ${SHIPPED_2}`)))).toBe("Authorization: token [REDACTED]")
    // SCN-PERSIST-10a-b-1: one-shot admit, non-secret framing preserved
    const buf = admitToBuffer(new Uint8Array(0), enc.encode(`about to write ${SHIPPED_1} into transcript`))
    expect(dec.decode(buf)).toBe("about to write [REDACTED] into transcript")
    expect(byteOccurrences(buf, SHIPPED_1)).toBe(0)
    // SCN-PERSIST-10a-e-1: 0 over-redaction around the secret
    expect(dec.decode(scrub(enc.encode(`... token=${SHIPPED_1} in call log line 42 ...`)))).toBe(
      "... token=[REDACTED] in call log line 42 ...",
    )
    // shape-family control: an unseen family member is still caught
    expect(dec.decode(scrub(enc.encode("x gho_ZzYyXxWw112233 y")))).toBe("x [REDACTED] y")
  })
})

describe("PERSIST-10a seam — CONTROL (c): the memory bound is real", () => {
  it("a long secret-free stream never carries more than MAX_SEAM_CARRY bytes", () => {
    // 74, and it is arithmetic on the DECLARATION rather than a guess. The carry begins EITHER at a
    // not-yet-complete candidate — which must reach the end of the stream, so it starts at most
    // MAX_PARTIAL bytes back — OR at the start of the match that ENCLOSES such a candidate, when the
    // undecided bytes turn out to be inside a redaction that has already been written:
    //
    //     MAX_SEAM_CARRY = MAX_CANON_MATCH + MAX_PARTIAL - 1  =  43 + 32 - 1  =  74
    //
    //   · MAX_PARTIAL = 32 = |github_pat_| + (22 - 1): the fine-grained PAT one body character short of
    //     its floor is the longest thing that is not yet a credential but could still become one.
    //   · MAX_CANON_MATCH = 43 = minFull(github-pat) + AMBIGUOUS_TAIL = 33 + 10: an UNBOUNDED body is
    //     canonicalised down to its floor plus the longest run that could still be a strict family prefix
    //     (`github_pat` at 10). A BOUNDED family cannot exceed |prefix| + ceiling (AWS: 4 + 16 = 20).
    //   · the "- 1" is the tail after that match: it must itself contain the candidate that forced the
    //     relaxation, so it is strictly shorter than MAX_PARTIAL.
    //
    // It was 14 with two families declared and 12 with one. Declaring `github_pat_` moved it to 74 because
    // BOTH terms moved: a 22-character floor lengthens the incomplete window, and an 11-character prefix
    // lengthens the ambiguous run. This is the price of the fine-grained PAT and it is O(1) per stream.
    expect(MAX_SEAM_CARRY).toBe(74)
    // the witness for the old two-family bound, still exactly what it was — and it must still fold
    // identically at every split
    const contingent = "xoxb-AAAAAxoxb"
    expect(contingent.length).toBe(14)
    expect(dec.decode(scrub(enc.encode(contingent)))).toBe("[REDACTED]")
    expect(dec.decode(scrub(enc.encode(`${contingent}-ABCDEF`)))).toBe("xoxb-AAAAA[REDACTED]")
    for (let off = 1; off < `${contingent}-ABCDEF`.length; off++) {
      const w = `${contingent}-ABCDEF`
      expect(dec.decode(admitAll([w.slice(0, off), w.slice(off)]))).toBe("xoxb-AAAAA[REDACTED]")
    }
    const chunk = "a long transcript line with no credential in it whatsoever; ".repeat(16)
    let buf: Uint8Array = new Uint8Array(0)
    let worst = 0
    for (let i = 0; i < 512; i++) {
      buf = admitToBuffer(buf, enc.encode(chunk))
      worst = Math.max(worst, seamCarryOf(buf))
    }
    expect(worst).toBeLessThanOrEqual(MAX_SEAM_CARRY)
    expect(buf.length).toBe(chunk.length * 512) // nothing withheld, nothing duplicated
  })

  it("an UNBOUNDED token body is absorbed, not buffered (the DoS this rules out)", () => {
    // A caller streams a credential prefix and then megabytes of token characters. Buffering until the
    // pattern could be excluded would have to hold all of it: the shape has no maximum length.
    let buf = admitToBuffer(new Uint8Array(0), enc.encode("head ghp_ABCDEF"))
    const body = "Z".repeat(64 * 1024)
    for (let i = 0; i < 64; i++) {
      buf = admitToBuffer(buf, enc.encode(body))
      expect(seamCarryOf(buf)).toBeLessThanOrEqual(MAX_SEAM_CARRY)
    }
    buf = admitToBuffer(buf, enc.encode(" tail"))
    // 4MB of secret body absorbed into ONE placeholder; the buffer never grew with it.
    expect(dec.decode(buf)).toBe("head [REDACTED] tail")
    expect(byteOccurrences(buf, "ZZZZZZZZ")).toBe(0)
  })

  it("a mid-stream incomplete prefix is held IN the buffer and is never a credential", () => {
    const buf = admitToBuffer(new Uint8Array(0), enc.encode("trailing prefix ghp_ABCDE"))
    expect(seamCarryOf(buf)).toBe(9)
    // it is carried, but it is visible and it is NOT redactable — no content is silently withheld
    expect(dec.decode(buf)).toBe("trailing prefix ghp_ABCDE")
    expect(Array.from(scrub(buf))).toEqual(Array.from(buf))
    // one more byte completes it, and the earlier bytes are retro-actively redacted
    expect(dec.decode(admitToBuffer(buf, enc.encode("F!")))).toBe("trailing prefix [REDACTED]!")
  })
})

describe("PERSIST-10a seam — TOTAL and fail-closed", () => {
  // Inputs whose BYTES cannot be read at all. These must be withheld (treated as empty), never forwarded.
  const UNREADABLE: unknown[] = [null, undefined, 0, 42, "", "ghp_ABCDEFGH", {}, [], NaN, true, () => 0]
  // Inputs that ARE genuine byte containers, just not a Uint8Array. These are read, and scrubbed.
  const READABLE: unknown[] = [new ArrayBuffer(4), new Int8Array([1, -2]), new Uint8ClampedArray([7, 8])]

  it("never throws on malformed or adversarial input, for any pair", () => {
    for (const a of [...UNREADABLE, ...READABLE]) {
      for (const b of [...UNREADABLE, ...READABLE]) {
        expect(() => scrub(a as Uint8Array)).not.toThrow()
        expect(() => admitToBuffer(a as Uint8Array, b as Uint8Array)).not.toThrow()
      }
    }
    expect(() => seamCarryOf(null as unknown as Uint8Array)).not.toThrow()
    expect(seamCarryOf(null as unknown as Uint8Array)).toBe(0)
  })

  it("an input whose bytes cannot be read is WITHHELD, never forwarded unscrubbed", () => {
    for (const a of UNREADABLE) {
      // teeth (breaks-on 'a non-byte input is coerced to a string and passed through'): the string
      // 'ghp_ABCDEFGH' is in UNREADABLE precisely so a stringifying coercion would show up as a leak.
      expect(scrub(a as Uint8Array).length).toBe(0)
      for (const b of UNREADABLE) expect(admitToBuffer(a as Uint8Array, b as Uint8Array).length).toBe(0)
    }
  })

  it("a non-Uint8Array byte container is read and scrubbed, not silently dropped", () => {
    for (const r of READABLE) expect(scrub(r as Uint8Array).length).toBe((r as ArrayBufferLike).byteLength)
    const asInt8 = new Int8Array(enc.encode(`x ${SECRET_A} y`))
    expect(dec.decode(scrub(asInt8 as unknown as Uint8Array))).toBe("x [REDACTED] y")
  })

  it("a buffer this module did not produce still has its SEAM re-examined", () => {
    // No state to read, so the widest window a split credential could occupy is rescanned rather than
    // assumed clean — a stream resumed from a fetched body still cannot smuggle a secret across the join.
    const foreign = enc.encode("resumed ghp_ABC")
    expect(dec.decode(admitToBuffer(foreign, enc.encode("DEF!")))).toBe("resumed [REDACTED]!")
    // and a foreign buffer with nothing to join is left byte-identical
    const plain = enc.encode("resumed cleanly")
    expect(dec.decode(admitToBuffer(plain, enc.encode(" more")))).toBe("resumed cleanly more")
  })

  it("the ABSORB state is never GUESSED from the buffer contents", () => {
    // A record may legitimately contain the placeholder followed by token characters. Inferring 'we are
    // mid-secret' from a trailing [REDACTED] would silently eat that content, so it is not inferred: only
    // state this module actually recorded is trusted.
    const foreign = enc.encode("prior value was [REDACTED]")
    expect(dec.decode(admitToBuffer(foreign, enc.encode("abc123 and on")))).toBe(
      "prior value was [REDACTED]abc123 and on",
    )
  })
})

describe("PERSIST-10a seam — REACHABILITY CALIBRATION (this seam has no production caller)", () => {
  // A rigorous suite over a module nothing calls is not evidence about the shipped path — this repo has
  // been caught by exactly that before (a write door with zero production callers). `scrub.ts`'s header
  // says so in prose; prose rots, so the fact is pinned here. When someone DOES wire the streaming gate
  // into a product path, this test fails and the header must be re-calibrated in the same commit.
  const src = (rel: string): string =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", rel), "utf8")

  /** A CALL to `admitToBuffer` in CODE. Three things must not count, and each one produced a false
   *  positive while this was written: its own declaration (`export function admitToBuffer(`), a whole-line
   *  comment, and a trailing comment — `scrub.ts`'s header describes the fold in prose, parentheses and
   *  all. The mutant test below is what keeps the stripping from silently blinding the probe. */
  const callsSeam = (text: string): boolean =>
    text
      .split("\n")
      .map((line) => (/^\s*(?:\/\/|\*|\/\*)/.test(line) ? "" : line.replace(/\/\/.*$/, "")))
      .some((line) => /(?<![.\w])admitToBuffer\s*\(/.test(line) && !/function\s+admitToBuffer/.test(line))

  it("the probe SEES a caller when there is one (mutant on the real door), and there is none", () => {
    const door = src("transcript-store.ts")
    const mutant = door.replace(
      "const admitted = scrub(body)",
      "const admitted = admitToBuffer(new Uint8Array(0), body);",
    )
    // teeth (breaks-on "the probe is a comment/definition match, so it would report 'no caller' forever"):
    expect([mutant !== door, callsSeam(mutant)]).toEqual([true, true]) // live anchor, and the probe fires
    // …and it is NOT satisfied by the declaration, a whole-line comment, or a trailing one
    expect(callsSeam("export function admitToBuffer(existing: Uint8Array, chunk: Uint8Array): Uint8Array {")).toBe(
      false,
    )
    expect(callsSeam("// the ordinary `buffer = admitToBuffer(buffer, chunk)` fold carries it for free.")).toBe(false)
    expect(callsSeam("const x = 1; // see admitToBuffer(a, b)")).toBe(false)
    expect(callsSeam("  buffer = admitToBuffer(buffer, chunk);")).toBe(true) // a real call, indented
    expect(callsSeam("  const out = store.admitToBuffer(a, b);")).toBe(false) // a METHOD of something else
    // the shipped door: `put` admits `scrub(body)` — the WHOLE-BUFFER path
    expect(door).toContain("const admitted = scrub(body)")
    expect(callsSeam(door)).toBe(false)
  })

  it("NO module under src/ folds a stream through the seam", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src")
    // Not empty any more? The seam IS live: re-calibrate scrub.ts's reachability header and re-read the
    // severity of everything in it, in the same commit.
    expect(readdirSync(dir).filter((f) => f.endsWith(".ts") && callsSeam(src(f)))).toEqual([])
  })
})
