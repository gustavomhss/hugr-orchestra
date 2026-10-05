// @atlas/persist — src/scrub-shapes.ts  (WP-3.5-a.PERSIST · PERSIST-10a)
//
// WHAT A CREDENTIAL SHAPE IS, and how one is DERIVED from a family declaration.
//
// Every number the seam machinery depends on (`minFull`, `maxPartial`, and the global carry bound) and every
// regex it matches with (`at`, `full`, `partial`) is COMPUTED here from one small declaration per family: the
// prefix that opens it, the characters its body is drawn from, and how many body characters it takes to clear
// the floor (and, for a BOUNDED family, how many it may not exceed). Hand-writing those per family is how a
// family gets declared with a bound that is one byte too small — which is not a missed match but a
// CHUNK-DEPENDENCE bug, i.e. a secret that leaks only for some chunkings. Declaring the family and deriving
// the rest makes that unrepresentable.
//
// ── WHY THE BODY LOOKAHEAD IS THE UNION OF ALL FAMILIES, NOT EACH FAMILY'S OWN ──────────────────────
// A body character class is greedy over characters that also spell a family prefix, so two credentials
// written back to back merge into ONE match and the second body ships in the clear. Blocking only a shape's
// OWN prefix fixes that within a family and leaves it wide open ACROSS families: with the own-prefix
// lookahead, `ghp_AAAAAA` immediately followed by `github_pat_…` matches through `…AAAAAAgithub` and emits
// `[REDACTED]_pat_<body>` — the fine-grained PAT's entropy-bearing body, in the clear, in an immutable
// content-addressed object. The lookahead below is therefore the union of EVERY declared family prefix.
//
// The union is also what makes the multi-shape composition sound at all. A single LEFTMOST walk applies all
// families together (see scrub-scan.ts), and that walk is well defined only if at most one family prefix can
// open at any one position — which the disjointness gate below makes mechanical.
//
// ── WHAT REPLACED THE "NO NON-ALPHANUMERIC BEFORE THE LAST PREFIX POSITION" RULE ────────────────────
// The previous descriptor derived a per-shape `blockPrefix` by enumerating the strict prefixes of every
// family that were spellable in THIS shape's body characters, and STOPPED at the first position this shape's
// body could not spell. `github_pat_` carries a `_` at position 7, so that enumeration stopped at `github`
// and the seam then absorbed `github` into the preceding redaction the moment a `_` arrived — measured:
// byte-at-a-time `ghp_AAAAAAgithub_pat_BBBBBB` → `[REDACTED]_pat_BBBBBB` against a whole-buffer
// `[REDACTED][REDACTED]`. A mechanical gate rejected such a family outright.
//
// That rule is gone because the thing it protected is gone: the seam no longer carries a per-shape ambiguous
// tail at all. It carries the raw undecided SUFFIX of the stream (scrub.ts) and re-derives every decision
// from a single scan, so a strict family prefix that reaches out of one shape's body class into another's is
// just an ordinary undecided suffix. What is mechanical now, and enforced by test, is:
//   (1) PREFIX DISJOINTNESS — no two families' prefixes can open at the same position;
//   (2) REDACTION FITS      — every family's shortest match is at least as long as the placeholder, so the
//                             emitted image of a carry is never LONGER than the carry it stands for;
//   (3) A PREFIX-FREE FILLER exists per family — a body character appearing in NO family prefix, so the
//                             seam may canonicalise a long absorbed body without inventing a prefix;
//   (4) THE BOUNDS ARE ARITHMETIC on the declaration, and the measured carry never exceeds them.

/** Body base classes, as regex class bodies. A family picks one and may add at most one extra character. */
const ALNUM = "A-Za-z0-9"
const UPPER = "0-9A-Z"

export type BodyBase = "alnum" | "upper"

/**
 * One credential FAMILY — the whole declaration. Everything on `CredentialShape` is derived from it.
 *
 * `prefix` is one entry per character POSITION, and each entry is the SET of characters that position
 * admits (`'g'` = literally g; `'pousr'` = any one of those). It is declared as sets rather than as a regex
 * because the derivation has to ENUMERATE the prefix's strict prefixes, and you cannot enumerate the strict
 * prefixes of an opaque regex source.
 */
