// @atlas/adapter-io — test/llm-count-parser.test.ts   (#196c count slot — the PROPOSER arm)
//
// The count mining arm turns a model's `COUNT: <name>` line into a TYPED count `PredicateSeed{ slot:'count',
// target, scope, atLeast }` the sound `verifyCount` oracle proves-or-drops, and ABSTAINS on anything else
// (never a fabricated advisory, never a model-supplied number). This suite pins:
//   • the grammar → typed seed, with the HARNESS-computed atLeast + resolved SYMBOL target (never the model's)
//   • an off-list name (resolver → null) ⇒ grounded abstention (COUNT_UNPARSEABLE_REASON) — the lucy BLOCKER
//   • a STRAY NUMBER (the model has no slot to emit one) ⇒ abstain
//   • rawAnswer provenance rides through (#195c)
//   • the DEFAULT arm (advisoryClaimParser) stays byte-identical to the shipped advisory shape
//   • createSiteProposer routes the count parser's abstention exactly like a GEN-12 model abstention

import { describe, it, expect } from "vitest"
import type { Candidate } from "@atlas/genesis"
import type { SubtreeHash } from "@atlas/contracts"
import { advisoryClaimParser, createSiteProposer, makeCountClaimParser, COUNT_UNPARSEABLE_REASON } from "../src/llm.js"
import type { CompletionResult, CountResolver, LlmBudget, ModelClient } from "../src/llm.js"

// A stub per-unit resolver (the index's job in production): a name known to be THIS unit's externally-called
// export resolves to its real SCIP symbol + the HARNESS-derived witnessed count + scope; anything off the list
// resolves to null ⇒ the parser abstains. The MODEL never supplies the number — it lives entirely here.
const stubResolve: CountResolver = (name) =>
  name === "Hash"
    ? { symbol: "SYM:Hash#", atLeast: 4, scope: "src" }
    : name === "id"
      ? { symbol: "SYM:id().", atLeast: 2, scope: "packages" }
      : null
const countClaimParser = makeCountClaimParser(stubResolve)

const cand: Candidate = {
  site: {
    kind: "symbol",
    qualifiedPath: "src/contracts/hash.ts::Hash",
    subtreeHash: "st-hash" as unknown as SubtreeHash,
  },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 0,
  rank: 0,
}

const budget: LlmBudget = { costCap: 1, timeoutMs: 1000 }
const buildPrompt = (c: Candidate): string => `describe ${c.site.qualifiedPath}`
function spyClient(result: CompletionResult): ModelClient {
  return { complete: () => result }
}

describe("makeCountClaimParser — #196c candidate-grounded: COUNT: <name> → typed count seed (harness-derived number)", () => {
  it("a RESOLVED name ⇒ predicate seed whose target is the real SYMBOL, atLeast + scope from the HARNESS", () => {
    const seed = countClaimParser("COUNT: Hash", cand, "COUNT: Hash")
    expect(seed).toStrictEqual({
      kind: "predicate",
      slot: "count",
      target: "SYM:Hash#", //  the RESOLVED symbol (not the bare name) — bound to the unit's specific export
      scope: "src", //         the callers' common-prefix scope, DERIVED by the index, never asked of the model
      atLeast: 4, //           the WITNESSED distinct-caller count — the harness's, never the model's
      cand,
      claim: "COUNT: Hash", // the raw human line is retained
      rawAnswer: "COUNT: Hash",
    })
  })

  it("the prefix is case-insensitive and rawAnswer is optional", () => {
    const seed = countClaimParser("count: id", cand)
    expect(seed).toStrictEqual({
      kind: "predicate",
      slot: "count",
      target: "SYM:id().",
      scope: "packages",
      atLeast: 2,
      cand,
      claim: "count: id",
    })
    expect(seed).not.toHaveProperty("rawAnswer") // absent when the caller passes none (#195c)
  })

  it("an OFF-LIST name (resolver returns null) ⇒ abstain — the lucy BLOCKER fix (never a sibling's symbol)", () => {
    expect(countClaimParser("COUNT: bogus", cand)).toStrictEqual({ abstain: COUNT_UNPARSEABLE_REASON })
  })

  it("a STRAY NUMBER makes the line unparseable — the model has NO slot to emit a count", () => {
    // teeth: the whole soundness hinge. `COUNT: Hash 5` and a bare `COUNT: 5` both fail the `\\S+`-then-end match
    // ⇒ abstain, so a hallucinated number can never become the claim's atLeast (that is the harness's alone).
    expect(countClaimParser("COUNT: Hash 5", cand)).toStrictEqual({ abstain: COUNT_UNPARSEABLE_REASON })
    expect(countClaimParser("COUNT: 5", cand)).toStrictEqual({ abstain: COUNT_UNPARSEABLE_REASON })
  })

  it('a trailing " @ scope" is NOT parsed — the model emits only a NAME', () => {
    expect(countClaimParser("COUNT: Hash @ src", cand)).toStrictEqual({ abstain: COUNT_UNPARSEABLE_REASON })
  })

  it("a prose line that is not the grammar ⇒ grounded abstention, NEVER a fabricated advisory", () => {
    expect(countClaimParser("Hash is used all over the codebase", cand)).toStrictEqual({
      abstain: COUNT_UNPARSEABLE_REASON,
    })
  })

  it("an empty name ⇒ abstain", () => {
    expect(countClaimParser("COUNT:   ", cand)).toStrictEqual({ abstain: COUNT_UNPARSEABLE_REASON })
  })
})

describe("advisoryClaimParser — the DEFAULT arm stays byte-identical to the shipped advisory shape", () => {
  it("every claim is an advisory seed { cand, claim } (+ rawAnswer when present) — unchanged by the count arm", () => {
    expect(advisoryClaimParser("greet returns a greeting", cand)).toStrictEqual({
      cand,
      claim: "greet returns a greeting",
    })
    expect(advisoryClaimParser("x", cand, "x-raw")).toStrictEqual({ cand, claim: "x", rawAnswer: "x-raw" })
  })
})

describe("createSiteProposer — the injected count parser shapes the seed and routes its abstention", () => {
  it("with countClaimParser: a RESOLVED COUNT answer ⇒ a typed count seed (target = symbol, atLeast from harness)", () => {
    const proposer = createSiteProposer({
      client: spyClient({ claim: "COUNT: Hash", rawAnswer: "COUNT: Hash" }),
      budget,
      buildPrompt,
      parseClaim: countClaimParser,
    })
    expect(proposer.propose(cand)).toMatchObject({
      kind: "predicate",
      slot: "count",
      target: "SYM:Hash#",
      scope: "src",
      atLeast: 4,
    })
  })

  it("with countClaimParser: a non-grammar claim ⇒ { abstain } (routed like a GEN-12 abstention)", () => {
    const proposer = createSiteProposer({
      client: spyClient({ claim: "just prose", rawAnswer: "just prose" }),
      budget,
      buildPrompt,
      parseClaim: countClaimParser,
    })
    expect(proposer.propose(cand)).toStrictEqual({ abstain: COUNT_UNPARSEABLE_REASON })
  })
})
