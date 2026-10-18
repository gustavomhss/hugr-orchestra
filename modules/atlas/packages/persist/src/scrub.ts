// @atlas/persist — src/scrub.ts  (WP-3.5-a.PERSIST · PERSIST-10a)
//
// Redact-at-source — the PRIMARY credential control. `scrub` drops known credential SHAPES and the write
// gate `admitToBuffer` scrubs a chunk BEFORE it enters the immutable content-addressed buffer (not a post-hoc
// scan). Secrets are redacted WITHOUT abridging the record: a non-secret byte is preserved unless the shape's
// own body class reaches it (trailing body characters ARE absorbed — see the over-redaction notes per family
// in scrub-shapes.ts; the bound is the first non-body byte).
//
// ── REACHABILITY: `admitToBuffer` HAS NO PRODUCTION CALLER TODAY ─────────────────────────────────────
// Read this before assigning severity to anything below. The shipped write door is
// `transcript-store.ts` `put()`, and it calls `scrub(body)` — the WHOLE-BUFFER path. Nothing in this
// product folds a stream through `admitToBuffer`; it is published-but-uncalled library surface, offered to
// callers who stream (and pointed at by `put`'s own docstring as the documented way to join across calls).
// A defect in the seam machinery would therefore be LATENT, not live, until something calls it. That does
// not make the seam optional — `put` cannot join across calls, so a streaming caller MUST have a correct
// gate to reach for, and this file is a T0 security path the moment one does. It does mean that a green
// suite over this module is not evidence that the shipped path is exercised. This repo has mistaken those
// two things before (a rigorously tested write door with zero production callers), so it is stated here
// rather than left to be rediscovered.
//
// ── THE SEAM INVARIANT (why this file carries state) ─────────────────────────────────────────────────
// A credential does not arrive aligned to a caller's chunk boundary. Scrubbing each chunk in ISOLATION
// therefore admits a secret that straddles two admits: `ghp_ABCDEF|GHIJ` is two non-matching halves, and
// `TranscriptStoreApi` is put/fetch only, so a secret admitted once can never be removed. The invariant
// this file enforces is CHUNK INDEPENDENCE:
//
//     for every way a byte stream is cut into chunks,
//         chunks.reduce(admitToBuffer, empty)  ===  scrub(whole stream)
//
// It holds at EVERY prefix, not just at the end: the buffer after N admits equals `scrub` of the first N
// chunks concatenated. There is no flush step and no deferred tail.
//
// ── THE SEAM STATE: ONE CARRY, NOT TWO ───────────────────────────────────────────────────────────────
// This used to be four fields in two mutually exclusive pairs: `raw`/`back` (bytes already EMITTED, in
// scrubbed form, still rewritable) and `swallow`/`pending` (bytes NOT emitted because they were absorbed
// into a redaction already written). That split could not represent a real state, and the state it could not
// represent is a live streaming leak:
//
//     ghp_AAAAAAgithub_pat_BBBBBB     whole-buffer  ->  [REDACTED][REDACTED]
//                                     byte-at-a-time ->  [REDACTED]_pat_BBBBBB     <- the fine-grained PAT
//
// `ghp_AAAAAAgithub` is a COMPLETE github-token match — it has already been emitted as `[REDACTED]` — and at
// the same time its trailing `github` is a strict prefix of `github_pat_`. When the `_` arrives it ends the
// github-token body (`_` is not one of its body characters), so the match no longer touches the end of the
// stream, yet the bytes that must be re-decided are INSIDE the redaction that was already written. Emitted
// and rewritable, and not-emitted, at once. The old seam had to pick one, and picking "not emitted" fed
// `github` back into the absorbed body, leaving `_pat_BBBBBB` in the clear in an undeletable object.
//
// The state below is a single undecided SUFFIX of the raw stream (`carry`) plus how many trailing EMITTED
// bytes it currently accounts for (`back`, which is `scrub(carry)`'s length and is 0 for nothing pending).
// A committed redaction whose extent is still provisional is simply a carry that happens to render as
// `[REDACTED]`: the placeholder is inside the rewritable window, so the boundary can move without the
// buffer ever holding a raw credential. Everything else — where the carry starts, how it is bounded — is
// re-derived per admit by scrub-scan.ts from the same definition `scrub` uses.
//
// ── SCOPE, STATED PLAINLY ────────────────────────────────────────────────────────────────────────────
// FOUR families are declared (GitHub token, Slack token, GitHub fine-grained PAT, AWS access key id). This
// is not a general credential control: a secret of any other shape passes through untouched, by
// construction. The families deliberately left out — and the specific thing each one breaks — are recorded
// in scrub-shapes.ts.

