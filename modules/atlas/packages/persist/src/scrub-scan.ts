// @atlas/persist — src/scrub-scan.ts  (WP-3.5-a.PERSIST · PERSIST-10a)
//
// THE ONE DEFINITION OF WHAT A CREDENTIAL IS, IN A STRING. `scrub` and the streaming write gate both go
// through this file, so there is exactly one answer to "where are the credentials" and no second
// implementation for the two paths to disagree about.
//
// It is a LEFTMOST walk, not a pass-per-shape `replace`: at each position, ask each declared shape whether a
// complete credential starts exactly HERE; on a hit, emit the placeholder and resume AFTER it; otherwise
// advance one character. Pass-per-shape was equivalent only while no two families could open at the same
// position and no family's body could contain another's prefix — the second is what the union lookahead
// buys, the first is now a mechanical gate (scrub-shapes.ts). A single walk needs neither argument, and its
// output cannot depend on the order families happen to be declared in.
//
// ── THE SEAM CUT, AND WHY IT IS A SEPARATE QUESTION FROM "WHERE ARE THE MATCHES" ─────────────────────
// A streaming caller has only a PREFIX of the stream. The write gate's invariant is that after every admit
// the buffer equals `scrub` of everything admitted so far — so it emits `scrub(prefix)` and additionally
// records where that answer could still CHANGE when more bytes arrive. `seamCut` computes that boundary:
//
//   (1) a match that reaches the end of the prefix can still GROW;
//   (2) a not-yet-complete candidate can still be COMPLETED — it starts at most `MAX_PARTIAL` from the end;
//   (3) …and if either of those lands INSIDE an already-matched region, the whole match is undecided, not
//       just its tail.
//
// (3) is the case the previous two-field seam could not express. `ghp_AAAAAAgithub_` is a complete
// github-token match whose LAST SEVEN BYTES are simultaneously a strict prefix of `github_pat_`: the match
// no longer touches the end of the prefix (the `_` is past it, since `_` is not a github-token body
// character) while its ambiguity still reaches into it. Measured before this rewrite: whole-buffer
// `ghp_AAAAAAgithub_pat_BBBBBB` → `[REDACTED][REDACTED]`, byte-at-a-time → `[REDACTED]_pat_BBBBBB`. Relaxing
// the cut out to the enclosing match makes the whole redaction provisional and re-decidable, which is what
// "unify the two carries into one" actually means in code.

import { AMBIGUOUS_TAIL, MAX_PARTIAL, REDACTION, SHAPES, SHAPES_BY_OPENER } from "./scrub-shapes.js"
import type { CredentialShape } from "./scrub-shapes.js"

/** A credential occurrence, as a half-open `[start, end)` span over the latin1 view. */
export interface Match {
  readonly start: number
  readonly end: number
  /** Index into `SHAPES`. */
  readonly shape: number
}

const NONE: readonly CredentialShape[] = []

/** Which shapes, if any, could open at `i`. Table lookup — see `SHAPES_BY_OPENER`. */
function openers(s: string, i: number): readonly CredentialShape[] {
  const code = s.charCodeAt(i)
  return code < 256 ? (SHAPES_BY_OPENER[code] as readonly CredentialShape[]) : NONE
}

/**
 * Every credential occurrence in `s`, leftmost-first and non-overlapping. Scanning resumes AFTER a match,
 * never inside it, so a credential written immediately after another is found as its own match rather than
 * being absorbed into the first one's greedy body (the union lookahead in the shape is what stops the first
 * body from reaching it in the first place).
 */
export function scanMatches(s: string): readonly Match[] {
  const out: Match[] = []
  let i = 0
  while (i < s.length) {
    const here = openers(s, i)
    let end = -1
    for (const shape of here) {
      shape.at.lastIndex = i
      const m = shape.at.exec(s)
      if (m !== null) {
        end = i + m[0].length
        out.push({ start: i, end, shape: SHAPES.indexOf(shape) })
        break
      }
    }
    i = end === -1 ? i + 1 : end
  }
  return out
}

/** Replace each match with the placeholder; every other byte is copied verbatim. */
export function render(s: string, matches: readonly Match[]): string {
  if (matches.length === 0) return s
  let out = ""
  let at = 0
  for (const m of matches) {
    out += s.slice(at, m.start) + REDACTION
    at = m.end
  }
  return out + s.slice(at)
}

/** The whole-buffer answer: redact every declared credential shape, preserve every other byte. */
export function scrubString(s: string): string {
  return render(s, scanMatches(s))
}