export interface CredentialFamily {
  readonly name: string
  /** The opening prefix, one character-SET per position. */
  readonly prefix: readonly string[]
  /** Which base class the body is drawn from. Default `alnum`. */
  readonly bodyBase?: BodyBase
  /** Characters this family's body admits BEYOND its base class — at most one. */
  readonly bodyExtra: string
  /** The minimum number of BODY characters after the prefix. */
  readonly floor: number
  /** The maximum number of BODY characters, for a FIXED-LENGTH family. `undefined` = unbounded (`{n,}`).
   *  A bounded family must stop absorbing at its ceiling or the streaming path and the whole-buffer path
   *  disagree: `AKIAIOSFODNN7EXAMPLEX` scrubbed to `[REDACTED]X` whole-buffer and `[REDACTED]` chunked,
   *  because the seam kept absorbing the trailing `X` that the shape has no room for. */
  readonly ceiling?: number
}

/**
 * The declared families. FOUR — not "credentials" in general. Anything not listed here is NOT redacted, and
 * the docs say so in those words. The shapes deliberately left out are recorded at the bottom of this file,
 * with the measurement that disqualified each.
 */
export const FAMILIES: readonly CredentialFamily[] = [
  {
    // GitHub token: ghp_ / gho_ / ghu_ / ghs_ / ghr_ + >= 6 token characters. Single-segment; `_` is the
    // prefix separator and is NOT a body character, so `ghp_ABCDEF_prod` keeps `_prod`.
    name: "github-token",
    prefix: ["g", "h", "pousr", "_"],
    bodyExtra: "",
    floor: 6,
  },
  {
    // Slack token: xoxb- / xoxa- / xoxp- / xoxr- / xoxs- + >= 6 body characters.
    //
    // OVER-REDACTION, DECLARED: a real Slack token is MULTI-SEGMENT (`xoxb-<id>-<id>-<secret>`) and `-` is
    // both its segment separator and, necessarily, a body character. Excluding `-` from the body would match
    // only the first segment and ship the trailing entropy-bearing segment in the clear — a leak, which for
    // a credential control is strictly worse than the alternative. So `-` IS a body character, and the cost
    // is that hyphen-joined NON-secret text immediately following a Slack token is absorbed into the
    // redaction: `xoxb-A1B2C3-not-part-of-token` redacts whole. It is bounded by the first non-body byte
    // (space, quote, newline, `=`, `.`), and can only ever trigger AFTER a literal `xox[baprs]-`.
    name: "slack-token",
    prefix: ["x", "o", "x", "baprs", "-"],
    bodyExtra: "-",
    floor: 6,
  },
  {
    // GitHub FINE-GRAINED PAT: `github_pat_` + 22 characters + `_` + 59 characters.
    //
    // TWO things had to be true before this family could be declared, and both are load-bearing:
    //
    //  (a) `_` IS A BODY CHARACTER. The token is two segments joined by `_`. Excluding `_` from the body
    //      would match `github_pat_` + the 22-character segment and ship the 59-character segment — where
    //      the entropy actually lives — IN THE CLEAR. That is the same defect the Slack separator has, in a
    //      different costume, and for a credential control it is strictly worse than over-redacting. The
    //      cost, symmetric with Slack's: `_`-joined NON-secret text immediately after a PAT is absorbed
    //      (`github_pat_<22>_<59>_prod` redacts whole), bounded by the first non-body byte.
    //  (b) The seam had to stop deriving a per-shape ambiguous tail. `github_`'s `_` is a body character of
    //      THIS family and of no other, so a `github_` sitting at the end of a github-token body is a strict
    //      family prefix that the github-token shape cannot spell — the exact state the old two-field seam
    //      could not represent. See the header of this file and the seam note in scrub.ts.
    //
    // floor 22 is the FIRST segment's length, so `github_pat_` + a short fragment is not a credential and is
    // not redacted (`github_pat_ABCDEFGH` passes through). A real token clears it many times over.
    name: "github-pat",
    prefix: ["g", "i", "t", "h", "u", "b", "_", "p", "a", "t", "_"],
    bodyExtra: "_",
    floor: 22,
  },
  {
    // AWS ACCESS KEY ID: `AKIA` + exactly 16 uppercase/digit characters. The FIRST bounded family, and the
    // reason `ceiling` exists: with an unbounded body the streaming path absorbed one more character than
    // the whole-buffer path ever could — `AKIAIOSFODNN7EXAMPLEX` → `[REDACTED]X` whole-buffer vs
    // `[REDACTED]` chunked. `ceiling: 16` makes the shape stop where the credential stops, on BOTH paths.
    //
    // Only the ACCESS KEY ID. The AWS SECRET access key has no distinctive prefix and is NOT declared —
    // see the bottom of this file.
    name: "aws-access-key-id",
    prefix: ["A", "K", "I", "A"],
    bodyBase: "upper",
    bodyExtra: "",
    floor: 16,
    ceiling: 16,
  },
]

