// @atlas/persist — test/reconstruct.test.ts  (WP-1.2-b.PERSIST)
//
// RED→GREEN transcription of the VISIBLE goldens for set-fold reconstruction over git history
// (SCN-PERSIST-2a-1/2b-1/2c-1), the never-delete archive / forget path (SCN-PERSIST-5a-1..5d-1), and
// rebase/rewind reconciliation (SCN-PERSIST-12a-1/12b-1), plus the ∀-laws PROP-PERSIST-2 / 5 / 12.
//
// `id-…`/`ch-…`/`nk-…` handles are SYMBOLIC — every assertion is RELATIONAL (byte-identity of the
// serialized AtlasState, subset/monotonicity of the archive, equality across a reorder/snapshot-drop),
// never pinned to a golden digest. The fold/union/OKF/canonicalizer are CONSUMED from the sealed
// @atlas/kernel seam, never re-rolled. Held-out `-2` fixtures are NOT transcribed (GATE-only).

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { AtlasState, Event, EventLog } from "@atlas/kernel"
import { fold } from "@atlas/kernel"
import {
  archive,
  collect,
  del,
  forget,
  mergeArchive,
  reconstruct,
  replayFromExport,
  respawn,
  rewind,
  serializeState,
} from "../src/reconstruct.js"

/** Build one well-formed Event. `seq` is a local hint; identity/entry keys are the symbolic handles. */
const ev = (id: string, node: string | undefined, ch: string, payload: unknown): Event => ({
  id: id as Hash,
  seq: 0,
  // spread-in, not `nodeKey: undefined`: `Event.nodeKey?` is exactOptionalPropertyTypes-optional.
  ...(node === undefined ? {} : { nodeKey: node as NodeKey }),
  contentHash: ch as Hash,
  fresh: true,
  supersedes: [],
  payload,
})

/** Lift a flat event list into a content-keyed set (first-write-wins on id). */
const set = (events: readonly Event[]): EventLog => {
  const m = new Map<Hash, Event>()
  for (const e of events) if (!m.has(e.id)) m.set(e.id, e)
  return m
}

// e1, e2 collide on the SAME nodeKey with DISTINCT contentHashes; e3 is an independent node. `ch-e2` >
// `ch-e1` lexicographically (the OR-Set keys both; head-resolution is EPIC-3-b, held out — observable
// here is only byte-identity of the folded set).
const e1 = ev("id-e1", "claim:acme-arr-2024", "ch-e1", { arr: 100 })
const e2 = ev("id-e2", "claim:acme-arr-2024", "ch-e2", { arr: 120 })
const e3 = ev("id-e3", "nk-3", "ch-e3", { note: "ok" })

describe("REQ-PERSIST-2 — Atlas state = fold of the append-only set (visible goldens)", () => {
  it("SCN-PERSIST-2a-1: replay-from-empty rebuilds a byte-identical AtlasState", () => {
    const S = set([e1, e2, e3])
    const A0 = serializeState(fold(S)) // the original serialized AtlasState

    const rebuilt = replayFromExport(S) // fold(replay(export(S))) — export → import(fresh) → replay → fold
    expect(serializeState(rebuilt)).toBe(A0) // byte-identical replay-from-empty (REQ-PERSIST-2-a)

    // teeth (breaks-on "the fold seeds from a cached mutable snapshot — replay-from-empty omits e3's node"):
    // the rebuilt state must carry e3's independent node in full, not a snapshot-truncated subset.
    expect(rebuilt.has("nk-3" as NodeKey)).toBe(true)
    expect([...rebuilt.get("nk-3" as NodeKey)!.entries.keys()]).toContain("ch-e3")
  })

  it("SCN-PERSIST-2b-1: reversing the colliding e1/e2 pair folds byte-identically", () => {
    const forward = serializeState(fold(set([e1, e2, e3])))
    const reversed = serializeState(fold(set([e2, e1, e3]))) // e2 before e1

    expect(reversed).toBe(forward) // same bytes — the arr node = union {ch-e1, ch-e2} in both orders
    // non-triviality: the collision node actually carries BOTH entries (a last-writer-wins fold would drop
    // one). teeth (breaks-on "the fold keys on arrival order — reversed heads e1 while forward heads e2"):
    const node = fold(set([e2, e1, e3])).get("claim:acme-arr-2024" as NodeKey)!
    expect([...node.entries.keys()].sort()).toEqual(["ch-e1", "ch-e2"])
  })

  it("SCN-PERSIST-2c-1: answer invariant under snapshot-drop and history-reorder", () => {
    const S = set([e1, e2, e3])
    // (i) answered from the live in-memory fold, (ii) with the snapshot discarded (pure replay-from-empty),
    // (iii) after the underlying history is reordered/re-parented (a permutation of the same set).
    const fromSnapshot = serializeState(fold(S))
    const snapshotDropped = serializeState(replayFromExport(S))
    const historyReordered = serializeState(fold(set([e3, e2, e1])))

    expect(snapshotDropped).toBe(fromSnapshot) // no mutable-snapshot dependence
    expect(historyReordered).toBe(fromSnapshot) // no linear-history dependence
    // a concrete query is stable across all three (not a vacuous empty-state match):
    const arr = (s: AtlasState): string[] => [...(s.get("claim:acme-arr-2024" as NodeKey)?.entries.keys() ?? [])].sort()
    expect(arr(fold(S))).toEqual(["ch-e1", "ch-e2"])
    expect(arr(replayFromExport(S))).toEqual(["ch-e1", "ch-e2"])
  })
})

