// @atlas/grounding — src/span.ts   (the 2026-08-02 owner-approved SPAN amendment · GROUND-1 family)
//
// A grounding entry used to say WHICH unit a claim came from and not WHERE IN IT. This file is the carrier
// for the where: `mintSpan` builds a `GroundingSpan` over bytes the caller is HOLDING, and `readSpan`
// re-derives the cited slice from bytes presented later — refusing unless they are the same bytes.
//
// A SPAN, NOT A QUOTE, and the difference is the whole reason the amendment exists. Storing the quoted text
// would put a second, unversioned copy of the source in the store: it drifts silently the moment the file
// changes, and nothing can ever check that those characters were really there — an unfalsifiable citation is
// exactly the failure grounding exists to remove. Nothing here stores text. `mintSpan` takes bytes and gives
// back a digest plus two integers; `readSpan` takes a span plus bytes and gives back the slice ONLY when the
// bytes it was handed hash to the digest the span carries. The citation is therefore RE-DERIVED on every
// read and is falsifiable by construction: present the wrong bytes and the read refuses rather than
// returning a plausible slice of the wrong content.
//
// THE DIGEST GOES THROUGH THE SEAM, NOT THROUGH `id`. Two deliberate choices, both stated because either
// one read the other way is a bug:
//   · The `Encoder` seam (GROUND-10 / KERNEL-2a) is used, never a locally-inlined digest — so a blake3↔stub
//     swap flows through spans exactly as it flows through every anchor (`bindSubtree`, subtree.ts).
//   · The bytes are hashed RAW — `encoder.hash(bytes)`, NOT `id(obj)`. `id` runs the canonical preimage,
//     which NFC-normalizes every string (canonical.ts:12). NFC can change a byte sequence's LENGTH, so an
//     NFC-normalized digest would commit to a different byte string than the one the offsets index — the
//     span would verify against bytes it cannot correctly slice. A span addresses bytes AS READ.
//
// FAIL-CLOSED AND TOTAL. Every refusal is `undefined`; nothing here throws and nothing here does IO. A span
// that cannot be minted is simply ABSENT from the entry, which reads as "the location inside the unit is
// unknown" — never as a fabricated whole-unit citation.
//
// WHAT THIS DOES NOT PROMISE, stated so it cannot be mistaken for integrity: a span lives in `grounding`,
// which KERNEL-8 EXCLUDES from the canonical preimage at every level (canonical.ts:36). Tampering a stored
// span therefore does NOT change the fact's address and NO shipped read door notices — exactly as blanking
// an `anchor.subtreeHash` does not. `readSpan` detects a span that disagrees with the BYTES; it cannot
// detect a span rewritten in the store to point somewhere else in the same bytes. That limit is measured and
// recorded in the amendment's REQ (`docs/requirements/req-grd.md#REQ-GROUND-1f`), not implied away here.

import type { Encoder } from "@atlas/kernel"
import type { GroundingSpan } from "./types.js"

/**
 * The span carrier's two verbs, bound to an injected `Encoder` (GROUND-10). Both pure + total: no clock, no
 * IO, no global state, no throw — every refusal is `undefined`.
 */
export interface SpanApi {
  /** Address `bytes[start, end)` as a `GroundingSpan`. The digest is computed HERE from the bytes handed
   *  in — it is never accepted from a caller — so a span can only be minted by something that actually
   *  holds the evidence. Refuses (`undefined`) a range that is not a non-empty, integral, in-bounds byte
   *  range, or whose boundaries split a UTF-8 code point (a slice nobody can decode is not a citation). */
  mintSpan(bytes: Uint8Array, start: number, end: number): GroundingSpan | undefined

  /** Re-derive the cited slice from `bytes`. Returns the slice ONLY if `bytes` hash to `span.contentHash`
   *  and the range still fits; otherwise `undefined` — these are not the bytes that were cited, so no
   *  slice of them is the citation. Never throws. */
  readSpan(span: GroundingSpan, bytes: Uint8Array): Uint8Array | undefined
}

/** A UTF-8 continuation byte (`10xxxxxx`) — the interior of a multi-byte code point. A span boundary that
 *  lands on one would slice a character in half and decode to U+FFFD, so it is refused at mint. */
function splitsCodePoint(bytes: Uint8Array, at: number): boolean {
  return at < bytes.length && ((bytes[at] as number) & 0xc0) === 0x80
}

/** A non-negative safe integer — the only offsets the canonical preimage can even carry (floats are a
 *  canonical-form violation, canonical.ts) and the only ones that index bytes. */
function isOffset(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0
}

/**
 * Build the span verbs over an INJECTED `Encoder` seam (GROUND-10), mirroring `bindSubtree`. Swapping the
 * encoder changes only the digest bytes, and every span in a run follows that swap — no span path may inline
 * its own hash.
 */
export function bindSpan(encoder: Encoder): SpanApi {
  const mintSpan = (bytes: Uint8Array, start: number, end: number): GroundingSpan | undefined => {
    if (!isOffset(start) || !isOffset(end)) return undefined
    if (start >= end || end > bytes.length) return undefined // empty / inverted / out-of-bounds
    if (splitsCodePoint(bytes, start) || splitsCodePoint(bytes, end)) return undefined
    return { contentHash: encoder.hash(bytes), start, end }
  }

  const readSpan = (span: GroundingSpan, bytes: Uint8Array): Uint8Array | undefined => {
    if (encoder.hash(bytes) !== span.contentHash) return undefined // not the bytes that were cited
    if (!isOffset(span.start) || !isOffset(span.end)) return undefined
    if (span.start >= span.end || span.end > bytes.length) return undefined
    return bytes.slice(span.start, span.end)
  }

  return { mintSpan, readSpan }
}
