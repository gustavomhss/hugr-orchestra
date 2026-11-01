// @atlas/genesis — test/admit-quarantine.test.ts  (genesis-hardening A8, owner decision D1 — quarantine)
//
// A dependency/count/definition fact admitted ONLY because its sound oracle abstained (ADR-0017 abstain ⇒
// justified) carries `quarantine: 'abstained-proof'`; the same proposal PROVEN carries no mark. Admission
// itself is unchanged. `atlas promote` refusing the mark is pinned in adapter-io (governed-promote-quarantine).

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { IndexNode } from "@atlas/index"
import type { Candidate } from "@atlas/genesis"
import { admit } from "../src/admit-harness.js"
import type { AdmitDeps, PredicateProposal, TypeOracle } from "../src/admit-harness.js"

const anchor: StructRef = { kind: "block", qualifiedPath: "src/pay.ts#charge", subtreeHash: asSubtreeHash("st-a10") }
const site: Candidate = {
  site: anchor,
  signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] },
  ppr: 0.42,
  rank: 1,
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
const typeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }

const proposal = (slot: "dependency" | "count" | "definition"): PredicateProposal => ({
  kind: "predicate",
  site,
  slot,
  target: "src/pay.ts#charge",
  scope: "src",
  ...(slot === "count" ? { atLeast: 2 } : {}),
  nodeKey: asNodeKey(`nk:${slot}`),
  claimNorm: `charge() ${slot} claim`,
  grounding,
  tier: "T1",
})

/** Every oracle answers `verdict`; the rest of `AdmitDeps` is inert. */
const deps = (verdict: "proven" | "abstain"): AdmitDeps => ({
  predicate: { synthesize: () => null, verify: () => "NA", teeth: () => false },
  doors: { grounded: () => true, nonObvious: () => true },
  typeOracle,
  refine: () => null,
  indexState,
  K: 1,
  verifyDependency: () => verdict,
  verifyCount: () => verdict,
  verifyDefinition: () => verdict,
})

const quarantineOf = (a: ReturnType<typeof admit>): unknown =>
  a.outcome === "admitted" ? (a.fact as { quarantine?: unknown }).quarantine : "not admitted"

describe("genesis-hardening A8 — an abstained proof is admitted QUARANTINED", () => {
  it.each(["dependency", "count", "definition"] as const)("%s: abstain ⇒ admitted with the mark", (slot) => {
    const a = admit(proposal(slot), deps("abstain"))
    expect(a.outcome).toBe("admitted")
    expect(quarantineOf(a)).toBe("abstained-proof")
    if (a.outcome === "admitted") expect(a.fact.kind).toBe("advisory") // admission unchanged: the same advisory
  })

  it.each(["dependency", "count", "definition"] as const)("%s: proven ⇒ no mark", (slot) => {
    const a = admit(proposal(slot), deps("proven"))
    expect(a.outcome).toBe("admitted")
    expect(quarantineOf(a)).toBeUndefined()
    if (a.outcome === "admitted") expect("quarantine" in a.fact).toBe(false) // bytes of a proven fact unchanged
  })
})
