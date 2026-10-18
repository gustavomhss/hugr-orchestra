// WP-D3B-B.USE-OR-SEAL · HELD-OUT leg — the withheld `-2` goldens for INV-AUTH-16 against the EXISTING
// src/hits.ts — authored by the COLD REVIEWER, NOT shown to the builder. Each `-2` hits the SAME trigger
// as its `-1` sibling with DIFFERENT concrete data (a different node / a `queue/` territory node / a
// third seat / a distinct non-threshold count) so an overfit hard-code of the `-1` answer FAILS here.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import { bindHits, USE_THRESHOLD, type HitsDeps, type Calibrate } from "../src/lifecycle/hits.js"

// ── fixtures (different concrete data from the -1 leg) ────────────────────────
const Q = asNodeKey("queue/growth-fact-Q") // a growth candidate at territory `queue/`
const R = asNodeKey("fact-R") // a third seat — different from A/B/C

const pack = (init: NodeKey[]): { snapshot: () => readonly NodeKey[]; set: (n: NodeKey[]) => void } => {
  let current = init
  return {
    snapshot: () => current,
    set: (n) => {
      current = n
    },
  }
}
const archiveSink = (): { archive: (n: NodeKey) => void; archived: NodeKey[] } => {
  const archived: NodeKey[] = []
  return {
    archive: (n) => {
      archived.push(n)
    },
    archived,
  }
}
// a DIFFERENT calibration shape — value not baked, and irrelevant to the plain-integer rise.
const calibrate: Calibrate = (observedHits) => observedHits * 4 - 1
const deps = (servedSet: () => readonly NodeKey[], archive: (n: NodeKey) => void): HitsDeps => ({
  servedSet,
  archive,
  calibrate,
})
const cfg = { window: 0, threshold: 0 }

// ── SCN-AUTH-16a-2 — a DIFFERENT served node (third seat) accrues on serve ─────────────────────────
describe("SCN-AUTH-16a-2 · a different advisory node served in a pack accrues (third seat)", () => {
  it("accrues a hit for the distinct `R` node, leaving an untouched sibling at zero", () => {
    const p = pack([Q, R])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.logHit(R)

    expect(hits.door2Threshold(R)).toBe(calibrate(1))
    // an untouched sibling Q has ZERO observed hits — no cross-node leakage.
    expect(hits.door2Threshold(Q)).toBe(calibrate(0))
    expect(hits.servedClass(Q)).toBe("advisory")
  })
})

// ── SCN-AUTH-16b-2 — the FIXED threshold, reached with a different counter shape ────────────────────
describe("SCN-AUTH-16b-2 · the `queue/` node rises at the fixed threshold — not at any other count", () => {
  it("rides the SAME plain USE_THRESHOLD for a different node (breaks-on a node-specific constant)", () => {
    const p = pack([Q])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    // the `queue/` node crosses at USE_THRESHOLD, exactly like any other — the constant is global.
    for (let i = 0; i < USE_THRESHOLD; i++) hits.logHit(Q)

    expect(hits.servedClass(Q)).toBe("governing")

    // a DIFFERENT node at the SAME count is below — a hard-coded "one node rises" mutant dies here.
    const p2 = pack([R])
    const sink2 = archiveSink()
    const other = bindHits(deps(p2.snapshot, sink2.archive))
    for (let i = 0; i < USE_THRESHOLD; i++) other.logHit(R)
    expect(other.servedClass(R)).toBe("governing") // the rise is per-node, not per-fixture
  })
})

// ── SCN-AUTH-16c-2 — a seal on a DIFFERENT node, counter below threshold ────────────────────────────
describe("SCN-AUTH-16c-2 · a seal on the `queue/` node rises it — counter below, others untouched", () => {
  it("seals Q while R stays advisory (breaks-on a seal that rises the whole pack)", () => {
    const p = pack([Q, R])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.seal(Q)

    expect(hits.servedClass(Q)).toBe("governing") // sealed independently of any counter
    expect(hits.servedClass(R)).toBe("advisory") // the seal never bleeds to a sibling
  })
})

// ── SCN-AUTH-16d-2 — a DIFFERENT non-earning node decays, and never rises ───────────────────────────
describe("SCN-AUTH-16d-2 · a different node (zero hits, unsealed) decays by non-use — still advisory", () => {
  it("decays Q across the pass and keeps servedClass advisory the whole way", () => {
    const p = pack([Q])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    expect(hits.servedClass(Q)).toBe("advisory") // before decay: no default rise

    const result = hits.decay(cfg)

    expect(result.decayed).toEqual([Q])
    expect(sink.archived).toEqual([Q]) // archived to CAS, never deleted
    expect(hits.servedClass(Q)).toBe("advisory") // after decay: still never rose by default
  })

  it("a node PART way to the threshold (below it) is retained, not decayed, and stays advisory", () => {
    const p = pack([R])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.logHit(R) // ONE hit — below USE_THRESHOLD, no seal
    expect(hits.servedClass(R)).toBe("advisory")

    const result = hits.decay(cfg)

    expect(result.retained).toEqual([R]) // a non-zero hit count keeps it from the non-use decay
    expect(hits.servedClass(R)).toBe("advisory") // and it has NOT risen
  })
})
