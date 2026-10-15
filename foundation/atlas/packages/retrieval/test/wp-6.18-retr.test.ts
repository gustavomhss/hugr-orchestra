// @atlas/retrieval — test/wp-6.18-retr.test.ts  (WP-6.18.RETR)
//
// RED→GREEN transcription of the 7 VISIBLE `-1` goldens for the EPIC-18 RETR facet:
//   RETR-8a/8b  — caps tuned by observed hits + per-kind hitRate drives the RETR-6 drop order,
//   RETR-13a..e — the per-territory off-atlas (MISS-oracle) coverage ledger.
// Held-out `-2` legs (SCN-RETR-8a-2 / 8b-2) are NOT transcribed.
//
// This facet OWNS the RETR-8 hits/hitRate LEDGER (`budget()` + caps tuned by observed hits) that the
// ALREADY-BUILT drop-order (`src/drop.ts`, WP-6.22.RETR) CONSUMES, and the RETR-13 off-atlas MISS-oracle.
// It does NOT reimplement `dropOrder` — SCN-RETR-8b-1 asserts the SEAM by feeding this ledger's `budget()`
// into the sealed `dropOrder` and observing the order change (the ledger drives it, least-used first).
//
// [FLAG — `related` is not a frozen InjectionKind] SCN-RETR-8b-1 names `related`/`poke`; `related` is NOT a
// member of the frozen @atlas/contracts `InjectionKind` closed vocabulary (same discipline as src/drop.ts),
// so the law "kind X's hitRate mutated below poke's ⇒ X drops before poke" is witnessed with the frozen
// pair `orientation`/`poke` (orientation normally drops LAST among non-pins; below poke's hitRate it drops
// before poke) — never invented onto the frozen enum.
//
// [DEFINE-park — RETR-13 threshold θ] SCN-RETR-13b-1 is `gen: residue`: the off-atlas value that triggers
// the calibration prompt is an OPEN DEFINE dependency (silent in the reference). The mechanism is bound
// PARAMETRIC — `crossesThreshold(territory, θ)` with predicate `offAtlasRate > θ` — and the golden asserts
// it for any `θ < 0.30` (raises) / any `θ ≥ 0.30` (none). The constant is NOT invented here.

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import { dropOrder } from "../src/drop.js"
import { ledgerFrom, BASE_CAP, type HitRecord } from "../src/ledger.js"
import { offAtlasFrom, type TurnRecord } from "../src/offatlas.js"

// ── builders ──────────────────────────────────────────────────────────────────────────────────────────

/** `n` served injections of `kind`, of which `hit` governed a decision (a RETR-8 hits sequence). */
function hits(kind: HitRecord["kind"], served: number, hit: number): HitRecord[] {
  return Array.from({ length: served }, (_v, i) => ({ kind, hit: i < hit }))
}

/** `n` served turns for `territory`, of which `off` went off-atlas (a RETR-13 coverage sequence). */
function turns(territory: string, served: number, off: number): TurnRecord[] {
  return Array.from({ length: served }, (_v, i) => ({ territory, offAtlas: i < off }))
}

/** Deterministic byte-image of a coverage ledger via the sealed kernel `asHash` (no raw hashing). */
const image = (rows: readonly unknown[]): string => asHash(JSON.stringify(rows))

// ── REQ-RETR-8 — ledger-calibrated, not guessed ─────────────────────────────────────────────────────────

describe("SCN-RETR-8a-1 — caps are a function of the ledger observed hits (happy)", () => {
  it("mutating the ledgered hits for `own` upward changes `own`s cap (never a static constant)", () => {
    // Given the cap-table reading the ledger; `own` served 10 turns, few hits vs many hits
    const few = ledgerFrom(hits("own", 10, 2))
    const many = ledgerFrom(hits("own", 10, 8)) // ledgered hits mutated upward
    // When the caps are recomputed
    const capFew = few.capFor("own")
    const capMany = many.capFor("own")
    // Then `own`s cap CHANGES in response — proving the cap is a function of observed hits
    // teeth: a hardcoded constant cap would leave capMany === capFew (== the base sweet-spot)
    expect(capMany).not.toBe(capFew)
    expect(capMany).toBeGreaterThan(capFew)
    expect(capFew).toBeGreaterThanOrEqual(BASE_CAP.own) // base is the never-used floor
  })
})

