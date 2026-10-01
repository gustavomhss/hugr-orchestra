// @atlas/persist — test/adjacency-oracle.ts  (WP-3.5-a.PERSIST · PERSIST-10a — fuzz ground truth)
//
// Shared, INDEPENDENT machinery for the adjacency fuzz. Nothing here imports the product: the credential
// scanner below is a hand-written character walk (no regex at all), so a mistake in the shipped regex cannot
// be reproduced here and cancel itself out in the differential.
//
// The rule it encodes is the shipped SHAPE rule, stated once, in prose:
//   a credential is a family PREFIX followed by >= `floor` characters of that family's BODY class,
//   and that body STOPS at the start of the next credential's family prefix — ANY family's, not just its
//   own. A body never swallows the prefix of the credential that follows it (which is exactly how
//   `ghp_AAAAAAghp_BBBBBB` used to collapse into one match and ship the second body in the clear, and how
//   `ghp_AAAAAAxoxb-BBBBBB` still did after the FIRST fix, whose lookahead blocked only its own family —
//   the cross-family case this file exists to reach).
// Matches are leftmost, and scanning resumes after a match (never inside it).
//
// The families are re-declared here BY HAND from the prose, not imported from the product.

export interface OracleFamily {
  readonly name: string
  /** One character-SET per prefix position ('g' = literally g, 'pousr' = any one of those). */
  readonly prefix: readonly string[]
  /** Which base class the body is drawn from: [A-Za-z0-9] or [0-9A-Z]. */
  readonly bodyBase?: "alnum" | "upper"
  /** Characters the body admits beyond its base class. */
  readonly bodyExtra: string
  /** Minimum body characters. */
  readonly floor: number
  /** Maximum body characters, for a FIXED-LENGTH family. `undefined` = unbounded. */
  readonly ceiling?: number
}

export const ORACLE_FAMILIES: readonly OracleFamily[] = [
  { name: "github-token", prefix: ["g", "h", "pousr", "_"], bodyExtra: "", floor: 6 },
  { name: "slack-token", prefix: ["x", "o", "x", "baprs", "-"], bodyExtra: "-", floor: 6 },
  // `_` IS a body character: the fine-grained PAT is `github_pat_<22>_<59>` and leaving `_` out would ship
  // the 59-character segment — where the entropy is — in the clear.
  {
    name: "github-pat",
    prefix: ["g", "i", "t", "h", "u", "b", "_", "p", "a", "t", "_"],
    bodyExtra: "_",
    floor: 22,
  },
  // BOUNDED: `AKIA` + exactly 16 uppercase/digit characters. The ceiling is the whole point — an unbounded
  // reading absorbs the 17th character on the streaming path and disagrees with the whole-buffer one.
  { name: "aws-access-key-id", prefix: ["A", "K", "I", "A"], bodyBase: "upper", bodyExtra: "", floor: 16, ceiling: 16 },
]

/** Is `s[i]` alphanumeric? charCode walk — deliberately not a regex. */
export function isAlnumAt(s: string, i: number): boolean {
  const c = s.charCodeAt(i)
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
}

/** Is `s[i]` in `fam`'s BASE class? */
function inBaseAt(fam: OracleFamily, s: string, i: number): boolean {
  const c = s.charCodeAt(i)
  if (fam.bodyBase === "upper") return (c >= 48 && c <= 57) || (c >= 65 && c <= 90)
  return isAlnumAt(s, i)
}

/** Is `s[i]` a BODY character of `fam`? */
export function isBodyChar(fam: OracleFamily, s: string, i: number): boolean {
  if (i >= s.length) return false
  return inBaseAt(fam, s, i) || fam.bodyExtra.includes(s[i] as string)
}

/** Does `fam`'s complete prefix start at `i`? */
export function prefixAt(fam: OracleFamily, s: string, i: number): boolean {
  for (let k = 0; k < fam.prefix.length; k++) {
    const ch = s[i + k]
    if (ch === undefined || !(fam.prefix[k] as string).includes(ch)) return false
  }
  return true
}

