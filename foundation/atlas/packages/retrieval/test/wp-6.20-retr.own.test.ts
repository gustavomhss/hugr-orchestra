// @atlas/retrieval — test/wp-6.20-retr.own.test.ts  (WP-6.20.RETR)
//
// RED→GREEN transcription of the 12 VISIBLE `-1` goldens for the OwnPack composer facet (RETR-12a..12l)
// + the D1 owner-decision availability-manifest facet (content-free reachable map). The composer is a
// MECHANICAL, zero-LLM, deterministic index reader: every index axis (role / invariants / terrain /
// relate / gotchas / memory / finer / manifest) is supplied AS A FIXTURE — the composer only ranks →
// caps → dedups → projects. `NodeKey`s are minted ONLY through the sealed @atlas/kernel `asNodeKey`
// constructor (no hand-rolled identity, no raw hashing). Held-out `-2` fixtures are NOT transcribed.
//
// The composed OwnPack extends the frozen `OwnPack` (ref/types.ts) with the exec-observable receipts the
// goldens assert on (`tokenEstimate` for the cap law, `grounding.source` for the level→source law,
// `manifest` for D1, `pullReachable` for the pull-reachable tail) — additive, never a re-shape of a
// frozen field.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey, PackInvariant, Pack, Tier, Hash } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { OwnUnit, RelatedFact, RelationSet } from "../src/types.js"
import {
  createOwn,
  ownToolName,
  groundingSource,
  OWN_CAP,
  type OwnSources,
  type SizedInvariant,
  type SizedGotcha,
  type ManifestCandidate,
} from "../src/own.js"

// ── fixture builders ────────────────────────────────────────────────────────────────────────────────────

const nk = (s: string): NodeKey => asNodeKey(s)

function si(id: string, o: { tier?: Tier; ppr?: number; hits?: number; cost?: number } = {}): SizedInvariant {
  return {
    inv: { nodeId: nk(id), tier: o.tier ?? "T1", claim: id, freshness: "FRESH" },
    ppr: o.ppr ?? 0.5,
    hits: o.hits ?? 0,
    cost: o.cost ?? 100,
  }
}

