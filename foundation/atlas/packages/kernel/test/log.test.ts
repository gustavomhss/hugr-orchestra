// @atlas/kernel — test/log.test.ts  (WP-1.2-a.KERNEL)
//
// RED→GREEN transcription of the VISIBLE log goldens SCN-KERNEL-4a-1 (log length monotone non-decreasing)
// + SCN-KERNEL-4b-1 (in-place mutate/delete rejected) and the ∀-law PROP-KERNEL-4 (append-only
// monotonicity). `id-…` handles are SYMBOLIC — the log keys by the event's own `id` field (identity
// computation is consumed from WP-1.1, not redefined here). Held-out `-2` fixtures are NOT transcribed.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import type { Hash } from "@atlas/contracts"
import type { Event } from "../src/types.js"
import { createLog } from "../src/log.js"

const ev = (idStr: string, seq: number, payload: unknown): Event => ({
  id: idStr as Hash,
  seq,
  contentHash: `c-${idStr}` as Hash,
  fresh: true,
  supersedes: [],
  payload,
})

describe("KERNEL-4 — the append-only event log (visible goldens)", () => {
  it("SCN-KERNEL-4a-1: log length is monotone non-decreasing", () => {
    const log = createLog()
    const s1 = log.append(ev("id-e1", 0, { v: 1 }))
    const s2 = log.append(ev("id-e2", 1, { v: 2 }))
    const s3 = log.append(ev("id-e3", 2, { v: 3 }))
    // size observes the non-decreasing sequence 1→2→3
    expect(s1.size).toBe(1)
    expect(s2.size).toBe(2)
    expect(s3.size).toBe(3)
    expect(s1.size).toBeLessThanOrEqual(s2.size)
    expect(s2.size).toBeLessThanOrEqual(s3.size)
    // teeth (breaks-on "the log compacts/truncates in place — size drops from 3 to 2"): a prior snapshot
    // is immutable and no prior event's bytes change.
    expect(s1.size).toBe(1)
    expect(s3.get("id-e1" as Hash)).toEqual(ev("id-e1", 0, { v: 1 }))
  })

  it("SCN-KERNEL-4b-1: mutate/delete of an extant event is rejected", () => {
    const log = createLog()
    const e1 = ev("id-a7f0", 0, { p: "original" })
    const before = log.append(e1)
    expect(before.size).toBe(1)
    expect(before.get("id-a7f0" as Hash)).toEqual(e1)
    // mutate attempt = re-append the SAME id with a different payload → NOT overwritten (a correction
    // must be a NEW event). teeth (breaks-on "in-place mutate accepted — payload overwritten under id"):
    const after = log.append(ev("id-a7f0", 0, { p: "tampered" }))
    expect((after.get("id-a7f0" as Hash) as Event).payload).toEqual({ p: "original" })
    expect(after.size).toBe(1) // size unchanged
    // delete attempt = there is no delete path; mutating a returned snapshot never removes from the log.
    const snap = log.append(ev("id-b111", 1, { p: "x" }))
    snap.delete("id-a7f0" as Hash)
    const next = log.append(ev("id-c222", 2, { p: "y" }))
    expect(next.get("id-a7f0" as Hash)).toEqual(e1) // still present — delete rejected
    expect(next.size).toBe(3)
  })
})

describe("PROP-KERNEL-4 — append-only monotonicity (∀-law)", () => {
  const opArb = fc.record({
    op: fc.constantFrom("append", "mutate"),
    id: fc.constantFrom("id-a", "id-b", "id-c", "id-d"),
    seq: fc.integer({ min: 0, max: 1000 }),
  })

  it("∀ op-sequence: size non-decreasing ∧ an extant event is never mutated/deleted in place", () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        const log = createLog()
        const seen = new Map<string, Event>() // first-write-wins expectation
        let prev = 0
        for (const o of ops) {
          const payload = o.op === "mutate" ? { tampered: o.seq } : { p: o.seq }
          const e = ev(o.id, o.seq, payload)
          const snap = log.append(e)
          if (!seen.has(o.id)) seen.set(o.id, e)
          expect(snap.size).toBeGreaterThanOrEqual(prev) // monotone non-decreasing
          for (const [k, v] of seen) expect(snap.get(k as Hash)).toEqual(v) // extant bytes unchanged
          prev = snap.size
        }
      }),
    )
  })
})
