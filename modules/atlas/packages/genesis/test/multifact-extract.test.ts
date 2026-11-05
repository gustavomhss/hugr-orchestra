import { expect, it } from "vitest"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import { runExtract } from "../src/extract.js"
import type { EmitGate, SeedProposal, SiteProposer } from "../src/extract.js"
import type { Candidate, Fact } from "../src/types.js"

const site = (rank: number): Candidate => ({
  site: { kind: "symbol", qualifiedPath: `src/cache${rank}.ts`, subtreeHash: asSubtreeHash(`cache${rank}`) },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 1 - rank / 100,
  rank,
})
// Ordinary production Fact shape; this injected mechanical gate isolates driver scheduling/routing.
const factFor = (cand: Candidate, claim: string): Fact => ({
  kind: "advisory", id: asNodeKey(cand.site.qualifiedPath), tier: "T2", claimNorm: claim,
  grounding: { entries: [{ anchor: cand.site, path: cand.site.qualifiedPath }] },
  freshness: "FRESH", claims: [], authoring: "ADVISORY",
  obviousness: { rank: "non-obvious", by: "harness-predicate" },
})
// Test-local bridge to the frozen additive return shape, while baseline public types are still singular.
const grouped = (propose: (cand: Candidate) => readonly (SeedProposal | { abstain: string })[]): SiteProposer =>
  ({ propose: (cand: Candidate) => ({ proposals: propose(cand) }) }) as unknown as SiteProposer

it("one ranked site spends one call and admits two gate facts in response order at budget one", () => {
  const calls: Candidate[] = []
  const gated: SeedProposal[] = []
  const first = site(0)
  const result = runExtract([site(1), first], { ceiling: 1 }, {
    proposer: grouped((cand) => {
      calls.push(cand)
      return [{ cand, claim: "reads touch recency" }, { cand, claim: "misses preserve recency" }]
    }),
    gate: { emit: (seed, cand) => {
      gated.push(seed)
      expect(seed.cand).toBe(cand)
      return { emitted: true, fact: factFor(cand, seed.claim) }
    } },
  })
  expect(calls).toEqual([first])
  expect(gated.map((seed) => seed.claim)).toEqual(["reads touch recency", "misses preserve recency"])
  expect(result.facts).toEqual(gated.map((seed) => factFor(first, seed.claim)))
  expect(result.abstained).toEqual([])
})

it("tagged item abstention and mechanical refusal preserve valid siblings on both sides", () => {
  const cand = site(0)
  const gated: string[] = []
  const result = runExtract([cand], { ceiling: 1 }, {
    proposer: grouped((cand) => [
      { cand, claim: "first" }, { abstain: "answer-malformed:semantic-slot" },
      { cand, claim: "refused" }, { cand, claim: "last" },
    ]),
    gate: { emit: (seed, cand) => {
      gated.push(seed.claim)
      return seed.claim === "refused"
        ? { emitted: false, whyNot: { site: cand.site, reason: "grounding refused" } }
        : { emitted: true, fact: factFor(cand, seed.claim) }
    } },
  })
  expect(gated).toEqual(["first", "refused", "last"])
  expect(result.facts).toEqual([factFor(cand, "first"), factFor(cand, "last")])
  expect(result.abstained).toEqual([
    { site: cand.site, reason: "answer-malformed:semantic-slot" },
    { site: cand.site, reason: "grounding refused" },
  ])
})

it("the trailing twenty window counts three productive sites, not their twelve admitted claims", () => {
  const calls: number[] = []
  const gated: SeedProposal[] = []
  const result = runExtract(Array.from({ length: 25 }, (_, rank) => site(rank)), { ceiling: 25 }, {
    proposer: grouped((cand) => {
      calls.push(cand.rank)
      return Array.from({ length: 4 }, (_, item) => ({ cand, claim: `claim-${cand.rank}-${item}` }))
    }),
    gate: { emit: (seed, cand) => {
      gated.push(seed)
      return cand.rank < 3
        ? { emitted: true, fact: factFor(cand, seed.claim) }
        : { emitted: false, whyNot: { site: cand.site, reason: "grounding refused" } }
    } },
  })
  expect(calls).toEqual(Array.from({ length: 20 }, (_, rank) => rank))
  expect(gated).toHaveLength(80)
  expect(result.facts).toHaveLength(12)
  expect(result.abstained).toHaveLength(68)
})

it("the hard ceiling spends sites rather than claims even when every collection fills the bound", () => {
  const calls: number[] = []
  const gate: EmitGate = { emit: (seed, cand) => ({ emitted: true, fact: factFor(cand, seed.claim) }) }
  const result = runExtract([site(2), site(0), site(1)], { ceiling: 2 }, {
    proposer: grouped((cand) => {
      calls.push(cand.rank)
      return Array.from({ length: 4 }, (_, item) => ({ cand, claim: `claim-${cand.rank}-${item}` }))
    }), gate,
  })
  expect(calls).toEqual([0, 1])
  expect(result.facts).toHaveLength(8)
})

it.each([0, 5])("a collection of %i items refuses as a whole before the gate, without truncation", (size) => {
  const cand = site(0)
  const gated: SeedProposal[] = []
  const calls: Candidate[] = []
  const result = runExtract([cand, site(1)], { ceiling: 1 }, {
    proposer: grouped((cand) => {
      calls.push(cand)
      return Array.from({ length: size }, (_, item) => ({ cand, claim: `claim-${item}` }))
    }),
    gate: { emit: (seed, cand) => {
      gated.push(seed)
      return { emitted: true, fact: factFor(cand, seed.claim) }
    } },
  })
  expect(calls).toEqual([cand])
  expect(gated).toEqual([])
  expect(result.facts).toEqual([])
  expect(result.abstained).toEqual([{ site: cand.site, reason: expect.any(String) }])
  expect(result.abstained[0]!.reason.length).toBeGreaterThan(0)
})
