// WP-4.12-a.KNOW · RED/GREEN — the reconcile mechanical/semantic drift split (KNOW-5) against the FROZEN
// `ReconcileApi` oracle. Transcribes the visible `-1` goldens SCN-KNOW-5a-1 / 5b-1 / 5c-1 / 5d-1
// (docs/requirements/goldens-knw.md). Held-out `-2` fixtures (the 9-drift set) are NOT referenced here.
//
// SEAM (no raw hashing): the per-fact re-derivation `reDerives(claim, newSha)` is the pure re-hash at the
// grounding `subtreeHash` — owned downstream, INJECTED here as a fixture predicate (the same build-ahead
// discipline `bindFreshness` used against GROUND's `DriftApi`). This WP owns only the SPLIT: partitioning
// the DRIFTED subset into `mechanical` (re-derives ⇒ auto-re-ground, exit 0) and `semantic` (no
// re-derive ⇒ BROKEN, blocks exit 2), with `reauthorCount == |semantic|`.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash, asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { DriftedFact, GroundedFact } from "@atlas/knowledge"
import { bindReconcile, type ReDerives } from "../src/lifecycle/reconcile.js"

// ── fixtures ────────────────────────────────────────────────────────────────

/** An advisory fact grounded at one anchor whose stored `subtreeHash` is the claim's re-derivation
 *  target. The stored `freshness`/`claims` legs are inert to the split — the arm is RECOMPUTED. */
const factAt = (id: string, storedSha: string): GroundedFact => ({
  kind: "advisory",
  id: asNodeKey(id),
  tier: "T2",
  claimNorm: `cn-${id}`,
  grounding: {
    entries: [
      {
        anchor: { kind: "symbol", qualifiedPath: `fn ${id}`, subtreeHash: asSubtreeHash(storedSha) },
        path: "src/queue.ts",
      },
    ],
  },
  freshness: "DRIFTED",
  claims: [],
  authoring: "ADVISORY",
})

const drifted = (fact: GroundedFact, newSha: string): DriftedFact => ({ fact, newSha: asHash(newSha) })

/** A fixture standing in for the downstream `reDerives` (grounding's pure re-hash at `subtreeHash`): at
 *  `newSha`, re-hash the moved unit (`table[newSha]`) and compare to the claim's STORED `subtreeHash`.
 *  Equal ⇒ mechanical (the anchor moved but the claim re-derives). An unknown `newSha` fails closed. */
const reHashAt =
  (table: Record<string, string>): ReDerives =>
  (fact: GroundedFact, newSha: Hash): boolean => {
    const stored = String(fact.grounding.entries[0]?.anchor.subtreeHash)
    const rehashed = table[String(newSha)]
    return rehashed !== undefined && rehashed === stored
  }

// The k=5 DRIFTED subset: 3 mechanical (re-derive at the new @sha) + 2 semantic (no longer re-derive).
const m1 = drifted(factAt("mA", "st-77"), "sha-M1")
const m2 = drifted(factAt("mB", "st-88"), "sha-M2")
const m3 = drifted(factAt("mC", "st-99"), "sha-M3")
const s1 = drifted(factAt("sA", "st-AA"), "sha-S1")
const s2 = drifted(factAt("sB", "st-BB"), "sha-S2")
const mechFacts = [m1.fact, m2.fact, m3.fact]
const semFacts = [s1.fact, s2.fact]

// re-hash table: the 3 mechanical shas rehash BACK to the stored hash (re-derive); the 2 semantic shas
// rehash to a DIFFERENT hash (the cited unit's body changed) → no re-derive.
const reDerives = reHashAt({
  "sha-M1": "st-77",
  "sha-M2": "st-88",
  "sha-M3": "st-99",
  "sha-S1": "st-CHANGED",
  "sha-S2": "st-CHANGED",
})
const reconcile = bindReconcile(reDerives)

describe("WP-4.12-a.KNOW — reconcile splits the DRIFTED subset mechanical vs semantic (KNOW-5)", () => {
  it("SCN-KNOW-5a-1 — the DRIFTED subset (k=5, s=2) splits into disjoint mechanical(3)/semantic(2) covering all 5", () => {
    const r = reconcile([m1, m2, m3, s1, s2])
    expect(r.mechanical.length).toBe(3)
    expect(r.semantic.length).toBe(2)
    // disjoint
    const semSet = new Set(r.semantic.map((f) => String(f.id)))
    expect(r.mechanical.some((f) => semSet.has(String(f.id)))).toBe(false)
    // cover: union == the 5 inputs
    const union = new Set([...r.mechanical, ...r.semantic].map((f) => String(f.id)))
    expect(union).toEqual(new Set(["mA", "mB", "mC", "sA", "sB"]))
    expect(union.size).toBe(5)
  })

  it("SCN-KNOW-5b-1 — mechanical drift auto-re-grounds: all 3 land mechanical, exit 0, no human, no block", () => {
    const r = reconcile([m1, m2, m3])
    expect(r.mechanical.length).toBe(3)
    expect(r.semantic.length).toBe(0)
    expect(r.exitCode).toBe(0) // no block
    expect(r.reauthorCount).toBe(0) // no human
    expect(new Set(r.mechanical)).toEqual(new Set(mechFacts))
  })

  it("SCN-KNOW-5c-1 — semantic drift flips BROKEN and blocks: the 2 non-re-deriving facts block with exit 2", () => {
    const r = reconcile([s1, s2])
    expect(r.semantic.length).toBe(2)
    expect(r.mechanical.length).toBe(0)
    expect(r.exitCode).toBe(2) // blocks the merge on the semantic flip
    expect(new Set(r.semantic)).toEqual(new Set(semFacts))
  })

  it("SCN-KNOW-5d-1 — human re-author count equals the semantic count (2), never the drift count (5)", () => {
    const r = reconcile([m1, m2, m3, s1, s2])
    expect(r.reauthorCount).toBe(2) // == |semantic|
    expect(r.reauthorCount).not.toBe(5) // never |DRIFTED|
    expect(r.reauthorCount).toBe(r.semantic.length)
  })

  it("teeth — a mechanically-drifted fact never blocks: a single re-deriving fact exits 0", () => {
    const r = reconcile([m1])
    expect(r.exitCode).toBe(0)
    expect(r.semantic.length).toBe(0)
  })

  it("empty DRIFTED subset is total: no drift ⇒ nothing to re-author, exit 0", () => {
    const r = reconcile([])
    expect(r.mechanical.length).toBe(0)
    expect(r.semantic.length).toBe(0)
    expect(r.reauthorCount).toBe(0)
    expect(r.exitCode).toBe(0)
  })
})
