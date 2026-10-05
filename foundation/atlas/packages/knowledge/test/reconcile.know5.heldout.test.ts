// WP-4.12-a.KNOW · HELD-OUT — the held-out `-2` goldens SCN-KNOW-5a-2 / 5b-2 / 5c-2 / 5d-2
// (docs/requirements/goldens-knw.md, held_out:true). The 9-drift set: 5 mechanical + 4 semantic.
// Authored by COLD REVIEW against existing src (bindReconcile) — never seen by the builder.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash, asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { DriftedFact, GroundedFact } from "@atlas/knowledge"
import { bindReconcile, type ReDerives } from "../src/lifecycle/reconcile.js"

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

const reHashAt =
  (table: Record<string, string>): ReDerives =>
  (fact: GroundedFact, newSha: Hash): boolean => {
    const stored = String(fact.grounding.entries[0]?.anchor.subtreeHash)
    const rehashed = table[String(newSha)]
    return rehashed !== undefined && rehashed === stored
  }

// k=9: 5 mechanical (re-derive back to stored) + 4 semantic (rehash to a changed body).
const m1 = drifted(factAt("mA", "st-01"), "sha-M1")
const m2 = drifted(factAt("mB", "st-02"), "sha-M2")
const m3 = drifted(factAt("mC", "st-03"), "sha-M3")
const m4 = drifted(factAt("mD", "st-04"), "sha-M4")
const m5 = drifted(factAt("mE", "st-05"), "sha-M5")
const s1 = drifted(factAt("sA", "st-06"), "sha-S1")
const s2 = drifted(factAt("sB", "st-07"), "sha-S2")
const s3 = drifted(factAt("sC", "st-08"), "sha-S3")
const s4 = drifted(factAt("sD", "st-09"), "sha-S4")

const mechFacts = [m1.fact, m2.fact, m3.fact, m4.fact, m5.fact]
const semFacts = [s1.fact, s2.fact, s3.fact, s4.fact]
const all9 = [m1, s1, m2, s2, m3, s3, m4, s4, m5] // interleaved to defeat order assumptions

const reDerives = reHashAt({
  "sha-M1": "st-01",
  "sha-M2": "st-02",
  "sha-M3": "st-03",
  "sha-M4": "st-04",
  "sha-M5": "st-05",
  "sha-S1": "st-X",
  "sha-S2": "st-X",
  "sha-S3": "st-X",
  "sha-S4": "st-X",
})
const reconcile = bindReconcile(reDerives)

describe("WP-4.12-a.KNOW — HELD-OUT 9-drift set (KNOW-5 `-2` goldens)", () => {
  it("SCN-KNOW-5a-2 — 9-drift splits disjoint mechanical(5)/semantic(4), covering all 9", () => {
    const r = reconcile(all9)
    expect(r.mechanical.length).toBe(5)
    expect(r.semantic.length).toBe(4)
    const semSet = new Set(r.semantic.map((f) => String(f.id)))
    expect(r.mechanical.some((f) => semSet.has(String(f.id)))).toBe(false) // disjoint
    const union = new Set([...r.mechanical, ...r.semantic].map((f) => String(f.id)))
    expect(union).toEqual(new Set(["mA", "mB", "mC", "mD", "mE", "sA", "sB", "sC", "sD"]))
    expect(union.size).toBe(9) // covering
  })

  it("SCN-KNOW-5b-2 — the 5 mechanical facts auto-re-ground: exit 0, no human", () => {
    const r = reconcile([m1, m2, m3, m4, m5])
    expect(r.mechanical.length).toBe(5)
    expect(r.semantic.length).toBe(0)
    expect(r.exitCode).toBe(0)
    expect(r.reauthorCount).toBe(0)
    expect(new Set(r.mechanical)).toEqual(new Set(mechFacts))
  })

  it("SCN-KNOW-5c-2 — the 4 semantic facts flip BROKEN and block with exit 2", () => {
    const r = reconcile([s1, s2, s3, s4])
    expect(r.semantic.length).toBe(4)
    expect(r.mechanical.length).toBe(0)
    expect(r.exitCode).toBe(2)
    expect(new Set(r.semantic)).toEqual(new Set(semFacts))
  })

  it("SCN-KNOW-5d-2 — reauthorCount == |semantic| (4), never |DRIFTED| (9), never N", () => {
    const r = reconcile(all9)
    expect(r.reauthorCount).toBe(4)
    expect(r.reauthorCount).not.toBe(9)
    expect(r.reauthorCount).toBe(r.semantic.length)
    expect(r.exitCode).toBe(2)
  })
})
