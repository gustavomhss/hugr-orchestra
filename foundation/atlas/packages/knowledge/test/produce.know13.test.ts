// WP-5.17.KNOW · RED/GREEN — the moment-gated producer + fed-or-why-not seal probe (KNOW-13) against the
// FROZEN `ProduceApi` oracle. Transcribes the visible `-1` goldens SCN-KNOW-13a-1 / SCN-KNOW-13b-1
// (docs/requirements/goldens-knw.md). Held-out `-2` fixtures (scheduled full-tree re-scan; code-touching
// bare wave) are NOT referenced here.
//
// SEAM (no raw hashing; build-ahead injection): two interiors are NOT frozen and are INJECTED as fixtures,
// the same discipline `bindFreshness`/`bindReconcile` use —
//   • the Candidate→GroundedFact ratification transform (`Mint`) is OWNER-DEFINE (oracle-pin), owned by the
//     write-decision/ratification route (WP-5.13-a / WP-5.15); this WP owns ONLY the moment GATE over it.
//   • the sealing wave is a SIG-TBD upward Orchestra artifact (`seal: unknown`, ProduceApi.sealProbe);
//     its two legs are read by injected `SealLeg`s. This WP OWNS the fed-or-why-not DEFINITION: violation
//     is the negation of the (absorb ∨ why-not) DISJUNCTION.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Candidate, GroundedFact, ProductionMoment } from "@atlas/knowledge"
import { bindProduce, type Mint, type SealLeg } from "../src/lifecycle/produce.js"

// ── fixtures ────────────────────────────────────────────────────────────────

/** A minimal staged candidate (the LLM proposes only the claim body + slot + grounding; KNOW-14 receipt). */
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

/** The injected downstream ratification transform (OWNER-DEFINE — WP-5.13-a/WP-5.15). Mints an advisory
 *  node from an admitted candidate; the transform BODY is NOT owned here, only injected. */
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

/** Injected readers of the (SIG-TBD, unfrozen) sealing wave. The test SHAPES a probe seal; the facet never
 *  does — it consumes these leg verdicts. `absorb` = the wave fed the Atlas; `whyNot` = a grounded why-not. */
const absorbed: SealLeg = (s: unknown): boolean => Boolean((s as { absorb?: unknown } | null | undefined)?.absorb)
const hasWhyNot: SealLeg = (s: unknown): boolean => {
  const w = (s as { whyNot?: unknown } | null | undefined)?.whyNot
  return typeof w === "string" && w.length > 0
}

const producer = bindProduce(mint, absorbed, hasWhyNot)

const MOMENTS: readonly ProductionMoment[] = ["init-skeleton", "enrich-by-blast-radius", "wave-close-write"]
// A production event NOT tagged one of the three moments (a repo-wide sweep). Erased at runtime → the
// closed-set gate must reject it. Cast is the only way to express an off-union tag past the frozen type.
const SWEEP = "repo-wide-sweep" as unknown as ProductionMoment

describe("WP-5.17.KNOW — production fires ONLY at the three moments; a sealing wave is fed-or-why-not (KNOW-13)", () => {
  it("SCN-KNOW-13a-1 — a repo-wide sweep (none of the 3 moments) produces 0 facts", () => {
    const out = producer.produce(SWEEP, [cand("a"), cand("b"), cand("c")])
    expect(out.length).toBe(0) // admitted only at the three moments
  })

  it("teeth-13a — each of the three moments ADMITS (a non-empty event mints a fact per candidate)", () => {
    for (const m of MOMENTS) {
      const out = producer.produce(m, [cand("a"), cand("b")])
      expect(out.length).toBe(2) // kills the always-empty mutant AND the sweep-admitting mutant
      // narrowed on `kind`: `claimNorm` lives on AdvisoryNode only, and `GroundedFact` is the
      // AdvisoryNode|PredicateNode union. Runtime-identical — a PredicateNode yields `undefined` either
      // way — but it now STATES that a predicate in this position would fail the assertion.
      expect(out.map((f) => (f.kind === "advisory" ? f.claimNorm : undefined))).toEqual(["cn-a", "cn-b"])
    }
  })

  it("produce is total: a valid moment with an empty event yields 0 facts", () => {
    expect(producer.produce("wave-close-write", []).length).toBe(0)
  })

  it("teeth-13a — the gate is closed: an untagged/empty tag is a sweep, not the enrich moment", () => {
    expect(producer.produce("" as unknown as ProductionMoment, [cand("a")]).length).toBe(0)
    expect(producer.produce("enrich" as unknown as ProductionMoment, [cand("a")]).length).toBe(0)
  })

  it("SCN-KNOW-13b-1 — a bare sealing wave (no absorb, no why-not) records a violation", () => {
    expect(producer.sealProbe({}).violation).toBe(true) // absorb ∨ why-not is false
  })

  it("a wave that fed the Atlas (absorb) records NO violation", () => {
    expect(producer.sealProbe({ absorb: [mint(cand("a"))] }).violation).toBe(false)
  })

  it("a wave that emitted a grounded why-not records NO violation", () => {
    expect(producer.sealProbe({ whyNot: "no territories were touched this wave" }).violation).toBe(false)
  })

  it("teeth-13b — the probe never passes a bare wave: undefined / empty why-not both violate", () => {
    expect(producer.sealProbe(undefined).violation).toBe(true)
    expect(producer.sealProbe({ whyNot: "" }).violation).toBe(true) // empty why-not is not grounded
    expect(producer.sealProbe({ absorb: false }).violation).toBe(true)
  })
})
