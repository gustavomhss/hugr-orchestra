// @atlas/kernel — test/totality.test.ts  (WP-1.2-a.KERNEL)
//
// RED→GREEN transcription of the VISIBLE totality goldens SCN-KERNEL-7a-1 (every entry point total under
// fuzz) + SCN-KERNEL-7b-1 (malformed input yields a rejection, never an exception) and the ∀-law
// PROP-KERNEL-7 (totality / no-throw). The entry points THIS WP owns are `store.put`, `store.get`,
// `log.append`; each must return a value (a Hash / CasObject|undefined / EventLog) or an honest empty —
// never throw. Held-out `-2` fixtures (the `merge` corners) are NOT transcribed and `merge` is not owned
// by this WP.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import type { Hash } from "@atlas/contracts"
import type { Event } from "../src/types.js"
import { createStore } from "../src/store.js"
import { createLog } from "../src/log.js"

describe("KERNEL-7 — pure/total entry points (visible goldens)", () => {
  it("SCN-KERNEL-7a-1: every entry point is total under fuzz — 0 exceptions", () => {
    const store = createStore()
    const log = createLog()
    fc.assert(
      fc.property(fc.anything(), (x) => {
        // arbitrary + malformed (deeply-nested, wrong-typed, non-NFC, float/NaN) → never throws
        expect(() => store.put(x)).not.toThrow()
        expect(() => store.get(x as Hash)).not.toThrow()
        expect(() => log.append(x as Event)).not.toThrow()
      }),
      { numRuns: 500 },
    )
    // teeth (breaks-on "an entry point throws on a deep-but-valid input — a non-total path"): a deeply
    // nested but valid object must not escape a RangeError from the canonical recursion.
    let deep: unknown = 0
    for (let i = 0; i < 4000; i++) deep = { n: deep }
    expect(() => store.put(deep)).not.toThrow()
  })

  it("SCN-KERNEL-7b-1: malformed input yields a rejection, never an exception", () => {
    const log = createLog()
    // ingest a malformed event: a non-NFC string payload with a wrong-typed `seq: "two"`
    const malformed = {
      id: "id-bad",
      seq: "two",
      contentHash: "c-bad",
      fresh: true,
      supersedes: [],
      payload: "café".normalize("NFD"),
    } as unknown as Event
    let out: Map<Hash, Event> | undefined
    expect(() => {
      out = log.append(malformed)
    }).not.toThrow()
    // structured rejection / honest empty: the malformed event is NOT inserted
    expect(out?.has("id-bad" as Hash)).toBe(false)
    expect(out?.size).toBe(0)
    // teeth (breaks-on "the malformed input propagates an uncaught exception"): the store entry points
    // likewise reject canonical-form violations without throwing.
    const store = createStore()
    expect(() => store.put({ v: Number.NaN })).not.toThrow()
    expect(() => store.put(BigInt(1) as unknown)).not.toThrow()
  })
})

describe("PROP-KERNEL-7 — totality / no-throw (∀-law)", () => {
  it("∀ input to every entry point: returns Result|honest-empty, never throws", () => {
    fc.assert(
      fc.property(fc.anything(), (i) => {
        const store = createStore()
        const log = createLog()
        expect(() => store.put(i)).not.toThrow()
        const got = store.get(i as Hash)
        expect(got === undefined || typeof got === "object" || typeof got !== "function").toBe(true)
        const snap = log.append(i as Event)
        expect(snap instanceof Map).toBe(true) // honest empty is still a well-formed EventLog
      }),
    )
  })
})
