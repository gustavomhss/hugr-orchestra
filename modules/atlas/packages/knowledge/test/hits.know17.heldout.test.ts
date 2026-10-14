// WP-6.18.KNOW · HELD-OUT leg — the withheld `-2` goldens for REQ-KNOW-17 (SCN-KNOW-17a-2 / 17b-2 /
// 17c-2 / 17d-2, docs/requirements/goldens-knw.md, all `held_out: true`). Authored by the COLD REVIEWER
// against the EXISTING src/hits.ts — NOT shown to the builder. Each `-2` hits the SAME behaviour/branch
// as its `-1` sibling but with DIFFERENT concrete data (different node / a second seat / a `queue/`
// territory node / a distinct self-score) so an overfit hard-code of the `-1` answer FAILS here.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import { bindHits, type HitsDeps, type Calibrate } from "../src/lifecycle/hits.js"

// ── fixtures (different concrete data from the -1 leg) ────────────────────────
const C = asNodeKey("fact-C") // 17a-2: a different fact cited by a *second* seat
const Q = asNodeKey("queue/fact-Q") // 17c-2/17d-2: a fact at territory `queue/`

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
// PARAMETRIC door-2 f(hits) — a DIFFERENT calibration shape than the -1 leg (proves value not baked).
const calibrate: Calibrate = (observedHits) => observedHits * 7 + 3
const deps = (servedSet: () => readonly NodeKey[], archive: (n: NodeKey) => void): HitsDeps => ({
  servedSet,
  archive,
  calibrate,
})
const cfg = { window: 0, threshold: 0 }

// ── SCN-KNOW-17a-2 — a different served fact cited by a second seat accrues a hit ────────────────────
describe("SCN-KNOW-17a-2 · a different served fact (second seat) accrues a logged hit", () => {
  it("logs a hit against the distinct fact node-id", () => {
    const p = pack([C])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    const entry = hits.logHit(C)

    expect(entry.nodeKey).toBe(C)
    expect(entry.hits).toBe(1)
    expect(entry.window).toBe(1) // logical ledger event-count
  })
})

// ── SCN-KNOW-17b-2 — door-2 ignores a high self-score, tracks the LOW observed hits ─────────────────
describe("SCN-KNOW-17b-2 · door-2 threshold reads low observed hits, never the high self-score", () => {
  it("tracks the low hit history and ignores the higher proposer self-assessment", () => {
    const p = pack([C])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.logHit(C) // low observed history = 1
    const proposerSelfScore = 250 // a distinct, high self-assessment — NOT an API input

    const threshold = hits.door2Threshold(C)

    expect(threshold).toBe(calibrate(1)) // == 10, tracks observed hits
    expect(threshold).not.toBe(proposerSelfScore)
  })
})

// ── SCN-KNOW-17c-2 — a zero-hit `queue/` fact decays to CAS, never deleted ──────────────────────────
describe("SCN-KNOW-17c-2 · a 0-hit fact at territory `queue/` decays out, archived to CAS", () => {
  it("drops the 0-hit `queue/` fact and archives it (never deletes)", () => {
    const p = pack([Q])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    const result = hits.decay(cfg)

    expect(result.decayed).toEqual([Q])
    expect(result.retained).toEqual([])
    expect(sink.archived).toEqual([Q]) // archived, not deleted
  })
})

// ── SCN-KNOW-17d-2 — a different decayed fact re-enters on a later hit ───────────────────────────────
describe("SCN-KNOW-17d-2 · a different decayed (`queue/`) fact re-enters on a later hit", () => {
  it("re-admits the decayed `queue/` fact when it later gets a hit", () => {
    const p = pack([Q])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    expect(hits.decay(cfg).decayed).toEqual([Q]) // decays first
    expect(sink.archived).toEqual([Q])

    const reentry = hits.logHit(Q) // a later hit re-spawns from CAS
    expect(reentry.nodeKey).toBe(Q)
    expect(reentry.hits).toBe(1)

    p.set([Q]) // back in the pack
    const result = hits.decay(cfg)
    expect(result.retained).toEqual([Q]) // re-entry survives
    expect(result.decayed).toEqual([])
  })
})
