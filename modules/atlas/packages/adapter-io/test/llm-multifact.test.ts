// Frozen genesis-multifact-contract.md: behavioral acceptance, not a shipped-feature claim.
// No subprocess/model/global mock. Existing llm-{dependency,count,definition}-parser suites
// retain the sound arms' complete grammar coverage; the final cases pin their splice boundary here.
import { describe, it, expect } from "vitest"
import type { SubtreeHash } from "@atlas/contracts"
import type { Candidate } from "@atlas/genesis"
import {
  admitAnswerText,
  createSiteProposer,
  semanticClaimParser,
  makeDependencyClaimParser,
  makeCountClaimParser,
  makeDefinitionClaimParser,
  SEMANTIC_NO_DERIVATION_REASON,
  SEMANTIC_SLOT_UNKNOWN_REASON,
} from "../src/llm.js"
import type { ClaimParser, CompletionResult, LlmBudget, ModelClient } from "../src/llm.js"

const cand: Candidate = {
  site: { kind: "symbol", qualifiedPath: "src/cache/lru.ts::get", subtreeHash: "cache-hash" as unknown as SubtreeHash },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 0,
  rank: 0,
}
const budget: LlmBudget = { costCap: 1, timeoutMs: 1000 }
const prompt = "describe the cache site"
const fence = (body: unknown) => `\`\`\`atlas-fact\n${JSON.stringify(body)}\n\`\`\``

function propose(result: CompletionResult, parseClaim?: ClaimParser) {
  const calls: { prompt: string; budget: LlmBudget }[] = []
  const client: ModelClient = {
    complete(prompt, budget) {
      calls.push({ prompt, budget })
      return result
    },
  }
  const out = createSiteProposer({
    client, budget, buildPrompt: () => prompt, ...(parseClaim === undefined ? {} : { parseClaim }),
  }).propose(cand)
  return { out, calls }
}