/** The redaction placeholder written in place of a matched secret. Declared here because gate (2) — every
 *  family's shortest match is at least this long — is a property of the DECLARATION, not of the writer. */
export const REDACTION = "[REDACTED]"

/**
 * A credential SHAPE, described completely enough to be recognised ACROSS a chunk boundary. `full` alone is
 * not enough: to decide the tail of a chunk you must also know what a not-yet-complete prefix looks like
 * (`partial`), and be able to ask "does a credential start exactly HERE?" without scanning forward (`at`).
 */
export interface CredentialShape {
  /** The family this shape was derived from (diagnostics; never matched against). */
  readonly name: string
  /** STICKY (`y`); matches a complete credential starting exactly at `lastIndex`. The leftmost scan's atom. */
  readonly at: RegExp
  /** g-flagged; the same source, for whole-buffer diagnostics and for tests. */
  readonly full: RegExp
  /** Anchored; matches a STRICT prefix — not a credential yet, but more bytes could make it one. */
  readonly partial: RegExp
  /** How many characters the opening prefix occupies. */
  readonly prefixLen: number
  /** Minimum / maximum body characters (`ceiling: undefined` = unbounded). */
  readonly floor: number
  readonly ceiling: number | undefined
  /** A body character of this family that appears in NO family prefix, so a canonicalised body can be
   *  padded with it without inventing a prefix. `''` if none exists — see gate (3). */
  readonly filler: string
  /** The shortest string `full` can match. */
  readonly minFull: number
  /** The longest string `partial` can match. */
  readonly maxPartial: number
  /** The longest a match of this shape can be once the seam has canonicalised it. */
  readonly maxCanon: number
}

// ── derivation ──────────────────────────────────────────────────────────────────────────────────────

const baseOf = (f: CredentialFamily): string => (f.bodyBase === "upper" ? UPPER : ALNUM)

function inBase(f: CredentialFamily, c: string): boolean {
  const n = c.charCodeAt(0)
  const digit = n >= 48 && n <= 57
  const upper = n >= 65 && n <= 90
  const lower = n >= 97 && n <= 122
  return f.bodyBase === "upper" ? digit || upper : digit || upper || lower
}

/** Is `c` a BODY character of `f`? The single definition; the regex class below is built from it. */
export function inBody(f: CredentialFamily, c: string): boolean {
  return c !== "" && (inBase(f, c) || f.bodyExtra.includes(c))
}

/** One prefix POSITION as regex source. Every declared character is `[A-Za-z0-9_-]` (asserted by test), all
 *  of which are literal outside a character class and safe last-position inside one — no escaping needed. */
function atom(set: string): string {
  return set.length === 1 ? set : `[${set}]`
}

const prefixSrc = (f: CredentialFamily): string => f.prefix.map(atom).join("")
const bodyClass = (f: CredentialFamily): string => `[${baseOf(f)}${f.bodyExtra}]`
const quantifier = (f: CredentialFamily): string =>
  f.ceiling === undefined ? `{${f.floor},}` : `{${f.floor},${f.ceiling}}`

