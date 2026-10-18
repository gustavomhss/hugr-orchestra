// @atlas/adapter-io — test/llm-answer-provenance.test.ts  (#195 b/c — the proposer's three-way outcome)
//
// `createSiteProposer` must now distinguish THREE outcomes at the answer boundary, which is the whole of the
// #195 observability fix — the 2026-08-04 splice was invisible because a malformed answer looked exactly like
// a model that declined:
//   • a MALFORMED answer (the sanity gate tagged `abstainReason` = `answer-malformed:*`) ⇒ a DISTINCT
//     `{ abstain }` the driver turns into a greppable grounded WhyNot;
//   • an UNTAGGED null (empty / model-declined) ⇒ the plain GEN-12 `null`;
//   • a claim ⇒ a `SeedProposal` carrying the VALIDATED `rawAnswer` (the CAS-receipt input for W-MINE).

import { describe, it, expect } from "vitest"
import type { Candidate } from "@atlas/genesis"
import type { SubtreeHash } from "@atlas/contracts"
import { createSiteProposer } from "../src/llm.js"
import type { ModelClient, LlmBudget, CompletionResult } from "../src/llm.js"

const budget: LlmBudget = { costCap: 1, timeoutMs: 1000 }
const cand: Candidate = {
  site: { kind: "symbol", qualifiedPath: "util/greet()", subtreeHash: "greet-subtree-hash" as unknown as SubtreeHash },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 0,
  rank: 0,
}
const clientOf = (r: CompletionResult): ModelClient => ({ complete: () => r })
const buildPrompt = (c: Candidate): string => `describe ${c.site.qualifiedPath}`

describe("createSiteProposer — #195 b/c the three-way answer outcome", () => {
  it("a MALFORMED answer (tagged abstainReason) maps to a DISTINCT { abstain }, never a silent null", () => {
    const p = createSiteProposer({
      client: clientOf({ claim: null, abstainReason: "answer-malformed:multi-response" }),
      budget,
      buildPrompt,
    })
    // teeth: before #195c this was `null`, indistinguishable from a model that declined.
    expect(p.propose(cand)).toStrictEqual({ abstain: "answer-malformed:multi-response" })
  })

  it("an UNTAGGED null (empty / model-declined) stays the plain GEN-12 null", () => {
    const p = createSiteProposer({ client: clientOf({ claim: null }), budget, buildPrompt })
    expect(p.propose(cand)).toBeNull()
  })

  it("a successful claim carries the VALIDATED rawAnswer for the CAS receipt (typed field, not a widened cast)", () => {
    const out = createSiteProposer({
      client: clientOf({ claim: "greet greets", rawAnswer: "  greet greets\n" }),
      budget,
      buildPrompt,
    }).propose(cand)
    expect(out).toStrictEqual({ cand, claim: "greet greets", rawAnswer: "  greet greets\n" })
  })

  it("a claim with NO rawAnswer omits the field entirely (absent, never explicit undefined)", () => {
    const out = createSiteProposer({ client: clientOf({ claim: "greet greets" }), budget, buildPrompt }).propose(cand)
    expect(out).toStrictEqual({ cand, claim: "greet greets" })
    expect(out).not.toHaveProperty("rawAnswer")
  })
})
