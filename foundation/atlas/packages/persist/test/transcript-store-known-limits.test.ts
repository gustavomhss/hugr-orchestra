// @atlas/persist — test/transcript-store-known-limits.test.ts  (PERSIST-10a — a MEASURED limit, PINNED)
//
// ── READ THIS BEFORE "FIXING" A FAILURE HERE ───────────────────────────────────────────────────────────
// EVERY CASE IN THIS FILE ASSERTS A LIMITATION, NOT A GUARANTEE. A red test here almost certainly means the
// limit was CLOSED, which is good news: update this file to pin the new, stronger behaviour. It does NOT
// mean the store regressed, and the correct response is never to restore the weaker behaviour. The file
// exists so that the day someone closes the gap, the suite TELLS them they did — instead of the limit
// decaying into folklore that nobody can find, re-derive, or safely rely on.
//
// ── THE LIMIT ──────────────────────────────────────────────────────────────────────────────────────────
// `put` redacts at the door, and within ONE call that is total. It joins NOTHING ACROSS CALLS. `scrub` is a
// single O(n) pass over one whole body; the streaming seam that carries cross-chunk state is
// `admitToBuffer`, and `put` deliberately does not route through it (the store's header gives the reason:
// `admitToBuffer` re-copies the accumulated buffer per call, so an ordinary whole-body write would pay an
// O(n²) cost for state a single body cannot need).
//
// WHY IT CANNOT SIMPLY BE CLOSED INSIDE `put`. There is no handle to key the state on. `put(body) → Hash`
// returns a content address, not a session, a stream, or a buffer identity — so there is no object a
// WeakMap could hang cross-call state off, and no way for `put` to know that two byte arrays it was handed
// at different times are two halves of one logical transcript rather than two unrelated transcripts that
// happen to abut. Closing it needs a SURFACE change (an explicit session/stream handle), which is a
// governed change to a frozen API, not a tweak. That is why this is pinned rather than fixed.
//
// The limit is DOCUMENTED on `put` already. What it did not have was a test — so nothing distinguished
// "known and accepted" from "nobody has looked". These cases are that distinction, with the boundary
// MEASURED rather than described.
//
// FIXTURES are obviously-synthetic (`ghp_SYNTHETICNOTAREALTOKEN01`) — a NOTAREAL marker inside a real-shaped
// prefix, so it exercises the shipped detector while resembling nothing a scanner should ever act on.

import { describe, it, expect } from "vitest"
import { createTranscriptStore, toGitPointer } from "../src/transcript-store.js"
import { admitToBuffer } from "../src/scrub.js"
import type { TranscriptStore } from "../src/transcript-store.js"

const enc = new TextEncoder()
const dec = new TextDecoder()

const SECRET = "ghp_SYNTHETICNOTAREALTOKEN01"
const BODY = `line: exported ${SECRET} done\n`
/** The index of the first byte of `SECRET` inside `BODY`, computed — never transcribed. */
const AT = BODY.indexOf(SECRET)

/** put → fetch, decoded. The full public path an ordinary caller uses. */
function stored(store: TranscriptStore, text: string): string {
  return dec.decode(store.fetch(toGitPointer(store.put(enc.encode(text)))))
}

/** What an attacker with read access to the store recovers by concatenating the objects in write order —
 *  which is exactly how a split transcript is reassembled for reading. */
function rejoined(splitAt: number): string {
  const store = createTranscriptStore()
  return stored(store, BODY.slice(0, splitAt)) + stored(store, BODY.slice(splitAt))
}

