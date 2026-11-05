import { afterEach, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore } from "@atlas/adapter-io"
import type { CasPath } from "@atlas/adapter-io"
import { asHash, id } from "@atlas/kernel"
import { makeRunController, reconcile, runExtract } from "@atlas/genesis"
import type { Candidate, EmitGate, SeedProposal, SiteProposer } from "@atlas/genesis"
import { buildControllerDeps } from "../src/mine.js"
import { makeVisitAll } from "../src/mine-pool.js"
import type { PoolResult, ProposerPool } from "../src/mine-pool.js"
import { MINED_SCOPE } from "../src/mine-staging.js"
import { A, B, ZERO_SIGNALS, depsOf, factFor, readStaging } from "./mine-fixtures.js"
const claims = [
  { claim: "cache reads mutate recency order", slot: "gotcha", derivation: "the read branch calls touch before returning" },
  { claim: "cache misses leave recency order unchanged", slot: "gotcha", derivation: "the missing-key branch returns before touch" },
] as const
// Adapter canonicalization is owned by its parser suite; this driver receives that accepted envelope.
const answer = JSON.stringify({ facts: claims })
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
const seeds = (cand: Candidate): readonly SeedProposal[] => claims.map((item) => ({
  cand, kind: "predicate", claim: item.claim, slot: item.slot, derivation: item.derivation, rawAnswer: answer,
}))
// Mechanical admission is the documented injected seam: driver/transport/staging, not semantic truth, is under test.
function admitted(seed: SeedProposal, cand: Candidate) {
  const fact = factFor(cand, seed.claim)
  if (fact.kind !== "advisory" || seed.kind !== "predicate" || seed.derivation === undefined || seed.rawAnswer === undefined) {
    throw new Error("expected semantic fixture with derivation and accepted envelope")
  }
  return { ...fact, predicateSlot: seed.slot, seal: "justified" as const, derivation: seed.derivation, rawAnswer: seed.rawAnswer }
}

it("one budgeted visit stages both same-source-id claims at one place with individual CAS grounds after reload", () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-mine-multifact-"))
  dirs.push(dir)
  const cas = join(dir, ".atlas", "cas") as unknown as CasPath
  const store = createDiskStore(cas)
  const calls: Candidate[] = []
  const gated: ReturnType<typeof admitted>[] = []
  const proposer = { propose: (cand: Candidate) => {
    calls.push(cand)
    return { proposals: seeds(cand) }
  } } as unknown as SiteProposer
  const gate: EmitGate = { emit: (seed, cand) => {
    const fact = admitted(seed, cand)
    gated.push(fact)
    return { emitted: true, fact }
  } }
  const ports = buildControllerDeps(dir, { ...depsOf({ store, proposer, gate }), env: {} })
  const report = makeRunController(ports).genesis(dir, "HEAD", { ceiling: 1 })
  expect(calls).toHaveLength(1)
  expect(gated.map((fact) => fact.claimNorm)).toEqual(claims.map((item) => item.claim))
  expect(gated[0]!.id).toBe(gated[1]!.id) // Source-path identity must not deduplicate independent claims.
  expect(report).toMatchObject({ llmCalls: 1, modelCalls: 1, budgetSpent: 1, admittedClaims: 2, answersStored: 1 })
  expect(reconcile(report.coverage)).toMatchObject({ closes: true, planned: 4, seeded: 1, unvisited: 3 })
  expect(report.coverage!.sites[0]).toMatchObject({ site: calls[0]!.site, outcome: "seeded" })
  const reloaded = createDiskStore(cas)
  const rows = [...readStaging(reloaded).current.values()]
  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row).toMatchObject({ claims: claims.map((item) => item.claim), slot: "gotcha", answerRef: String(id(answer)) })
  expect(ports.stagedNodeKeys()).toEqual([String(row.nodeKey)])
  const evidence = (row as unknown as {
    claimEvidenceByClaim: Readonly<Record<string, { factRef: string; answerRef: string }>>
  }).claimEvidenceByClaim
  const visited = report.coverage!.sites[0]!
  if (visited.outcome !== "seeded") throw new Error("expected productive site coverage")
  expect(visited.facts).toEqual(claims.map((item) => evidence[item.claim]!.factRef))
  expect(Object.keys(evidence)).toEqual(claims.map((item) => item.claim))
  expect(evidence[claims[0].claim]!.factRef).not.toBe(evidence[claims[1].claim]!.factRef)
  gated.forEach((fact) => {
    const { rawAnswer, ...body } = fact
    const receipt = evidence[fact.claimNorm]!
    const expected = { ...body, scope: MINED_SCOPE }
    expect(receipt.factRef).toBe(String(id(expected)))
    expect(reloaded.get(asHash(receipt.factRef))).toEqual(expected)
    expect(receipt.answerRef).toBe(String(id(answer)))
    expect(reloaded.get(asHash(receipt.answerRef))).toBe(rawAnswer)
  })
})

it("makeVisitAll carries whole PoolResults positionally to parent admission without another proposer call", () => {
  const cands: readonly Candidate[] = [
    { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 },
    { site: B, signals: ZERO_SIGNALS, ppr: 0.5, rank: 1 },
  ]
  const proposed: Candidate[] = []
  const batches: (readonly Candidate[])[] = []
  const parent: Candidate[] = []
  const gated: SeedProposal[] = []
  const workerProposer = { propose: (cand: Candidate) => {
    proposed.push(cand)
    return { proposals: seeds(cand) }
  } } as unknown as SiteProposer
  const pool: ProposerPool = {
    proposeAll: (batch): readonly PoolResult[] => {
      batches.push(batch)
      return batch.map((cand) => ({ ok: true, seed: workerProposer.propose(structuredClone(cand)) }))
    },
    close: () => {},
  }
  const visitAll = makeVisitAll(pool, (cand, held) => {
    parent.push(cand)
    return runExtract([cand], { ceiling: 1 }, { proposer: held, gate: { emit: (seed, local) => {
      expect(local).toBe(cand)
      expect(seed.cand).toBe(cand) // Every nested seed must be rebound after structured clone.
      gated.push(seed)
      return { emitted: true, fact: admitted(seed, local) }
    } } })
  })
  const attempts = visitAll(cands)
  expect(batches).toEqual([cands])
  expect(proposed).toEqual(cands)
  expect(proposed[0]).not.toBe(cands[0]) // Positive control: the worker carrier really was cloned.
  expect(parent).toEqual(cands)
  expect(gated.map((seed) => seed.cand)).toEqual([cands[0], cands[0], cands[1], cands[1]])
  expect(attempts).toEqual(cands.map((cand) => ({
    ok: true, value: { facts: seeds(cand).map((seed) => admitted(seed, cand)), abstained: [] },
  })))
})
