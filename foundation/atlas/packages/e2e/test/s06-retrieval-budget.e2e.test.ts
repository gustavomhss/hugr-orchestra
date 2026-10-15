// @atlas/e2e — S6 · Retrieval stays inside its budget; pins never drop; a stale pack is never trusted
// AXIS: EFFICIENCY (bounded context — a pack/turn is capped, never unbounded) + SECURITY (stale-not-trusted,
// fail-closed on the read path).
//
// STORY. A worker's context is a scarce, budgeted resource. Retrieval must keep every injection inside its
// pinned ceilings AND stay honest about what it left out — WITHOUT ever silently dropping content, ever
// dropping a pin, or ever serving a stale pack as trusted. This story drives the REAL wired @atlas/retrieval
// runtime across the package seam and proves four invariants the whole harness rests on:
//   • the pinned ~2K pack cap is observable: an overflowing territory yields `tokenEstimate ≤ PACK_CAP`
//     with a truncation MARKER + a `pull-reachable` tail (0 silent drops); a fitting one is un-truncated,
//   • the pack emits by RANK (T0-first, then hits-desc/ppr-desc/key-asc), never by arrival order,
//   • the two pins ('awareness' / 'protocols.safetyCritical') are NEVER in a drop sequence and NEVER dropped
//     under ceiling pressure — even when every droppable kind is over-sized,
//   • a `stale` pack is not trusted, is re-grounded BEFORE use, and fails CLOSED (never served) if it stays
//     stale — while a fresh pack passes through unchanged.
//
// INJECTED PORT (legitimate seam, not a blocker): `PackIndex` — the index seam feeding candidates + each
// candidate's pinned `cl100k_base` `tokenEstimate`. The facet consumes it (it never tokenizes / never hashes);
// we wire a hand-built index fixture, so the cap/rank teeth run against the REAL `createPacker` fill logic.
//
// PARAMETRIC (DEFINE-parametric, NOT asserted to a value — recon flags): the hitRate-tie secondary key κ
// (drop.ts FLAG "hitRate-tie secondary key κ is an OPEN DEFINE dependency"), the ledger cap-tuning `gain`
// (ledger.ts FLAG "cap-tuning gain is underspecified"), and the off-atlas θ threshold. This story asserts the
// STRUCTURAL invariants those mechanisms guard (pins-excluded, sum ≤ ceiling), never a κ/gain/θ-dependent value.

import { describe, it, expect } from "vitest"
import { asHash, asNodeKey } from "@atlas/kernel"
import {
  createPacker,
  dropOrder,
  resolveCeiling,
  isStale,
  isTrusted,
  servePack,
  isPin,
  ledgerFrom,
  PACK_CAP,
  CEILING,
} from "@atlas/retrieval"
import type { PackAxis, PackCandidate, PackIndex, Injection } from "@atlas/retrieval"
import type { HitRecord } from "@atlas/retrieval"
import type { Budget, Hash, InjectionKind, NodeKey, Pack, Territory, Tier } from "@atlas/contracts"

// ── fixture builders (mirrored from the proven WP-6.19 / WP-6.22 / WP-6.18 fixtures) ─────────────────────
const nk = (s: string): NodeKey => asNodeKey(s)

function cand(id: string, o: { tier?: Tier; ppr?: number; hits?: number; tok?: number } = {}): PackCandidate {
  return {
    nodeKey: nk(id),
    tier: o.tier ?? "T1",
    ppr: o.ppr ?? 0.5,
    hits: o.hits ?? 0,
    claim: id,
    tokenEstimate: o.tok ?? 300,
    stale: false,
  }
}
const terr = (name: string): Territory => ({ name, owner: "team", tier: "T1", globs: [] })
/** The injected `PackIndex` port — a hand-built index feeding candidates + pinned tokenEstimates. */
function indexOf(axes: Record<string, PackAxis>): PackIndex {
  return { axis: (t: Territory) => axes[t.name] ?? null }
}
const axisOf = (territory: string, candidates: readonly PackCandidate[]): PackAxis => ({
  territory,
  axisHash: asHash(`axis-${territory}`),
  candidates,
  stale: false,
})
const idsOf = (xs: readonly { readonly nodeId: NodeKey }[]): string[] => xs.map((x) => String(x.nodeId))

// One served-injection sequence (RETR-8 ledger records) — feeds `ledgerFrom(...).budget()`.
const hitRecs = (kind: InjectionKind, served: number, hit: number): HitRecord[] =>
  Array.from({ length: served }, (_v, i) => ({ kind, hit: i < hit }))
