// @atlas/kernel — test/heldout-krn-event.test.ts  (MICROSCOPE GATE — WP-1.3-a.KERNEL, author BLINDED)
//
// KERNEL-9a..9e carry `held_out: n/a` (each is `gen: PBT`, subsumed by the ∀-property generator), so
// there is NO `-2` fixture to transcribe. Per the GATE protocol we instead assert the FORMAL ∀-laws as
// RELATIONAL / encoder-agnostic properties — never a literal hash — over GENUINELY INDEPENDENT data
// (different contentHashes, seq ranges, relabel functions, and log arbitraries than the author's), run
// against the author src UNCHANGED. An overfit that hard-coded fixture-1's shape fails these.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { Event, EventLog } from "../src/types.js"
import { createLog, eventId, combine, reseq } from "../src/log.js"
import { fold } from "../src/fold.js"

type Content = Omit<Event, "id">
const mk = (ch: string, seq: number, nk?: string, payload: unknown = { p: ch }): Content => ({
  seq,
  contentHash: ch as Hash,
  fresh: true,
  supersedes: [] as Hash[],
  payload,
  ...(nk ? { nodeKey: nk as NodeKey } : {}),
})
const withId = (c: Content): Event => ({ ...c, id: eventId(c) })
const keyset = (l: EventLog) => new Set(l.keys())
const logOf = (...es: Event[]): EventLog => {
  const m: EventLog = new Map()
  for (const e of es) if (!m.has(e.id)) m.set(e.id, e)
  return m
}
// fold fingerprint independent of the author's helper: nodeKey -> sorted contentHash list.
const fp = (l: EventLog) =>
  JSON.stringify(
    [...fold(l).entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([nk, n]) => [nk, [...n.entries.keys()].sort()]),
  )

// Independent arbitraries: different vocab (dead/beef/cafe...) and wider seq range than the author's.
const evArb = fc
  .record({
    ch: fc.constantFrom("dead", "beef", "cafe", "f00d", "0bad"),
    seq: fc.integer({ min: -9000, max: 9000 }),
    nk: fc.option(fc.constantFrom("nkX", "nkY"), { nil: undefined }),
    payload: fc.integer({ min: 100, max: 999 }),
  })
  .map((r) => mk(r.ch, r.seq, r.nk, r.payload))
const logArb = fc.array(evArb, { maxLength: 7 }).map((cs) => logOf(...cs.map(withId)))

describe("GATE KERNEL-9 (held-out ∀-laws, independent data)", () => {
  it("9a — id excludes seq AND is content-sensitive", () => {
    fc.assert(
      fc.property(evArb, fc.integer(), fc.integer(), (c, s1, s2) => {
        expect(eventId({ ...c, seq: s1 })).toBe(eventId({ ...c, seq: s2 }))
        // a genuine content change (different contentHash) DOES move the id.
        expect(eventId({ ...c, contentHash: "ZZ1" as Hash })).not.toBe(eventId({ ...c, contentHash: "ZZ2" as Hash }))
      }),
    )
  })

  it("9b — append is idempotent on an equal id (size + keyset fixed)", () => {
    fc.assert(
      fc.property(evArb, fc.nat(4), (c, n) => {
        const e = withId(c)
        const log = createLog()
        const L1 = log.append(e)
        let L = L1
        for (let i = 0; i < n; i++) L = log.append(e)
        expect(L.size).toBe(L1.size)
        expect([...L.keys()]).toEqual([...L1.keys()])
      }),
    )
  })

  it("9c — combine = idempotent, commutative set-union on the id", () => {
    fc.assert(
      fc.property(logArb, logArb, (A, B) => {
        expect(keyset(combine(A, A))).toEqual(keyset(A))
        const u = new Set([...A.keys(), ...B.keys()])
        expect(keyset(combine(A, B))).toEqual(u)
        expect(keyset(combine(B, A))).toEqual(keyset(combine(A, B)))
      }),
    )
  })

  it("9c/assoc — combine is associative on the keyset", () => {
    fc.assert(
      fc.property(logArb, logArb, logArb, (A, B, C) => {
        expect(keyset(combine(combine(A, B), C))).toEqual(keyset(combine(A, combine(B, C))))
      }),
    )
  })

  it("9d — reseq preserves keyset AND fold under an INDEPENDENT relabel (const, negate, double)", () => {
    const relabels: Array<(e: Event) => number> = [() => 42, (e) => -e.seq, (e) => e.seq * 2 + 1]
    fc.assert(
      fc.property(logArb, fc.nat(2), (L, k) => {
        const R = reseq(L, relabels[k]!)
        expect(keyset(R)).toEqual(keyset(L))
        expect(fp(R)).toBe(fp(L))
      }),
    )
  })

  it("9e — same seq, distinct content => distinct id, both retained", () => {
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom("nk1", undefined), (seq, nk) => {
        const eX = withId(mk("aa", seq, nk as string | undefined, { w: "A" }))
        const eY = withId(mk("bb", seq, nk as string | undefined, { w: "B" }))
        expect(eX.id).not.toBe(eY.id)
        const log = createLog()
        log.append(eX)
        const L = log.append(eY)
        expect(L.size).toBe(2)
        expect(keyset(L)).toEqual(new Set([eX.id, eY.id]))
      }),
    )
  })
})
