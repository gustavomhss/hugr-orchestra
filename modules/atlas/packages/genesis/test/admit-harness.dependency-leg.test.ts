// @atlas/genesis — test/admit-harness.dependency-leg.test.ts   (ADR-0017 dependency-slot leg)
//
// NEW dependency-slot leg of `admitPredicate`. The branch (in order):
//   DROP_DEP_UNWIRED   — `verifyDependency` is undefined
//   DROP_DEP_MALFORMED — target/scope empty
//   ABSTAIN (verifyDependency !== "proven") ⇒ JUSTIFIED advisory if grounded, else DROP_UNGROUNDED
//     (genesis-epistemic-contract.md: the oracle abstaining is "could-not-prove", NOT a refutation, so it must
//      not drop a grounded model-proposed fact — it admits as the existing unsealed advisory node)
//   DROP_UNGROUNDED    — doors.grounded === false (on both the proven AND the abstain arm)
//   PROVEN + grounded  — ADMIT via `buildSound` with seal:"proven".
//
// Fixture shape mirrors the existing `wp-8.28-b-gen.test.ts` / `admit-harness.no-fabricated-check.test.ts`.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { IndexNode } from "@atlas/index"
import type { Candidate } from "@atlas/genesis"
import { admit } from "../src/admit-harness.js"
import type { AdmitDeps, PredicateProposal, TwoDoorBar, TypeOracle } from "../src/admit-harness.js"

// ---- fixtures (copied from the existing admission tests) ---------------------------------------------

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

/** A dependency predicate proposal. Defaults to a well-formed, proven-ready dependency candidate. */
const depProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "dependency",
  target: "src/pay.ts#charge",
  scope: "src",
  nodeKey: asNodeKey("nk:dep-pay-ledger"),
  claimNorm: "charge() depends on the ledger module",
  grounding,
  tier: "T1",
  ...over,
})

const typeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }

/**
 * deps with the dependency-slot seams pinned per case. `predicate`/`refine`/`K` are irrelevant to this
 * leg, but a complete `AdmitDeps` is required by the type — supply inert fixtures.
 */
function makeDeps(over: Partial<AdmitDeps>): AdmitDeps {
  return {
    predicate: {
      synthesize: () => null,
      verify: () => "NA",
      teeth: () => false,
    },
    doors: { grounded: () => true, nonObvious: () => true },
    typeOracle,
    refine: () => null,
    indexState,
    K: 1,
    ...over,
  }
}

describe("ADR-0017 dependency-slot leg — admit(deps)", () => {
  it('proven + grounded ⇒ admitted with seal:"proven" on a dependency predicate', () => {
    let called: { target: string; scope: string } | undefined
    const a = admit(
      depProposal(),
      makeDeps({
        verifyDependency: (target, scope) => {
          called = { target, scope }
          return "proven"
        },
      }),
    )

    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(called).toEqual({ target: "src/pay.ts#charge", scope: "src" })
    expect(a.fact.seal).toBe("proven")
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("dependency")
  })

  it('verifyDependency returns "abstain" + grounded ⇒ admitted as a JUSTIFIED advisory (unsealed, no seal)', () => {
    const a = admit(depProposal(), makeDeps({ verifyDependency: () => "abstain" }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    // the abstain fallback admits the EXISTING advisory node — unsealed (no `proven` seal) and NOT LIKELY_INVARIANT.
    expect(a.fact.kind).toBe("advisory")
    expect((a.fact as { seal?: string }).seal).toBeUndefined()
    expect(a.label).toBeUndefined()
    // the claim + grounding ride onto the advisory unchanged.
    expect((a.fact as { claimNorm?: string }).claimNorm).toBe("charge() depends on the ledger module")
  })

  it('verifyDependency "abstain" but doors.grounded false ⇒ dropped (ungrounded) — the truth door still gates', () => {
    const a = admit(
      depProposal(),
      makeDeps({ verifyDependency: () => "abstain", doors: { grounded: () => false, nonObvious: () => true } }),
    )
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("does not ground")
    expect("fact" in a).toBe(false)
  })

  it("empty target OR empty scope ⇒ dropped (malformed)", () => {
    const noTarget = admit(depProposal({ target: "" }), makeDeps({ verifyDependency: () => "proven" }))
    expect(noTarget.outcome).toBe("dropped")

    const noScope = admit(depProposal({ scope: "" }), makeDeps({ verifyDependency: () => "proven" }))
    expect(noScope.outcome).toBe("dropped")
  })

  it("verifyDependency undefined ⇒ dropped (unwired)", () => {
    // The base `makeDeps` supplies NO `verifyDependency`, so an empty override IS the unwired case.
    // (Passing `verifyDependency: undefined` explicitly violates exactOptionalPropertyTypes.)
    const a = admit(depProposal(), makeDeps({}))
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("GEN-12-dep")
  })

  it("proven but doors.grounded false ⇒ dropped (ungrounded), and no fact is sealed", () => {
    const a = admit(
      depProposal(),
      makeDeps({
        verifyDependency: () => "proven",
        doors: { grounded: () => false, nonObvious: () => true },
      }),
    )

    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("does not ground")
    expect("fact" in a).toBe(false)
  })
})
