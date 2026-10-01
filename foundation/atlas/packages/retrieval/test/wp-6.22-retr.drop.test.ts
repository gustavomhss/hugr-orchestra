// @atlas/retrieval — test/wp-6.22-retr.drop.test.ts  (WP-6.22.RETR)
//
// RED→GREEN transcription of the 10 VISIBLE `-1` goldens for the injection-budget / drop-policy +
// fail-closed-staleness facet:
//   RETR-6a..6f (the injection ceiling + ledger-calibrated drop order + cold-start + drop-counter),
//   RETR-3a..3c (fail-closed staleness — a stale pack is not trusted, re-grounded before use, stale == OR).
//
// The facet is a SEAM CONSUMER: it READS the per-kind hits/hitRate ledger (RETR-8, WP-6.18.RETR — the
// sealed hits-ledger seam) + the per-turn pinned `cl100k_base` `tokenEstimate` the index supplies; it
// NEVER tokenizes and NEVER hashes (identity is minted only through the sealed @atlas/kernel `asHash`).
// The injection budget (Fixture B) is transcribed EXACTLY from goldens-ret.md §Fixture B, MINUS the
// `related` kind — `related` is NOT a member of the frozen @atlas/contracts `InjectionKind` closed
// vocabulary, so it is never invented onto the frozen enum (see WP-6.19 §SCN-RETR-7a-1 for the same FLAG).
//
// The drop ORACLE is re-derived INDEPENDENTLY here (`specDropOrder`) from the two frozen laws — warm:
// `hitRate-asc, least-used first`; cold: the documented cold-start priority order — never the facet's own
// comparator. SCN-RETR-6b-2 is `gen: residue`: RETR-6/8 guarantee a deterministic TOTAL order but do NOT
// name the hitRate-tie secondary key κ ([NEEDS RECONCILIATION]) — so the tie golden asserts DETERMINISM +
// exactly-one-survives ONLY, never a specific κ-dependent survivor (κ is not invented at execution).

import { describe, it, expect, vi } from "vitest"
import { asHash } from "@atlas/kernel"
import type { Budget, InjectionKind, Pack } from "@atlas/contracts"
import {
  dropOrder,
  resolveCeiling,
  dropCounter,
  isStale,
  isTrusted,
  servePack,
  CEILING,
  MISCAP_THRESHOLD,
  type Injection,
} from "../src/drop.js"

// ── fixture builders ────────────────────────────────────────────────────────────────────────────────────

/** A per-kind ledger row (RETR-8 seam). `hits > 0` on any row ⇒ the ledger HAS data (warm regime). */
function bud(kind: InjectionKind, o: { cap?: number; hits?: number; hitRate?: number } = {}): Budget {
  return { kind, capTokens: o.cap ?? 500, hits: o.hits ?? 0, hitRate: o.hitRate ?? 0 }
}
/** One turn's actual injection: the pinned `cl100k_base` `tokenEstimate` + the ledger's observed hitRate/hits. */
function inj(kind: InjectionKind, tok: number, o: { hits?: number; hitRate?: number } = {}): Injection {
  return { kind, tokenEstimate: tok, hits: o.hits ?? 0, hitRate: o.hitRate ?? 0 }
}
const pack = (o: Partial<Pack> & { stale: boolean }): Pack => ({
  territory: o.territory ?? "crate:billing",
  axisHash: o.axisHash ?? asHash("axis-billing"),
  invariants: o.invariants ?? [],
  advisory: o.advisory ?? [],
  advisoryDropped: o.advisoryDropped ?? 0,
  tokenEstimate: o.tokenEstimate ?? 1760,
  stale: o.stale,
})

