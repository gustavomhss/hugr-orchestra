// WP-5.17.KNOW · HELD-OUT gate — the `-2` goldens (goldens-knw.md: SCN-KNOW-13a-2 / SCN-KNOW-13b-2,
// held_out:true) authored by the COLD REVIEWER against the existing src, unseen by the builder.
//   13a-2: a scheduled full-tree re-scan (none of the 3 moments) ⇒ 0 facts.
//   13b-2: a sealing wave that TOUCHED code yet neither absorbed nor gave a grounded why-not ⇒ violation.
// Same injected-interior discipline as the visible test (Mint / SealLeg are fixtures, not owned here).

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Candidate, GroundedFact, ProductionMoment } from "@atlas/knowledge"
import { bindProduce, type Mint, type SealLeg } from "../src/lifecycle/produce.js"

const cand = (n: string): Candidate => ({
  claimText: `claim ${n}`,
  claimNorm: `cn-${n}`,
  slot: "invariant",
  grounding: {
    entries: [
      { anchor: { kind: "symbol", qualifiedPath: `fn ${n}`, subtreeHash: asSubtreeHash(`st-${n}`) }, path: "src/x.ts" },
    ],
  },
  provenance: { source: "agent", trusted: true },
  tier: "T2",
})

const mint: Mint = (c: Candidate): GroundedFact => ({
  kind: "advisory",
  id: asNodeKey(`nk-${c.claimNorm}`),
  tier: c.tier,
  claimNorm: c.claimNorm,
  grounding: c.grounding,
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
})

const absorbed: SealLeg = (s: unknown): boolean => Boolean((s as { absorb?: unknown } | null | undefined)?.absorb)
const hasWhyNot: SealLeg = (s: unknown): boolean => {
  const w = (s as { whyNot?: unknown } | null | undefined)?.whyNot
  return typeof w === "string" && w.length > 0
}

const producer = bindProduce(mint, absorbed, hasWhyNot)

// A scheduled full-tree re-scan — NOT one of the three moments. Erased at runtime → the gate must reject.
const FULL_TREE_RESCAN = "scheduled-full-tree-rescan" as unknown as ProductionMoment

describe("WP-5.17.KNOW — HELD-OUT -2 goldens (KNOW-13)", () => {
  it("SCN-KNOW-13a-2 — a scheduled full-tree re-scan produces 0 facts", () => {
    const out = producer.produce(FULL_TREE_RESCAN, [cand("a"), cand("b"), cand("c")])
    expect(out.length).toBe(0)
  })

  it("SCN-KNOW-13b-2 — a wave that touched code but neither absorbed nor gave a why-not records a violation", () => {
    // the wave modified territories (touched code) yet carries no absorb + no grounded why-not
    const codeTouchingBareWave = { touched: ["src/a.ts", "src/b.ts"], absorb: undefined, whyNot: "" }
    expect(producer.sealProbe(codeTouchingBareWave).violation).toBe(true)
  })
})
