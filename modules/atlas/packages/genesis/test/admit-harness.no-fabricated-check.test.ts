// WP-FIX-6.KNOW · RED/GREEN — the harness stops FABRICATING a check for the sound-oracle arm (#200).
//
// THE DEFECT. `admitPredicate`'s GEN-12k branch built its node from
//     soundCheck(slot) = { kind: 'assertion', expr: `type-checker/LSP diagnostics: ${slot}` }
// — a string that was never passed to `PredicateApi.verify`, never subjected to `PredicateApi.teeth`, and
// that the steady-state evaluator cannot read (its assertion grammar is `child-count|…` / `subtree-hash|…`
// over one `IndexNode`; this string names no operator, so `evaluate` answers `NA` on every index state).
// The node shipped `status: 'HOLDS'` on it, plus the `machine-checked likely invariant` label.
//
// THE FIX, and why it is a DOWNGRADE and not a better string. The sound verdict comes from the type
// checker, which is not index state; KNOW-16's `Check` can express NOTHING but index state; and
// `PredicateNode.check` is REQUIRED, not optional. So there is no truthful `Check` to put on a predicate
// here, and inventing a parseable-but-unrelated one (`exists|<the site>`) would be the same lie in a
// costume that also passes the door. The honest node is the family that carries no check and no `status`:
// an ADVISORY, keeping the slot on `predicateSlot`. ABSENT means UNKNOWN, never a placeholder.
//
// The last case crosses the two packages on purpose: whatever this harness emits must be readable by the
// door that later re-runs it.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Status, StructRef } from "@atlas/contracts"
import type { Check, PredicateSlot } from "@atlas/knowledge"
import { admit as admitCheck } from "@atlas/knowledge"
import type { IndexNode } from "@atlas/index"
import type { Candidate, PredicateApi } from "@atlas/genesis"
import { admit, LIKELY_INVARIANT } from "../src/admit-harness.js"
import type { AdmitDeps, PredicateProposal, TwoDoorBar, TypeOracle } from "../src/admit-harness.js"

// ---- fixtures (mirrors wp-8.28-b-gen.test.ts) --------------------------------------------------------

const anchor: StructRef = { kind: "block", qualifiedPath: "src/pay.ts#charge", subtreeHash: asSubtreeHash("st-a10") }
const site = (): Candidate => ({
  site: anchor,
  signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] },
  ppr: 0.42,
  rank: 1,
})
const grounding = { entries: [{ anchor, path: "src/pay.ts" }] } as PredicateProposal["grounding"]
const indexState: IndexNode = {
  axis: "spatial",
  level: "block",
  key: "src/pay.ts#charge",
  subtreeHash: asSubtreeHash("idx-a10"),
  children: [],
  objects: [],
}

const predProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "contract",
  nodeKey: asNodeKey("nk:charge-nonneg"),
  claimNorm: "charge() never returns a negative amount",
  grounding,
  tier: "T1",
  ...over,
})

/** A REAL index-query the shipped evaluator can read — what a synthesizing seam is supposed to produce. */
const REAL_QUERY: Check = { kind: "index-query", query: "exists|src/pay.ts#charge" }

function predicateSeam(over: Partial<{ synth: Check | null; verdict: Status; flips: boolean }> = {}) {
  const saw = { verified: [] as Check[], teethed: [] as Check[] }
  const seam: PredicateApi = {
    synthesize: () => ("synth" in over ? (over.synth as Check | null) : REAL_QUERY),
    verify(check) {
      saw.verified.push(check)
      return over.verdict ?? "HOLDS"
    },
    teeth(check) {
      saw.teethed.push(check)
      return over.flips ?? true
    },
  }
  return { seam, saw }
}

const openDoors: TwoDoorBar = { grounded: () => true, nonObvious: () => true }
const soundOracle: TypeOracle = { expressible: (s: PredicateSlot) => s === "contract", diagnose: () => "HOLDS" }
const closedOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }

const makeDeps = (over: Partial<AdmitDeps> = {}): AdmitDeps => ({
  predicate: predicateSeam().seam,
  doors: openDoors,
  typeOracle: closedOracle,
  refine: () => null,
  indexState,
  K: 1,
  ...over,
})

