// @atlas/knowledge — test/wp-5.15-know.tier-ratify.heldout.test.ts  (WP-5.15.KNOW · EPIC-15)
//
// HELD-OUT (-2) leg for tier-routed ratification (KNOW-6/7/8/18). Authored by the COLD reviewer from
// goldens-knw.md §Held-out — different concrete data, same behaviour/branch:
//   6a-2 (40-territory monorepo → 0 invariants), 6b-2 (5-level-deep nesting all T2/advisory),
//   7a-2 (payments/ flag not promoted), 7b-2 ({secrets/,kms/} only flag), 8a-2 (blast-radius miner
//   stages a PREDICATE candidate only), 8b-2 (queue/ advisory commits only with lead token),
//   8c-2 (payments/ T0 requires billy), 18a-2 (second grounded low-risk T2 advisory auto-accepts),
//   18b-2 (payments/ T0 + conflicting-node contested + chk-tail predicate all full-ratify).

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef, Tier } from "@atlas/contracts"
import type { Grounding } from "@atlas/grounding"
import type { Candidate, TerritoryView, Check } from "@atlas/knowledge"

import { init } from "../src/ratify/init.js"
import type { StructuralTree } from "../src/ratify/init.js"
import { classify } from "../src/ratify/tier.js"
import { stage, ratify } from "../src/ratify/ratify.js"
import { route } from "../src/ratify/fastpath.js"

const anchor = (qualifiedPath: string, subtreeHash: string): StructRef => ({
  kind: "symbol",
  qualifiedPath,
  subtreeHash: asSubtreeHash(subtreeHash),
})
const grounded: Grounding = { entries: [{ anchor: anchor("fn g", "st-91"), path: "src/g.ts" }] }
const ungrounded: Grounding = { entries: [] }

const territory = (path: string): TerritoryView => ({
  path,
  owner: "seat-y",
  tier: "T2",
  files: [`${path}mod.ts`],
  blastRadius: [],
})

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  claimText: "the ring buffer wraps at capacity",
  claimNorm: "ring buffer wraps at capacity",
  slot: "invariant",
  grounding: grounded,
  provenance: { source: "agent:miner", trusted: true },
  tier: "T2",
  ...over,
})

const chkTail: Check = { kind: "index-query", query: "chk-tail(q)" }

// ── KNOW-6 held-out ─────────────────────────────────────────────────────────────
describe("WP-5.15.KNOW held-out — init empty-genesis (KNOW-6 -2)", () => {
  it("SCN-KNOW-6a-2: a 40-territory monorepo init still carries zero invariants", () => {
    const tree: StructuralTree = {
      territories: Array.from({ length: 40 }, (_, i) => ({
        path: `pkg-${i}/`,
        owner: `team-${i % 5}`,
        files: [`pkg-${i}/index.ts`],
      })),
    }
    const views = init(tree)
    expect(views.length).toBe(40)
    const invariantCount = views.reduce(
      (n, v) => n + ((Reflect.get(v, "invariants") as unknown[] | undefined)?.length ?? 0),
      0,
    )
    expect(invariantCount).toBe(0)
    for (const v of views) expect(Reflect.get(v, "invariants")).toBeUndefined()
  })

  it("SCN-KNOW-6b-2: deeply-nested (5-level) territories all default T2/advisory", () => {
    const tree: StructuralTree = {
      territories: [
        { path: "a/", owner: "o", files: ["a/f.ts"] },
        { path: "a/b/", owner: "o", files: ["a/b/f.ts"] },
        { path: "a/b/c/", owner: "o", files: ["a/b/c/f.ts"] },
        { path: "a/b/c/d/", owner: "o", files: ["a/b/c/d/f.ts"] },
        { path: "a/b/c/d/e/", owner: "o", files: ["a/b/c/d/e/f.ts"] },
      ],
    }
    const views = init(tree)
    expect(views.length).toBe(5)
    expect(views.every((v) => v.tier === "T2")).toBe(true)
    const skeletonKeys = new Set(["path", "owner", "tier", "files", "blastRadius", "regions"])
    for (const v of views) {
      for (const k of Object.keys(v)) expect(skeletonKeys.has(k)).toBe(true)
      const fam = Reflect.get(v, "family")
      expect(fam === undefined || fam === "advisory").toBe(true)
    }
  })
})

// ── KNOW-7 held-out ─────────────────────────────────────────────────────────────
describe("WP-5.15.KNOW held-out — tier classifier (KNOW-7 -2)", () => {
  it("SCN-KNOW-7a-2: a payments/ T0-keyword match is not auto-promoted", () => {
    const r = classify(territory("payments/"))
    expect(r.t0Candidate).toBe(true)
    expect(r.tier).toBe("T2")
  })

  it("SCN-KNOW-7b-2: heuristics over a {secrets/, kms/} corpus only flag", () => {
    for (const p of ["secrets/", "kms/"]) {
      const c = classify(territory(p))
      expect(c.t0Candidate).toBe(true)
      expect(c.tier).toBe("T2")
    }
  })
})

// ── KNOW-8 held-out ─────────────────────────────────────────────────────────────
describe("WP-5.15.KNOW held-out — staging / ratifier gate (KNOW-8 -2)", () => {
  it("SCN-KNOW-8a-2: the blast-radius miner writes only a staged predicate candidate", () => {
    const pred = candidate({ check: chkTail })
    const staged = stage(pred)
    expect(staged.node).toBe(pred)
    expect(staged.node.check).toBe(chkTail) // a PREDICATE candidate, still only staged
    expect("committed" in (staged as object)).toBe(false)
  })

  it("SCN-KNOW-8b-2: a staged queue/ advisory candidate commits only with the lead ratifier token", () => {
    const adv = candidate({ slot: "rationale" }) // advisory (no check)
    expect(ratify(stage(adv), { by: "lead" }).committed).toBe(true)
    expect(ratify(stage(adv), { by: "" }).committed).toBe(false)
  })

  it("SCN-KNOW-8c-2: a payments/ T0 candidate requires billy", () => {
    const t0 = stage(candidate({ tier: "T0" as Tier }))
    expect(ratify(t0, { by: "lead" }).committed).toBe(false)
    expect(ratify(t0, { by: "billy" }).committed).toBe(true)
  })
})

// ── KNOW-18 held-out ────────────────────────────────────────────────────────────
describe("WP-5.15.KNOW held-out — confidence fast-path (KNOW-18 -2)", () => {
  it("SCN-KNOW-18a-2: a second grounded low-risk T2 advisory candidate auto-accepts", () => {
    const adv = candidate({ slot: "rationale", tier: "T2" })
    expect(route(adv, { contested: false, lowRisk: true })).toBe("auto-accept")
  })

  it("SCN-KNOW-18b-2: a payments/ T0, a conflicting-node contested, and a chk-tail predicate all full-ratify", () => {
    expect(route(candidate({ tier: "T0" as Tier }), { contested: false, lowRisk: true })).toBe("full-ratify")
    expect(route(candidate({ slot: "rationale" }), { contested: true, lowRisk: true })).toBe("full-ratify")
    expect(route(candidate({ check: chkTail }), { contested: false, lowRisk: true })).toBe("full-ratify")
    // conjuncts each gate independently (held-out data)
    expect(route(candidate({ grounding: ungrounded }), { contested: false, lowRisk: true })).toBe("full-ratify")
    expect(route(candidate({ slot: "rationale" }), { contested: false, lowRisk: false })).toBe("full-ratify")
  })
})
