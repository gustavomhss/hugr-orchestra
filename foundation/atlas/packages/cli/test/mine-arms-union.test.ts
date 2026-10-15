// @atlas/cli — test/mine-arms-union.test.ts  (SOUND-DEFAULT-MINE AC-B2 [CORE PROOF] + AC-B4 [seal honesty])
//
// THE CORE PROOF. A DEFAULT run (unset env) admits, in ONE `driveMineArms` invocation over the fixture
// frontier, advisory PROSE (no seal) AND a dependency fact (seal:'proven') AND a count fact (seal:'proven')
// into the union — so genesis ships SOUND-by-default, not advisory-only behind an env var.
//
// TESTABILITY SUBTLETY (pre-decided): an injected `deps.proposer` BYPASSES per-arm proposer resolution, so we
// inject ONE proposer that returns mixed-kind seeds (advisory + dependency + count at three sites) and inject
// the REAL admit gate (`makeAdmitGate`) whose sound oracles (`verifyDependency`/`verifyCount`) PROVE the
// dep/count seeds. This exercises the new loop + admission + union; per-arm proposer resolution is #196a-tested.

import { describe, it, expect, afterEach } from "vitest"
import { driveMineArms, makeAdmitGate } from "../src/mine.js"
import { asSubtreeHash } from "@atlas/kernel"
import type { Check } from "@atlas/knowledge"
import type { IndexNode } from "@atlas/index"
import type { AdmitDeps, Candidate, EmitGate, Fact, SeedProposal, SiteProposer } from "@atlas/genesis"
import type { Status } from "@atlas/contracts"
import { A, B, C, injectedHistory, skeletonSource, stagingFake, NO_MODEL_ENV } from "./mine-fixtures.js"

// The gate that ADMITS all three families: advisory via the truth door, dependency + count via their sound
// oracles (both pinned to 'proven' here — the fixture index PROVING them is what admit-harness.*-leg tests own).
const indexNode: IndexNode = {
  axis: "dependency",
  level: "symbol",
  key: "k",
  subtreeHash: asSubtreeHash("k"),
  children: [],
  objects: [],
}
const admitAllDeps = (): AdmitDeps => {
  const held: Check = { kind: "index-query", query: "exists|k" }
  return {
    predicate: { synthesize: () => held, verify: (): Status => "HOLDS", teeth: () => true },
    doors: { grounded: () => true, nonObvious: () => true },
    typeOracle: { expressible: () => false, diagnose: (): Status => "HOLDS" },
    refine: () => null,
    indexState: indexNode,
    K: 1,
    verifyDependency: () => "proven",
    verifyCount: () => "proven",
  }
}

// ONE proposer, three families keyed by site — advisory@A, dependency@B, count@C, abstain elsewhere.
const mixedProposer = (): SiteProposer => ({
  propose: (c: Candidate): SeedProposal | null => {
    const p = c.site.qualifiedPath
    if (p === A.qualifiedPath) return { cand: c, claim: "A coordinates the pipeline" } // advisory prose (no kind)
    if (p === B.qualifiedPath)
      return {
        kind: "predicate",
        cand: c,
        claim: "B depends on x",
        slot: "dependency",
        target: "pkg/x.ts::x",
        scope: "pkg",
      }
    if (p === C.qualifiedPath)
      return {
        kind: "predicate",
        cand: c,
        claim: "B has ≥2 callers",
        slot: "count",
        target: "pkg/x.ts::x",
        scope: "pkg",
        atLeast: 2,
      }
    return null // D abstains
  },
})

const slotOf = (f: Fact): string | undefined => (f as unknown as { predicateSlot?: string }).predicateSlot
const sealOf = (f: Fact): string | undefined => (f as unknown as { seal?: string }).seal

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

describe("AC-B2/B4 — a DEFAULT run unions advisory prose + sound dep/count in ONE invocation", () => {
  it("admits ≥1 advisory (no seal) AND ≥1 dependency (seal:proven) AND ≥1 count (seal:proven)", () => {
    const store = stagingFake()
    const gate: EmitGate = makeAdmitGate(admitAllDeps()) // no reground — raw-seed grounding branch (one identity space)
    const arms = driveMineArms("fix-repo", {
      env: NO_MODEL_ENV, //           unset ATLAS_MINE_SLOT ⇒ the [advisory, dependency, count] union
      proposer: mixedProposer(), //   injected ⇒ bypasses per-arm resolution, emits all three families
      gate,
      history: injectedHistory,
      skeleton: skeletonSource,
      store: store.store,
    })

    // three arms drove (unset env), each over the same injected proposer — union the seeded facts by id.
    expect(arms.map((a) => a.slot)).toEqual(["advisory", "dependency", "count"])
    const byId = new Map<string, Fact>()
    for (const a of arms) for (const f of a.pass.report.seeded) byId.set(f.id as unknown as string, f)
    const facts = [...byId.values()]

    const advisory = facts.filter((f) => slotOf(f) === undefined)
    const dependency = facts.filter((f) => slotOf(f) === "dependency")
    const count = facts.filter((f) => slotOf(f) === "count")

    expect(advisory.length).toBeGreaterThanOrEqual(1)
    expect(dependency.length).toBeGreaterThanOrEqual(1)
    expect(count.length).toBeGreaterThanOrEqual(1)

    // AC-B4 — seal honesty: the sound arms carry seal:'proven'; advisory prose carries NO seal field.
    for (const f of dependency) expect(sealOf(f)).toBe("proven")
    for (const f of count) expect(sealOf(f)).toBe("proven")
    for (const f of advisory) expect(sealOf(f)).toBeUndefined()
  })
})
