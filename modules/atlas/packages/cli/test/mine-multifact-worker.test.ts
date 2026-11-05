import { expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { asSubtreeHash } from "@atlas/kernel"
import { runExtract } from "@atlas/genesis"
import type { Candidate, SeedProposal } from "@atlas/genesis"
import { ZERO_SIGNALS, factFor } from "./mine-fixtures.js"
it("compiled workers parse two block claims and carry both through parent admission without another command", async () => {
  // Like script/atlas-genesis/adapter-probe.mjs: real compiled worker/adapter; missing builds fail, only the parent gate is injected.
  const entry = new URL("../dist/src/mine-pool.js", import.meta.url).href
  const { createProposerPool, makeVisitAll, proposerPoolAvailable } = await import(/* @vite-ignore */ entry) as typeof import("../src/mine-pool.js")
  expect(proposerPoolAvailable()).toBe(true)
  const dir = mkdtempSync(join(tmpdir(), "atlas-multifact-worker-"))
  const repo = join(dir, "repo")
  mkdirSync(repo)
  const claims = [
    { claim: "reads touch recency", slot: "gotcha", derivation: "the successful branch calls touch before returning" },
    { claim: "misses preserve recency", slot: "gotcha", derivation: "the missing-key branch returns before touch" },
  ]
  const response = `\`\`\`atlas-fact\n${JSON.stringify({ facts: claims })}\n\`\`\``
  const log = join(dir, "calls.log")
  const command = join(dir, "model.mjs")
  writeFileSync(command, `import { appendFileSync, readFileSync } from "node:fs"; readFileSync(0); appendFileSync(${JSON.stringify(log)}, "call\\n"); console.log(${JSON.stringify(response)})`)
  const config = join(dir, "model.json") // Operator config outside the analyzed repository, not repo-controlled config.
  writeFileSync(config, JSON.stringify({ roles: { propose: { cmd: process.execPath, args: [command] } }, timeoutMs: 1000 }))
  const cands: readonly Candidate[] = [0, 1].map((rank) => {
    const path = `cache${rank}.ts`
    writeFileSync(join(repo, path), "export function read(cache, key) { const value = cache.get(key); if (!value) return; cache.touch(key); return value }\n")
    return { site: { kind: "file", qualifiedPath: path, subtreeHash: asSubtreeHash(path) }, rank, ppr: 1, signals: ZERO_SIGNALS }
  })
  const pool = createProposerPool(repo, { ATLAS_MODEL_CONFIG: config, HOME: dir, XDG_CONFIG_HOME: dir }, "semantic", 2)
  const gated: SeedProposal[] = []
  try {
    const attempts = makeVisitAll(pool, (cand, proposer) => runExtract([cand], { ceiling: 1 }, { proposer, gate: {
      emit: (seed, local) => {
        expect(local).toBe(cand)
        expect(seed.cand).toBe(cand)
        expect(seed).toMatchObject({ kind: "predicate", ...claims[gated.length % 2]! })
        gated.push(seed)
        return { emitted: true, fact: factFor(local, seed.claim) }
      },
    } }))(cands)
    expect(attempts).toEqual(cands.map((cand) => ({ ok: true, value: { facts: claims.map((item) => factFor(cand, item.claim)), abstained: [] } })))
    expect(gated.map((seed) => seed.cand)).toEqual([cands[0], cands[0], cands[1], cands[1]])
    expect(gated[0]!.rawAnswer).toEqual(expect.any(String))
    expect(new Set(gated.map((seed) => seed.rawAnswer)).size).toBe(1)
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["call", "call"])
  } finally {
    pool.close()
    rmSync(dir, { recursive: true, force: true })
  }
}, 60_000)