// ── Fixture B — the one-turn injection budget (goldens-ret.md §Fixture B), MINUS the non-vocab `related` ──
// tokenEstimate == cap for this turn; sum (vocab) = 400+500+250+500+1500+2000+500+150 = 5800 > 5000 ceiling.
const HITS = 5 // any positive hits ⇒ warm regime (the ledger has data)
const B_BUDGETS: readonly Budget[] = [
  bud("awareness", { cap: 400, hits: HITS, hitRate: 1.0 }), // PIN
  bud("protocols.safetyCritical", { cap: 500, hits: HITS, hitRate: 1.0 }), // PIN
  bud("orientation", { cap: 250, hits: HITS, hitRate: 0.8 }),
  bud("projectMem", { cap: 500, hits: HITS, hitRate: 0.6 }),
  bud("own", { cap: 1500, hits: HITS, hitRate: 0.5 }),
  bud("pack", { cap: 2000, hits: HITS, hitRate: 0.7 }),
  bud("protocols.advisory", { cap: 500, hits: HITS, hitRate: 0.3 }),
  bud("poke", { cap: 150, hits: HITS, hitRate: 0.1 }),
]
const B_INJECTIONS: readonly Injection[] = [
  inj("awareness", 400, { hits: HITS, hitRate: 1.0 }),
  inj("protocols.safetyCritical", 500, { hits: HITS, hitRate: 1.0 }),
  inj("orientation", 250, { hits: HITS, hitRate: 0.8 }),
  inj("projectMem", 500, { hits: HITS, hitRate: 0.6 }),
  inj("own", 1500, { hits: HITS, hitRate: 0.5 }),
  inj("pack", 2000, { hits: HITS, hitRate: 0.7 }),
  inj("protocols.advisory", 500, { hits: HITS, hitRate: 0.3 }),
  inj("poke", 150, { hits: HITS, hitRate: 0.1 }),
]
// the same set, COLD (no ledger data yet): hits = 0 everywhere ⇒ the documented cold-start order applies.
const cold = <T extends { hits: number }>(xs: readonly T[]): readonly T[] => xs.map((x) => ({ ...x, hits: 0 }))

const PINS: readonly InjectionKind[] = ["awareness", "protocols.safetyCritical"]

// ── independent ORACLE — re-derived from the two frozen drop laws, NOT the facet's comparator ────────────
// The documented cold-start priority order (highest-priority kept LAST), in vocab (no `related`, no
// awareness-tail — the frozen enum has a single `awareness`, treated as the constitution pin):
const SPEC_COLD_DROP_FIRST: readonly InjectionKind[] = [
  "poke",
  "protocols.advisory",
  "pack",
  "own",
  "projectMem",
  "orientation",
]
const specColdRank = (k: InjectionKind): number => SPEC_COLD_DROP_FIRST.indexOf(k)
/** Warm: hitRate-asc (least-used dropped first), ties broken by the documented cold-start priority (κ backbone). */
function specDropOrder(rows: readonly { kind: InjectionKind; hits: number; hitRate: number }[]): InjectionKind[] {
  const warm = rows.some((r) => r.hits > 0)
  return rows
    .filter((r) => !PINS.includes(r.kind))
    .slice()
    .sort((a, b) =>
      warm && a.hitRate !== b.hitRate ? a.hitRate - b.hitRate : specColdRank(a.kind) - specColdRank(b.kind),
    )
    .map((r) => r.kind)
}

// ── REQ-RETR-6 — injection ceiling + ledger-calibrated drop order ────────────────────────────────────────

