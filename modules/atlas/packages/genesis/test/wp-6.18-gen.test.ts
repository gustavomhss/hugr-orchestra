// @atlas/genesis — test/wp-6.18-gen.test.ts   (WP-6.18.GEN — EPIC-18)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for USEFULNESS-GRADED-A-POSTERIORI (GEN-16 · the
// genesis SEED side):
//   - SCN-GEN-16a-1 (guard) — the non-obvious ∧ actionable gate IGNORES proposer self-assessment.
//   - SCN-GEN-16b-1 (happy) — genesis seeds LOOSE-BUT-THIN (a grounded 0-hit candidate is still seeded).
//   - SCN-GEN-16c-1 (happy) — each seeded fact accrues a LOGGED hit on consult (KNOW-17).
//   - SCN-GEN-16d-1 (guard) — a fact no wave consults decays out, archived + re-enterable (not deleted).
//   - SCN-GEN-16e-1 (happy) — the admission threshold calibrates against observed hits (`threshold=f(hits)`).
//
// The facet is imported DIRECTLY from ../src/usefulness.js (the barrel is wired by the lead at SEAL). The
// hits ledger + decay + Door-2 mechanics are KNOW-17 — CONSUMED from the SEALED @atlas/knowledge `bindHits`
// (never redefined here); genesis owns only the loose-but-thin seed gate and the parametric admission
// calibration OVER the shared ledger. A hit is a LOGGED CITED event (`logHit`), never a self-assessed
// counter. Branded node identity comes from the SEALED @atlas/kernel (`asNodeKey`/`asSubtreeHash`), never a
// hand-rolled digest. Held-out `-2` fixtures are the GATE's — NOT transcribed.
//
// FLAG: the GEN-16 genesis reference oracle (`genesis usefulness.ts`, method-tags-gen:126) was never frozen
// — this facet binds the SEALED KNOW-17 surface (@atlas/knowledge) + genesis types.ts instead.
// FLAG: interface_contract digest is `<filled-at-freeze>` (simulated) — resolved by disciplined judgment.
// FLAG: the admission threshold `f(hits)` and the decay `window` are the KNOW-17 OPEN-DEFINE parametrics
// (ref/hits.ts DecayConfig) — taken here as EXPLICIT injected parameters (`calibrate` / `cfg.window`), never
// a baked-in magic number.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { NodeKey, StructRef } from "@atlas/contracts"
import { bindHits, type Calibrate, type ObviousnessScore } from "@atlas/knowledge"
import { seedGate, bindSeedGate, type SeedCandidate } from "../src/usefulness.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

const siteOf = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(`st-${id}`),
})

const cand = (over: Partial<SeedCandidate> = {}): SeedCandidate => ({
  site: siteOf("c"),
  grounded: true,
  ...over,
})

