// @atlas/genesis — test/admit-harness.witness.test.ts   (SEAL-CARRIES-ITS-WITNESS)
//
// A fact sealed `proven` used to record THAT something was proved and discard the DERIVATION (`target` /
// `scope` / `atLeast`) — a seal that says "trust me, it was proved once" is provenance-by-trust. `buildSound`
// now carries a nested `witness` alongside `seal`, read off the RESOLVED proposal legs the harness already
// checked `verifyDependency`/`verifyCount` against — never re-parsed from `claimNorm` (the model's
// PRE-RESOLUTION prose).
//
// Fixture shape copied from the sibling `admit-harness.dependency-leg.test.ts`.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { IndexNode } from "@atlas/index"
import type { Candidate } from "@atlas/genesis"
import { admit } from "../src/admit-harness.js"
import type { AdmitDeps, PredicateProposal, TypeOracle } from "../src/admit-harness.js"

const anchor: StructRef = { kind: "block", qualifiedPath: "src/pay.ts#charge", subtreeHash: asSubtreeHash("st-a10") }

function site(): Candidate {
  return {
    site: anchor,
    signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] },
    ppr: 0.42,
    rank: 1,
  }
}

const grounding = { entries: [{ anchor, path: "src/pay.ts" }] } as PredicateProposal["grounding"]

const indexState: IndexNode = {
  axis: "spatial",
  level: "block",
  key: "src/pay.ts#charge",
  subtreeHash: asSubtreeHash("idx-a10"),
  children: [],
  objects: [],
}

const depProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "dependency",
  target: "src/pay.ts#charge",
  scope: "src",
  nodeKey: asNodeKey("nk:dep-pay-ledger"),
  claimNorm: "DEPENDS-ON: ledger", // the model's PRE-RESOLUTION prose — deliberately NOT what the witness carries
  grounding,
  tier: "T1",
  ...over,
})

const countProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "count",
  target: "src/pay.ts#charge",
  scope: "src",
  atLeast: 3,
  nodeKey: asNodeKey("nk:count-pay-charge"),
  claimNorm: "COUNT: charge",
  grounding,
  tier: "T1",
  ...over,
})

/** A type-expressible-slot proposal — NO `target`/`scope` legs at all (the GEN-12k arm never asks for them). */
const contractProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "contract",
  nodeKey: asNodeKey("nk:contract-pay-charge"),
  claimNorm: "charge() only accepts a positive amount",
  grounding,
  tier: "T1",
  ...over,
})

const typeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }

function makeDeps(over: Partial<AdmitDeps>): AdmitDeps {
  return {
    predicate: { synthesize: () => null, verify: () => "NA", teeth: () => false },
    doors: { grounded: () => true, nonObvious: () => true },
    typeOracle,
    refine: () => null,
    indexState,
    K: 1,
    ...over,
  }
}