// One turn's actual injection (pinned cl100k_base tokenEstimate + observed hitRate/hits).
const inj = (kind: InjectionKind, tok: number, hitRate = 0): Injection => ({
  kind,
  tokenEstimate: tok,
  hitRate,
  hits: 5,
})

const PIN_KINDS: readonly InjectionKind[] = ["awareness", "protocols.safetyCritical"]
const buildPack = (o: { stale: boolean; territory?: string; tokenEstimate?: number }): Pack => ({
  territory: o.territory ?? "crate:billing",
  axisHash: asHash("axis-billing") as Hash,
  invariants: [],
  advisory: [],
  advisoryDropped: 0,
  tokenEstimate: o.tokenEstimate ?? 1760,
  stale: o.stale,
})

describe("S6 · retrieval budget — bounded context, pins never drop, stale never trusted", () => {
  // ── 1 · TOKEN CAP OBSERVABLE (efficiency) ──────────────────────────────────────────────────────────────
  it("caps a pack at PACK_CAP and surfaces the excluded keys in `tail` — never a silent drop", () => {
    // an overflowing territory: 7×300 = 2100 > PACK_CAP; distinct hits so the fill order is deterministic.
    const overflow = [70, 60, 50, 40, 30, 20, 10].map((h) => cand(`inv:o-${h}`, { hits: h, tok: 300 }))
    const packer = createPacker(indexOf({ "crate:big": axisOf("crate:big", overflow) }))
    const p = packer.pack(terr("crate:big"))

    expect(p.tokenEstimate).toBeLessThanOrEqual(PACK_CAP) // ≤ 2000 — the CAP WINS (1800 emitted, +300 would blow it)
    expect(p.truncated).toBe(true) // the truncation MARKER (completeness yielded to the cap)
    expect(p.tail.length).toBeGreaterThan(0) // the excluded keys are pull-reachable, NOT vanished
    expect(p.tail.map(String)).toEqual(["inv:o-10"]) // the least-used candidate is the honest tail
    // 0 silent drops: every candidate is either emitted OR named in the tail.
    const accountedFor = new Set<string>([...idsOf(p.invariants), ...p.tail.map(String)])
    for (const c of overflow) expect(accountedFor.has(String(c.nodeKey))).toBe(true)

    // a small territory that fits under the cap → un-truncated, empty tail.
    const small = [cand("inv:s-1", { tok: 300 }), cand("inv:s-2", { tok: 300 })]
    const fitPacker = createPacker(indexOf({ "crate:small": axisOf("crate:small", small) }))
    const fit = fitPacker.pack(terr("crate:small"))
    // teeth (breaks-on "the pack exceeds its 2K budget, or drops content without surfacing it in `tail`"):
    expect(fit.truncated).toBe(false)
    expect(fit.tail).toEqual([])
    expect(fit.tokenEstimate).toBe(600)
  })

  // ── 2 · RANK ORDER (efficiency — the scarce budget goes to the ranked prefix) ───────────────────────────
  it("emits T0-first then T1 by the pack rank (hits-desc, ppr-desc, key-asc), never arrival order", () => {
    // arrival order is deliberately scrambled vs. the expected rank order.
    const t0x = cand("inv:t0-x", { tier: "T0", ppr: 0.8, tok: 200 })
    const t0y = cand("inv:t0-y", { tier: "T0", ppr: 0.75, tok: 200 })
    const a = cand("inv:a-retry", { hits: 40, ppr: 0.9, tok: 200 })
    const b = cand("inv:b-refund", { hits: 40, ppr: 0.7, tok: 200 })
    const c = cand("inv:c-audit", { hits: 10, ppr: 0.5, tok: 200 })
    const d = cand("inv:d-currency", { hits: 10, ppr: 0.5, tok: 200 }) // ties c on (10,0.5) → key-asc: c before d
    const arrival: readonly PackCandidate[] = [d, a, t0y, c, t0x, b] // scrambled; sum 1200 < PACK_CAP ⇒ all fit
    const packer = createPacker(indexOf({ "crate:rank": axisOf("crate:rank", arrival) }))
    const p = packer.pack(terr("crate:rank"))

    // independent expectation, re-derived through the pack's OWN comparator: T0 by rank, then T1 by rank.
    const t0 = [t0x, t0y].slice().sort(packer.compare)
    const t1 = [a, b, c, d].slice().sort(packer.compare)
    const expected = [...t0, ...t1].map((x) => String(x.nodeKey))
    // teeth (breaks-on "the pack emits by arrival order, ignoring rank"):
    expect(idsOf(p.invariants)).toEqual(expected)
    expect(idsOf(p.invariants)).toEqual([
      "inv:t0-x",
      "inv:t0-y",
      "inv:a-retry",
      "inv:b-refund",
      "inv:c-audit",
      "inv:d-currency",
    ])
  })

  // ── 3 · PINS NEVER DROP (security — the constitution + safety-critical protocols are exempt) ────────────
  it("never places a pin in a drop sequence, and never drops a pin under ceiling pressure", () => {
    // a real ledger-driven drop order (via `ledgerFrom(...).budget()`) that INCLUDES the pinned kinds.
    const records: HitRecord[] = [
      ...hitRecs("awareness", 5, 5), // PIN, fully used
      ...hitRecs("protocols.safetyCritical", 5, 5), // PIN, fully used
      ...hitRecs("own", 10, 5),
      ...hitRecs("poke", 10, 1),
      ...hitRecs("pack", 10, 7),
      ...hitRecs("orientation", 10, 8),
    ]
    const budget: readonly Budget[] = ledgerFrom(records).budget()
    const order = dropOrder(budget)
    for (const pin of PIN_KINDS) expect(order).not.toContain(pin) // neither pin is ever a drop candidate
    expect(order.every((k) => !isPin(k))).toBe(true) // the whole sequence is droppable-only (isPin gate)

    // ceiling pressure: Fixture-B-style turn (sum 5800 > CEILING) — droppables shed until sum ≤ CEILING.
    const turn: readonly Injection[] = [
      inj("awareness", 400, 1.0),
      inj("protocols.safetyCritical", 500, 1.0),
      inj("orientation", 250, 0.8),
      inj("projectMem", 500, 0.6),
      inj("own", 1500, 0.5),
      inj("pack", 2000, 0.7),
      inj("protocols.advisory", 500, 0.3),
      inj("poke", 150, 0.1),
    ]
    const r = resolveCeiling(turn)
    for (const pin of PIN_KINDS) {
      expect(r.dropped).not.toContain(pin) // never dropped…
      expect(r.survivors.map((i) => i.kind)).toContain(pin) // …always retained
    }
    expect(r.sum).toBeLessThanOrEqual(CEILING) // the ceiling holds (structural — κ/gain not asserted)

    // heavy overflow: every droppable kind is over-sized ⇒ all droppables shed; the pins still stand
    // (the ceiling yields to the pins — the "unless only pins remain" clause).
    const heavy: readonly Injection[] = turn.map((i) => (isPin(i.kind) ? i : { ...i, tokenEstimate: 9000 }))
    const rh = resolveCeiling(heavy)
    // teeth (breaks-on "a pin ('awareness' / 'protocols.safetyCritical') is dropped under ceiling pressure"):
    expect(rh.dropped.every((k) => !isPin(k))).toBe(true)
    expect(rh.survivors.map((i) => i.kind).sort()).toEqual([...PIN_KINDS].sort())
    expect(rh.sum).toBe(900) // only the two pins remain (400 + 500), the ceiling honored the exemption
  })

  // ── 4 · STALE-NOT-TRUSTED (security — fail-closed on the read path) ─────────────────────────────────────
  it("never trusts a stale pack: re-grounds before use and fails closed if it stays stale", () => {
    expect(isTrusted({ stale: true })).toBe(false) // a stale pack is never trusted as-is (RETR-3a)
    expect(isTrusted({ stale: false })).toBe(true) // a fresh pack is trusted

    // the stale flag is the exact OR over the backings' drift-bit — never an age/TTL guess (RETR-3c).
    const stalePack = buildPack({ stale: isStale([{ drifted: false }, { drifted: true }]) })
    expect(stalePack.stale).toBe(true)

    // re-grounding still drifts ⇒ the pack is NOT served (fail-closed, null), and re-ground ran BEFORE use.
    let regrounded = 0
    const stillStale = (pk: Pack): Pack => {
      regrounded += 1
      return { ...pk, stale: true }
    }
    // teeth (breaks-on "a stale pack is served as trusted context"):
    expect(servePack(stalePack, stillStale)).toBeNull()
    expect(regrounded).toBe(1) // routed through re-grounding before any serve decision

    // a re-ground that clears the drift ⇒ the fresh pack is served.
    const served = servePack(stalePack, (pk) => ({ ...pk, stale: false, axisHash: asHash("axis-fresh") }))
    expect(served).not.toBeNull()
    expect(served?.stale).toBe(false)

    // a fresh pack passes through unchanged — no needless re-ground.
    const fresh = buildPack({ stale: false })
    let touched = 0
    const passthrough = (pk: Pack): Pack => {
      touched += 1
      return pk
    }
    expect(servePack(fresh, passthrough)).toBe(fresh)
    expect(touched).toBe(0)
  })
})
