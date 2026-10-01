// @atlas/knowledge — test/wp-5.15-know.tier-ratify.test.ts  (WP-5.15.KNOW · EPIC-15)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for tier-routed ratification (KNOW-6/7/8/18):
//   SCN-KNOW-6a-1 (init output carries zero invariants), 6b-1 (every territory ships T2/advisory),
//   7a-1 (a T0-keyword match is NOT auto-promoted), 7b-1 (heuristics only flag, never assign tier),
//   8a-1 (the explorer writes only staged candidates), 8b-1 (ratification requires a ratifier token),
//   8c-1 (a T0 candidate requires billy), 18a-1 (grounded ∧ lowRisk ∧ T2 ∧ advisory auto-accepts),
//   18b-1 (T0 / contested / predicate all route to full ratification).
// The held-out `-2` fixtures are NOT referenced here.
//
// BIND NOTE (disciplined judgment, flagged): the frozen ref oracles pin the SIGNATURES. Two inputs the
// ratifier computes UPSTREAM are supplied as ctx here (R3 reconciliation, FastpathApi):
// `contested` (store-state) + `lowRisk` (door-2 threshold verdict; the THRESHOLD VALUE stays OPEN-DEFINE
// in hits.ts — the BOOLEAN is consumed, the threshold is NOT pinned). The candidate-intrinsic
// conjuncts (grounded/T2/advisory) are computed by `route` itself. The init `tree` is the downward-owned
// `unknown` snapshot (index/kernel below) — narrowed to a session-internal structural seed, not a frozen
// index type (cf. router.ts StoreProjection precedent). No raw hashing; the sealed @atlas/kernel
// `asSubtreeHash` constructor mints the branded drift oracle.

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

// ── fixtures ──────────────────────────────────────────────────────────────────

const anchor = (qualifiedPath: string, subtreeHash: string): StructRef => ({
  kind: "symbol",
  qualifiedPath,
  subtreeHash: asSubtreeHash(subtreeHash),
})

/** GROUND-2 real grounding: ≥1 entry, each a non-empty subtreeHash. */
const grounded: Grounding = { entries: [{ anchor: anchor("fn f", "st-77"), path: "src/f.ts" }] }
/** Ungrounded: 0 entries. */
const ungrounded: Grounding = { entries: [] }

const territory = (path: string): TerritoryView => ({
  path,
  owner: "seat-x",
  tier: "T2",
  files: [`${path}mod.ts`],
  blastRadius: [],
})

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  claimText: "the queue drains FIFO",
  claimNorm: "queue drains fifo",
  slot: "rationale",
  grounding: grounded,
  provenance: { source: "agent:explorer", trusted: true },
  tier: "T2",
  ...over,
})

const predicateCheck: Check = { kind: "assertion", expr: "len(q) >= 0" }

// ── KNOW-6 — empty-genesis init ────────────────────────────────────────────────

describe("WP-5.15.KNOW — init empty-genesis (KNOW-6 visible goldens)", () => {
  const tree: StructuralTree = {
    territories: [
      { path: "auth/", owner: "core", files: ["auth/login.ts"] },
      { path: "queue/", owner: "infra", files: ["queue/mod.ts"] },
    ],
  }

  it("SCN-KNOW-6a-1: init output carries zero invariants — nothing authored at move-in", () => {
    const views = init(tree)
    expect(views.length).toBe(2)
    // count(invariants) == 0 across the whole skeleton (by construction — no authored content)
    const invariantCount = views.reduce(
      (n, v) => n + ((Reflect.get(v, "invariants") as unknown[] | undefined)?.length ?? 0),
      0,
    )
    expect(invariantCount).toBe(0)
    // teeth: a starter invariant seeded per territory would surface an `invariants` field
    for (const v of views) expect(Reflect.get(v, "invariants")).toBeUndefined()
  })

  it("SCN-KNOW-6b-1: every territory ships the T2/advisory default by construction", () => {
    const views = init(tree)
    // ∀ territory: tier == 'T2'
    expect(views.every((v) => v.tier === "T2")).toBe(true)
    // advisory family + zero invariants by construction: the emitted skeleton leaks NO authored-content
    // key (TerritoryView has no `family`/`invariants`/predicate leg — types.ts)
    const skeletonKeys = new Set(["path", "owner", "tier", "files", "blastRadius", "regions"])
    for (const v of views) {
      for (const k of Object.keys(v)) expect(skeletonKeys.has(k)).toBe(true)
      const fam = Reflect.get(v, "family")
      expect(fam === undefined || fam === "advisory").toBe(true)
    }
  })
})

