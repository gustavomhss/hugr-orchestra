// Settled staging-row identity is separate from the coverage ledger's reported fact/source-path ids.
import { afterEach, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore } from "@atlas/adapter-io"
import { asHash } from "@atlas/kernel"
import { buildControllerDeps, driveMineArms, driveMinePass, foldArms } from "../src/mine.js"
import { foldVerdict, ledgerSeededIds } from "../src/mine-render.js"
import { A, D, ZERO_SIGNALS, depsOf, factFor, readStaging } from "./mine-fixtures.js"

const dirs: string[] = []
afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})

function freshMine() {
  const dir = mkdtempSync(join(tmpdir(), "atlas-mine-staged-metrics-"))
  dirs.push(dir)
  const cas = join(dir, ".atlas", "cas")
  return { dir, cas, store: createDiskStore(cas) }
}

it("real pass snapshots count seven settled rows across 3/1/3 admits sharing only four source-path ids", () => {
  const mine = freshMine()
  const arms = driveMineArms(mine.dir, { ...depsOf({ store: mine.store }), env: {} }, (repo, deps) => {
    const slot = deps?.slot
    if (slot !== "advisory" && slot !== "dependency" && slot !== "count") throw new Error("unexpected arm")
    return driveMinePass(repo, {
      ...deps,
      gate: {
        emit: (seed, cand) => {
          // Advisory/count share A/B/C ids but stage distinct slots; dependency contributes D's fourth id.
          const admit = slot === "dependency" ? cand.site.qualifiedPath === D.qualifiedPath : cand.site.qualifiedPath !== D.qualifiedPath
          if (!admit) return { emitted: false, whyNot: { site: cand.site, reason: "outside this arm's fixture" } }
          const fact = factFor(cand, seed.claim)
          if (fact.kind !== "advisory") throw new Error("expected advisory fixture")
          return { emitted: true, fact: { ...fact, ...(slot === "advisory" ? {} : { predicateSlot: slot }) } }
        },
      },
    })
  })

  expect(arms.map((a) => a.pass.stagedNodeKeys?.length)).toEqual([3, 1, 3])
  const sourceIds = new Set(arms.flatMap((a) => a.pass.report.seeded.map((fact) => String(fact.id))))
  expect(sourceIds.size).toBe(4) // Positive control: source-path identities really undercount this fixture.
  const settledRefs = new Set(arms.flatMap((a) => [...ledgerSeededIds(a.pass.report)!]))
  expect(settledRefs.size).toBe(7)
  for (const ref of settledRefs) expect(mine.store.get(asHash(ref))).toBeDefined()
  const durable = readStaging(createDiskStore(mine.cas))
  expect(durable.current.size).toBe(7)
  expect(new Set(arms.flatMap((a) => a.pass.stagedNodeKeys!))).toEqual(new Set(durable.current.keys()))
  const verdict = foldArms(arms)
  expect(verdict.exitCode).toBe(0)
  expect(verdict.stdout.split("\n")[0]).toBe("genesis: seeded 7 candidate row(s) [staging-key union]; ratified 0")
  expect(verdict.stdout).toContain("mine: arms — advisory 3 · dependency 1 · count 3")
  expect(verdict.stdout).toContain("cost: llmCalls 12 · budgetSpent 12")
  expect(arms.map((a) => a.pass.report.modelCalls)).toEqual([4, 4, 4])
  expect(arms.map((a) => a.pass.report.seeded.length)).toEqual([3, 1, 3])
  expect(arms.map((a) => a.pass.report.answersStored)).toEqual([0, 0, 0])

  // The accessor is optional only for legacy/injected callers. Their ledger remains authoritative even
  // when the write-dedup set is empty; neither an all-legacy nor a mixed set may claim staging identity.
  const legacy = arms.map((a) => ({
    slot: a.slot,
    pass: {
      report: { ...a.pass.report, seeded: [], coverage: { ...a.pass.report.coverage!, sites: a.pass.report.coverage!.sites.map((site) => {
        if (site.outcome !== "seeded") return site
        const { factIdentity, ...legacy } = site
        return { ...legacy, facts: site.facts.map((ref) => String((mine.store.get(asHash(ref)) as { id: string }).id)) }
      }) } },
      seed: a.pass.seed,
      modelWired: a.pass.modelWired,
      seedsDropped: a.pass.seedsDropped,
    },
  }))
  for (const passes of [legacy, [arms[0]!, legacy[1]!, arms[2]!]]) {
    const fallback = foldArms(passes).stdout
    const count = passes === legacy ? 4 : 7 // Mixed CAS/source IDs cannot claim either row or source identity.
    expect(fallback.split("\n")[0]).toBe(`genesis: seeded ${count} candidate fact(s) [reported-id union; staging identity unavailable]; ratified 0`)
    expect(fallback).toContain("mine: arms — advisory 3 · dependency 1 · count 3")
    expect(fallback).not.toContain("[staging-key union]")
  }
  const preLedger = arms.map((a) => ({
    ...a,
    pass: {
      seed: a.pass.seed,
      modelWired: a.pass.modelWired,
      seedsDropped: a.pass.seedsDropped,
      report: { seeded: a.pass.report.seeded, ratified: [], open: [], llmCalls: 4, budgetSpent: 4 },
    },
  }))
  expect(foldArms(preLedger).stdout.split("\n")[0]).toBe("genesis: seeded 4 candidate fact(s) [reported-id union; staging identity unavailable]; ratified 0")
  expect(foldArms([arms[0]!])).toEqual(foldVerdict(arms[0]!.pass))
})

it("the controller snapshots settled map keys and two claims at one place remain one durable row", () => {
  const mine = freshMine()
  const ports = buildControllerDeps(mine.dir, { ...depsOf({ store: mine.store }), env: {} })
  const cand = { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 }
  const first = factFor(cand, "cache reads update recency")
  const second = factFor(cand, "cache misses leave recency unchanged")
  const before = ports.stagedNodeKeys()
  ports.upsert([first])
  const afterFirst = ports.stagedNodeKeys()
  ports.upsert([second, first])

  const durable = readStaging(createDiskStore(mine.cas))
  expect(before).toEqual([]) // Accessors return snapshots, not a mutable view of the map.
  expect(afterFirst).toEqual([...durable.current.keys()])
  expect(ports.stagedNodeKeys()).toEqual(afterFirst)
  expect(ports.stagedNodeKeys()).not.toContain(String(first.id))
  expect(durable.current.size).toBe(1)
  expect([...durable.current.values()][0]).toMatchObject({
    claims: ["cache reads update recency", "cache misses leave recency unchanged"],
  })
})