describe("REQ-RETR-6 — injection ceiling + ledger-calibrated drop order", () => {
  it("SCN-RETR-6a-1 — the auto-injected sum respects the pinned ~5K ceiling", () => {
    const r = resolveCeiling(B_INJECTIONS)
    expect(r.sum).toBe(3650) // 5800 − poke(150) − advisory(500) − own(1500) = 3650
    expect(r.sum).toBeLessThanOrEqual(CEILING) // ≤ 5000 — the hard ceiling holds under the pinned measure
    expect(CEILING).toBe(5000)
  })

  it("SCN-RETR-6b-1 — overflow drops droppable kinds by hitRate, least-used first", () => {
    const r = resolveCeiling(B_INJECTIONS)
    expect(r.dropped).toEqual(["poke", "protocols.advisory", "own"]) // least-used first (related is not in vocab)
    // a higher-hitRate kind is RETAINED over a lower one (pack 0.70 / orientation 0.80 survive)
    const survivors = new Set(r.survivors.map((i) => i.kind))
    expect(survivors.has("pack")).toBe(true)
    expect(survivors.has("orientation")).toBe(true)
    expect(survivors.has("poke")).toBe(false) // the least-used kind dropped, not a hardcoded declaration order
    // independent oracle: the drop prefix follows hitRate-asc
    expect(r.dropped).toEqual(specDropOrder(B_INJECTIONS).slice(0, r.dropped.length))
  })

  it("SCN-RETR-6b-2 — the drop is deterministic under a hitRate tie (κ residue: determinism only)", () => {
    // Fixture B′: `own` and `pack` TIE at hitRate 0.30; the overflow must drop EXACTLY one of the tied pair.
    const tied: readonly Injection[] = [
      inj("awareness", 400, { hits: HITS, hitRate: 1.0 }), // pin
      inj("protocols.safetyCritical", 500, { hits: HITS, hitRate: 1.0 }), // pin
      inj("own", 3000, { hits: HITS, hitRate: 0.3 }),
      inj("pack", 3000, { hits: HITS, hitRate: 0.3 }),
    ] // sum 6900 > 5000; dropping ONE 3000 ⇒ 3900 ≤ 5000
    const a = resolveCeiling(tied)
    const b = resolveCeiling(tied)
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b)) // deterministic total order — both runs identical
    expect(a.dropped).toHaveLength(1) // EXACTLY one of the tied pair drops…
    expect(["own", "pack"]).toContain(a.dropped[0]) // …and it is a member of the tied pair (κ not asserted)
    const survivors = a.survivors.map((i) => i.kind).filter((k) => k === "own" || k === "pack")
    expect(survivors).toHaveLength(1) // exactly one of {own, pack} survives (the tie decides which — residue)
  })

  it("SCN-RETR-6c-1 — the two pins never drop, even under heavy overflow", () => {
    // heavy overflow: every droppable kind is huge, forcing many drops; the pins must never be touched.
    const heavy: readonly Injection[] = B_INJECTIONS.map((i) =>
      PINS.includes(i.kind) ? i : { ...i, tokenEstimate: 9000 },
    )
    const r = resolveCeiling(heavy)
    for (const p of PINS) {
      expect(r.dropped).not.toContain(p) // never dropped
      expect(r.survivors.map((i) => i.kind)).toContain(p) // always retained
    }
    expect(r.dropped.every((k) => !PINS.includes(k))).toBe(true) // only non-pin kinds are droppable
  })

  it("SCN-RETR-6d-1 — cold-start uses the documented default drop order", () => {
    const order = dropOrder(cold(B_BUDGETS)) // no hitRate data yet ⇒ cold-start
    expect(order).toEqual(SPEC_COLD_DROP_FIRST) // poke, advisory, pack, own, projectMem, orientation
    expect(order).toEqual(specDropOrder(cold(B_BUDGETS))) // independent oracle
    for (const p of PINS) expect(order).not.toContain(p) // the two pins are never reached
    // teeth: `own` must NOT be dropped before `poke` (documented highest-priority-first order)
    expect(order.indexOf("poke")).toBeLessThan(order.indexOf("own"))
  })

  it("SCN-RETR-6e-1 — once the ledger has data, kinds reorder by observed hitRate", () => {
    // Orientation's observed hitRate has fallen to 0.05 (below poke's 0.10) — warm ledger.
    const warm = B_BUDGETS.map((b) =>
      b.kind === "orientation" ? bud("orientation", { cap: 250, hits: HITS, hitRate: 0.05 }) : b,
    )
    const order = dropOrder(warm)
    expect(order.indexOf("orientation")).toBeLessThan(order.indexOf("poke")) // least-used now, drops first
    expect(order.indexOf("orientation")).toBe(0) // overriding its cold-start (highest-priority) position
    expect(order).toEqual(specDropOrder(warm)) // independent oracle: ledger-driven reorder
  })

  it("SCN-RETR-6f-1 — a per-kind drop-counter is ledgered", () => {
    // `own` dropped on 3 of the last 10 turns; 7 turns dropped only `poke`.
    const history: readonly (readonly InjectionKind[])[] = [
      ["poke", "own"],
      ["poke", "own"],
      ["poke", "own"],
      ["poke"],
      ["poke"],
      ["poke"],
      ["poke"],
      ["poke"],
      ["poke"],
      ["poke"],
    ]
    const stats = dropCounter(history)
    const own = stats.find((s) => s.kind === "own")!
    expect(own.dropped).toBe(3)
    expect(own.turns).toBe(10)
    expect(own.rate).toBeCloseTo(0.3, 10) // 3/10 = 30%
    expect(own.flagged).toBe(true) // > 20% ⇒ mis-capped / mis-prioritized
    expect(MISCAP_THRESHOLD).toBe(0.2)
    const poke = stats.find((s) => s.kind === "poke")!
    expect(poke.dropped).toBe(10)
    expect(poke.flagged).toBe(true)
  })
})