function gf(id: string, tier: Tier = "T1"): SizedGotcha {
  const fact: GroundedFact = {
    kind: "advisory",
    id: nk(id),
    tier,
    claimNorm: `claim:${id}`,
    grounding: { entries: [] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
  return { fact, cost: 40 }
}

function rf(id: string, o: { distance?: number; ppr?: number } = {}): RelatedFact {
  return {
    nodeId: nk(id),
    relation: "dependents",
    distance: o.distance ?? 1,
    tier: "T1",
    ppr: o.ppr ?? 0.5,
    claim: id,
    stale: false,
  }
}

function relSet(
  unit: string,
  dependents: readonly RelatedFact[],
  dependencies: readonly RelatedFact[] = [],
): RelationSet {
  return {
    unit,
    enclosing: [],
    dependents,
    dependents_meta: {
      maxHops: 2,
      rank: "tier-desc,ppr-desc,distance-asc,nodeKey-asc",
      total: dependents.length,
      returned: dependents.length,
      truncated: false,
    },
    dependencies,
    governing: [],
  }
}

function mp(
  name: string,
  o: { kind?: "pack" | "memory" | "knowledge" | "drill"; hits?: number; cost?: number; digest?: string } = {},
): ManifestCandidate {
  return {
    pointer: {
      kind: o.kind ?? "pack",
      name,
      digest: o.digest ?? `sim:${name}`,
      pull: `pull:${name}`,
      hits: o.hits ?? 0,
    },
    cost: o.cost ?? 20,
  }
}

interface UnitData {
  role?: string
  invariants?: readonly SizedInvariant[]
  advisory?: readonly SizedInvariant[]
  terrain?: { contents: readonly NodeKey[]; owner: string; tier: Tier }
  relate?: RelationSet
  gotchas?: readonly SizedGotcha[]
  memory?: unknown
  finer?: readonly OwnUnit[]
  manifest?: readonly ManifestCandidate[]
}

function sourcesOf(db: Record<string, UnitData>): OwnSources {
  const d = (u: OwnUnit): UnitData => db[u.id] ?? {}
  return {
    role: (u) => d(u).role ?? `role:${u.id}`,
    invariants: (u) => d(u).invariants ?? [],
    advisory: (u) => d(u).advisory ?? [],
    terrain: (u) => d(u).terrain ?? { contents: [], owner: "owner", tier: "T1" },
    relate: (u) => d(u).relate ?? relSet(u.id, []),
    gotchas: (u) => d(u).gotchas ?? [],
    memory: (u) => d(u).memory ?? null,
    finer: (u) => d(u).finer ?? [],
    manifest: (u) => d(u).manifest ?? [],
  }
}

// ── scope-units (Fixture A alphabet) ────────────────────────────────────────────────────────────────────
const billing: OwnUnit = { level: "crate", id: "billing", grounding: null }
const charge: OwnUnit = { level: "module", id: "billing/charge", grounding: null }
const checkout: OwnUnit = { level: "service", id: "checkout", grounding: null }
const refunds: OwnUnit = { level: "feature", id: "refunds", grounding: null }
const disputes: OwnUnit = { level: "feature", id: "disputes", grounding: null }

const HASH = "deadbeef" as unknown as Hash
function pack(territory: string, ids: readonly string[]): Pack {
  return {
    territory,
    axisHash: HASH,
    invariants: ids.map((id): PackInvariant => ({ nodeId: nk(id), tier: "T1", claim: id, freshness: "FRESH" })),
    advisory: [],
    advisoryDropped: 0,
    tokenEstimate: 100 * ids.length,
    stale: false,
  }
}

// ── SCN-RETR-12a — every scope-unit projects an `own_<id>` tool ─────────────────────────────────────────
describe("RETR-12a — every scope-unit projects an own_<id> tool", () => {
  it("projects own_billing / own_charge / own_checkout / own_refunds, each returning a curated OwnPack", () => {
    const own = createOwn(sourcesOf({}))
    const projected = own.project([billing, charge, checkout, refunds])
    expect(projected.map((p) => p.tool)).toEqual(["own_billing", "own_charge", "own_checkout", "own_refunds"])
    for (const p of projected) {
      expect(p.pack).toHaveProperty("invariants")
      expect(p.pack).toHaveProperty("drill")
      expect(p.pack).toHaveProperty("shape")
    }
    // ownToolName is total over every scope-unit level (no unit projects no tool)
    expect(ownToolName(checkout)).toBe("own_checkout")
  })
})

// ── SCN-RETR-12b — the OwnPack is pre-composed, zero-assembly ────────────────────────────────────────────
describe("RETR-12b — the OwnPack is pre-composed, zero-assembly", () => {
  it("own_billing returns a complete pre-composed OwnPack, not a scope-picker / parts list", () => {
    const own = createOwn(sourcesOf({ billing: { invariants: [si("n1", { tier: "T0" })] } }))
    const p = own.own(billing)
    for (const field of ["unit", "invariants", "shape", "edges", "gotchas", "memory", "drill"] as const) {
      expect(p).toHaveProperty(field)
    }
    expect(Array.isArray(p.invariants)).toBe(true)
    // not a picker: no field asks the agent to choose a scope
    expect(p).not.toHaveProperty("choose")
    expect(p).not.toHaveProperty("scopes")
  })
})

// ── SCN-RETR-12c — byte-identical for equal input despite permuted relate() construction ────────────────
describe("RETR-12c — mechanically composed, byte-identical for equal input", () => {
  it("permuted relate() insertion order (same multiset) → byte-identical serialization", () => {
    const forward = [rf("e_a"), rf("e_b"), rf("e_c")]
    const reverse = [rf("e_c"), rf("e_b"), rf("e_a")]
    const a = createOwn(sourcesOf({ billing: { relate: relSet("billing", forward, forward) } })).own(billing)
    const b = createOwn(sourcesOf({ billing: { relate: relSet("billing", reverse, reverse) } })).own(billing)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

// ── SCN-RETR-12d — the OwnPack uses no LLM ──────────────────────────────────────────────────────────────
describe("RETR-12d — the OwnPack uses no LLM (pure, deterministic)", () => {
  it("composition is a pure function of index-read sources — identical across repeated calls", () => {
    const own = createOwn(
      sourcesOf({
        billing: {
          invariants: [si("n3", { hits: 40, ppr: 0.9 }), si("n4", { hits: 40, ppr: 0.7 })],
          gotchas: [gf("g1")],
        },
      }),
    )
    const r1 = JSON.stringify(own.own(billing))
    const r2 = JSON.stringify(own.own(billing))
    const r3 = JSON.stringify(own.own(billing))
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
    // the sources surface exposes only index reads — there is no model/llm channel to enter composition
    const keys = Object.keys(sourcesOf({}))
    expect(keys).not.toContain("llm")
    expect(keys).not.toContain("model")
  })
})

// ── SCN-RETR-12e — the OwnPack carries no free prose ────────────────────────────────────────────────────
describe("RETR-12e — the OwnPack carries no free prose", () => {
  it("every field is structured (PackInvariant / GroundedFact / pointer) — no prose blob inlined", () => {
    const own = createOwn(
      sourcesOf({
        billing: {
          role: "billing crate — the money spine\nSECOND LINE MUST BE DROPPED",
          invariants: [si("n1", { tier: "T0" })],
          gotchas: [gf("g1"), gf("g2")],
          manifest: [mp("own_payments")],
        },
      }),
    )
    const p = own.own(billing)
    // role is a single line, never a multi-paragraph prose blob
    expect(p.unit.includes("\n")).toBe(false)
    // gotchas are structured GroundedFact objects (kind/id), never raw prose strings
    for (const g of p.gotchas) {
      expect(typeof g).toBe("object")
      expect(g).toHaveProperty("kind")
      expect(g).toHaveProperty("id")
    }
    // invariants are structured PackInvariant records
    for (const inv of p.invariants) {
      expect(typeof inv).toBe("object")
      expect(inv).toHaveProperty("nodeId")
    }
    // manifest entries are content-free pointers (name/digest/pull), never inlined content
    for (const ptr of p.manifest.pointers) {
      expect(ptr).toHaveProperty("pull")
      expect(ptr).toHaveProperty("digest")
      expect(ptr).not.toHaveProperty("content")
    }
  })
})

// ── SCN-RETR-12f — capped at the pinned ~1.5K under the ceiling ─────────────────────────────────────────
describe("RETR-12f — the OwnPack is capped at ~1.5K under the ceiling", () => {
  it("tokenEstimate ≤ OWN_CAP; overflow is dropped to a pull-reachable tail (0 silent drops)", () => {
    const many: SizedInvariant[] = [
      si("n1", { tier: "T0", cost: 120 }),
      si("n2", { tier: "T0", cost: 140 }),
      si("n3", { hits: 40, ppr: 0.9, cost: 300 }),
      si("n4", { hits: 40, ppr: 0.7, cost: 300 }),
      si("n5", { hits: 10, ppr: 0.5, cost: 300 }),
      si("n6", { hits: 10, ppr: 0.5, cost: 300 }),
      si("n7", { hits: 2, ppr: 0.3, cost: 300 }),
      si("n8", { hits: 1, ppr: 0.2, cost: 700 }),
    ]
    const p = createOwn(sourcesOf({ billing: { invariants: many } })).own(billing)
    expect(OWN_CAP).toBe(1500)
    expect(p.tokenEstimate).toBeLessThanOrEqual(OWN_CAP)
    // the fixture's total (2460) exceeds the cap ⇒ something must overflow, and it is pull-reachable, not silently gone
    expect(p.pullReachable.length).toBeGreaterThan(0)
  })
})

// ── SCN-RETR-12g — drill-down affordances, detail pull-reachable ────────────────────────────────────────
describe("RETR-12g — the OwnPack carries drill-down affordances, detail pull-reachable", () => {
  it("drill = { finer: OwnUnit[], refresh, complement } — finer detail is pull-reachable, never inlined", () => {
    const p = createOwn(sourcesOf({ billing: { finer: [charge] } })).own(billing)
    expect(p.drill.finer).toEqual([charge])
    expect(p.drill.refresh).toHaveProperty("pull")
    expect(p.drill.complement).toHaveProperty("pull")
    // finer units are exposed as pointers (OwnUnit handles), not inlined as full packs
    for (const f of p.drill.finer) {
      expect(f).not.toHaveProperty("invariants")
    }
  })
})

// ── SCN-RETR-12h — a seat receives its `own` by default ─────────────────────────────────────────────────
describe("RETR-12h — a seat receives its own by default", () => {
  it("dispatching a seat to crate:billing yields own_billing pushed by default (no explicit request)", () => {
    const own = createOwn(sourcesOf({ billing: { invariants: [si("n1", { tier: "T0" })] } }))
    const provisioned = own.dispatch(billing)
    expect(provisioned.tool).toBe("own_billing")
    expect(provisioned.pack.invariants.length).toBeGreaterThan(0)
  })
})

// ── SCN-RETR-12i — grounding source matches the unit level ──────────────────────────────────────────────
describe("RETR-12i — grounding source matches the unit level", () => {
  it("crate/module grounded by the tree; service/feature by a declared manifest", () => {
    expect(groundingSource("crate")).toBe("tree")
    expect(groundingSource("module")).toBe("tree")
    expect(groundingSource("service")).toBe("manifest")
    expect(groundingSource("feature")).toBe("manifest")
    const own = createOwn(sourcesOf({}))
    expect(own.own(billing).grounding.source).toBe("tree")
    expect(own.own(checkout).grounding.source).toBe("manifest")
  })
})

// ── SCN-RETR-12j — an epic is not a grounded `own` unit ─────────────────────────────────────────────────
describe("RETR-12j — an epic is not a grounded own unit", () => {
  it("own_<epic> resolves without a tree path / manifest and never throws", () => {
    const own = createOwn(sourcesOf({ refunds: { invariants: [si("r1")] } }))
    const p = own.ownEpic({ id: "settlements", goal: "reconcile money out", features: [refunds] })
    expect(p.grounding.source).toBe("goal") // not 'tree' / not 'manifest' — an epic is a project-memory goal
    expect(() => own.ownEpic({ id: "empty-epic", goal: "g", features: [] })).not.toThrow()
  })
})

// ── SCN-RETR-12l — own_<epic> composes from goal + the features' OwnPacks ───────────────────────────────
describe("RETR-12l — own_<epic> composes from its goal + the features OwnPacks", () => {
  it("assembled from the project-memory goal + BOTH features OwnPacks, not from one grounded node", () => {
    const own = createOwn(
      sourcesOf({ refunds: { invariants: [si("r1"), si("r2")] }, disputes: { invariants: [si("d1")] } }),
    )
    const p = own.ownEpic({ id: "chargebacks", goal: "resolve chargebacks end to end", features: [refunds, disputes] })
    expect(p.unit).toContain("chargebacks".length ? "resolve" : "") // role sourced from the goal
    const ids = p.invariants.map((i) => String(i.nodeId))
    expect(ids).toContain("r1") // from feature:refunds OwnPack
    expect(ids).toContain("d1") // from feature:disputes OwnPack — both features contribute
  })
})

// ── SCN-RETR-12k — `own` + a co-injected pack dedup by nodeId, own wins ─────────────────────────────────
describe("RETR-12k — own + a co-injected pack dedup by nodeId, own wins", () => {
  it("a fact carried in own is removed from the co-injected pack, replaced by a pull-reachable pointer", () => {
    const own = createOwn(sourcesOf({ billing: { invariants: [si("n3", { tier: "T0" })] } }))
    const ownPack = own.own(billing)
    const coPack = pack("crate:billing", ["n3", "n9"])
    const { pack: deduped, pointers } = own.dedup(ownPack, coPack)
    const deIds = deduped.invariants.map((i) => String(i.nodeId))
    expect(deIds).not.toContain("n3") // n3 removed from the pack — own wins
    expect(deIds).toContain("n9") // the non-overlapping fact stays
    expect(pointers.map((p) => String(p.nodeId))).toContain("n3") // pack shows a pull-reachable pointer in its place
    // own is unchanged — the fact is paid for once, in own
    expect(ownPack.invariants.map((i) => String(i.nodeId))).toContain("n3")
  })
})

// ── D1 (OWNER DECISION 2026-07-18) — the availability manifest is a content-free reachable map ──────────
describe("D1 — availability manifest: pointers to reachable packs/memory/knowledge, ranked + capped, content-free", () => {
  it("lists reachable surfaces as name/digest/how-to-pull pointers, frecency-ranked, never the content", () => {
    const own = createOwn(
      sourcesOf({
        billing: {
          manifest: [
            mp("own_payments", { kind: "pack", hits: 3 }),
            mp("pr-memory:billing", { kind: "memory", hits: 9 }),
            mp("know:billing", { kind: "knowledge", hits: 1 }),
          ],
        },
      }),
    )
    const p = own.own(billing)
    // ranked by frecency (hits-desc): the memory pointer (9) leads
    expect(p.manifest.pointers[0]!.name).toBe("pr-memory:billing")
    // content-free: each pointer carries a name + a (simulated) digest + a how-to-pull, but no content field
    for (const ptr of p.manifest.pointers) {
      expect(ptr.digest.startsWith("sim:")).toBe(true) // SIMULATED digest (real content-identity is index/kernel-supplied)
      expect(ptr).not.toHaveProperty("content")
      expect(ptr).not.toHaveProperty("invariants")
    }
  })
})

// ── RETR-9 totality — a malformed unit yields an empty briefing, never a throw ──────────────────────────
describe("RETR-9 — totality of the own surface", () => {
  it("a source that throws yields an empty OwnPack, never a propagated throw", () => {
    const poison: OwnSources = {
      ...sourcesOf({}),
      invariants: () => {
        throw new Error("index read failed")
      },
    }
    const own = createOwn(poison)
    expect(() => own.own(billing)).not.toThrow()
    expect(own.own(billing).invariants).toEqual([])
  })
})