/** The union of every declared family prefix — what a body character may NOT open. */
export const ANY_FAMILY_PREFIX = `(?:${FAMILIES.map(prefixSrc).join("|")})`

/** A body character of `f` that does not open ANY family's prefix. The one lookahead that stops a credential
 *  from swallowing the credential written immediately after it, whatever family that one belongs to. */
const bodyAtom = (f: CredentialFamily): string => `(?:(?!${ANY_FAMILY_PREFIX})${bodyClass(f)})`

/** Every character that appears anywhere in any family prefix — the set a canonicalisation filler must avoid. */
const PREFIX_CHARS = new Set<string>(FAMILIES.flatMap((f) => f.prefix.flatMap((set) => [...set])))

/** The first body character of `f` that appears in no family prefix. `'0'` for every family declared today
 *  (no prefix contains a digit), which is what makes canonicalising an absorbed body safe. */
function fillerFor(f: CredentialFamily): string {
  for (const c of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz") {
    if (inBody(f, c) && !PREFIX_CHARS.has(c)) return c
  }
  return ""
}

/** Derive the full shape from a family declaration. Every bound is arithmetic on the declaration:
 *
 *    minFull    = |prefix| + floor                  the shortest complete match
 *    maxPartial = |prefix| + floor - 1              one body character short of the floor
 *    maxCanon   = bounded ? |prefix| + ceiling      a bounded match cannot grow past its ceiling
 *                         : minFull + AMBIGUOUS_TAIL   an unbounded body is canonicalised down to the floor
 *                                                      plus the longest strict family prefix that could
 *                                                      still be sitting at its end
 */
export function shapeOf(f: CredentialFamily): CredentialShape {
  const p = prefixSrc(f)
  const own: string[] = []
  for (let k = 1; k < f.prefix.length; k++) own.push(f.prefix.slice(0, k).map(atom).join(""))
  const src = `${p}${bodyAtom(f)}${quantifier(f)}`
  const minFull = f.prefix.length + f.floor
  return {
    name: f.name,
    at: new RegExp(src, "y"),
    full: new RegExp(src, "g"),
    partial: new RegExp(`^(?:${own.join("|")}|${p}${bodyClass(f)}{0,${f.floor - 1}})$`),
    prefixLen: f.prefix.length,
    floor: f.floor,
    ceiling: f.ceiling,
    filler: fillerFor(f),
    minFull,
    maxPartial: minFull - 1,
    maxCanon: f.ceiling === undefined ? minFull + AMBIGUOUS_TAIL : f.prefix.length + f.ceiling,
  }
}

/** The longest run that can be a STRICT prefix of some family prefix. Nothing longer can sit ambiguously at
 *  the end of a stream: a COMPLETE family prefix inside a match body is blocked by the union lookahead, so
 *  the only prefix bytes a body can hold are the ones still short of one. */
export const AMBIGUOUS_TAIL = Math.max(...FAMILIES.map((f) => f.prefix.length)) - 1

export const SHAPES: readonly CredentialShape[] = FAMILIES.map(shapeOf)

/** The widest window in which a not-yet-complete candidate can begin. */
export const MAX_PARTIAL = Math.max(...SHAPES.map((s) => s.maxPartial))

/** The longest a single canonicalised match can be. */
export const MAX_CANON_MATCH = Math.max(...SHAPES.map((s) => s.maxCanon))

/**
 * The hard ceiling on undecided bytes the seam may hold at a chunk boundary, and on the trailing emitted
 * bytes that are still provisional. DERIVED, not guessed:
 *
 *   a carry begins either at a not-yet-complete candidate — at most MAX_PARTIAL bytes from the end — or at
 *   the start of the match that ENCLOSES such a candidate. In the second case the match itself is at most
 *   MAX_CANON_MATCH bytes once canonicalised, and the bytes after it are strictly fewer than MAX_PARTIAL
 *   (the candidate they must contain starts inside the match).
 *
 * The emitted side cannot exceed the raw side because every family's shortest match is at least as long as
 * the placeholder it is replaced by (gate 2), so redaction never lengthens.
 */
