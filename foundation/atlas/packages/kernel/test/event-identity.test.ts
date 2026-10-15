// @atlas/kernel — test/event-identity.test.ts  (WP-1.3-a.KERNEL)
//
// RED→GREEN transcription of the VISIBLE KERNEL-9 goldens SCN-KERNEL-9a-1..9e-1 (content-addressed event
// identity with `seq` EXCLUDED · idempotent append · content-keyed set-union `combine` · the seq-invariant
// `reseq` oracle) + the FORMAL ∀-law cluster PROP-KERNEL-9. `id-…`/`c-…` handles are SYMBOLIC — the goldens
// assert RELATIONAL / idempotent / commutative / associative laws, never a literal hash. Identity is computed
// ONLY through the sealed encoder seam (reused via src `eventId`); no hash is hand-rolled here. The held-out
// `-2` fixtures are subsumed by the ∀-generator and are NOT transcribed. fold() is imported read-only.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { Event, EventLog, AtlasState } from "../src/types.js"
import { createLog, eventId, combine, reseq } from "../src/log.js"
import { fold } from "../src/fold.js"

type Content = Omit<Event, "id">

/** Build an event's content (no id) — `seq` is a local hint; `contentHash` is a plain field, NOT the id. */
const content = (
  contentHash: string,
  seq: number,
  payload: unknown,
  // `nodeKey?: string | undefined` — the fc arbitrary below passes the key PRESENT-and-undefined
  // (`fc.option(..., { nil: undefined })`), which `nodeKey?: string` rejects under
  // exactOptionalPropertyTypes. The body already discriminates before spreading it in.
  opts: { nodeKey?: string | undefined; fresh?: boolean; supersedes?: string[] } = {},
): Content => ({
  seq,
  contentHash: contentHash as Hash,
  fresh: opts.fresh ?? true,
  supersedes: (opts.supersedes ?? []) as Hash[],
  payload,
  ...(opts.nodeKey ? { nodeKey: opts.nodeKey as NodeKey } : {}),
})

/** Attach the CONTENT id (via the sealed seam) — the only sanctioned way an event acquires its identity. */
const withId = (c: Content): Event => ({ ...c, id: eventId(c) })

/** A content-keyed event set (EventLog) built by set-insert on id — first-write-wins on an equal id. */
const logOf = (...evs: Event[]): EventLog => {
  const m: EventLog = new Map()
  for (const e of evs) if (!m.has(e.id)) m.set(e.id, e)
  return m
}

/** The seq-invariant fold projection: nodeKey → sorted contentHash keyset (`seq` is outside the algebra). */
const foldFingerprint = (state: AtlasState): string =>
  JSON.stringify(
    [...state.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([nk, node]) => [nk, [...node.entries.keys()].sort()]),
  )

const keyset = (log: EventLog): Set<string> => new Set(log.keys())

describe("KERNEL-9 — content-addressed event identity + set-union (visible goldens)", () => {
  it("SCN-KERNEL-9a-1: event id = hash(canonicalForm), seq excluded", () => {
    // e1 and e1' identical in every field EXCEPT seq (1 vs 99).
    const base = content("c-a7f0", 1, { p: "x" }, { nodeKey: "nk-1" })
    const e1 = withId(base)
    const e1prime = withId({ ...base, seq: 99 })
    expect(e1prime.id).toBe(e1.id) // identity is the content hash, invariant under seq (symbolic id-a7f0)
    expect(typeof e1.id).toBe("string")
    expect(e1.id.length).toBeGreaterThan(0)
    // relational: a genuine CONTENT change (not seq) DOES move the id.
    const other = withId({ ...base, contentHash: "c-other" as Hash })
    expect(other.id).not.toBe(e1.id)
    // teeth (breaks-on "id from a monotonic counter, or seq in the preimage — e1 ≠ e1'"): asserted equal.
  })

  it("SCN-KERNEL-9b-1: re-appending an existing event is a no-op", () => {
    const log = createLog()
    const e1 = withId(content("c-b1", 5, { v: 1 }))
    const L = log.append(e1) // L = append(∅, e1), size 1
    expect(L.size).toBe(1)
    const L2 = log.append(e1) // append(append(L,e1), e1)
    expect(L2.size).toBe(1) // still 1 — append∘append ≡ append
    expect([...L2.keys()]).toEqual([...L.keys()])
    // teeth (breaks-on "unconditional insert with no id-membership check — size becomes 2").
  })

  it("SCN-KERNEL-9c-1: two logs combine by set-union on the id", () => {
    const e1 = withId(content("c-e1", 1, { n: 1 }))
    const e2 = withId(content("c-c3d1", 2, { n: 2 })) // shared by id
    const e3 = withId(content("c-e3", 3, { n: 3 }))
    const A = logOf(e1, e2)
    const B = logOf(e2, e3)
    const R = combine(A, B)
    expect(R.size).toBe(3) // {e1,e2,e3} — e2 deduped by id, nothing dropped or duplicated
    expect(keyset(R)).toEqual(new Set([e1.id, e2.id, e3.id]))
    // teeth (breaks-on "concatenate version maps ⇒ size 4; or keep max-seq log ⇒ e1 dropped").
  })

  it("SCN-KERNEL-9d-1: reseq leaves the keyset and the fold unchanged", () => {
    const e1 = withId(content("c-a7f0", 1, { n: 1 }, { nodeKey: "nk-a" }))
    const e2 = withId(content("c-c3d1", 2, { n: 2 }, { nodeKey: "nk-b" }))
    const e3 = withId(content("c-f009", 3, { n: 3 }, { nodeKey: "nk-a" }))
    const L = logOf(e1, e2, e3)
    const F = foldFingerprint(fold(L))
    const R = reseq(L, (e) => 100 - e.seq) // relabel every seq
    expect(keyset(R)).toEqual(keyset(L)) // keyset(reseq(L)) = keyset(L)
    expect(foldFingerprint(fold(R))).toBe(F) // fold(reseq(L)) = fold(L)
    // sanity — the relabel actually took effect (seqs are new).
    expect([...R.values()].map((e) => e.seq).sort((a, b) => a - b)).toEqual([97, 98, 99])
    // teeth (breaks-on "seq folded into the identity/merge key — reseq mints fresh ids, keyset+fold diverge").
  })

  it("SCN-KERNEL-9e-1: two writers, same seq, distinct identity", () => {
    const eX = withId(content("aa1101", 7, { w: "A" })) // writer A: seq=7
    const eY = withId(content("bb2202", 7, { w: "B" })) // writer B: seq=7, distinct content
    expect(eX.id).not.toBe(eY.id) // the shared seq=7 collides no identity (symbolic id-9b21 ≠ id-7c44)
    const log = createLog()
    log.append(eX)
    const L = log.append(eY)
    expect(L.size).toBe(2) // both retained
    expect(keyset(L)).toEqual(new Set([eX.id, eY.id]))
    // teeth (breaks-on "seq as the object key — the two seq=7 events collapse to one slot, an event lost").
  })
})

