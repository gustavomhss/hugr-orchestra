// @atlas/genesis — test/extract-answer-malformed.test.ts  (#195c — the malformed abstention is OBSERVABLE)
//
// The whole point of #195: the 2026-08-04 splice was INVISIBLE because a corrupt answer abstained the same
// way a model that declined did. The driver must now turn a `{ abstain }` proposal into a DISTINCT, greppable
// grounded `WhyNot('answer-malformed:*')` — separable from the plain GEN-12 model-abstain — and it must NEVER
// reach the gate with a malformed answer (no fact can be fabricated from a spliced one).

import { describe, it, expect } from "vitest"
import { runExtract } from "../src/extract.js"
import type { EmitGate, SiteProposer } from "../src/extract.js"
import type { Candidate, GenesisBudget } from "../src/types.js"
import type { SubtreeHash } from "@atlas/contracts"

const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budget: GenesisBudget = { ceiling: 10, deepening: { review: OFF, enrich: OFF, expand: OFF } }
const cand: Candidate = {
  site: { kind: "symbol", qualifiedPath: "util/greet()", subtreeHash: "greet-hash" as unknown as SubtreeHash },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 1,
  rank: 0,
}

/** A gate that would ADMIT anything — so a malformed answer reaching it would show up as a fact. It must not. */
const throwIfGated: EmitGate = {
  emit: () => {
    throw new Error("the gate must NEVER be reached for a malformed-answer abstention")
  },
}

describe("runExtract — #195c a malformed answer drives a DISTINCT, greppable abstention", () => {
  it("a { abstain } proposal yields a grounded WhyNot carrying the answer-malformed:* reason VERBATIM", () => {
    const proposer: SiteProposer = { propose: () => ({ abstain: "answer-malformed:not-utf8" }) }
    const res = runExtract([cand], budget, { proposer, gate: throwIfGated })

    expect(res.facts).toHaveLength(0) // no fact fabricated from a corrupt answer
    expect(res.abstained).toHaveLength(1)
    expect(res.abstained[0]!.reason).toBe("answer-malformed:not-utf8")
    expect(res.abstained[0]!.reason).toMatch(/^answer-malformed:/) // GREPPABLE — the observability property
    expect(res.abstained[0]!.site).toBe(cand.site) // grounded to the anchored site
  })

  it("is DISTINCT from a plain GEN-12 model-abstain — the two reasons never collide", () => {
    const malformed = runExtract([cand], budget, {
      proposer: { propose: () => ({ abstain: "answer-malformed:multi-response" }) },
      gate: throwIfGated,
    })
    const declined = runExtract([cand], budget, { proposer: { propose: () => null }, gate: throwIfGated })

    expect(malformed.abstained[0]!.reason).toMatch(/^answer-malformed:/)
    expect(declined.abstained[0]!.reason).toBe("model abstained: no grounded fact at site")
    expect(declined.abstained[0]!.reason).not.toMatch(/answer-malformed/)
    // the two outcomes are separable — which they were NOT before #195c.
    expect(malformed.abstained[0]!.reason).not.toBe(declined.abstained[0]!.reason)
  })
})