import { MAX_SEAM_CARRY } from "./scrub-shapes.js"
import { canonicalise, renderPrefix, scanMatches, scrubString, seamCut } from "./scrub-scan.js"

export { MAX_SEAM_CARRY }

/** Redact-at-source surface (PERSIST-10a): `scrub(buffer)` drops known credential shapes BEFORE the body
 *  is stored; every non-secret byte preserved (no over-redaction). (method-tags-pst:91-92) */
export interface ScrubApi {
  scrub(buffer: Uint8Array): Uint8Array
}

// Byte-preserving latin1 view: each byte <-> exactly one char (1:1, reversible). Scanning/replacing on this
// view leaves every NON-matching byte byte-identical — no UTF-8 normalization, no over-redaction of the
// bytes adjacent to a secret.
function toLatin1(bytes: Uint8Array): string {
  let s = ""
  // Batched so a multi-megabyte stream does not pay quadratic string building; each byte still maps to
  // exactly one char, so the result is identical to a byte-at-a-time build.
  for (let i = 0; i < bytes.length; i += 4096) {
    s += String.fromCharCode(...bytes.subarray(i, i + 4096))
  }
  return s
}

function fromLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

/** TOTAL input coercion. An input whose bytes cannot be read is WITHHELD (treated as empty) rather than
 *  passed through unscrubbed — a scrubber that throws, or that forwards what it could not inspect, is a
 *  scrubber that fails open. Nothing in this module throws on any input. */
function asBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  return new Uint8Array(0)
}

/**
 * Redact the DECLARED credential shapes from a transcript buffer at source (PERSIST-10a) — GitHub token,
 * Slack token, GitHub fine-grained PAT, AWS access key id, and nothing else. Only a matched secret is
 * replaced by the redaction placeholder; bytes outside a match are preserved byte-for-byte.
 */
export function scrub(buffer: Uint8Array): Uint8Array {
  return fromLatin1(scrubString(toLatin1(asBytes(buffer))))
}

// ── the seam machinery ──────────────────────────────────────────────────────────────────────────────

/**
 * What a buffer still owes the next admit.
 *
 *  - `carry` the raw suffix of the stream whose classification is not final. It may be a not-yet-complete
 *            candidate, a complete match that could still grow, or a complete match whose LAST BYTES are a
 *            strict prefix of the credential that follows it — all one thing now. A long absorbed body is
 *            stored canonicalised (scrub-scan.ts), which is what keeps this bounded.
 *  - `back`  how many trailing bytes of the EMITTED buffer that carry accounts for, i.e. `scrub(carry)`'s
 *            length. Those bytes are ALREADY SCRUBBED — a candidate whose fate is still contingent shows up
 *            as a placeholder, never as a raw credential — and they are what the next admit rewrites.
 */
interface SeamState {
  readonly back: number
  readonly carry: string
}

const FRESH: SeamState = { back: 0, carry: "" }

// State is keyed on the IDENTITY of the buffer this module returned, so the published `admitToBuffer`
// signature is unchanged and the ordinary `buffer = admitToBuffer(buffer, chunk)` fold carries it for free.
// A buffer we did not produce (a caller-built `new Uint8Array(0)`, a fetched body) starts a FRESH stream —
// the conservative reading, since we cannot know what preceded it. WeakMap so nothing is retained.
const SEAM = new WeakMap<Uint8Array, SeamState>()

/** How many trailing bytes of `buffer` are still provisional — always <= {@link MAX_SEAM_CARRY}. Those
 *  bytes are never a raw credential: they are `scrub` of the bytes they stand for. */