/** Does ANY declared family's prefix start at `i`? (the union the shipped lookahead must encode) */
export function anyPrefixAt(s: string, i: number): boolean {
  return ORACLE_FAMILIES.some((f) => prefixAt(f, s, i))
}

export interface Span {
  readonly start: number
  readonly end: number
  readonly family: string
}

/** Every credential occurrence in `s`, as half-open [start,end) spans, leftmost-first and non-overlapping. */
export function credentialSpans(s: string): readonly Span[] {
  const spans: Span[] = []
  let i = 0
  outer: while (i < s.length) {
    for (const fam of ORACLE_FAMILIES) {
      if (!prefixAt(fam, s, i)) continue
      const bodyStart = i + fam.prefix.length
      const stop = fam.ceiling === undefined ? Infinity : bodyStart + fam.ceiling
      let j = bodyStart
      while (j < s.length && j < stop && isBodyChar(fam, s, j) && !anyPrefixAt(s, j)) j++
      if (j - bodyStart >= fam.floor) {
        spans.push({ start: i, end: j, family: fam.name })
        i = j
        continue outer
      }
    }
    i++
  }
  return spans
}

/** True if `s` still contains a whole credential shape (the residual-shape post-condition). */
export function hasCredentialShape(s: string): boolean {
  return credentialSpans(s).length > 0
}

/** The reference redaction: every credential span replaced, every other byte kept. */
export function referenceScrub(s: string, redaction = "[REDACTED]"): string {
  let out = ""
  let at = 0
  for (const { start, end } of credentialSpans(s)) {
    out += s.slice(at, start) + redaction
    at = end
  }
  return out + s.slice(at)
}

