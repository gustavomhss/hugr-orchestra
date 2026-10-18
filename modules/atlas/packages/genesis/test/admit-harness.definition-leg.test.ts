// @atlas/genesis — test/admit-harness.definition-leg.test.ts   (#196d definition-slot leg)
//
// NEW definition-slot leg of `admitPredicate` — the DEFINITION dual of the dependency leg, BYTE-IDENTICAL to it
// (no cardinality leg). The branch (in order):
//   DROP_DEF_UNWIRED   — `verifyDefinition` is undefined
//   DROP_DEF_MALFORMED — target/scope empty
//   ABSTAIN (verifyDefinition !== "proven") ⇒ JUSTIFIED advisory if grounded, else DROP_UNGROUNDED
//     (genesis-epistemic-contract.md: the oracle abstaining is "could-not-prove", NOT a refutation, so it must
//      not drop a grounded model-proposed fact — it admits as the existing unsealed advisory node)
//   DROP_UNGROUNDED    — doors.grounded === false (on both the proven AND the abstain arm)
//   PROVEN + grounded  — ADMIT via `buildSound` with seal:"proven" + witness.
//
// TEETH: a claim about a symbol NOT defined under the scope (the oracle abstains) must NOT become false-proven —
// it degrades to a justified/unsealed advisory. Fixture shape mirrors `admit-harness.dependency-leg.test.ts`.

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

/** A definition predicate proposal. Defaults to a well-formed, proven-ready definition candidate. */
const defProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "definition",
  target: "src/pay.ts#charge",
  scope: "src",
  nodeKey: asNodeKey("nk:def-pay-charge"),
  claimNorm: "charge() is defined in the pay module",
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

describe("#196d definition-slot leg — admit(deps)", () => {
  it('proven + grounded ⇒ admitted with seal:"proven" + a definition witness', () => {
    let called: { target: string; scope: string } | undefined
    const a = admit(
      defProposal(),
      makeDeps({
        verifyDefinition: (target, scope) => {
          called = { target, scope }
          return "proven"
        },
      }),
    )

    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(called).toEqual({ target: "src/pay.ts#charge", scope: "src" })
    expect(a.fact.seal).toBe("proven")
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("definition")
    // SEAL-CARRIES-ITS-WITNESS — the witness re-derives the (target, scope) the oracle proved, slot 'definition'.
    expect((a.fact as { witness?: unknown }).witness).toEqual({
      slot: "definition",
      target: "src/pay.ts#charge",
      scope: "src",
    })
    // the stored sentence is DERIVED from the witness — "defined under", never the dependency arm's "references".
    expect((a.fact as { claimNorm?: string }).claimNorm).toBe(
      "src/pay.ts#charge is defined under src (witnessed definition occurrence, sound oracle)",
    )
  })

  it('TEETH — verifyDefinition "abstain" (symbol not defined here) + grounded ⇒ JUSTIFIED advisory, NEVER false-proven', () => {
    const a = admit(defProposal(), makeDeps({ verifyDefinition: () => "abstain" }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.kind).toBe("advisory")
    expect((a.fact as { seal?: string }).seal).toBeUndefined()
    expect(a.label).toBeUndefined()
    expect((a.fact as { claimNorm?: string }).claimNorm).toBe("charge() is defined in the pay module")
  })

  it('verifyDefinition "abstain" but doors.grounded false ⇒ dropped (ungrounded) — the truth door still gates', () => {
    const a = admit(
      defProposal(),
      makeDeps({ verifyDefinition: () => "abstain", doors: { grounded: () => false, nonObvious: () => true } }),
    )
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("does not ground")
  })

  it("empty target OR empty scope ⇒ dropped (malformed)", () => {
    const noTarget = admit(defProposal({ target: "" }), makeDeps({ verifyDefinition: () => "proven" }))
    expect(noTarget.outcome).toBe("dropped")
    if (noTarget.outcome !== "dropped") throw new Error("unreachable")
    expect(noTarget.reason).toContain("GEN-12-def")

    const noScope = admit(defProposal({ scope: "" }), makeDeps({ verifyDefinition: () => "proven" }))
    expect(noScope.outcome).toBe("dropped")
  })

  it("verifyDefinition undefined ⇒ dropped (unwired)", () => {
    const a = admit(defProposal(), makeDeps({}))
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("GEN-12-def")
  })

  it("proven but doors.grounded false ⇒ dropped (ungrounded), no fact sealed", () => {
    const a = admit(
      defProposal(),
      makeDeps({ verifyDefinition: () => "proven", doors: { grounded: () => false, nonObvious: () => true } }),
    )
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("does not ground")
  })
})