// PROP-KERNEL-9 — idempotent content-keyed set-union  (FSPEC-merge · verbatim from properties-krn.md:103-115)
//   idempotent   : append(append(L,e),e) ≡ append(L,e)  ;  merge(a,a) ≡ a
//   identity     : id(e) = hash(canonical(e))            (seq EXCLUDED from the preimage)
//   set-union    : merge = set-union on the id
//   seq-invariant: ∀ seq'. keyset(reseq(L,seq')) ≡ keyset(L)  ∧  fold(reseq(L,seq')) ≡ fold(L)
describe("PROP-KERNEL-9 — idempotent content-keyed set-union (∀-law)", () => {
  const evArb = fc
    .record({
      contentHash: fc.constantFrom("ch1", "ch2", "ch3", "ch4"),
      seq: fc.integer({ min: -500, max: 500 }),
      nodeKey: fc.option(fc.constantFrom("nk1", "nk2", "nk3"), { nil: undefined }),
      fresh: fc.boolean(),
      supersedes: fc.array(fc.constantFrom("ch1", "ch2"), { maxLength: 2 }),
      payload: fc.integer({ min: 0, max: 9 }),
    })
    .map((r) =>
      content(r.contentHash, r.seq, r.payload, {
        nodeKey: r.nodeKey,
        fresh: r.fresh,
        supersedes: r.supersedes,
      }),
    )
  const logArb = fc.array(evArb, { maxLength: 8 }).map((cs) => logOf(...cs.map(withId)))

  it("idempotent: ∀ e. append(append(L,e),e) ≡ append(L,e)", () => {
    fc.assert(
      fc.property(evArb, (c0) => {
        const e = withId(c0)
        const log = createLog()
        const L1 = log.append(e)
        const L2 = log.append(e)
        expect(L2.size).toBe(L1.size)
        expect([...L2.keys()]).toEqual([...L1.keys()])
      }),
    )
  })

  it("identity: ∀ content, ∀ seq,seq′. id(e@seq) = id(e@seq′)  (seq excluded from the preimage)", () => {
    fc.assert(
      fc.property(evArb, fc.integer(), fc.integer(), (c0, s1, s2) => {
        expect(eventId({ ...c0, seq: s1 })).toBe(eventId({ ...c0, seq: s2 }))
      }),
    )
  })

  it("identity: ∀ same-seq, distinct-content. id differs (colliding seq never collides identity)", () => {
    fc.assert(
      fc.property(evArb, fc.integer(), (c0, seq) => {
        const a = eventId({ ...c0, seq, contentHash: "chA" as Hash })
        const b = eventId({ ...c0, seq, contentHash: "chB" as Hash })
        expect(a).not.toBe(b)
      }),
    )
  })

  it("set-union: ∀ A,B. combine(A,A) ≡ A ∧ keyset(combine(A,B)) = keyset(A) ∪ keyset(B) (commutative)", () => {
    fc.assert(
      fc.property(logArb, logArb, (A, B) => {
        expect(keyset(combine(A, A))).toEqual(keyset(A)) // idempotent: merge(a,a) ≡ a
        const union = new Set([...A.keys(), ...B.keys()])
        expect(keyset(combine(A, B))).toEqual(union) // set-union on the id
        expect(keyset(combine(B, A))).toEqual(keyset(combine(A, B))) // commutative on the keyset
      }),
    )
  })

  it("set-union associative: ∀ A,B,C. combine(combine(A,B),C) ≡ combine(A,combine(B,C))", () => {
    fc.assert(
      fc.property(logArb, logArb, logArb, (A, B, C) => {
        const left = keyset(combine(combine(A, B), C))
        const right = keyset(combine(A, combine(B, C)))
        expect(left).toEqual(right)
      }),
    )
  })

  it("seq-invariant: ∀ L, ∀ relabel. keyset(reseq(L)) ≡ keyset(L) ∧ fold(reseq(L)) ≡ fold(L)", () => {
    fc.assert(
      fc.property(logArb, fc.integer(), (L, k) => {
        const R = reseq(L, (e) => e.seq + k + 1)
        expect(keyset(R)).toEqual(keyset(L))
        expect(foldFingerprint(fold(R))).toBe(foldFingerprint(fold(L)))
      }),
    )
  })
})