describe("REQ-PERSIST-5 — nothing dies: archive is grow-only (visible goldens)", () => {
  const k = ev("id-k", "know:policy", "ch-k", { fact: "v1" })
  const kPrime = ev("id-kp", "know:policy", "ch-kp", { fact: "v2" }) // supersedes k

  it("SCN-PERSIST-5a-1: a delete is a no-op that never shrinks the archive", () => {
    const A = archive(new Map() as EventLog, k) // archive containing k
    const after = del(A, k) // delete(k) attempted

    expect(after.has("id-k" as Hash)).toBe(true) // k retained
    // monotone: A' ⊒ A (every prior entry present, nothing removed).
    for (const id of A.keys()) expect(after.has(id)).toBe(true)
    expect(after.size).toBeGreaterThanOrEqual(A.size)
    // teeth (breaks-on "delete(k) actually removes k — the archive shrinks (A' ⊏ A)"): size never drops.
  })

  it("SCN-PERSIST-5b-1: supersede archives, and a re-run dedups idempotently", () => {
    let A = archive(new Map() as EventLog, k)
    A = archive(A, kPrime) // both k and k' archived

    expect(A.has("id-k" as Hash)).toBe(true) // k retained (not deleted by supersede)
    expect(A.has("id-kp" as Hash)).toBe(true) // k' archived

    const rerun = mergeArchive(A, A) // merge(A, A) — the re-run
    expect(serializeArchive(rerun)).toBe(serializeArchive(A)) // ≡ A: dedup idempotent, loses nothing
    // teeth (breaks-on "the re-run duplicates k or drops a prior entry"): same keyset, same size.
    expect(rerun.size).toBe(A.size)
  })

  it("SCN-PERSIST-5c-1: a superseded entry round-trips back into the active set", () => {
    const A = archive(new Map() as EventLog, k)
    const revived = respawn(A, k) // respawn(archive(k)) round-trips it back

    expect(revived).not.toBeNull()
    expect(revived).toEqual(k) // reconstructed byte-identically — no lossy digest
    // teeth (breaks-on "the archive stores only a lossy digest — respawn cannot reconstruct k"):
    expect(revived!.payload).toEqual({ fact: "v1" })
  })

  it("SCN-PERSIST-5d-1: forget removes from the active set only, archive untouched", () => {
    const activeBefore = set([k, kPrime]) // k present in the active/injected set
    const arch = archive(new Map() as EventLog, k) // and retained in the grow-only archive

    const activeAfter = forget(activeBefore, k)
    expect(activeAfter.has("id-k" as Hash)).toBe(false) // removed from the active set only
    expect(activeAfter.has("id-kp" as Hash)).toBe(true) // siblings untouched
    // teeth (breaks-on "forget also removes k from the archive — the archive shrinks"):
    expect(arch.has("id-k" as Hash)).toBe(true) // archive unchanged, k still retained + re-spawnable
    expect(respawn(arch, k)).toEqual(k)
  })
})

describe("REQ-PERSIST-12 — reorder invariance on non-linear history (visible goldens)", () => {
  it("SCN-PERSIST-12a-1: a rebase reordering the colliding pair leaves AtlasState byte-identical", () => {
    // reconstruct over two histories that carry the same set across DIFFERENT commits/parentage, reversing
    // the colliding e1/e2 pair — the fold is over the set, not the commit sequence.
    const original = reconstruct([[e1], [e2], [e3]])
    const rebased = reconstruct([[e3, e2], [e1]]) // reversed pair, re-parented into different commits

    expect(serializeState(rebased)).toBe(serializeState(original)) // byte-identical (REQ-PERSIST-12-a)
    // teeth (breaks-on "the fold keys on commit order/parentage — rebased heads e1 while original heads e2"):
    const node = rebased.get("claim:acme-arr-2024" as NodeKey)!
    expect([...node.entries.keys()].sort()).toEqual(["ch-e1", "ch-e2"])
  })

  it("SCN-PERSIST-12b-1: rewinding a PR rewinds Atlas on branch/merge/rebase history", () => {
    const S = set([e1, e2, e3])
    const P = [e2] // the PR's events, sitting on non-linear (branch→merge→rebase) history

    const rewound = rewind(S, P) // set-difference then re-fold: fold(S \ P)
    const expected = serializeState(fold(set([e1, e3]))) // Atlas rewinds to fold({e1, e3})

    expect(serializeState(rewound)).toBe(expected) // order/parentage-independent rewind (REQ-PERSIST-12-b)
    // teeth (breaks-on "rewind only works on a linear log — stale e2 remains"): e2's entry is gone from
    // the collision node (only e1's contentHash survives there).
    const node = rewound.get("claim:acme-arr-2024" as NodeKey)!
    expect([...node.entries.keys()]).toEqual(["ch-e1"])
  })
})

