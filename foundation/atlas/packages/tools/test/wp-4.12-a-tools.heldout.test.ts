// @atlas/tools — test/wp-4.12-a-tools.heldout.test.ts   (WP-4.12-a.TOOLS — HELD-OUT GATE)
//
// Cold held-out `-2` goldens (SCN-TOOLS-8{a,b,c,d}-2) authored by the reviewer against the EXISTING
// src/reconcile.ts. Different drift sets, same reconcile behaviour vs the co-located `ReconcileApi`. Fixtures
// mirror the visible-test seams (GROUND DriftSource + KNOW-5 classifier), never redefining them.

import { describe, it, expect } from "vitest"
import { asHash, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { DriftedFact, ReconcileApi as Know5Classifier } from "@atlas/knowledge"
import type { AdvisoryNode } from "@atlas/knowledge"
import { createReconcile } from "../src/reconcile.js"
import type { DriftPair, DriftSource } from "../src/reconcile.js"

const MERGE = asHash("merge-base-2")

function advisory(name: string, subtree: string): AdvisoryNode {
  const anchor = {
    kind: "block" as const,
    qualifiedPath: `reference/${name}.md#${name}`,
    subtreeHash: asSubtreeHash(subtree),
  }
  return {
    kind: "advisory",
    id: asNodeKey(`nk:${name}`),
    tier: "T1",
    claimNorm: name,
    grounding: { entries: [{ anchor, path: `reference/${name}.md` }] },
    freshness: "DRIFTED",
    claims: [],
    authoring: "ADVISORY",
  }
}

function pair(name: string, oldSt: string, newSt: string): DriftPair {
  const drifted: DriftedFact = { fact: advisory(name, oldSt), newSha: asHash(`sha:${name}:new`) }
  const qp = `reference/${name}.md#${name}`
  return {
    drifted,
    anchorWas: { kind: "block", qualifiedPath: qp, subtreeHash: asSubtreeHash(oldSt) },
    anchorNow: { kind: "block", qualifiedPath: qp, subtreeHash: asSubtreeHash(newSt) },
  }
}

function driftSourceOf(pairs: readonly DriftPair[]): DriftSource {
  return { driftAt: () => pairs }
}

function classifierWith(reDerives: ReadonlySet<string>): Know5Classifier {
  return {
    reconcile(drifted: readonly DriftedFact[]) {
      const mechanical = drifted.filter((d) => reDerives.has(d.fact.id)).map((d) => d.fact)
      const semantic = drifted.filter((d) => !reDerives.has(d.fact.id)).map((d) => d.fact)
      return { mechanical, semantic, reauthorCount: semantic.length, exitCode: semantic.length > 0 ? 2 : 0 }
    },
  }
}

describe("WP-4.12-a.TOOLS — held-out -2 goldens", () => {
  // SCN-TOOLS-8a-2: D2 = {dm2 (people.md#ceo, re-derives → mechanical), ds2 (semantic)}.
  it("SCN-TOOLS-8a-2: a different drift set splits into a reviewable DriftItem set, never all-or-nothing", () => {
    const pairs = [pair("ceo", "f7e8d9", "g8h9i0"), pair("churn", "st-churn-old", "st-churn-new")]
    const out = createReconcile(driftSourceOf(pairs), classifierWith(new Set(["nk:ceo"]))).reconcile(MERGE)

    expect(out.drift.length).toBe(2)
    // input order preserved
    expect(out.drift.map((d) => d.fact)).toEqual(["nk:ceo", "nk:churn"])
    const byName = new Map(out.drift.map((d) => [d.fact, d.class]))
    expect(byName.get("nk:ceo")).toBe("mechanical")
    expect(byName.get("nk:churn")).toBe("semantic")
    // teeth: both classes present, not collapsed to one verdict
    expect(new Set(out.drift.map((d) => d.class))).toEqual(new Set(["mechanical", "semantic"]))
    const dm = out.drift.find((d) => d.fact === "nk:ceo")!
    expect(dm.anchorWas.subtreeHash).toBe(asSubtreeHash("f7e8d9"))
    expect(dm.anchorNow.subtreeHash).toBe(asSubtreeHash("g8h9i0"))
  })

  // SCN-TOOLS-8b-2: D2 with |semantic|=1 → exit 2.
  it("SCN-TOOLS-8b-2: a different semantic-carrying run also exits 2, never silent green", () => {
    const pairs = [pair("ceo", "f7e8d9", "g8h9i0"), pair("churn", "st-churn-old", "st-churn-new")]
    const out = createReconcile(driftSourceOf(pairs), classifierWith(new Set(["nk:ceo"]))).reconcile(MERGE)
    expect(out.exitCode).toBe(2)
    expect(out.semantic.length).toBe(1)
  })

  // SCN-TOOLS-8c-2: D2' = {dm2, dm3} both mechanical → exit 0.
  it("SCN-TOOLS-8c-2: a two-item mechanical-only run also exits 0", () => {
    const pairs = [pair("ceo", "f7e8d9", "g8h9i0"), pair("inv", "c1d2e3", "f4g5h6")]
    const out = createReconcile(driftSourceOf(pairs), classifierWith(new Set(["nk:ceo", "nk:inv"]))).reconcile(MERGE)
    expect(out.exitCode).toBe(0)
    expect(out.semantic.length).toBe(0)
    expect(out.mechanical).toEqual(["nk:ceo", "nk:inv"])
    expect(out.regroundedCount).toBe(0) // inert here — writer is WP-4.12-b
  })

  // SCN-TOOLS-8d-2: D3 = {dm, ds, ds3}, |semantic|=2 → reauthor 2, never whole store (3).
  it("SCN-TOOLS-8d-2: re-authors exactly two when the semantic count is two, never the whole store", () => {
    const pairs = [
      pair("ceo", "st-ceo-old", "st-ceo-new"),
      pair("arr", "st-arr-old", "st-arr-new"),
      pair("runway", "st-runway-old", "st-runway-new"),
    ]
    const out = createReconcile(driftSourceOf(pairs), classifierWith(new Set(["nk:ceo"]))).reconcile(MERGE)
    expect(out.reauthorCount).toBe(2)
    expect(new Set(out.semantic)).toEqual(new Set(["nk:arr", "nk:runway"]))
    // teeth: not the mechanical dm, not the whole 3-row store
    expect(out.reauthorCount).not.toBe(out.drift.length)
    expect(out.semantic).not.toContain("nk:ceo")
    expect(out.exitCode).toBe(2)
    expect(out.regroundedCount).toBe(0)
  })
})
