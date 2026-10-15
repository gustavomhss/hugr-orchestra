// WP-6.18.KNOW · RED/GREEN — the served-fact hits ledger + door-2 threshold calibration + decay/re-entry
// (KNOW-17) against the FROZEN `HitsApi` oracle. Transcribes the visible `-1` goldens
// SCN-KNOW-17a-1 / 17b-1 / 17c-1 / 17d-1 (docs/requirements/goldens-knw.md). Held-out `-2` fixtures
// (different node / territory `queue/` / self-score) are NOT referenced here.
//
// SEAM (sealed lower layers; build-ahead injection — the same discipline `bindReconcile`/`bindFreshness`/
// `produce` use):
//   • the served/pack SNAPSHOT is upstream-owned (produce/router) — INJECTED as `servedSet`, never
//     recomputed here.
//   • the CAS archive is KERNEL-owned (KNOW-12, archive.ts) — INJECTED as `archive` (a sink that only
//     receives; decay NEVER deletes).
//   • the door-2 threshold `f(hits)` is OPEN-DEFINE + PARAMETRIC (DecayConfig.threshold, hits.ts) —
//     INJECTED as `calibrate`, never a baked-in constant.
// This WP owns ONLY the ledger accrual, the door-2 calibration OVER observed hits, and the decay/re-entry.
// No clock, no IO, no hash computed here (the `window` is a logical ledger event-count, not wall-clock).

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import { bindHits, type HitsDeps, type Calibrate } from "../src/lifecycle/hits.js"

// ── fixtures ────────────────────────────────────────────────────────────────

const A = asNodeKey("fact-A")
const B = asNodeKey("fact-B")

/** A mutable served/pack snapshot the test drives (upstream produce/router-owned). */
const pack = (init: NodeKey[]): { snapshot: () => readonly NodeKey[]; set: (n: NodeKey[]) => void } => {
  let current = init
  return {
    snapshot: () => current,
    set: (n) => {
      current = n
    },
  }
}

/** A CAS archive sink that only RECEIVES (KNOW-12 — never deletes). Records what decay archived. */
const archiveSink = (): { archive: (n: NodeKey) => void; archived: NodeKey[] } => {
  const archived: NodeKey[] = []
  return {
    archive: (n) => {
      archived.push(n)
    },
    archived,
  }
}

/** The DEFINE-supplied door-2 threshold f(observed hits) — PARAMETRIC, injected (value not baked). */
const calibrate: Calibrate = (observedHits) => observedHits * 10

const deps = (servedSet: () => readonly NodeKey[], archive: (n: NodeKey) => void): HitsDeps => ({
  servedSet,
  archive,
  calibrate,
})

// The frozen DecayConfig — window is a logical ledger event-count; threshold is the parametric door-2 knob.
const cfg = { window: 0, threshold: 0 }

// ── SCN-KNOW-17a-1 — a served fact governing a decision accrues a logged hit ─────────────────────────
describe("SCN-KNOW-17a-1 · served fact governing a decision accrues a logged hit", () => {
  it("logs a hit against the cited fact node-id", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    const entry = hits.logHit(A)

    // a `hit` is logged against that fact's node-id (breaks-on: usefulness invisible to the ledger)
    expect(entry.nodeKey).toBe(A)
    expect(entry.hits).toBe(1)
    // window is a logical ledger event-count (monotone), never wall-clock
    expect(entry.window).toBe(1)
    expect(hits.logHit(A).hits).toBe(2) // append-only accrual
  })
})

// ── SCN-KNOW-17b-1 — door-2 calibrates on observed hits, not self-score ──────────────────────────────
describe("SCN-KNOW-17b-1 · door-2 threshold is f(observed hits), never the proposer self-score", () => {
  it("reads observed hits and ignores the (higher) proposer self-assessment", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.logHit(A) // observed hit history = 1 (low)
    const proposerSelfScore = 99 // higher self-assessment — NOT an input to the ledger API

    const threshold = hits.door2Threshold(A)

    // threshold tracks OBSERVED hits (breaks-on: threshold reads the self-assessment)
    expect(threshold).toBe(calibrate(1))
    expect(threshold).not.toBe(proposerSelfScore)
  })
})

// ── SCN-KNOW-17c-1 — an unconsulted fact decays out, archived to CAS (never deleted) ─────────────────
describe("SCN-KNOW-17c-1 · unconsulted (0-hit) fact decays out, archived to CAS, never deleted", () => {
  it("drops the 0-hit served fact from the pack and archives it to CAS", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    const result = hits.decay(cfg) // A has hits-in-window == 0

    expect(result.decayed).toEqual([A])
    expect(result.retained).toEqual([])
    // archived to CAS — never deleted (breaks-on: decay deletes instead of archiving)
    expect(sink.archived).toEqual([A])
  })

  it("retains a fact that WAS consulted (hits > 0)", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.logHit(A)
    const result = hits.decay(cfg)

    expect(result.retained).toEqual([A])
    expect(result.decayed).toEqual([])
    expect(sink.archived).toEqual([])
  })
})

// ── SCN-KNOW-17d-1 — a decayed fact may re-enter on a later hit ──────────────────────────────────────
describe("SCN-KNOW-17d-1 · a decayed (archived) fact re-enters the served set on a later hit", () => {
  it("re-admits a decayed fact when it later gets a hit (decay is NOT one-way)", () => {
    const p = pack([A])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    // decay archives the 0-hit fact
    expect(hits.decay(cfg).decayed).toEqual([A])
    expect(sink.archived).toEqual([A])

    // a LATER hit re-spawns it from CAS (breaks-on: decayed fact permanently excluded)
    const reentry = hits.logHit(A)
    expect(reentry.nodeKey).toBe(A)
    expect(reentry.hits).toBe(1) // accrual resumes from the re-spawn

    // with the fact back in the pack, the next decay RETAINS it — re-entry survives
    p.set([A])
    const result = hits.decay(cfg)
    expect(result.retained).toEqual([A])
    expect(result.decayed).toEqual([])
  })
})

// ── isolation: distinct served facts accrue independently (no cross-node leakage) ────────────────────
describe("KNOW-17 · distinct facts accrue independently", () => {
  it("a hit on B does not accrue against A", () => {
    const p = pack([A, B])
    const sink = archiveSink()
    const hits = bindHits(deps(p.snapshot, sink.archive))

    hits.logHit(B)
    const result = hits.decay(cfg)

    expect(result.retained).toEqual([B])
    expect(result.decayed).toEqual([A]) // A unconsulted ⇒ decays
    expect(sink.archived).toEqual([A])
  })
})