/**
 * Render only `s[0, cut)`, REUSING the matches found over the whole of `s`.
 *
 * NOT `scrubString(s.slice(0, cut))`, and the difference is load-bearing. A body's lookahead at position p
 * reads up to |longest family prefix| bytes PAST p, so truncating on the right can remove the very prefix
 * that blocked a body and turn a non-match into a match: `ghp_AAAAAgithub_pat_XXXX` has no credential in it
 * at all (the `github_pat_` at index 9 cuts the github-token body to five characters), but its 15-byte
 * prefix `ghp_AAAAAgithub` scrubs to `[REDACTED]`. Deciding the head from the matches of the FULL `s` cannot
 * make that mistake, and it is one scan cheaper. Left-truncation — what the carry does — is safe by
 * contrast: the scan is left-to-right and no lookahead reads backwards.
 *
 * Requires `cut` not to fall strictly inside a match, which is exactly what `seamCut` step (3) guarantees.
 *
 * ⚠ DEFENCE IN DEPTH, WITH NO BEHAVIOURAL TEST COVERING IT — do not let a future "simplification" past on
 * the grounds that the suite stays green. An independent security review measured this: right-truncation is
 * genuinely unsound (11,042 of the legal cuts over 28,323 inputs disagree), but AT THE CUT `seamCut`
 * ACTUALLY RETURNS the two agree 28,323/28,323, and swapping this function for the unsound
 * `scrubString(s.slice(0, cut))` survives 374,414 differential cases with 0 failures. No test can detect its
 * removal today. It is kept because it makes the head independent of the cut rule rather than coupled to it,
 * so a future `seamCut` change cannot silently reintroduce the hazard. Note the hazard's DIRECTION: removing
 * a blocking lookahead can only ADD matches, i.e. over-redaction, never a leak.
 */
export function renderPrefix(s: string, matches: readonly Match[], cut: number): string {
  let out = ""
  let at = 0
  for (const m of matches) {
    if (m.end > cut) break
    out += s.slice(at, m.start) + REDACTION
    at = m.end
  }
  return out + s.slice(at, cut)
}

/** Could a credential START at `p` and still be incomplete at the end of `s`? */
function isPartialStart(s: string, p: number): boolean {
  const here = openers(s, p)
  if (here.length === 0) return false
  const tail = s.slice(p)
  for (const shape of here) if (shape.partial.test(tail)) return true
  return false
}

/**
 * Where the answer for `s` stops being final. Everything before the returned index is decided for good;
 * everything from it on must be carried and re-decided when the next chunk arrives.
 *
 * Note that (2) only has to look at the last `MAX_PARTIAL` positions: a candidate that is still incomplete
 * must reach the end of `s`, and no `partial` can be longer than `MAX_PARTIAL`. That is what keeps the cost
 * per admit O(1) in the size of the stream rather than a re-scan of everything written so far.
 */
export function seamCut(s: string, matches: readonly Match[]): number {
  let cut = s.length
  const last = matches[matches.length - 1]
  if (last !== undefined && last.end === s.length) cut = last.start // (1) it can still grow
  for (let p = Math.max(0, s.length - MAX_PARTIAL); p < cut; p++) {
    if (isPartialStart(s, p)) {
      cut = p // (2) leftmost candidate that could still be completed
      break
    }
  }
  for (const m of matches) {
    if (m.start < cut && cut < m.end) {
      cut = m.start // (3) the undecided region begins inside a match — the whole match is provisional
      break
    }
  }
  return cut
}

/**
 * Shrink the absorbed body of any UNBOUNDED match in a carry down to a canonical, bounded stand-in.
 *
 * WHY THIS IS THE THING THAT BOUNDS MEMORY. A caller can stream `ghp_` and then megabytes of token
 * characters. All of it is one match, all of it is undecided (it can still grow), and holding it raw is a
 * memory DoS from ordinary use. But its body beyond the floor carries no decision: the match is a
 * `[REDACTED]` either way, and the only thing the FUTURE can still ask of those bytes is "are the last few
 * of you a strict family prefix that the next byte completes?". So the middle is replaced by `floor` copies
 * of a filler and the last `AMBIGUOUS_TAIL` body characters are kept verbatim.
 *
 * WHY IT IS SOUND. (a) The result is still a match of the same shape, so its emitted image is unchanged.
 * (b) A partial candidate starting inside a match body can begin at most `AMBIGUOUS_TAIL` characters before
 * the match ends — a COMPLETE family prefix inside a body is blocked by the union lookahead, so only a
 * strict one can be there, and a strict prefix is by definition shorter than the longest family prefix.
 * Those characters are exactly what is kept. (c) The filler appears in NO family prefix (scrub-shapes.ts,
 * gate 3), so padding cannot invent a prefix, and no prefix can span the junction between the padding and
 * the kept tail. A family with no such filler is left un-canonicalised — correct, but unbounded, which the
 * memory-bound test sees.
 */
export function canonicalise(carry: string): string {
  const matches = scanMatches(carry)
  if (matches.length === 0) return carry
  let out = ""
  let at = 0
  for (const m of matches) {
    const sh = SHAPES[m.shape]!
    if (sh.ceiling === undefined && sh.filler !== "" && m.end - m.start > sh.maxCanon) {
      const body = carry.slice(m.start + sh.prefixLen, m.end)
      out +=
        carry.slice(at, m.start) +
        carry.slice(m.start, m.start + sh.prefixLen) +
        sh.filler.repeat(sh.floor) +
        body.slice(body.length - AMBIGUOUS_TAIL)
    } else {
      out += carry.slice(at, m.end)
    }
    at = m.end
  }
  return out + carry.slice(at)
}
