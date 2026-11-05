// Claim evidence is a carrier on the existing place row, not a new identity or a fan-out contract.
import { afterEach, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { admitAnswerText, createDiskStore } from "@atlas/adapter-io"
import type { CasPath } from "@atlas/adapter-io"
import { asHash } from "@atlas/kernel"
import { nodeKey } from "@atlas/knowledge"
import type { Candidate, CurrentNode } from "@atlas/knowledge"
import { buildControllerDeps } from "../src/mine.js"
import { MINED_SCOPE } from "../src/mine-staging.js"
import { A, ZERO_SIGNALS, depsOf, factFor, readStaging } from "./mine-fixtures.js"

const cand = { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 }
function semanticFact(claim: string, derivation: string) {
  const fact = factFor(cand, claim)
  if (fact.kind !== "advisory") throw new Error("factFor must yield the advisory fixture")
  return { ...fact, predicateSlot: "gotcha" as const, seal: "justified" as const, derivation }
}
const first = semanticFact("cache reads mutate recency order", "the successful read branch calls touch before returning the cached value")
const second = semanticFact("cache misses leave recency order unchanged", "the missing-key branch returns before the call to touch")
// A valid singular envelope shared by already-admitted fixtures; no new parser grammar is implied.
const answer = '```atlas-fact\n{"claim":"cache reads mutate recency order, but cache misses do not"}\n```'
const incoming = [{ ...first, rawAnswer: answer }, { ...second, rawAnswer: answer }]
const key = String(nodeKey({ ...first, slot: first.predicateSlot } as unknown as Candidate))
const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})

function freshMine() {
  const dir = mkdtempSync(join(tmpdir(), "atlas-mine-claim-evidence-"))
  dirs.push(dir)
  const store = createDiskStore(dir as unknown as CasPath)
  return { dir, store, controller: buildControllerDeps(dir, { ...depsOf({ store }), env: {} }) }
}

function evidenceOf(row: CurrentNode | undefined) {
  expect(row).toMatchObject({
    claimEvidenceByClaim: {
      [first.claimNorm]: { factRef: expect.stringMatching(/^[0-9a-f]{64}$/), answerRef: expect.stringMatching(/^[0-9a-f]{64}$/) },
      [second.claimNorm]: { factRef: expect.stringMatching(/^[0-9a-f]{64}$/), answerRef: expect.stringMatching(/^[0-9a-f]{64}$/) },
    },
  })
  return (row as unknown as {
    readonly claimEvidenceByClaim: Readonly<Record<string, { readonly factRef: string; readonly answerRef?: string }>>
  }).claimEvidenceByClaim
}

it("one intrinsic place row retains both individually resolvable claims/derivations and one shared answer receipt", () => {
  const mine = freshMine()
  expect(admitAnswerText(answer)).toMatchObject({ rawAnswer: answer })
  expect(String(nodeKey({ ...second, slot: second.predicateSlot } as unknown as Candidate))).toBe(key)
  mine.controller.upsert(incoming)

  const staged = readStaging(mine.store)
  expect([...staged.current.keys()]).toEqual([key])
  const row = staged.current.get(key)
  expect(row).toMatchObject({ nodeKey: key, claims: [first.claimNorm, second.claimNorm], slot: "gotcha" })
  const evidence = evidenceOf(row)
  expect(Object.keys(evidence).sort()).toEqual([first.claimNorm, second.claimNorm].sort())
  expect(evidence[first.claimNorm]!.factRef).not.toBe(evidence[second.claimNorm]!.factRef)
  expect(evidence[first.claimNorm]!.answerRef).toBe(evidence[second.claimNorm]!.answerRef)
  for (const fact of [first, second]) {
    const receipt = evidence[fact.claimNorm]!
    // Read through the actual CAS integrity boundary; no test-side hash or normalization implementation.
    expect(mine.store.get(asHash(receipt.factRef))).toEqual({ ...fact, scope: MINED_SCOPE })
    expect(mine.store.get(asHash(receipt.answerRef!))).toBe(answer)
  }
})

it("duplicate claim input does not duplicate evidence; reopening the disk store retains both original claim receipts at the same key", () => {
  const mine = freshMine()
  mine.controller.upsert(incoming)
  const before = evidenceOf(readStaging(mine.store).current.get(key))
  mine.controller.upsert([incoming[0]!, incoming[0]!])

  const reloaded = createDiskStore(mine.dir as unknown as CasPath)
  const staged = readStaging(reloaded)
  expect([...staged.current.keys()]).toEqual([key])
  const row = staged.current.get(key)
  expect(row).toMatchObject({ nodeKey: key, claims: [first.claimNorm, second.claimNorm] })
  const evidence = evidenceOf(row)
  expect(evidence).toEqual(before)
  expect(Object.keys(evidence).sort()).toEqual([first.claimNorm, second.claimNorm].sort())
  for (const fact of [first, second]) {
    expect(reloaded.get(asHash(evidence[fact.claimNorm]!.factRef))).toEqual({ ...fact, scope: MINED_SCOPE })
    expect(reloaded.get(asHash(evidence[fact.claimNorm]!.answerRef!))).toBe(answer)
  }
})