describe("bounded multi-fact completion acceptance", () => {
  it("preserves legacy singular completions and canonicalizes a legacy single block", () => {
    expect(propose({ claim: "legacy claim", rawAnswer: "legacy receipt" }).out).toStrictEqual({
      cand, claim: "legacy claim", rawAnswer: "legacy receipt",
    })
    const body = { claim: "A read touches recency", slot: "invariant", derivation: "get calls touch" }
    const result = admitAnswerText(`discard this scratch\n${fence({ secret: "scratch", ...body })}\nafterthought`)
    expect(result).toMatchObject({ claim: body.claim, rawAnswer: fence(body) })
    expect(semanticClaimParser(body.claim, cand, result.rawAnswer)).toMatchObject({
      kind: "predicate", ...body, cand, rawAnswer: fence(body),
    })
    expect(propose(result, semanticClaimParser).out).toMatchObject({
      kind: "predicate", ...body, cand, rawAnswer: fence(body),
    })
    expect(propose({ claim: null }).out).toBeNull()
  })

  it.each([1, 2, 3, 4])("returns every distinct claim for a %i-item envelope with one unchanged bounded call", (size) => {
    const facts = Array.from({ length: size }, (_, i) => ({ claim: `cache property ${i}` }))
    const result = admitAnswerText(fence({ facts }))
    expect(result).toMatchObject({ claim: facts[0]!.claim, claims: facts, rawAnswer: fence({ facts }) })
    expect(result).toHaveProperty("claims.length", size)
    const run = propose(result)
    expect(run.calls).toStrictEqual([{ prompt, budget }])
    expect(run.calls[0]!.budget).toBe(budget)
    expect(run.out).toMatchObject({
      proposals: facts.map((fact) => ({ cand, claim: fact.claim, rawAnswer: fence({ facts }) })),
    })
    expect(run.out).toHaveProperty("proposals.length", size)
  })

  it("uses one exact accepted envelope: ordered allowlisted fields, optional values only when supplied", () => {
    const accepted = { facts: [
      { claim: "A read changes recency", slot: "invariant", derivation: "touch runs before return" },
      { claim: "Eviction takes the oldest entry" },
      { claim: "Null metadata is preserved for parser validation", slot: null, derivation: 7 },
    ] }
    const result = admitAnswerText(`PRIVATE OUTSIDE SCRATCH\n${fence({
      scratch: "PRIVATE ROOT FIELD",
      facts: [
        { derivation: "touch runs before return", reasoning: "PRIVATE ITEM FIELD", slot: "invariant", claim: "  A read changes recency  " },
        { claim: "Eviction takes the oldest entry", confidence: 1 },
        { derivation: 7, slot: null, claim: "Null metadata is preserved for parser validation" },
      ],
    })}\nPRIVATE TRAILING SCRATCH`)
    expect(result).toMatchObject({ claim: accepted.facts[0]!.claim, claims: accepted.facts, rawAnswer: fence(accepted) })
    expect(propose(result).out).toMatchObject({
      proposals: accepted.facts.map((fact) => ({ cand, claim: fact.claim, rawAnswer: fence(accepted) })),
    })
    expect(propose(result).out).toHaveProperty("proposals.length", 3)
  })

  it("keeps two same-slot semantic claims with their own derivations and the shared receipt", () => {
    const facts = [
      { claim: "Reads change recency", slot: "invariant", derivation: "get calls touch" },
      { claim: "Writes change recency", slot: "invariant", derivation: "set calls touch" },
    ]
    const rawAnswer = fence({ facts })
    const run = propose(admitAnswerText(rawAnswer), semanticClaimParser)
    expect(run.calls).toHaveLength(1)
    expect(run.out).toMatchObject({ proposals: facts.map((fact) => ({ kind: "predicate", ...fact, cand, rawAnswer })) })
    expect(run.out).toHaveProperty("proposals.length", 2)

    // The additive fourth argument must select THIS item's fields, not reparse the first item.
    const parse = semanticClaimParser as unknown as (
      claim: string, cand: Candidate, rawAnswer: string, fields: { slot: unknown; derivation: unknown },
    ) => ReturnType<typeof semanticClaimParser>
    expect(parse(facts[1]!.claim, cand, rawAnswer, facts[1]!)).toMatchObject({
      kind: "predicate", ...facts[1]!, cand, rawAnswer,
    })
  })

  it.each([
    [{ claim: "Missing grounds", slot: "invariant" }, SEMANTIC_NO_DERIVATION_REASON],
    [{ claim: "Empty grounds", slot: "invariant", derivation: "  " }, SEMANTIC_NO_DERIVATION_REASON],
    [{ claim: "Nonstring grounds", slot: "invariant", derivation: 7 }, SEMANTIC_NO_DERIVATION_REASON],
    [{ claim: "Wrong slot", slot: "dependency", derivation: "not an oracle" }, SEMANTIC_SLOT_UNKNOWN_REASON],
    [{ claim: "Missing slot", derivation: "get calls touch" }, SEMANTIC_SLOT_UNKNOWN_REASON],
  ] as const)("tags a malformed semantic item without advisory downgrade or losing its sibling: %j", (bad, reason) => {
    const good = { claim: "Reads change recency", slot: "invariant", derivation: "get calls touch" }
    const rawAnswer = fence({ facts: [bad, good] })
    const run = propose(admitAnswerText(rawAnswer), semanticClaimParser)
    expect(run.calls).toHaveLength(1)
    expect(run.out).toMatchObject({ proposals: [
      { abstain: reason },
      { kind: "predicate", ...good, cand, rawAnswer },
    ] })
    expect(run.out).toHaveProperty("proposals.length", 2)
    const items = (run.out as unknown as { proposals: readonly unknown[] }).proposals
    expect(items[0]).not.toHaveProperty("claim")
  })

  it.each([
    ["zero items", { facts: [] }],
    ["five items, never truncate", { facts: [1, 2, 3, 4, 5].map((n) => ({ claim: `claim ${n}` })) }],
    ["duplicate claims", { facts: [{ claim: "same" }, { claim: "same" }] }],
    ["NFC and trim duplicate claims", { facts: [{ claim: " café " }, { claim: "cafe\u0301" }] }],
    ["mixed single and collection", { claim: "single", facts: [{ claim: "collection" }] }],
    ["nonarray collection", { facts: { claim: "not an array" } }],
    ["nonstring claim", { facts: [{ claim: "valid sibling" }, { claim: 7 }] }],
    ["empty claim", { facts: [{ claim: "valid sibling" }, { claim: " \n " }] }],
    ["null item", { facts: [{ claim: "valid sibling" }, null] }],
    ["escaped NUL claim", { facts: [{ claim: "valid sibling" }, { claim: "bad\u0000claim" }] }],
  ])("refuses the entire malformed collection: %s", (_name, body) => {
    const result = admitAnswerText(fence(body))
    expect(result).toMatchObject({ claim: null, abstainReason: expect.stringMatching(/^answer-malformed:/) })
    expect(result).not.toHaveProperty("rawAnswer")
    expect(result).not.toHaveProperty("claims")
    expect(propose(result).out).toMatchObject({ abstain: expect.any(String) })
  })

  it.each([
    ["malformed JSON", '```atlas-fact\n{"facts":[{"claim":"a"}]\n```'],
    ["UTF-8 body over 8 KiB", fence({ facts: [{ claim: "界".repeat(3000) }] })],
    ["literal NUL splice", `${fence({ facts: [{ claim: "a" }] })}\u0000`],
    ["two complete fences", `${fence({ claim: "a" })}\n${fence({ claim: "b" })}`],
    ["unclosed extra fence", `${fence({ claim: "a" })}\n\`\`\`atlas-fact\n{"claim":"b"}`],
    ["unclosed extra opener without newline", `${fence({ claim: "a" })}\n\`\`\`atlas-fact`],
  ])("refuses malformed/spliced block envelopes: %s", (_name, text) => {
    const result = admitAnswerText(text)
    expect(result).toMatchObject({ claim: null, abstainReason: expect.stringMatching(/^answer-malformed:/) })
    expect(result).not.toHaveProperty("rawAnswer")
    expect(result).not.toHaveProperty("claims")
  })

  it("accepts the existing 8 KiB UTF-8 body boundary, not an arbitrarily smaller limit", () => {
    const facts = [{ claim: "x".repeat(8192 - JSON.stringify({ facts: [{ claim: "" }] }).length) }]
    expect(admitAnswerText(fence({ facts }))).toMatchObject({ claim: facts[0]!.claim, claims: facts })
  })

  it.each([
    ["dependency", "DEPENDS-ON: dep", makeDependencyClaimParser((name) => name === "dep" ? "SYM:dep" : null)],
    ["definition", "DEFINES: def", makeDefinitionClaimParser((name) => name === "def" ? "SYM:def" : null)],
    ["count", "COUNT: export", makeCountClaimParser((name) => name === "export" ? { symbol: "SYM:export", atLeast: 2, scope: "src" } : null)],
  ] as const)("keeps the %s single-line grammar; no collection or multiline splice enters as a sound seed", (slot, line, parser) => {
    expect(parser(line, cand, line)).toMatchObject({ kind: "predicate", slot, claim: line })
    expect(parser(`${line}\n${line}`, cand)).toMatchObject({ abstain: expect.any(String) })
    expect(parser(fence({ facts: [{ claim: line }] }), cand)).toMatchObject({ abstain: expect.any(String) })
  })
})