/** A KNOW-17 ledger bound over a caller-controlled served set + an archive SINK (never a delete). */
const ledgerOf = (served: Set<NodeKey>, calibrate: Calibrate = () => 0) => {
  const archived: NodeKey[] = []
  const hits = bindHits({
    servedSet: () => served,
    archive: (nodeKey) => archived.push(nodeKey), // KNOW-12 sink — RECEIVES, never deletes
    calibrate,
  })
  return { hits, archived }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

describe("WP-6.18.GEN — usefulness graded a-posteriori · the seed side (GEN-16)", () => {
  // SCN-GEN-16a-1 — the non-obvious ∧ actionable gate ignores proposer self-assessment.
  it("SCN-GEN-16a-1: admission is INDEPENDENT of the proposer self_score", () => {
    const boastful = seedGate(cand({ self_score: 0.99, importance: 1 })) // proposer swears it's great
    const modest = seedGate(cand({ self_score: 0.01, importance: 0 })) //   proposer under-rates it
    expect(modest.seeded).toBe(true) // teeth: a gate on `self_score >= 0.8` would REJECT this low one
    expect(boastful).toEqual(modest) // the decision reads no self-assessment — identical either way
  })

  // ADR-0012 — seedGate is the CONSUMER of the score, and the SCN-GEN-16a-1 witness above must survive it.
  it("ADR-0012: the score rides onto the decision for ranking and NEVER moves the verdict", () => {
    const OBV: ObviousnessScore = { rank: "obvious", by: "harness-predicate" }
    const NON: ObviousnessScore = { rank: "non-obvious", by: "harness-predicate" }
    const c = cand({ self_score: 0.99, importance: 1 })

    // 1. the score is CARRIED — ranking downstream can read the cold-start prior off the decision.
    expect(seedGate(c, OBV).obviousness).toStrictEqual(OBV)

    // 2. it is NOT consulted. teeth (breaks-on "seedGate starts gating on `obviousness.rank`"): the
    //    verdict is byte-identical across the whole score domain AND across its absence.
    const verdict = (d: { seeded: boolean; reason: string }) => ({ seeded: d.seeded, reason: d.reason })
    expect(verdict(seedGate(c, OBV))).toStrictEqual(verdict(seedGate(c, NON)))
    expect(verdict(seedGate(c, OBV))).toStrictEqual(verdict(seedGate(c)))
    expect(seedGate(c, OBV).seeded).toBe(true) // an OBVIOUS candidate is still seeded — never gated

    // 3. and the GEN-16a witness is intact underneath: `grounded` is still the only mechanical input, so
    //    the ungrounded candidate is refused no matter how flattering its score.
    expect(seedGate(cand({ grounded: false }), NON).seeded).toBe(false)

    // 4. absent score ⇒ absent field. No default is fabricated (exactOptionalPropertyTypes-honest).
    expect("obviousness" in seedGate(c)).toBe(false)
  })

  // SCN-GEN-16b-1 — genesis seeds loose-but-thin.
  it("SCN-GEN-16b-1: a grounded candidate with 0 measured hits is SEEDED loose-but-thin", () => {
    const cLoose = cand({ grounded: true, self_score: 0 }) // plausible-but-unproven, 0 hits yet
    const d = seedGate(cLoose)
    expect(d.seeded).toBe(true) // teeth: a strict a-priori usefulness bar would reject the 0-hit c_loose
    expect(d.reason).toBe("loose-but-thin")
    // control — grounding (GEN-4) is the real bar, not usefulness: an ungrounded candidate is not seeded.
    expect(seedGate(cand({ grounded: false })).seeded).toBe(false)
  })

  // SCN-GEN-16c-1 — each seeded fact accrues logged hits on consult.
  it("SCN-GEN-16c-1: consulting a seeded fact increments its LOGGED hits (KNOW-17)", () => {
    const F = asNodeKey("nk:seeded-fact-F")
    const { hits } = ledgerOf(new Set([F]))
    const gate = bindSeedGate({ hits, calibrate: (h) => h })
    expect(gate.consult(F).hits).toBe(1) // wave 1 consults F
    expect(gate.consult(F).hits).toBe(2) // wave 2 consults F — the counter is a logged a-posteriori outcome
    // teeth: a no-op `consult` (usefulness never measured) would leave `.hits` at 0 — decay could not calibrate.
  })

  // SCN-GEN-16d-1 — a fact no wave consults decays out, archived and re-enterable.
  it("SCN-GEN-16d-1: a 0-hit fact decays out — archived (not deleted) and re-enterable on a later hit", () => {
    const F = asNodeKey("nk:unconsulted-F")
    const served = new Set<NodeKey>([F])
    const { hits, archived } = ledgerOf(served)
    const gate = bindSeedGate({ hits, calibrate: (h) => h })

    const first = gate.decay({ window: 10, threshold: 0 })
    expect(first.decayed).toContain(F) // teeth: no decay ⇒ the unconsulted F would live in served forever
    expect(first.retained).not.toContain(F)
    expect(archived).toContain(F) // archived to CAS — NOT deleted (KNOW-12)

    // re-enterable: a later consult re-spawns F; back in the served set with a hit, it is now RETAINED.
    gate.consult(F)
    const second = gate.decay({ window: 10, threshold: 0 })
    expect(second.decayed).not.toContain(F) // re-entered — no longer decays
    expect(second.retained).toContain(F)
  })

  // SCN-GEN-16e-1 — the admission threshold calibrates against observed hits.
  it("SCN-GEN-16e-1: the admission threshold is a FUNCTION of observed hits (threshold = f(hits))", () => {
    const calibrate: Calibrate = (h) => h * 2 + 1 // the parametric OPEN-DEFINE f(hits) — injected
    const { hits } = ledgerOf(new Set())
    const gate = bindSeedGate({ hits, calibrate })
    expect(gate.admissionThreshold(3)).toBe(7) //  f(3)
    expect(gate.admissionThreshold(7)).toBe(15) // f(7)
    // teeth: a hard-coded constant threshold would ignore observed hits — these two would be EQUAL.
    expect(gate.admissionThreshold(3)).not.toBe(gate.admissionThreshold(7))
  })
})