// ── ∀-laws (frozen properties, oracle-free disproof of fixture-overfitting) ──────────────────────────

/** Deterministic canonical bytes of an archive (sorted by id) — insertion-order-independent. */
function serializeArchive(a: EventLog): string {
  return JSON.stringify([...a.keys()].sort().map((id) => a.get(id)))
}

/** Build one event fully determined by its discriminator `k`; a small nodeKey space forces collisions and
 *  shared buckets while distinct `k` ⇒ distinct contentHash (so the OR-Set union stays order-independent
 *  without any head-resolution, which is EPIC-3-b / held out). */
const build = (k: number): Event => ev(`id-${k}`, `nk-${k % 3}`, `ch-${k}`, { k })
const ksArb = fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 24 })

describe("PROP-PERSIST-2 — fold convergence at the persistence seam (∀-law)", () => {
  it("∀ set S, ∀ π: serialize(fold(π(S))) ≡ serialize(fold(S)) ∧ fold(replay(export(S))) ≡ fold(S)", () => {
    fc.assert(
      fc.property(ksArb, fc.array(fc.integer(), { maxLength: 24 }), (ks, perm) => {
        const S = set(ks.map(build))
        const shuffled = set(shuffle(ks, perm).map(build))
        const base = serializeState(fold(S))

        expect(serializeState(fold(shuffled))).toBe(base) // permutation/re-batch invariant (KERNEL-11)
        expect(serializeState(replayFromExport(S))).toBe(base) // export→import→replay-from-empty round-trip
        // non-triviality: the projection materializes exactly the distinct node buckets present.
        expect(fold(S).size).toBe(new Set(ks.map((k) => k % 3)).size)
      }),
    )
  })
})

describe("PROP-PERSIST-5 — archive monotonicity + dedup-idempotence (∀-law)", () => {
  it("∀ archive A, entry e: A ⊑ archive(A,e) ∧ merge(A,A) ≡ A ∧ respawn(archive(k)) ≡ k ∧ forget active-only", () => {
    fc.assert(
      fc.property(ksArb, fc.integer({ min: 0, max: 40 }), (ks, ek) => {
        let A: EventLog = new Map()
        for (const k of ks) A = archive(A, build(k))
        const e = build(ek)

        const grown = archive(A, e)
        for (const id of A.keys()) expect(grown.has(id)).toBe(true) // A ⊑ archive(A, e) (grow-only)
        expect(grown.has(`id-${ek}` as Hash)).toBe(true)
        expect(serializeArchive(mergeArchive(A, A))).toBe(serializeArchive(A)) // merge(A,A) ≡ A (idempotent)
        expect(respawn(grown, e)).toEqual(e) // respawn(archive(k)) ≡ k (re-spawnable, byte-identical)

        // forget prunes the ACTIVE projection only; the grow-only archive is unchanged.
        const active = set(ks.map(build))
        const forgotten = forget(active, e)
        expect(forgotten.has(`id-${ek}` as Hash)).toBe(false)
        for (const id of A.keys()) expect(A.has(id)).toBe(true) // archive untouched by forget
      }),
    )
  })
})

describe("PROP-PERSIST-12 — reorder invariance on non-linear history (∀-law)", () => {
  it("∀ set S, ∀ ρ: serialize(fold(ρ(S))) ≡ serialize(fold(S)) ∧ rewind = set-difference then re-fold", () => {
    fc.assert(
      fc.property(
        ksArb,
        fc.array(fc.integer(), { maxLength: 24 }),
        fc.array(fc.integer({ min: 0, max: 9 })),
        (ks, perm, pk) => {
          const S = set(ks.map(build))
          const reordered = set(shuffle(ks, perm).map(build)) // arbitrary re-parenting / commit permutation
          const base = serializeState(fold(S))

          expect(serializeState(fold(reordered))).toBe(base) // order/parentage-independent (KERNEL-9/11)

          // rewind = fold(S \ P), order-independent: removing P then re-folding ≡ folding the residual set.
          const P = pk.map(build)
          const residual = set(ks.filter((k) => !pk.includes(k)).map(build))
          expect(serializeState(rewind(S, P))).toBe(serializeState(fold(residual)))
        },
      ),
    )
  })
})

/** A deterministic permutation of `xs` driven by an index stream (no clock/RNG in the path under test). */
function shuffle<T>(xs: readonly T[], perm: readonly number[]): T[] {
  const out = [...xs]
  for (let i = 0; i < out.length; i++) {
    const p = perm[i % Math.max(perm.length, 1)] ?? 0
    const j = ((p % out.length) + out.length) % out.length
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}
