// @atlas/cli — test/wp-196a-proposer-dependency.test.ts  (#196a PROPOSER — the dependency seed reaches the oracle)
//
// The PROPOSER leg of #196a: an injected proposer emits a DEPENDENCY `PredicateSeed{ slot:'dependency', target,
// scope }`, the mine gate's `buildProposal` FORWARDS `target`/`scope` onto the `PredicateProposal`, and the sound
// oracle leg (`admitPredicate`) receives them at `verifyDependency`. Without the forward the oracle would see
// `undefined` legs and DROP every dependency (malformed) — so this pins the wire end-to-end through the REAL
// production chain (`runExtract` → `makeAdmitGate` → frozen `admit`), never a hand-built proposal.
//
//   • proven  ⇒ the seed's (target, scope) reach verifyDependency VERBATIM, and the fact carries seal:'proven'.
//   • abstain ⇒ the oracle drops it (no fabricated dependency survives a non-proving oracle).

import { describe, expect, it } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { IndexNode } from "@atlas/index"
import { runExtract } from "@atlas/genesis"
import type { AdmitDeps, Candidate, SeedProposal, SiteProposer } from "@atlas/genesis"
import type { StructRef } from "@atlas/contracts"
import { makeAdmitGate } from "../src/mine.js"

const SITE = "src/pay/charge.ts::charge"
const site: StructRef = { kind: "symbol", qualifiedPath: SITE, subtreeHash: asSubtreeHash("st-charge") }
const cand: Candidate = {
  site,
  rank: 0,
  ppr: 1,
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
}
const indexNode: IndexNode = {
  axis: "dependency",
  level: "symbol",
  key: "charge",
  subtreeHash: asSubtreeHash("charge"),
  children: [],
  objects: [],
}
const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budget = { ceiling: 10, deepening: { review: OFF, enrich: OFF, expand: OFF } }

/** An `AdmitDeps` whose dependency oracle is a spy: the predicate synthesized-check path is inert (dependency
 *  never enters it), the doors are open, and `verifyDependency` records the (target, scope) it was handed. */
const depDeps = (verifyDependency: (t: string, s: string) => "proven" | "abstain"): AdmitDeps => ({
  predicate: { synthesize: () => null, verify: () => "NA", teeth: () => false },
  doors: { grounded: () => true, nonObvious: () => true },
  typeOracle: { expressible: () => false, diagnose: () => "NA" },
  verifyDependency,
  refine: () => null,
  indexState: indexNode,
  K: 1,
})

/** A proposer emitting ONE dependency seed at the site (abstains elsewhere) — the injected S2 model. */
const depProposer = (): SiteProposer => ({
  propose: (c: Candidate): SeedProposal | null =>
    c.site.qualifiedPath === SITE
      ? {
          kind: "predicate",
          slot: "dependency",
          target: "ledgerModule",
          scope: "src/pay",
          cand: c,
          claim: "DEPENDS-ON: ledgerModule @ src/pay",
        }
      : null,
})

describe("#196a PROPOSER — a mined dependency seed forwards (target, scope) to the sound oracle", () => {
  it("proven ⇒ the oracle sees the seed legs verbatim and the fact is sealed proven", () => {
    let seen: { t: string; s: string } | undefined
    const gate = makeAdmitGate(
      depDeps((t, s) => {
        seen = { t, s }
        return "proven"
      }),
    )
    const { facts } = runExtract([cand], budget, { proposer: depProposer(), gate })

    // teeth: with the buildProposal forward removed, `target`/`scope` are undefined ⇒ admitPredicate drops
    // (malformed) ⇒ verifyDependency is NEVER called and `seen` stays undefined.
    expect(seen).toEqual({ t: "ledgerModule", s: "src/pay" })
    expect(facts).toHaveLength(1)
    expect((facts[0] as { predicateSlot?: string }).predicateSlot).toBe("dependency")
    expect((facts[0] as { seal?: string }).seal).toBe("proven") // the two-seal `proven` mark (ADR-0017)
  })

  it("abstain + grounded ⇒ admitted as a JUSTIFIED advisory (unsealed) — no fabricated PROVEN survives", () => {
    // The epistemic-contract inversion: the oracle abstaining (could-not-prove) NO LONGER drops the fact.
    // It admits as a grounded advisory carrying NO `proven` seal — the model asserts, nothing claims proof.
    const gate = makeAdmitGate(depDeps(() => "abstain"))
    const { facts } = runExtract([cand], budget, { proposer: depProposer(), gate })
    expect(facts).toHaveLength(1)
    expect((facts[0] as { kind?: string }).kind).toBe("advisory")
    expect((facts[0] as { seal?: string }).seal).toBeUndefined() // NEVER proven on abstain
    expect((facts[0] as { predicateSlot?: string }).predicateSlot).toBeUndefined()
  })

  it("abstain + ungrounded ⇒ dropped — the abstain fallback still requires grounding", () => {
    const deps = depDeps(() => "abstain")
    const gate = makeAdmitGate({ ...deps, doors: { ...deps.doors, grounded: () => false } })
    const { facts } = runExtract([cand], budget, { proposer: depProposer(), gate })
    expect(facts).toHaveLength(0)
  })
})