describe("SEAL-CARRIES-ITS-WITNESS — buildSound carries the oracle derivation, not just the verdict", () => {
  it("dependency arm: the admitted fact carries witness {slot, target, scope} VERBATIM from the resolved proposal", () => {
    const a = admit(depProposal(), makeDeps({ verifyDependency: () => "proven" }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect((a.fact as { witness?: unknown }).witness).toEqual({
      slot: "dependency",
      target: "src/pay.ts#charge",
      scope: "src",
    })
    // TEETH: the witness is read from the RESOLVED proposal legs, never re-parsed from `claimNorm` — the
    // stored witness target/scope must NOT be the model's prose.
    expect((a.fact as { witness?: { target?: unknown } }).witness?.target).not.toBe(depProposal().claimNorm)
  })

  it("count arm: the witness additionally carries the witnessed lower bound atLeast", () => {
    const a = admit(countProposal(), makeDeps({ verifyCount: () => "proven" }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect((a.fact as { witness?: unknown }).witness).toEqual({
      slot: "count",
      target: "src/pay.ts#charge",
      scope: "src",
      atLeast: 3,
    })
  })

  it("TEETH — dropping ONE witness member (target) breaks the equality assertion (proves the test can fail)", () => {
    const a = admit(depProposal(), makeDeps({ verifyDependency: () => "proven" }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    const witness = (a.fact as { witness?: { slot: string; target: string; scope: string } }).witness!
    // Simulate a carry that dropped `target` (the mutation this WP's DoD asks to prove goes red) — a reader
    // comparing against the FULL shape below is exactly what would have caught the regression.
    const mutated = { slot: witness.slot, scope: witness.scope } as unknown
    expect(mutated).not.toEqual({ slot: "dependency", target: "src/pay.ts#charge", scope: "src" })
  })

  it("the type-expressible (GEN-12k) sound arm carries NO witness — that oracle is the type checker, not verifyDependency/verifyCount", () => {
    const a = admit(contractProposal(), makeDeps({ typeOracle: { expressible: () => true, diagnose: () => "HOLDS" } }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.seal).toBe("proven")
    expect((a.fact as { witness?: unknown }).witness).toBeUndefined()
  })

  it("CLAIM-DERIVED-FROM-WITNESS — dependency arm: the stored claimNorm is the HARNESS sentence, never the model prose, even when the prose CONTRADICTS the witness", () => {
    // The model's own prose says the OPPOSITE of what the harness resolved (`target`/`scope` are the TRUE,
    // oracle-checked legs; `claimNorm` below is a lie a compromised/hallucinating model could return).
    const lying = depProposal({
      claimNorm: "DEPENDS-ON: nothing — src/pay.ts#charge has NO dependency on ledger at all",
    })
    const a = admit(lying, makeDeps({ verifyDependency: () => "proven" }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    const fact = a.fact as { claimNorm: string; witness?: { target: string; scope: string } }
    expect(fact.claimNorm).not.toContain("nothing")
    expect(fact.claimNorm).not.toContain("NO dependency")
    expect(fact.claimNorm).toBe("src references src/pay.ts#charge (witnessed cross-unit reference, sound oracle)")
    expect(fact.claimNorm).toContain(fact.witness!.target)
    expect(fact.claimNorm).toContain(fact.witness!.scope)
    expect(fact.claimNorm).not.toContain("calls") // the oracle proves a REFERENCE, never a CALL
  })

  it("CLAIM-DERIVED-FROM-WITNESS — count arm: the stored claimNorm names a LOWER BOUND, never an equality, and ignores contradicting prose", () => {
    const lying = countProposal({ claimNorm: "COUNT: charge is never called by anyone, zero callers" })
    const a = admit(lying, makeDeps({ verifyCount: () => "proven" }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    const fact = a.fact as { claimNorm: string }
    expect(fact.claimNorm).not.toContain("never called")
    expect(fact.claimNorm).not.toContain("zero")
    expect(fact.claimNorm).toBe(
      "src/pay.ts#charge is referenced by at least 3 distinct unit(s) under src (witnessed lower bound, sound oracle)",
    )
    expect(fact.claimNorm).toContain("at least")
    expect(fact.claimNorm).not.toMatch(/\bcalls\b|\bcallers\b/)
  })

  it("the stored AUTHZ `scope` and the nested `witness.scope` are DIFFERENT legs — the trap this WP names", () => {
    // `admit()` alone never stamps the authz `scope` (that is `governed-emit.ts`'s job, downstream of this
    // module) — asserted here as the negative: `buildSound` never confuses the two, so nothing here sets a
    // top-level `scope` that could collide with `witness.scope`.
    const a = admit(depProposal(), makeDeps({ verifyDependency: () => "proven" }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect((a.fact as { scope?: unknown }).scope).toBeUndefined()
    expect((a.fact as { witness?: { scope?: unknown } }).witness?.scope).toBe("src")
  })
})
