// @atlas/genesis — test/wp-8.28-b-gen.heldout.test.ts  (WP-8.28-b.GEN — HELD-OUT `-2` gate)
//
// Cold-review held-out transcription of the `-2` beacon goldens (goldens-gen.md:1189-1286):
//   GEN-12a..12k-2. Independent beacon data; NOT the author's visible fixtures.
import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Status, StructRef } from "@atlas/contracts"
import type { Check, PredicateSlot } from "@atlas/knowledge"
import type { IndexNode } from "@atlas/index"
import type { Candidate, WhyNot } from "@atlas/genesis"
import type { PredicateApi } from "@atlas/genesis"
import { admit, runSite, LIKELY_INVARIANT } from "../src/admit-harness.js"
import type {
  AdmitDeps,
  AdvisoryProposal,
  PredicateProposal,
  Proposal,
  TwoDoorBar,
  TypeOracle,
} from "../src/admit-harness.js"

const anchor: StructRef = {
  kind: "block",
  qualifiedPath: "billing/invoice.ts#finalize",
  subtreeHash: asSubtreeHash("st-e50"),
}
const site = (): Candidate => ({
  site: anchor,
  signals: { hotspot: 5, szzBugCommits: 4, coChanged: [], owners: [], messages: [] },
  ppr: 0.61,
  rank: 3,
})
const grounding = { entries: [{ anchor, path: "billing/invoice.ts" }] } as PredicateProposal["grounding"]
const indexState: IndexNode = {
  axis: "spatial",
  level: "block",
  key: "billing/invoice.ts#finalize",
  subtreeHash: asSubtreeHash("idx-e50"),
  children: [],
  objects: [],
}
const predProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "invariant",
  nodeKey: asNodeKey("nk:finalize-inv"),
  claimNorm: "finalize() never double-posts",
  grounding,
  tier: "T1",
  ...over,
})
const advProposal = (over: Partial<AdvisoryProposal> = {}): AdvisoryProposal => ({
  kind: "advisory",
  site: site(),
  nodeKey: asNodeKey("nk:rtrim-note"),
  claimNorm: "rtrim() strips trailing whitespace",
  grounding,
  tier: "T1",
  ...over,
})
const QUERY: Check = { kind: "index-query", query: "ql: forall f | f.postings.unique" }
const predicateSeam = (over: Partial<{ synth: Check | null; verdict: Status; flips: boolean }> = {}) => {
  const calls = { synthesize: 0, verify: 0, teeth: 0 }
  const seam: PredicateApi = {
    synthesize(_c) {
      calls.synthesize += 1
      return "synth" in over ? (over.synth as Check | null) : QUERY
    },
    verify(_c, _i) {
      calls.verify += 1
      return over.verdict ?? "HOLDS"
    },
    teeth(_c, _a) {
      calls.teeth += 1
      return over.flips ?? true
    },
  }
  return { seam, calls }
}
const openDoors: TwoDoorBar = { grounded: () => true, nonObvious: () => true }
const closedTypeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }
const makeDeps = (over: Partial<AdmitDeps> = {}): AdmitDeps => ({
  predicate: predicateSeam().seam,
  doors: openDoors,
  typeOracle: closedTypeOracle,
  refine: () => null,
  indexState,
  K: 1,
  ...over,
})

