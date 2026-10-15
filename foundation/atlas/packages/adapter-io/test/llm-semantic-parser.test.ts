// @atlas/adapter-io — test/llm-semantic-parser.test.ts   (196c — the general SEMANTIC/justified arm)
//
// The semantic mining arm is the ONE general justified arm (anti-7-heads): the model CLASSIFIES each fact into
// one of the eight `SemanticSlot`s (gotcha is now just one option). It differs from the sound arms
// (dependency/count) in two ways this suite pins:
//   • it is a REASON-FREELY `'block'` arm (like advisory), so the model emits ONE fenced `atlas-fact` block
//     — but that block carries THREE fields, `{slot, claim, derivation}`, not one;
//   • the SLOT (the model's classification) + the DERIVATION (the compact, contestable grounds the `justified`
//     seal persists) are lifted by `semanticClaimParser` from the raw envelope onto
//     `PredicateSeed{ slot:<validated>, claim, derivation }`.
// This suite pins:
//   • a captured answer whose block carries {slot:'invariant', claim, derivation} ⇒ the typed seed at that slot
//   • a DIFFERENT slot ({slot:'rationale'}) parses to that slot — the arm is general, not gotcha-only
//   • a NON-SEMANTIC slot in the block ({slot:'dependency'}) ⇒ grounded abstention (SEMANTIC_SLOT_UNKNOWN_REASON)
//   • a bare `NO-FACT` ⇒ abstain (null), exactly like the advisory path (never reaches the parser)
//   • a block with NO/empty derivation ⇒ grounded abstention (SEMANTIC_NO_DERIVATION_REASON)
//   • a block with NO slot ⇒ grounded abstention (SEMANTIC_SLOT_UNKNOWN_REASON)
//   • rawAnswer provenance rides through (#195c); the default advisory arm stays byte-identical
// The block-admission path is driven through the REAL `createCommandClient('block')` over `cat`, so the block
// gate (`admitFactBlock`) that extracts `claim` and the parser that lifts `slot`+`derivation` are exercised together.

import { describe, it, expect } from "vitest"
import type { Candidate } from "@atlas/genesis"
import type { SubtreeHash } from "@atlas/contracts"
import {
  createCommandClient,
  createSiteProposer,
  semanticClaimParser,
  SEMANTIC_NO_DERIVATION_REASON,
  SEMANTIC_SLOT_UNKNOWN_REASON,
  advisoryClaimParser,
} from "../src/llm.js"
import type { CompletionResult, LlmBudget, ModelClient } from "../src/llm.js"

const cand: Candidate = {
  site: { kind: "symbol", qualifiedPath: "src/cache/lru.ts::get", subtreeHash: "st-hash" as unknown as SubtreeHash },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 0,
  rank: 0,
}

const budget: LlmBudget = { costCap: 1, timeoutMs: 10_000 }
const buildPrompt = (c: Candidate): string => `describe ${c.site.qualifiedPath}`
function spyClient(result: CompletionResult): ModelClient {
  return { complete: () => result }
}

/** Build a captured answer: free scratch reasoning (discarded), then ONE fenced block with the given fields. */
function captured(fields: Record<string, unknown>): string {
  return [
    "Let me reason. Scanning the body, I will refute a candidate against the bytes...",
    "it survives refutation.",
    "",
    "```atlas-fact",
    JSON.stringify(fields),
    "```",
  ].join("\n")
}

const CLAIM = "get() mutates recency order as a side effect, so a read is not a pure lookup"
const DERIVATION = "the get branch calls touch(key) before return, moving the entry to the MRU end of the list"