export const MAX_SEAM_CARRY = MAX_CANON_MATCH + MAX_PARTIAL - 1

/**
 * Fast dispatch for the leftmost scan: for each character code, WHICH shapes can open there (empty for the
 * overwhelming majority). A credential-free megabyte then costs one array lookup per byte instead of one
 * regex attempt per byte per family, and an `x` never pays for the three families that cannot start with it.
 */
export const SHAPES_BY_OPENER: readonly (readonly CredentialShape[])[] = (() => {
  const t: CredentialShape[][] = Array.from({ length: 256 }, () => [])
  SHAPES.forEach((shape, i) => {
    for (const c of FAMILIES[i]!.prefix[0] as string) (t[c.charCodeAt(0) & 0xff] as CredentialShape[]).push(shape)
  })
  return t
})()

// ── DELIBERATELY NOT DECLARED (each was measured; each breaks something specific) ────────────────────
//
// A family belongs above only if it is PREFIXED and describable as "prefix + a run of one body class,
// between a floor and an optional ceiling". The three below are none of those, and adding one without first
// extending the descriptor is a REGRESSION, not a coverage win. Each entry also records what the seam
// rework (#120) changed for it, because "we deferred it" is worth much less than "here is what is left":
//
//  · JWT `eyJ…` — MULTI-SEGMENT with a `.` separator that is NOT a base64url character. Widening the body
//    to include `.` would swallow ordinary prose after any base64 blob; leaving it out matches the HEADER
//    segment only and ships the SIGNATURE in the clear. Needs a segment-aware descriptor (a repeated
//    <separator, class> pair with a per-segment floor), not one body class. NOTE: the `_`-in-body fix that
//    let `github_pat_` in does NOT generalise here — a PAT's separator is a body character of the same
//    class, a JWT's is not, which is exactly the distinction the descriptor cannot yet express.
//    CHEAPER NOW, in one specific way, and it exposes a sharper blocker: the old "the whole-buffer path and
//    the streaming path disagree" half of this was a `full`-vs-`cont` mismatch, and `cont` no longer exists
//    — the streaming path re-scans its carry with the SAME `full`, so that class of disagreement is
//    unrepresentable. What is left is (a) the segment-aware descriptor and (b) a NEW, concrete requirement
//    this rework makes visible: a JWT's `partial` (`header.payload` with no signature yet) is UNBOUNDED, so
//    `MAX_PARTIAL` — and with it the seam carry every stream pays — would be unbounded. Declaring JWT means
//    first teaching `canonicalise` to shrink an in-progress PARTIAL, not only a completed match.
//  · PEM `-----BEGIN … PRIVATE KEY-----` — needs "absorb until the `-----END …-----` TERMINATOR". There is
//    no terminator field at all, and it would need a BOUND as well, or a missing END line eats the rest of
//    the transcript into one placeholder. CHEAPER NOW on one axis: its prefix is non-alphanumeric at every
//    position, which the retired "no non-alphanumeric before the last prefix position" gate rejected
//    outright; the disjointness gate that replaced it passes `-----BEGIN ` without complaint. Unchanged on
//    the terminator axis, and it inherits the same unbounded-`partial` problem as JWT.
//  · AWS SECRET access key — 40 base64 characters with NO distinctive prefix. Shape alone cannot tell it
//    from any other base64 blob (over-redaction of ordinary content); it needs a CONTEXT field
//    (`aws_secret_access_key\s*=`), which inflates `maxPartial` to the context length and with it the seam
//    carry every stream pays for. `AKIA…` above is the ACCESS KEY ID only, which is not the secret half.
//    NO CHEAPER. The context field is still a new concept, and the carry cost it imposes is now a single
//    derived, tested number (`MAX_SEAM_CARRY`) instead of a per-shape one — more visible, not smaller.