describe("GEN-12 held-out (-2 beacon)", () => {
  it("SCN-GEN-12a-2: LLM output is a typed candidate proposal only", () => {
    const p: Proposal = predProposal()
    expect("outcome" in p).toBe(false)
    expect("confidence" in p).toBe(false)
    expect(runSite(() => p, makeDeps()).outcome).toBe("admitted")
    expect(p).toEqual(predProposal())
  })
  it("SCN-GEN-12b-2: admission decided by mechanical harness", () => {
    const p = predProposal()
    expect(admit(p, makeDeps({ predicate: predicateSeam({ flips: true }).seam })).outcome).toBe("admitted")
    expect(admit(p, makeDeps({ predicate: predicateSeam({ flips: false }).seam })).outcome).toBe("dropped")
  })
  it("SCN-GEN-12c-2: NA or BROKEN check not admitted", () => {
    expect(admit(predProposal(), makeDeps({ predicate: predicateSeam({ verdict: "NA" }).seam })).outcome).toBe(
      "dropped",
    )
    expect(admit(predProposal(), makeDeps({ predicate: predicateSeam({ verdict: "BROKEN" }).seam })).outcome).toBe(
      "dropped",
    )
  })
  it("SCN-GEN-12d-2: failing check refined ≤K then dropped", () => {
    const { seam, calls } = predicateSeam({ verdict: "BROKEN" })
    let refines = 0
    const a = admit(
      predProposal(),
      makeDeps({
        predicate: seam,
        K: 1,
        refine: () => {
          refines += 1
          return QUERY
        },
      }),
    )
    expect(refines).toBe(1)
    expect(a.outcome).toBe("dropped")
    expect(calls.teeth).toBe(0)
  })
  it("SCN-GEN-12e-2: obvious beacon advisory IS admitted, carrying a low score (ADR-0012)", () => {
    const obvious: TwoDoorBar = { grounded: () => true, nonObvious: () => false }
    const a = admit(advProposal(), makeDeps({ doors: obvious }))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.obviousness).toStrictEqual({ rank: "obvious", by: "harness-predicate" })
    // the truth door is what still rejects (independent beacon leg of SCN-GEN-12e-1).
    const ungrounded: TwoDoorBar = { grounded: () => false, nonObvious: () => true }
    expect(admit(advProposal(), makeDeps({ doors: ungrounded })).outcome).toBe("dropped")
  })
  it("SCN-GEN-12f-2: chain-of-thought scratch never persisted", () => {
    const a = admit(predProposal({ scratch: "BEACON-COT-refund-bug-2021" }), makeDeps())
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(JSON.stringify(a.fact)).not.toContain("BEACON-COT")
    expect("scratch" in a.fact).toBe(false)
  })
  it("SCN-GEN-12g-2: abstention with grounded why-not is valid", () => {
    const whyNot: WhyNot = { site: anchor, reason: "no groundable invariant at h3" }
    let calls = 0
    const a = runSite(() => {
      calls += 1
      return { kind: "abstain", whyNot }
    }, makeDeps())
    expect(a.outcome).toBe("abstained")
    expect(calls).toBe(1)
  })
  it("SCN-GEN-12h-2: model not pressured to emit on h5", () => {
    let calls = 0
    const a = runSite(() => {
      calls += 1
      return { kind: "abstain", whyNot: { site: anchor, reason: "cold tail" } }
    }, makeDeps())
    expect(calls).toBe(1)
    expect(a.outcome).toBe("abstained")
  })
  it("SCN-GEN-12i-2: admitted predicate labelled likely invariant, never proof", () => {
    const a = admit(predProposal(), makeDeps())
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.label).toBe(LIKELY_INVARIANT)
    expect(a.label).not.toBe("proof")
  })
  it("SCN-GEN-12j-2: check surviving every mutant dropped as vacuous", () => {
    expect(
      admit(predProposal(), makeDeps({ predicate: predicateSeam({ verdict: "HOLDS", flips: false }).seam })).outcome,
    ).toBe("dropped")
    expect(
      admit(predProposal(), makeDeps({ predicate: predicateSeam({ verdict: "HOLDS", flips: true }).seam })).outcome,
    ).toBe("admitted")
  })
  it("SCN-GEN-12k-2: type-expressible slot prefers sound type-checker/LSP", () => {
    const { seam, calls } = predicateSeam()
    let diagnosed = 0
    const soundOracle: TypeOracle = {
      expressible: (s: PredicateSlot) => s === "contract",
      diagnose: () => {
        diagnosed += 1
        return "HOLDS"
      },
    }
    const a = admit(predProposal({ slot: "contract" }), makeDeps({ predicate: seam, typeOracle: soundOracle }))
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(calls.synthesize).toBe(0)
    expect(diagnosed).toBe(1)
    // WP-FIX-6.KNOW (#200) — same edit as the visible twin: the sound arm emits an ADVISORY, because the
    // `assertion` these two lines used to approve was the fabricated `type-checker/LSP diagnostics: <slot>`
    // string. The held-out golden's own claim (the type-checker decides, not a synthesized query) is pinned
    // by the two assertions above and is untouched.
    expect(a.fact.kind).toBe("advisory")
    expect("check" in a.fact).toBe(false)
    expect("status" in a.fact).toBe(false)
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("contract")
  })
})