export function seamCarryOf(buffer: Uint8Array): number {
  return (SEAM.get(asBytes(buffer)) ?? FRESH).back
}

/**
 * Decide as much of `carry + input` as can be decided without seeing the next chunk, and say what must be
 * remembered.
 *
 * The emitted answer is `scrub` of everything seen so far, by construction: the head is `scrub` of the
 * decided part and the carry is emitted as `scrub` of ITSELF. There is no window in which the buffer holds
 * a raw credential and no flush step — a caller that stops mid-credential has a buffer that already reads
 * `[REDACTED]`.
 *
 * FAIL-CLOSED, unconditionally: the provisional tail enters the buffer only as `scrub` of itself. If a
 * future family ever breaks the cut analysis, the failure mode is a MISSED JOIN across the seam — never a
 * raw credential in an immutable, undeletable record.
 *
 * The previous version also carried a "tail longer than the bound: decide it now and forget it" escape,
 * which is gone. The reason it is gone is that the bound is now derived arithmetic on the declaration
 * (`MAX_SEAM_CARRY`) and measured, so the branch was unreachable — and an unreachable branch no test can
 * exercise is a liability, not a safety net. It was ALSO suspected of being unsafe when reachable (dropping
 * a carry mid-absorb should release the rest of the body in the clear), but that is UNPROVEN: an
 * independent review restored the escape and got 0 failures on its differential corpus, i.e. nobody has
 * produced a witness. Removing it is correct on the reachability argument alone; do not cite the leak.
 */
function advance(carry: string, input: string): { emit: string; state: SeamState } {
  const s = carry + input
  const matches = scanMatches(s)
  const cut = seamCut(s, matches)
  // The head is decided from the matches of the WHOLE `s`, never by re-scrubbing `s.slice(0, cut)` — a
  // right-truncated string can lose the lookahead that blocked a body and gain a match that is not there.
  // See `renderPrefix`. The carry is left-truncated, which is safe.
  const tail = canonicalise(s.slice(cut))
  const provisional = scrubString(tail)
  return { emit: renderPrefix(s, matches, cut) + provisional, state: { back: provisional.length, carry: tail } }
}

/**
 * The redact-at-source WRITE gate: scrub a chunk BEFORE admitting it to the transcript buffer, so the raw
 * credential never enters the buffer in the first place (the primary control, not a post-hoc scan). Returns
 * the buffer with the scrubbed chunk appended, RE-EXAMINING the seam so a credential split across two calls
 * — or written immediately after another one — is caught. Total: never throws, for any input.
 */
export function admitToBuffer(existing: Uint8Array, chunk: Uint8Array): Uint8Array {
  const prev = asBytes(existing)
  const known = SEAM.get(prev)
  // For a buffer we did not produce (resumed from a fetched body, rebuilt by a caller) there is no state to
  // read, so re-examine the widest window a split credential could occupy rather than assuming the seam is
  // clean. For our own buffers this is exactly the provisional region recorded when it was written.
  const back = Math.min(known === undefined ? MAX_SEAM_CARRY : known.back, prev.length)
  const keep = prev.length - back
  const carry = known === undefined ? toLatin1(prev.subarray(keep)) : known.carry
  const { emit, state } = advance(carry, toLatin1(asBytes(chunk)))

  const emitted = fromLatin1(emit)
  const out = new Uint8Array(keep + emitted.length)
  out.set(prev.subarray(0, keep), 0)
  out.set(emitted, keep)
  SEAM.set(out, state)
  return out
}

/** The RAW undecided suffix a buffer is holding — the memory bound the seam actually pays, as opposed to
 *  the emitted `seamCarryOf`. Exported so the bound can be MEASURED rather than asserted. */
export function seamRawCarryOf(buffer: Uint8Array): number {
  return (SEAM.get(asBytes(buffer)) ?? FRESH).carry.length
}

// differential-vs-oracle (compile-time): `scrub` conforms to the co-located frozen ScrubApi.
const _api: ScrubApi = { scrub }
void _api
