// @atlas/genesis — test/admit-harness.count-leg.test.ts   (#196c count-slot leg — the sound cardinality gate)
//
// NEW count-slot leg of `admitPredicate`, the CARDINALITY dual of the dependency leg. The branch (in order):
//   DROP_COUNT_UNWIRED   — `verifyCount` is undefined
//   DROP_COUNT_MALFORMED — target/scope empty OR atLeast not a positive integer (the gate RE-CHECKS the number)
//   ABSTAIN (verifyCount !== "proven") ⇒ JUSTIFIED advisory if grounded, else DROP_UNGROUNDED
//     (genesis-epistemic-contract.md: could-not-witness ≥ atLeast is NOT proved-fewer-exist; the abstaining oracle
//      must not drop a grounded model-proposed fact — it admits the existing unsealed advisory node)
//   DROP_UNGROUNDED      — doors.grounded === false (on both the proven AND the abstain arm)
//   PROVEN + grounded    — ADMIT via `buildSound` with seal:"proven".
//
// CRITICAL TEETH: a count seed must NEVER reach the synthesized-check path (`predicate.synthesize`) — otherwise
// an unrelated check could admit a count fact `verifyCount` never proved. We spy `synthesize` and assert 0 calls.
// This teeth SURVIVES the abstain-⇒-justified inversion: the abstain fallback admits an ADVISORY (no synthesized
// check), it does NOT fall through to `predicate.synthesize`, so the count claim is never blessed by a stray check.

import { describe, it, expect } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { IndexNode } from "@atlas/index"
import type { Candidate } from "@atlas/genesis"
import { admit } from "../src/admit-harness.js"
import type { AdmitDeps, PredicateProposal, TwoDoorBar, TypeOracle } from "../src/admit-harness.js"

const anchor: StructRef = {
  kind: "block",
  qualifiedPath: "src/contracts/hash.ts#Hash",
  subtreeHash: asSubtreeHash("st-c10"),
}

function site(): Candidate {
  return {
    site: anchor,
    signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] },
    ppr: 0.42,
    rank: 1,
  }
}

const grounding = { entries: [{ anchor, path: "src/contracts/hash.ts" }] } as PredicateProposal["grounding"]

const indexState: IndexNode = {
  axis: "spatial",
  level: "block",
  key: "src/contracts/hash.ts#Hash",
  subtreeHash: asSubtreeHash("idx-c10"),
  children: [],
  objects: [],
}

/** A count predicate proposal. Defaults to a well-formed, proven-ready cardinality candidate: the resolved
 *  SYMBOL on `target`, the callers' scope, and the HARNESS-derived witnessed lower bound on `atLeast`. */
const countProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: "predicate",
  site: site(),
  slot: "count",
  target: "src/contracts/hash.ts#Hash",
  scope: "src",
  atLeast: 4,
  nodeKey: asNodeKey("nk:count-hash"),
  claimNorm: "Hash is referenced by ≥4 distinct units under src",
  grounding,
  tier: "T1",
  ...over,
})

const typeOracle: TypeOracle = { expressible: () => false, diagnose: () => "NA" }

/** deps with a SPY `predicate.synthesize` so the critical teeth (count never reaches the synthesized-check
 *  path) is observable. `verify`/`teeth`/`refine`/`K` are inert — this leg never touches them when wired. */