describe("semanticClaimParser — 196c: the {slot, claim, derivation} block ⇒ a typed justified seed at the classified slot", () => {
  it("a captured answer with slot:invariant ⇒ PredicateSeed{slot:invariant, claim, derivation}, all POPULATED", () => {
    // Drive the REAL block gate: createCommandClient('block') runs `cat` (echoes the captured envelope on stdin),
    // `admitFactBlock` extracts `claim`, and the injected semanticClaimParser lifts `slot`+`derivation` from rawAnswer.
    const env = captured({ slot: "invariant", claim: CLAIM, derivation: DERIVATION })
    const client = createCommandClient({ cmd: "cat", args: [] }, "block")
    const proposer = createSiteProposer({ client, budget, buildPrompt: () => env, parseClaim: semanticClaimParser })
    expect(proposer.propose(cand)).toStrictEqual({
      kind: "predicate",
      slot: "invariant", //     the model's classification, validated against the eight
      derivation: DERIVATION, // the persisted, contestable grounds — populated, never empty
      cand,
      claim: CLAIM, //          the extracted sentence (admitFactBlock's projection)
      rawAnswer: env, //        the whole validated envelope rides through (#195c)
    })
  })

  it("a DIFFERENT slot (rationale) parses to that slot — the arm is general, not gotcha-only", () => {
    const env = captured({ slot: "rationale", claim: CLAIM, derivation: DERIVATION })
    expect(semanticClaimParser(CLAIM, cand, env)).toStrictEqual({
      kind: "predicate",
      slot: "rationale",
      derivation: DERIVATION,
      cand,
      claim: CLAIM,
      rawAnswer: env,
    })
  })

  it("gotcha stays a valid slot the model may pick (the 196b special case is one of the eight)", () => {
    const env = captured({ slot: "gotcha", claim: CLAIM, derivation: DERIVATION })
    expect(semanticClaimParser(CLAIM, cand, env)).toMatchObject({
      kind: "predicate",
      slot: "gotcha",
      derivation: DERIVATION,
    })
  })

  it("a NON-SEMANTIC slot in the block (dependency) ⇒ grounded abstention, NOT a fact minted outside the vocabulary", () => {
    // `dependency` is an ORACLE slot — it lands `proven`, not `justified`, so the semantic arm must never mint it.
    const env = captured({ slot: "dependency", claim: CLAIM, derivation: DERIVATION })
    expect(semanticClaimParser(CLAIM, cand, env)).toStrictEqual({ abstain: SEMANTIC_SLOT_UNKNOWN_REASON })
  })

  it("a free-text slot ⇒ grounded abstention (the closed-vocabulary guard is total over unknown)", () => {
    const env = captured({ slot: "free-text-whatever", claim: CLAIM, derivation: DERIVATION })
    expect(semanticClaimParser(CLAIM, cand, env)).toStrictEqual({ abstain: SEMANTIC_SLOT_UNKNOWN_REASON })
  })

  it("a MISSING slot ⇒ grounded abstention (a fact with no classification cannot be sealed justified)", () => {
    const env = captured({ claim: CLAIM, derivation: DERIVATION })
    expect(semanticClaimParser(CLAIM, cand, env)).toStrictEqual({ abstain: SEMANTIC_SLOT_UNKNOWN_REASON })
  })

  it("a bare NO-FACT ⇒ abstain (null), same as the advisory path (never reaches the parser)", () => {
    // Through the REAL block gate: `printf NO-FACT` is mapped to the GEN-12 model-abstained outcome by
    // admitModelAnswer BEFORE any parser runs, so propose() returns null exactly like an advisory abstention.
    const client = createCommandClient({ cmd: "printf", args: ["%s", "NO-FACT"] }, "block")
    const proposer = createSiteProposer({ client, budget, buildPrompt, parseClaim: semanticClaimParser })
    expect(proposer.propose(cand)).toBeNull()
  })

  it("teeth: a block with NO derivation field ⇒ grounded abstention (SEMANTIC_NO_DERIVATION_REASON), NOT a bare advisory", () => {
    // The whole worth of `justified` is that its grounds travel — a fact whose derivation does not is malformed.
    const env = captured({ slot: "invariant", claim: CLAIM })
    expect(semanticClaimParser(CLAIM, cand, env)).toStrictEqual({ abstain: SEMANTIC_NO_DERIVATION_REASON })
  })

  it("teeth: an EMPTY / whitespace-only derivation ⇒ abstain (a hollow ground is no ground)", () => {
    const env = captured({ slot: "invariant", claim: CLAIM, derivation: "   " })
    expect(semanticClaimParser(CLAIM, cand, env)).toStrictEqual({ abstain: SEMANTIC_NO_DERIVATION_REASON })
  })

  it("a MISSING rawAnswer ⇒ abstain — the slot+derivation live only in the envelope, so absent envelope is no ground", () => {
    expect(semanticClaimParser(CLAIM, cand)).toStrictEqual({ abstain: SEMANTIC_NO_DERIVATION_REASON })
  })

  it("the derivation is TRIMMED (its projection, like claim) — leading/trailing whitespace is not stored", () => {
    const env = captured({ slot: "invariant", claim: CLAIM, derivation: `  ${DERIVATION}  ` })
    expect(semanticClaimParser(CLAIM, cand, env)).toMatchObject({ derivation: DERIVATION })
  })
})

describe("createSiteProposer — the injected semantic parser routes a hollow fact like a GEN-12 abstention", () => {
  it("a block with no derivation ⇒ { abstain } (routed like any GEN-12 abstention, never a fabricated seed)", () => {
    const env = captured({ slot: "invariant", claim: CLAIM })
    // The client already extracted `claim`; the parser sees the raw envelope with no derivation and abstains.
    const proposer = createSiteProposer({
      client: spyClient({ claim: CLAIM, rawAnswer: env }),
      budget,
      buildPrompt,
      parseClaim: semanticClaimParser,
    })
    expect(proposer.propose(cand)).toStrictEqual({ abstain: SEMANTIC_NO_DERIVATION_REASON })
  })

  it("a block with an out-of-vocabulary slot ⇒ { abstain } (fail-closed, never a seed at a non-justified slot)", () => {
    const env = captured({ slot: "count", claim: CLAIM, derivation: DERIVATION })
    const proposer = createSiteProposer({
      client: spyClient({ claim: CLAIM, rawAnswer: env }),
      budget,
      buildPrompt,
      parseClaim: semanticClaimParser,
    })
    expect(proposer.propose(cand)).toStrictEqual({ abstain: SEMANTIC_SLOT_UNKNOWN_REASON })
  })
})

describe("advisoryClaimParser — the DEFAULT arm stays byte-identical, unaffected by the semantic arm", () => {
  it("every claim is an advisory seed { cand, claim } (+ rawAnswer when present)", () => {
    expect(advisoryClaimParser("greet returns a greeting", cand)).toStrictEqual({
      cand,
      claim: "greet returns a greeting",
    })
    expect(advisoryClaimParser("x", cand, "x-raw")).toStrictEqual({ cand, claim: "x", rawAnswer: "x-raw" })
  })
})