describe("PERSIST-10a KNOWN LIMIT — `put` does not join a credential across two calls", () => {
  it("LIMIT: a secret split right after its prefix is stored VERBATIM in two objects", () => {
    // The worst case, and the realistic one: a streaming caller flushes on a buffer boundary that happens to
    // land inside the token. Neither half carries enough token characters to trip the detector on its own,
    // so BOTH are stored raw — and the credential is recovered by plain concatenation, with no cleverness.
    const afterPrefix = AT + "ghp_".length
    const leak = rejoined(afterPrefix)
    expect(leak).toContain(SECRET) // ← THE LIMIT. Red here = the gap closed; re-pin, do not revert.
    expect(leak).toBe(BODY) // nothing was redacted at all: the stored bytes are the original body
  })

  it("LIMIT BOUNDARY, MEASURED: the split must fall within the detector's minimum run to leak in full", () => {
    // The limit is not unbounded, and the boundary is worth having in writing so nobody over- or
    // under-states it. Once the FIRST half carries enough token characters to be a credential on its own it
    // is redacted normally, and the whole secret is no longer reconstructible.
    const leaks = new Map<number, boolean>()
    for (let n = 0; n <= SECRET.length - "ghp_".length; n++) {
      leaks.set(n, rejoined(AT + "ghp_".length + n).includes(SECRET))
    }
    // Small splits leak the whole credential; past the floor they do not. Both directions asserted, so this
    // cannot pass by everything-leaks OR by nothing-leaks.
    expect([...leaks.values()]).toContain(true)
    expect([...leaks.values()]).toContain(false)
    // The transition is MONOTONE — one floor, not a scatter of holes. Pinned so a detector change that
    // punched a hole in the middle of the safe range would surface here rather than pass unnoticed.
    const firstSafe = [...leaks.entries()].find(([, leaked]) => !leaked)![0]
    for (const [n, leaked] of leaks) expect(leaked).toBe(n < firstSafe)
  })

  it("LIMIT (partial): even PAST that floor, the tail of the secret survives raw in the second object", () => {
    // The safe-looking case is only safe about the WHOLE credential. The second half is still an
    // unredacted fragment — it has no prefix, so nothing marks it as a credential. Stated explicitly
    // because "past the floor it is fine" would be the natural, and wrong, reading of the case above.
    const splitAt = AT + SECRET.length - 8 // last 8 characters land in the second put
    const tail = SECRET.slice(-8)
    const leak = rejoined(splitAt)
    expect(leak).not.toContain(SECRET) // the whole credential is gone…
    expect(leak).toContain(tail) // …and a fragment of it is not
  })

  it("CONTROL: the SAME bytes in ONE `put` are redacted — the limit is the SPLIT, not the body", () => {
    // Anti-vacuity for every case above: if the store simply failed to redact this fixture at all, the
    // leaks would prove nothing about cross-call joining.
    expect(stored(createTranscriptStore(), BODY)).toBe(`line: exported [REDACTED] done\n`)
    expect(stored(createTranscriptStore(), BODY)).not.toContain(SECRET)
  })

  it("THE DOCUMENTED WAY OUT WORKS: fold through `admitToBuffer`, then `put` once", () => {
    // `put`'s own docstring points callers here, so the escape hatch is pinned too — an unusable workaround
    // is the same as no workaround, and this is what makes the limit ACCEPTABLE rather than merely known.
    const store = createTranscriptStore()
    const splitAt = AT + "ghp_".length // the worst-case split from the first case
    let folded: Uint8Array = new Uint8Array(0)
    for (const part of [BODY.slice(0, splitAt), BODY.slice(splitAt)]) {
      folded = admitToBuffer(folded, enc.encode(part))
    }
    const out = dec.decode(store.fetch(toGitPointer(store.put(folded))))
    expect(out).not.toContain(SECRET)
    expect(out).toBe(`line: exported [REDACTED] done\n`)
    // …and it converges on the SAME object as the whole-body write: one logical transcript, one hash.
    expect(store.put(folded)).toBe(store.put(enc.encode(BODY)))
  })

  it("WHY IT CANNOT BE KEYED: `put` returns a Hash, so there is no per-caller identity to hang state on", () => {
    // The structural reason, executable. Two calls with the same bytes are INDISTINGUISHABLE to the store —
    // they return the identical hash — so `put` cannot tell "the same caller continuing" from "a different
    // caller repeating". Any cross-call join would have to be keyed on something this signature does not
    // carry. If this ever stops holding, the surface changed and the limit is re-openable.
    const store = createTranscriptStore()
    const chunk = enc.encode(BODY.slice(0, AT + 4))
    expect(store.put(chunk)).toBe(store.put(Uint8Array.from(chunk)))
    expect(typeof store.put(chunk)).toBe("string") // a content address, not a session handle
  })
})