describe("SCN-RETR-8b-1 — per-kind hitRate drives the RETR-6 drop order (happy)", () => {
  it("mutating a kinds hitRate below `poke`s makes it drop before `poke` (least-used first)", () => {
    // Baseline: `orientation` heavily used (hitRate 0.80) — it drops AFTER `poke` (hitRate 0.10)
    const base = ledgerFrom([...hits("orientation", 10, 8), ...hits("poke", 10, 1), ...hits("pack", 10, 7)])
    const baseOrder = dropOrder(base.budget())
    expect(baseOrder.indexOf("poke")).toBeLessThan(baseOrder.indexOf("orientation"))

    // Mutated: `orientation`s hitRate mutated BELOW `poke`s (0.05 < 0.10)
    const mutated = ledgerFrom([...hits("orientation", 20, 1), ...hits("poke", 10, 1), ...hits("pack", 10, 7)])
    const mutatedOrder = dropOrder(mutated.budget())
    // Then `orientation` now drops BEFORE `poke` — driven by observed hitRate, least-used first
    expect(mutatedOrder.indexOf("orientation")).toBeLessThan(mutatedOrder.indexOf("poke"))
    // teeth: a static-rank drop order would leave the order unchanged when the hitRate moves
    expect(mutatedOrder).not.toEqual(baseOrder)
  })
})

// ── REQ-RETR-13 — MISS-oracle, off-atlas coverage per territory ──────────────────────────────────────────

describe("SCN-RETR-13a-1 — the off-atlas rate is logged per territory (happy)", () => {
  it("billing served 10, 3 off-atlas ⇒ offAtlasRate = 3/10 = 0.30", () => {
    const led = offAtlasFrom(turns("crate:billing", 10, 3))
    const row = led.offAtlas().find((r) => r.territory === "crate:billing")
    expect(row).toBeDefined()
    expect(row?.served).toBe(10)
    expect(row?.offAtlasReads).toBe(3)
    expect(row?.offAtlasRate).toBe(0.3)
    // teeth: uncounted out-of-scope reads would leave the rate 0 despite the 3 misses
    expect(row?.offAtlasRate).not.toBe(0)
  })
})

describe("SCN-RETR-13b-1 — crossing the (symbolic) threshold raises a calibration prompt (guard) [DEFINE-parametric]", () => {
  it("for any θ < 0.30 the territory raises a prompt; for any θ ≥ 0.30 none (predicate offAtlasRate > θ)", () => {
    const led = offAtlasFrom(turns("crate:billing", 10, 3)) // offAtlasRate = 0.30
    // θ < 0.30 ⇒ crosses (raise a calibration prompt to author the missing tag/edge)
    for (const theta of [0, 0.1, 0.2, 0.29]) {
      expect(led.crossesThreshold("crate:billing", theta)).toBe(true)
    }
    // θ ≥ 0.30 ⇒ no prompt
    for (const theta of [0.3, 0.5, 1]) {
      expect(led.crossesThreshold("crate:billing", theta)).toBe(false)
    }
  })
})

describe("SCN-RETR-13c-1 — the off-atlas ledger is deterministic (happy)", () => {
  it("the same read multiset accumulated in two permuted orders serializes byte-identically", () => {
    const a = turns("crate:billing", 10, 3).concat(turns("crate:payments", 4, 1))
    const b = [...a].reverse() // the reads replayed in a permuted sequence
    const imgA = image(offAtlasFrom(a).offAtlas())
    const imgB = image(offAtlasFrom(b).offAtlas())
    // Then both serialize byte-identically — order-independent (a commutative, pinned reduction)
    expect(imgB).toBe(imgA)
    // teeth: an iteration-order accumulation would produce different rate bytes across the permutation
  })
})

describe("SCN-RETR-13d-1 — a territory with no served history yields rate 0 (guard)", () => {
  it("payments with served = 0 ⇒ offAtlasRate = 0 (not NaN, not undefined)", () => {
    // `crate:payments` is a KNOWN (registered) territory but was never served
    const led = offAtlasFrom(turns("crate:billing", 10, 3), ["crate:payments"])
    const row = led.offAtlas().find((r) => r.territory === "crate:payments")
    expect(row).toBeDefined()
    expect(row?.served).toBe(0)
    expect(row?.offAtlasRate).toBe(0)
    expect(Number.isNaN(row?.offAtlasRate ?? NaN)).toBe(false) // teeth: 0/0 = NaN
  })
})

describe("SCN-RETR-13e-1 — a territory with no served history never throws (guard)", () => {
  it("offAtlas() on a served = 0 territory returns rate 0 and does not throw (total)", () => {
    const led = offAtlasFrom([], ["crate:payments"])
    expect(() => led.offAtlas()).not.toThrow()
    const row = led.offAtlas().find((r) => r.territory === "crate:payments")
    expect(row?.offAtlasRate).toBe(0)
    // an unregistered / unserved territory is also total: rate 0 ⇒ crossesThreshold false
    expect(() => led.crossesThreshold("crate:never", 0.1)).not.toThrow()
    expect(led.crossesThreshold("crate:never", 0.1)).toBe(false)
  })
})