function makeDeps(over: Partial<AdmitDeps>, synthCalls?: { n: number }): AdmitDeps {
  return {
    predicate: {
      synthesize: () => {
        if (synthCalls) synthCalls.n += 1
        return null
      },
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

describe("#196c count-slot leg — admit(deps)", () => {
  it('proven + grounded ⇒ admitted with seal:"proven"; verifyCount gets the HARNESS number; synthesize NEVER called', () => {
    let called: { target: string; scope: string; atLeast: number } | undefined
    const synth = { n: 0 }
    const a = admit(
      countProposal(),
      makeDeps(
        {
          verifyCount: (target, scope, atLeast) => {
            called = { target, scope, atLeast }
            return "proven"
          },
        },
        synth,
      ),
    )

    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(called).toEqual({ target: "src/contracts/hash.ts#Hash", scope: "src", atLeast: 4 })
    expect(a.fact.seal).toBe("proven")
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe("count")
    // CRITICAL TEETH: the count branch short-circuits BEFORE the synthesized-check path — a count fact is NEVER
    // admitted by an unrelated synthesized check that never called verifyCount.
    expect(synth.n).toBe(0)
  })

  it('verifyCount returns "abstain" + grounded ⇒ admitted as a JUSTIFIED advisory, and synthesize is STILL never called', () => {
    const synth = { n: 0 }
    const a = admit(countProposal(), makeDeps({ verifyCount: () => "abstain" }, synth))
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    // abstain ⇒ the existing unsealed advisory node (no `proven` seal, not LIKELY_INVARIANT).
    expect(a.fact.kind).toBe("advisory")
    expect((a.fact as { seal?: string }).seal).toBeUndefined()
    expect(a.label).toBeUndefined()
    // TEETH survives the inversion: the abstain fallback admits an advisory, it NEVER falls through to synthesize.
    expect(synth.n).toBe(0)
  })

  it('verifyCount "abstain" but doors.grounded false ⇒ dropped (ungrounded); synthesize STILL never called', () => {
    const synth = { n: 0 }
    const a = admit(
      countProposal(),
      makeDeps(
        { verifyCount: () => "abstain", doors: { grounded: () => false, nonObvious: () => true } as TwoDoorBar },
        synth,
      ),
    )
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("does not ground")
    expect(synth.n).toBe(0)
  })

  it("verifyCount undefined ⇒ dropped (unwired), never a silent admit", () => {
    // The base `makeDeps` supplies NO `verifyCount`, so an empty override IS the unwired case
    // (passing `verifyCount: undefined` explicitly violates exactOptionalPropertyTypes).
    const synth = { n: 0 }
    const a = admit(countProposal(), makeDeps({}, synth))
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("GEN-12-count")
    expect(synth.n).toBe(0) // unwired drops in the count branch — it does NOT degrade to the synthesized path
  })

  it("the gate RE-CHECKS the number: atLeast 0 / negative / non-integer ⇒ dropped (malformed), oracle NOT consulted", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      let consulted = false
      const a = admit(
        countProposal({ atLeast: bad }),
        makeDeps({
          verifyCount: () => {
            consulted = true
            return "proven"
          },
        }),
      )
      expect(a.outcome).toBe("dropped")
      if (a.outcome !== "dropped") throw new Error("unreachable")
      expect(a.reason).toContain("GEN-12-count")
      // the gate must not trust a seed's number — a malformed atLeast drops BEFORE the oracle is asked.
      expect(consulted).toBe(false)
    }
  })

  it("missing atLeast (an absent count leg) ⇒ dropped (malformed)", () => {
    const { atLeast: _omit, ...noAtLeast } = countProposal()
    void _omit
    const a = admit(noAtLeast as PredicateProposal, makeDeps({ verifyCount: () => "proven" }))
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("GEN-12-count")
  })

  it("empty target OR empty scope ⇒ dropped (malformed)", () => {
    const noTarget = admit(countProposal({ target: "" }), makeDeps({ verifyCount: () => "proven" }))
    expect(noTarget.outcome).toBe("dropped")

    const noScope = admit(countProposal({ scope: "" }), makeDeps({ verifyCount: () => "proven" }))
    expect(noScope.outcome).toBe("dropped")
  })

  it("proven but doors.grounded false ⇒ dropped (ungrounded), and no fact is sealed", () => {
    const a = admit(
      countProposal(),
      makeDeps({
        verifyCount: () => "proven",
        doors: { grounded: () => false, nonObvious: () => true } as TwoDoorBar,
      }),
    )

    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toContain("does not ground")
    expect("fact" in a).toBe(false)
  })
})