// ── REQ-RETR-3 — stale ⇒ re-ground (fail-closed staleness) ───────────────────────────────────────────────

describe("REQ-RETR-3 — stale ⇒ re-ground", () => {
  it("SCN-RETR-3a-1 — a stale:true pack is not trusted as-is", () => {
    const stalePack = pack({ stale: true })
    expect(isTrusted(stalePack)).toBe(false) // refused — the stale flag is honored on the read path
    expect(isTrusted(pack({ stale: false }))).toBe(true) // a fresh pack is trusted
  })

  it("SCN-RETR-3b-1 — a stale:true pack is re-grounded before use", () => {
    const stalePack = pack({ stale: true, tokenEstimate: 1760 })
    const reground = vi.fn((p: Pack): Pack => ({ ...p, stale: false, axisHash: asHash("axis-billing-fresh") }))
    const served = servePack(stalePack, reground)
    expect(reground).toHaveBeenCalledTimes(1) // routed through re-grounding BEFORE use
    expect(served).not.toBeNull()
    expect(served!.stale).toBe(false) // only the re-grounded (fresh) pack is served
    // a fresh pack is served AS-IS (no needless re-ground)
    const fresh = pack({ stale: false })
    const reground2 = vi.fn((p: Pack): Pack => p)
    expect(servePack(fresh, reground2)).toBe(fresh)
    expect(reground2).not.toHaveBeenCalled()
    // fail-closed: if re-ground STILL drifts, the pack is NOT served (never a stale pack trusted)
    const stillStale = vi.fn((p: Pack): Pack => ({ ...p, stale: true }))
    expect(servePack(stalePack, stillStale)).toBeNull()
  })

  it('SCN-RETR-3c-1 — stale equals exactly "a backing drifted", never a guess', () => {
    expect(isStale([{ drifted: false }, { drifted: true }])).toBe(true) // g1 clean OR g2 drifted = true
    expect(isStale([{ drifted: false }, { drifted: false }])).toBe(false) // all clean ⇒ fresh
    expect(isStale([{ drifted: true }, { drifted: true }])).toBe(true)
    expect(isStale([])).toBe(false) // no backing drifted ⇒ not stale (exact OR, identity element false)
    // exact OR over any drift-bit vector (never an age/TTL heuristic)
    for (const bits of [[false], [true], [false, false, true], [true, false, false]]) {
      expect(isStale(bits.map((d) => ({ drifted: d })))).toBe(bits.some((d) => d))
    }
  })
})
