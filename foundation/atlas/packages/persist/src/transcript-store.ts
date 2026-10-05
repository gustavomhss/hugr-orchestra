// @atlas/persist — src/transcript-store.ts  (WP-3.5-a.PERSIST · PERSIST-10)
//
// The content-addressed large-object transcript store: the body is retained IN FULL (never truncated / lossily
// compressed — owner law). `put(body) → hash` stores the lossless body; `fetch(ref)` returns the EXACT bytes
// on demand (byte-identity round-trip). Only the `TranscriptRef` pointer lives in git; `id` is the SEALED seam.
//
// ── WHY `put` SCRUBS, RATHER THAN DOCUMENTING THAT CALLERS SHOULD ────────────────────────────────────
// `scrub` (PERSIST-10a) is the PRIMARY credential control, and it was correct but opt-in: every caller had to
// remember `store.put(scrub(body))`. A check the caller must remember is not a control — it is a convention,
// and this store is exactly where a lapsed convention is unrecoverable, because the surface is put/fetch with
// NO delete: anything admitted raw is permanent and content-addressed into git-propagated history. So the
// redaction is applied HERE, on the way in, by the store. A caller who has never heard of `scrub` cannot
// store an unredacted credential, because there is no path into `objects` that does not pass through it.
//
// SHAPE NOTE (deliberate, not an oversight): `put` takes a WHOLE body, not a chunk fold, so the seam state
// `admitToBuffer` carries in its WeakMap is neither used nor needed here — a single body is a single chunk,
// and chunk-independence is trivial within one `put`. `scrub` is used rather than `admitToBuffer` for a
// second reason: `admitToBuffer` re-copies the whole accumulated buffer per call (O(n²) over a stream), and
// routing an ordinary whole-body write through it would make that cost live. `scrub` is a single O(n) pass.
// The residual gap this leaves is recorded on `put`: one logical transcript split across SEPARATE `put`
// calls has no shared seam state, so a credential straddling that split is not joined.

import type { Hash } from "@atlas/contracts"
import { id } from "@atlas/kernel"
import { scrub } from "./scrub.js"
import type { TranscriptRef } from "./types.js"

/** The full, lossless transcript body — byte-identity `fetch(put(body)) ≡ body` forces raw bytes. */
export type Transcript = Uint8Array

/** The content-addressed large-object transcript store (PERSIST-10): `put(body) → hash` stores the full
 *  lossless body; `fetch(ref)` returns the EXACT bytes on demand (0 truncation). (atlas-persist:107) */
export interface TranscriptStoreApi {
  put(body: Uint8Array): Hash
  fetch(ref: TranscriptRef): Transcript
}

/** The large-object store kind for the CAS-backed transcript pointer (atlas-persist:122-124). */
const STORE_KIND: TranscriptRef["store"] = "cas"

/** Content-address the raw byte body over the SEALED kernel `id` seam (never a hand-rolled digest). The
 *  body is tagged so an equal body always maps to the same hash and no arbitrary array collides with it. */
function contentHash(body: Uint8Array): Hash {
  return id({ kind: "Transcript", bytes: Array.from(body) })
}

/** The git-side POINTER to a stored large object — only `{sha, store}`, never the body (PERSIST-10-c). */
export function toGitPointer(sha: Hash): TranscriptRef {
  return { sha, store: STORE_KIND }
}

/** The frozen `TranscriptStoreApi` surface (`put`/`fetch`) — content-addressed, immutable, fetch-on-demand. */
export type TranscriptStore = TranscriptStoreApi

/**
 * A content-addressed large-object transcript store (PERSIST-10). `put` is idempotent on equal bodies and
 * stores a stable copy in full; `fetch` returns the exact bytes for a pointer, on demand. Byte-identity
 * `fetch(put(body)) ≡ body` holds for every body carrying no credential — no code path truncates or lossily
 * abridges the body — and for a body that DOES carry one, the difference is exactly the redaction.
 */
export function createTranscriptStore(): TranscriptStore {
  const objects = new Map<Hash, Uint8Array>()
  return {
    /**
     * Admit a body and return its content hash. The body is REDACTED AT SOURCE first (PERSIST-10a): the raw
     * credential never reaches `objects`, so it never reaches the immutable, undeletable, git-propagated
     * record. Total — `scrub` withholds an input whose bytes cannot be read rather than forwarding it, so a
     * malformed body stores nothing instead of throwing or storing more.
     *
     * The hash addresses what is STORED, not what was offered: `contentHash` runs on the redacted bytes, so
     * the pointer never digests a secret and `fetch(put(b))` still content-addresses its own return value.
     * Because `scrub` is idempotent, re-putting an already-scrubbed body is a no-op that maps to the same
     * hash — a caller that folded chunks through `admitToBuffer` first gets the identical object.
     *
     * LIMIT: this joins nothing ACROSS calls. A credential split between two separate `put`s is two separate
     * objects with no shared seam state; callers streaming one logical transcript must fold it through
     * `admitToBuffer` before putting it, which this call is idempotent with respect to.
     */
    put(body: Uint8Array): Hash {
      const admitted = scrub(body)
      const h = contentHash(admitted)
      // immutable + idempotent: store the full redacted body once; equal bytes re-use the same object.
      if (!objects.has(h)) objects.set(h, Uint8Array.from(admitted))
      return h
    },
    fetch(ref: TranscriptRef): Transcript {
      if (ref.store !== STORE_KIND) {
        throw new Error(`transcript pointer uses unsupported store ${String(ref.store)}`)
      }
      const body = objects.get(ref.sha)
      if (body === undefined) {
        throw new Error(`transcript large-object not found for pointer ${String(ref.sha)}`)
      }
      // the EXACT bytes — a defensive copy so a caller cannot mutate the immutable object in place.
      return Uint8Array.from(body)
    },
  }
}

// ── size mitigation — lossless + reversible (PERSIST-10-d) ──────────────────────────────────────────────
//
// No lossy transform is applied to the transcript body. The `mitigate`/`reverse` pair is the round-trip
// contract point for ANY future size mitigation: it MUST satisfy `reverse(mitigate(T)) ≡ T` byte-identical.
// The current mitigation is the identity round-trip (fully lossless + reversible); a lossy compression that
// dropped bytes would fail the byte-identity guard.

/** Apply the (currently lossless, identity) size-mitigation transform to a transcript body. */
export function mitigate(body: Uint8Array): Uint8Array {
  return Uint8Array.from(body)
}

/** Invert the size-mitigation transform — `reverse(mitigate(T)) ≡ T` byte-identical (lossless). */
export function reverse(mitigated: Uint8Array): Uint8Array {
  return Uint8Array.from(mitigated)
}
