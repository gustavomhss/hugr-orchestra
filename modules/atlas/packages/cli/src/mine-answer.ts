// @atlas/cli — src/mine-answer.ts  (#195 (b) — the mined answer's content-addressed, tamper-evident receipt)
//
// SPLIT from `mine.ts` at the 400-LOC ceiling along the cohesive boundary #195 opened, and the SOLE site that
// turns the exact bytes the model returned into a CAS-addressed receipt a fact can carry. It answers ONE
// question: "how does a raw answer become an `answerRef` WITHOUT a secret in it ever reaching CAS."
//
// KNOW-11 ORDER IS THE WHOLE POINT — SCRUB, THEN CAS. The answer is run through the SAME `@atlas/persist`
// `scrub` the content-addressed transcript boundary already uses (`persist/src/transcript-store.ts` `put()`
// scrubs by construction; fitness #121) BEFORE it becomes a CAS object. So a credential-bearing answer is
// redacted at source: the bytes that land in CAS never contain the raw secret. billy cold-reviews exactly this
// door, and the sibling fitness function (`test/mine-answer-scrub-fitness.test.ts`) asserts, over THIS module's
// AST, that the stored CAS object provably flows from `scrub(...)` — a structural guarantee, not a hope.
//
// WHY THE GENERIC `store.put()` AND NOT `@atlas/persist`'s scrub-ENFORCED `TranscriptStore`. That store enforces
// scrub-at-the-door structurally, which is stronger — but it is IN-MEMORY-ONLY with ZERO production callers
// today (it has no disk-persistence wiring), so routing the mine path through it is DEFERRED, not silently
// bypassed. Until that wiring exists, the answer goes through the mine driver's ordinary CAS `store.put()`, and
// scrub-before-put is enforced HERE (the call site) plus the #121 fitness function over this module. See
// docs/design/195-answer-provenance-contract.md §2(b).
//
// THE ONE CARRIER: `answerRef` — the CAS id (`id(obj)`, the value `store.put(obj)` returns) of the SCRUBBED
// answer object. In a content-addressed store the CAS id IS the digest of the stored content, so it is its OWN
// tamper-evidence: a reader re-runs `id(fetchedBytes)` and compares to `answerRef` — which `store.get()` already
// does on every read (a mutated stored answer re-hashes to a different id ⇒ read as absent). No separate digest
// field is kept (that precedent is `promptDigest`: one digest, no companion ref). #209 digests the admitted
// rows' `answerRef`s so the issued-vs-stored CARDINALITY is visible in the run artifact.

import { scrub } from "@atlas/persist"
import { id } from "@atlas/kernel"

/** A mined answer's provenance receipt. `obj` is the SCRUBBED answer text — the CAS object the pass stores
 *  (through its `put` array) and that `answerRef` addresses. Stamped on a `WriteRequest` ONLY on the mine
 *  emit path; a human `atlas emit`/`atlas link` carries neither. */
export interface AnswerReceipt {
  readonly obj: string //       the scrubbed answer text = the stored CAS object (never a raw credential)
  readonly answerRef: string // the CAS id of `obj` (== `store.put(obj)`); its own tamper-evidence at rest
}

/**
 * Build the content-addressed, tamper-evident receipt for one mined answer. SCRUB-THEN-CAS, in that order
 * (KNOW-11): a secret in the answer is redacted at source, so it never reaches CAS raw. The stored object IS
 * the scrubbed answer text, and `answerRef = id(obj)` is the exact id `store.put(obj)` returns — so re-hashing
 * the fetched bytes and comparing to `answerRef` is the tamper check, no separate digest needed.
 */
export function answerReceipt(rawAnswer: string): AnswerReceipt {
  // (1) SCRUB FIRST — the primary control. The input is valid UTF-8 (the `llm.ts` admission sanity gate
  //     guarantees it), and `scrub` only redacts credential SHAPES to an ASCII placeholder, so the result is
  //     still valid UTF-8 and round-trips losslessly through the CAS string object below.
  const scrubbed = scrub(Buffer.from(rawAnswer, "utf8"))
  const obj = Buffer.from(scrubbed).toString("utf8") // the scrubbed answer text = the CAS object we store
  // (2) THEN CAS — `answerRef` is the exact id `store.put(obj)` returns (`id(obj)`); pushing `obj` to the
  //     pass's `put` array stores it at that id.
  const answerRef = id(obj) as unknown as string
  return { obj, answerRef }
}