// ── KNOW-7 — no T0 auto-promotion ──────────────────────────────────────────────

describe("WP-5.15.KNOW — tier classifier (KNOW-7 visible goldens)", () => {
  it("SCN-KNOW-7a-1: a T0-keyword (auth/) match is not auto-promoted — flags, never assigns", () => {
    const r = classify(territory("auth/"))
    expect(r.t0Candidate).toBe(true)
    // teeth: the keyword match must NOT write tier='T0' — criticality is human-ratified only
    expect(r.tier).toBe("T2")
  })

  it("SCN-KNOW-7b-1: heuristics only flag — the tier field is never mutated over the corpus", () => {
    // over the whole corpus the classifier only ever emits tier='T2'; the flag routes to human ratify
    const corpus = ["auth/", "payments/", "secrets/", "kms/", "queue/", "src/util/"]
    for (const p of corpus) {
      const c = classify(territory(p))
      expect(c.tier).toBe("T2") // teeth: a mutant that writes tier=T0 on a match breaks here
    }
    // the invariant `t0Candidate ⇒ tier == 'T2'` holds; a non-keyword path is simply not flagged
    expect(classify(territory("queue/")).t0Candidate).toBe(false)
    expect(classify(territory("payments/")).t0Candidate).toBe(true)
  })
})

// ── KNOW-8 — propose ≠ ratify ───────────────────────────────────────────────────

describe("WP-5.15.KNOW — staging / ratifier gate (KNOW-8 visible goldens)", () => {
  it("SCN-KNOW-8a-1: the explorer writes only staged candidates — 0 reach the committed store", () => {
    const c = candidate()
    const staged = stage(c)
    expect(staged.node).toBe(c) // the write lands only in staging as a Candidate
    // teeth: staging never carries a commit — the explorer cannot self-commit
    expect("committed" in (staged as object)).toBe(false)
  })

  it("SCN-KNOW-8b-1: ratification requires a ratifier token", () => {
    expect(ratify(stage(candidate()), { by: "lead" }).committed).toBe(true)
    // teeth: a staged candidate committed with NO ratifier token collapses propose/ratify
    expect(ratify(stage(candidate()), { by: "" }).committed).toBe(false)
  })

  it("SCN-KNOW-8c-1: a T0 candidate requires billy", () => {
    const t0 = stage(candidate({ tier: "T0" as Tier }))
    // teeth: a T0 candidate ratifying with only the lead token bypasses the T0 gate
    expect(ratify(t0, { by: "lead" }).committed).toBe(false)
    expect(ratify(t0, { by: "billy" }).committed).toBe(true)
  })
})

// ── KNOW-18 — confidence fast-path ──────────────────────────────────────────────

describe("WP-5.15.KNOW — confidence fast-path (KNOW-18 visible goldens)", () => {
  it("SCN-KNOW-18a-1: a grounded, low-risk, T2 advisory candidate auto-accepts (no human)", () => {
    const adv = candidate({ tier: "T2" }) // advisory (no check), grounded
    expect(route(adv, { contested: false, lowRisk: true })).toBe("auto-accept")
  })

  it("SCN-KNOW-18b-1: a T0 / contested / predicate candidate routes to full ratification", () => {
    const adv = candidate({ tier: "T2" })
    // T0 — even grounded low-risk
    expect(route(candidate({ tier: "T0" as Tier }), { contested: false, lowRisk: true })).toBe("full-ratify")
    // contested (reviewer veto / conflicting node)
    expect(route(adv, { contested: true, lowRisk: true })).toBe("full-ratify")
    // predicate — teeth: the fast-path must NOT drop the `advisory` conjunct
    const pred = candidate({ tier: "T2", check: predicateCheck })
    expect(route(pred, { contested: false, lowRisk: true })).toBe("full-ratify")
    // and the remaining conjuncts each gate independently
    expect(route(candidate({ grounding: ungrounded }), { contested: false, lowRisk: true })).toBe("full-ratify")
    expect(route(adv, { contested: false, lowRisk: false })).toBe("full-ratify")
  })
})