/** The exact expression `soundCheck` used to mint. Named so a resurrection is caught by string, not vibe. */
const FABRICATED = "type-checker/LSP diagnostics: contract"

describe("WP-FIX-6.KNOW — no node ships HOLDS on a check that was never evaluated", () => {
  it("the SOUND-ORACLE arm emits a node with NO check and NO status — the fabrication is gone", () => {
    const { seam, saw } = predicateSeam()
    const a = admit(predProposal(), makeDeps({ predicate: seam, typeOracle: soundOracle }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")

    // teeth (breaks-on "the sound arm mints `{kind:'assertion', expr:`type-checker/LSP diagnostics: …`}`
    // and stamps the node HOLDS"): the emitted node carries neither field, at all.
    expect(Object.keys(a.fact).sort()).toEqual([
      "authoring",
      "claimNorm",
      "claims",
      "freshness",
      "grounding",
      "id",
      "kind",
      "obviousness",
      "predicateSlot",
      "seal", // ADR-0017 — the sound-oracle arm IS proven, so it carries the `proven` seal (still NO check, NO status)
      "tier",
    ])
    expect(a.fact.kind).toBe("advisory")
    expect((a.fact as { seal?: string }).seal).toBe("proven")
    expect("check" in a.fact).toBe(false)
    expect("status" in a.fact).toBe(false)
    expect(JSON.stringify(a.fact)).not.toContain("type-checker/LSP diagnostics")
    expect(JSON.stringify(a.fact)).not.toContain("HOLDS")

    // the sound oracle really did decide (GEN-12k is intact — the synthesized seam is never consulted)...
    expect(saw.verified).toEqual([])
    expect(saw.teethed).toEqual([])
    // ...and the slot survives, so read-side grouping (KNOW-4g) is unchanged.
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("contract")
    // the label describes the ORACLE, which really was a machine, and still never claims a proof.
    expect(a.label).toBe(LIKELY_INVARIANT)
    expect(a.label).not.toBe("proof")
  })

  it("the SOUND-ORACLE arm still REFUSES a slot the compiler reports as not-HOLDS", () => {
    const broken: TypeOracle = { expressible: () => true, diagnose: () => "BROKEN" }
    const a = admit(predProposal(), makeDeps({ typeOracle: broken }))
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("sound type-checker")
  })

  it("the SYNTHESIZED arm still ships HOLDS — and its check went through verify AND teeth first", () => {
    const { seam, saw } = predicateSeam()
    const a = admit(predProposal({ slot: "invariant" }), makeDeps({ predicate: seam }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted" || a.fact.kind !== "predicate") throw new Error("unreachable")
    expect(a.fact.status).toBe("HOLDS")
    // the check ON THE NODE is the very object both mechanisms were run against — not a sibling, not a
    // re-synthesis. Identity, not equality: a `HOLDS` earned by one check and carried by another is the
    // same defect wearing a parseable string.
    expect(saw.verified).toEqual([a.fact.check])
    expect(saw.teethed).toEqual([a.fact.check])
    expect(saw.verified[0]).toBe(a.fact.check)
    expect(saw.teethed[0]).toBe(a.fact.check)
  })

  it("COMPOSITION: every check this harness can emit is ADMITTED by the knowledge door that re-runs it", () => {
    const { seam } = predicateSeam()
    const emitted: Check[] = []
    for (const slot of ["invariant", "contract"] as const) {
      const a = admit(predProposal({ slot }), makeDeps({ predicate: seam, typeOracle: soundOracle }))
      if (a.outcome === "admitted" && a.fact.kind === "predicate") emitted.push(a.fact.check)
    }
    // exactly ONE check is emitted across both arms — the synthesized one; the sound arm emits none.
    expect(emitted).toEqual([REAL_QUERY])
    for (const check of emitted) expect(admitCheck(check).evaluable, JSON.stringify(check)).toBe(true)

    // and the string the sound arm USED to emit is refused by that same door, with a legible reason —
    // which is what makes the two halves of this fix one fix.
    const refused = admitCheck({ kind: "assertion", expr: FABRICATED })
    expect(refused.evaluable).toBe(false)
    if (refused.evaluable || refused.reason !== "malformed-check") throw new Error("unreachable")
    expect(refused.expected).toContain("child-count|<key>|<non-negative integer>")
    expect(refused.expected).toContain(FABRICATED)
  })
})