/** Deterministic LCG — same generator the shipped sweep uses, so cases are reproducible from the seed. */
export function lcg(seed: number): () => number {
  let s = seed
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

/** Runs that are a STRICT prefix of some family prefix. Appending one to a body is what creates a CONTINGENT
 *  match — one that is a credential only while those trailing bytes are read as body, and that un-makes
 *  itself when the next bytes complete the prefix instead. Reaching this class is the whole point: an
 *  earlier fuzz that never produced it could not distinguish a correct seam from a broken one. */
export const AMBIGUOUS_TAILS: readonly string[] = [
  "g",
  "gh",
  "ghp",
  "x",
  "xo",
  "xox",
  "xoxb",
  "gi",
  "git",
  "gith",
  "githu",
  "github",
  "github_",
  "github_p",
  "github_pa",
  "github_pat",
  "A",
  "AK",
  "AKI",
]

/** CLEAN filler. EVERY piece starts with a character that is NOT a body character of ANY family, so no piece
 *  can ever be absorbed into the body of a credential that precedes it — that is what makes the expected
 *  output below exactly computable, and what makes a missing piece unambiguously OVER-redaction. Pieces that
 *  open with `_` or `-` (body characters of the github-pat / slack families) are held separately: they are
 *  still used, but only after a family whose body cannot reach them. */
export const CLEAN_PIECES: readonly string[] = [
  " ",
  " token=",
  "\n",
  " [REDACTED] ",
  " ghp_ABCDE", // five body chars: below the floor, NOT a credential — and no trailing separator
  " gha_ABCDEFGH", // not a family member
  " github_pat_ABCDEFGH", // eight body characters: below the github-pat floor of 22, so NOT a credential
  " xoxq-ABCDEFGH", // `q` is not a member of the slack family
  " xoxb-ABCDE", // below the floor for the slack family
  "=",
  "!",
  " end of line",
  ".",
  " 09:14 UTC ",
  " gh",
  " AKI",
  " AKIAIOSFODNN7EXAMP", // fourteen body characters: below the AWS ceiling AND its floor of 16
  ":",
]

/** Clean pieces that OPEN with a body character of some family. Safe only after a family that cannot eat
 *  them — `-dev` survives after a github-token (whose body excludes `-`) and is eaten after a slack token,
 *  which is the declared Slack over-redaction made visible in the corpus. */
export const BODY_OPENING_PIECES: readonly string[] = [
  "-dev",
  "-not-part-of-token",
  "-2026-08-01",
  // `_`-opening pieces moved here when github-pat was declared: `_` is a body character of exactly one
  // family, so `_prod` survives after a GitHub token and is ABSORBED after a fine-grained PAT. Leaving them
  // in CLEAN_PIECES would have scored that correct absorption as over-redaction.
  "_prod",
  "_suffix.log",
]

/**
 * The family whose BODY is still open at the end of `text` — a family prefix appears, and every character
 * after it is one of that family's body characters. The next character written decides whether those bytes
 * stay body or terminate it.
 *
 * This is deliberately NOT "the family of the last token emitted". A near-miss written as CLEAN filler
 * leaves a body open too: ` github_pat_ABCDE` is five body characters short of the floor and therefore not
 * a credential, but appending the equally-clean `_prod` to it produces `github_pat_ABCDE_prod`, whose body
 * is ten characters — a REAL credential assembled out of two pieces the construction believed were both
 * harmless. Tracking only the last token missed exactly that, and it showed up as 306 construction/scanner
 * disagreements in 20k cases (also ` xoxb-ABCDE` + `-not-part-of-token`).
 */
export function openFamily(text: string): OracleFamily | undefined {
  for (let i = text.length - 1; i >= 0; i--) {
    for (const fam of ORACLE_FAMILIES) {
      if (!prefixAt(fam, text, i)) continue
      const bodyLen = text.length - (i + fam.prefix.length)
      if (fam.ceiling !== undefined && bodyLen >= fam.ceiling) continue // bounded and already full: closed
      let ok = true
      for (let j = i + fam.prefix.length; j < text.length; j++) {
        if (!isBodyChar(fam, text, j) || anyPrefixAt(text, j)) ok = false
      }
      if (ok) return fam
    }
  }
  return undefined
}

/** Is `piece` safe to write immediately after a credential of `fam` (i.e. its first character terminates
 *  that family's body)? A piece that is not safe would be ABSORBED, and its absence would be scored as
 *  over-redaction when it is in fact correct behaviour. */
export function pieceSafeAfter(fam: OracleFamily | undefined, piece: string): boolean {
  if (fam === undefined) return true
  return !isBodyChar(fam, piece, 0)
}

export interface FuzzCase {
  /** The generated stream. */
  readonly text: string
  /** The exactly-correct redaction, computed from the construction (not from any implementation). */
  readonly expected: string
  /** The entropy-bearing bodies of the injected credentials — none may survive in the output. */
  readonly bodies: readonly string[]
  /** The clean pieces, in order — every one must survive verbatim. */
  readonly clean: readonly string[]
  /** How many distinct families the case injected (>= 2 means it reached the CROSS-FAMILY class). */
  readonly familiesUsed: number
}

interface Built {
  text: string
  expected: string
  bodies: string[]
  clean: string[]
  families: Set<string>
}

const MAX_PREFIX_LEN = Math.max(...ORACLE_FAMILIES.map((f) => f.prefix.length))

/**
 * STABILITY RULE. Appending `nxt` must not create a family-prefix START inside text that is already
 * committed, because that would silently re-cut a token the construction has already accounted for and the
 * expectation would be wrong: `ghp_AAAAAghp` + `_prod` is NOT `[REDACTED]_prod`, it is nothing at all — the
 * trailing `ghp` becomes the head of a `ghp_` prefix, the first body drops to five characters, and both
 * candidates fall below the floor. That un-making is REAL behaviour and it is covered by dedicated
 * byte-exact tests; what it must not do is corrupt the fuzz's ground truth, where it would show up as a
 * phantom leak. Only the last `MAX_PREFIX_LEN - 1` committed characters can be affected.
 */
export function wouldDisturb(text: string, nxt: string): boolean {
  const comb = text + nxt
  for (let i = Math.max(0, text.length - (MAX_PREFIX_LEN - 1)); i < text.length; i++) {
    if (anyPrefixAt(comb, i) && !anyPrefixAt(text, i)) return true
  }
  return false
}

const UPPER_DIGIT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

function makeBody(rnd: () => number, fam: OracleFamily): string {
  const base = fam.bodyBase === "upper" ? UPPER_DIGIT : ALNUM
  const alphabet = base + fam.bodyExtra.repeat(4) // the extra char, deliberately over-weighted
  const span = fam.ceiling === undefined ? Math.floor(rnd() * 10) : Math.floor(rnd() * (fam.ceiling - fam.floor + 1))
  const len = fam.floor + span
  let body = ""
  for (let i = 0; i < len; i++) body += alphabet[Math.floor(rnd() * alphabet.length)] as string
  // sometimes end on an AMBIGUOUS run, so the contingent-match path is actually reached. A BOUNDED family
  // has no room to append one, so the run REPLACES the body's own tail — which is the harder case: the run
  // is inside a body that is already exactly at its ceiling.
  if (rnd() < 0.35) {
    const tail = AMBIGUOUS_TAILS[Math.floor(rnd() * AMBIGUOUS_TAILS.length)] as string
    if (![...tail].every((c) => isBodyChar(fam, c, 0))) return body
    if (fam.ceiling === undefined) return body + tail
    if (tail.length <= body.length) return body.slice(0, body.length - tail.length) + tail
  }
  return body
}

/** Append `nxt` to the case, refusing it if it would re-cut what is already committed. */
function append(b: Built, nxt: string, expected: string): boolean {
  if (wouldDisturb(b.text, nxt)) return false
  b.text += nxt
  b.expected += expected
  return true
}

function emitToken(rnd: () => number, b: Built): OracleFamily | undefined {
  const fam = ORACLE_FAMILIES[Math.floor(rnd() * ORACLE_FAMILIES.length)] as OracleFamily
  const prefix = fam.prefix.map((set) => set[Math.floor(rnd() * set.length)] as string).join("")
  const body = makeBody(rnd, fam)
  if (!append(b, prefix + body, "[REDACTED]")) return undefined
  b.bodies.push(body)
  b.families.add(fam.name)
  return fam
}

/**
 * Build one fuzz case: clean filler interleaved with RUNS of credentials, where a run is 1..3 credentials
 * with NO separator between them (the class the shipped sweep could never reach — it injected exactly one
 * token per case, and then only ever from ONE family) or joined by a single separator character. Families
 * are drawn independently per token, so a run mixes them.
 */
export function makeCase(rnd: () => number, opts: { readonly minRun: number; readonly maxRun: number }): FuzzCase {
  const b: Built = { text: "", expected: "", bodies: [], clean: [], families: new Set() }
  const items = 1 + Math.floor(rnd() * 4)
  for (let k = 0; k < items; k++) {
    if (rnd() < 0.45) {
      const pool = rnd() < 0.3 ? BODY_OPENING_PIECES : CLEAN_PIECES
      const piece = pool[Math.floor(rnd() * pool.length)] as string
      // a piece opening on a body character of the PRECEDING family would be absorbed — correctly, so it is
      // not written at all rather than written and then scored as over-redaction
      if (!pieceSafeAfter(openFamily(b.text), piece)) continue
      if (!append(b, piece, piece)) continue
      b.clean.push(piece)
      continue
    }
    const run = opts.minRun + Math.floor(rnd() * (opts.maxRun - opts.minRun + 1))
    for (let t = 0; t < run; t++) {
      if (t > 0) {
        const glue = rnd() < 0.5 ? "" : (["_", "-"][Math.floor(rnd() * 2)] as string)
        // a separator that IS a body character of the still-open family would be absorbed by it
        if (glue !== "" && pieceSafeAfter(openFamily(b.text), glue)) append(b, glue, glue)
      }
      emitToken(rnd, b)
    }
  }
  return { text: b.text, expected: b.expected, bodies: b.bodies, clean: b.clean, familiesUsed: b.families.size }
}

/** Cut `s` into random chunks of 1..maxLen characters. */
export function chunkRandomly(s: string, rnd: () => number, maxLen = 5): readonly string[] {
  const parts: string[] = []
  let p = 0
  while (p < s.length) {
    const len = 1 + Math.floor(rnd() * maxLen)
    parts.push(s.slice(p, p + len))
    p += len
  }
  return parts
}
