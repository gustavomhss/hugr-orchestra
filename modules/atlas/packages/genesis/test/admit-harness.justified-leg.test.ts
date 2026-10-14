// @atlas/genesis — test/admit-harness.justified-leg.test.ts   (196b — the semantic-slot `justified` path)
//
// The SEMANTIC-SLOT justified leg of `admitPredicate`. A grounded predicate proposal whose slot no mechanical
// oracle decides (`gotcha`) — not dependency/count, not type-expressible, and with NO synthesized check — is
// admitted as a FIRST-CLASS `justified` fact carrying `predicateSlot` + `seal:'justified'` + its contestable
// `derivation` (NOT the degenerate bare-advisory downgrade). Grounding is the only door:
//   A2         — grounded gotcha (no witness) ⇒ admitted, slot:'gotcha' + seal:'justified' + non-empty derivation
//   A3         — ungrounded gotcha            ⇒ dropped, DROP_UNGROUNDED (grounding still the truth door)
//   A2-regress — a dependency proposal that PROVES still seals 'proven'; one that ABSTAINS still lands the
//                existing bare unsealed advisory (no regression on the oracle arms)
//
// Fixture shape mirrors `admit-harness.dependency-leg.test.ts`.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { IndexNode } from "@atlas/index"
import type { Candidate } from "@atlas/genesis"
import { admit } from "../src/admit-harness.js"
import type { AdmitDeps, PredicateProposal, TypeOracle } from "../src/admit-harness.js"

// ---- fixtures (copied from the dependency-leg admission test) -----------------------------------------

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

/** A grounded gotcha (semantic-slot) predicate proposal — no oracle legs, carries a contestable derivation. */
const gotchaProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "gotcha",
  nodeKey: asNodeKey("nk:gotcha-charge-retry"),
  claimNorm: "charge() is not idempotent — a retry double-charges",
  grounding,
  tier: "T1",
  derivation:
    "no idempotency key is read before the ledger write at src/pay.ts:41, so a retried call appends a second debit",
  ...over,
})

/** A well-formed, proven-ready dependency proposal (for the no-regression checks). */
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

// gotcha is genuinely semantic: not type-expressible, and no check synthesizes for it.
const typeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }

function makeDeps(over: Partial<AdmitDeps>): AdmitDeps {
  return {
    predicate: {
      synthesize: () => null, // no mechanical check for a semantic slot ⇒ the justified path
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

describe("196b semantic-slot justified leg — admit(deps)", () => {
  it("A2 — grounded gotcha ⇒ admitted, first-class justified (slot + seal + derivation)", () => {
    const a = admit(gotchaProposal(), makeDeps({}))

    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.kind).toBe("advisory")
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("gotcha")
    expect((a.fact as { seal?: string }).seal).toBe("justified")
    expect((a.fact as { derivation?: string }).derivation).toBeTruthy()
    expect((a.fact as { derivation?: string }).derivation).toBe(gotchaProposal().derivation)
    // a justified fact is NOT proven and carries no oracle witness / LIKELY_INVARIANT label.
    expect((a.fact as { witness?: unknown }).witness).toBeUndefined()
    expect(a.label).toBeUndefined()
  })

  it("A3 — ungrounded gotcha ⇒ dropped (DROP_UNGROUNDED) — grounding is still the door", () => {
    const a = admit(gotchaProposal(), makeDeps({ doors: { grounded: () => false, nonObvious: () => true } }))

    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("does not ground")
    expect("fact" in a).toBe(false)
  })

  it('A2-regress — a dependency proposal that PROVES still seals "proven" (oracle arm unchanged)', () => {
    const a = admit(depProposal(), makeDeps({ verifyDependency: () => "proven" }))

    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect((a.fact as { seal?: string }).seal).toBe("proven")
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("dependency")
  })

  it("A2-regress — a dependency proposal that ABSTAINS still lands the bare unsealed advisory (no regression)", () => {
    const a = admit(depProposal(), makeDeps({ verifyDependency: () => "abstain" }))

    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.kind).toBe("advisory")
    // the oracle-abstain downgrade is UNCHANGED: no seal, no derivation, no slot promotion.
    expect((a.fact as { seal?: string }).seal).toBeUndefined()
    expect((a.fact as { derivation?: string }).derivation).toBeUndefined()
    expect(a.label).toBeUndefined()
  })

  it("a gotcha with no derivation still admits justified, omitting the field (absent-tolerant)", () => {
    const noDeriv: PredicateProposal = {
      kind: "predicate",
      site: site(),
      slot: "gotcha",
      nodeKey: asNodeKey("nk:gotcha-charge-retry"),
      claimNorm: "charge() is not idempotent — a retry double-charges",
      grounding,
      tier: "T1",
    }
    const a = admit(noDeriv, makeDeps({}))

    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect((a.fact as { seal?: string }).seal).toBe("justified")
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("gotcha")
    expect((a.fact as { derivation?: string }).derivation).toBeUndefined()
  })
})
