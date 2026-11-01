// @atlas/cli — test/mine-pool-slot.test.ts  (genesis-hardening A1 — each mining arm's pool workers run THAT arm)
//
// `runMineArms` drives one pass per arm with `deps.slot`; the in-thread proposer honours it, but the pool's
// workers rebuilt their proposer from `(repoPath, env)` alone, so `resolveMineSlot(env)` put every arm's
// workers on the ADVISORY proposer. The slot now rides `workerData` into `WorkerContext` and on to
// `resolveProposer`'s override.
//
// THE SEAM, AND WHAT IT DOES NOT COVER. The pool only starts from compiled `dist/` (a worker loads a FILE —
// `proposerPoolAvailable`, mine-pool.ts), and this suite runs from source, so no real `Worker` is started
// here. The test takes the context the pool hands a worker, puts it through `structuredClone` (the same
// algorithm `workerData` crosses the thread boundary with) and resolves it with the worker's own
// `resolveWorkerProposer`. A real `dist/mine-worker.js` thread, and `createProposerPool` putting `slot` into
// `workerData`, are NOT exercised.

import { describe, it, expect, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"

import { resolveProposer, resolveWorkerProposer, MINE_SLOT_ENV } from "../src/mine-proposer.js"
import type { MineSlot } from "../src/mine-proposer.js"

const scratch: string[] = []
afterAll(() => {
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

const HASH = "scip-typescript npm @atlas/lib 0.0.0 src/`lib.ts`/Hash#"
const CHARGE = "scip-typescript npm @atlas/lib 0.0.0 src/`sink.ts`/charge()."

/** consumer.ts references Hash (defined in lib.ts) ⇒ provable for `dependency`; lib.ts has an external caller
 *  ⇒ provable for `count`; sink.ts is neither. The two sound arms therefore disagree on consumer.ts / lib.ts,
 *  which is what lets the test tell WHICH arm a worker resolved. */
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "atlas-pool-slot-repo-"))
  scratch.push(repo)
  mkdirSync(join(repo, ".atlas"), { recursive: true })
  const occ = (symbol: string, def: boolean) =>
    create(OccurrenceSchema, { symbol, symbolRoles: def ? SymbolRole.Definition : 0 })
  const index = create(IndexSchema, {
    metadata: create(MetadataSchema, { toolInfo: create(ToolInfoSchema, { name: "scip-typescript" }) }),
    documents: [
      create(DocumentSchema, { relativePath: "src/lib.ts", occurrences: [occ(HASH, true)] }),
      create(DocumentSchema, { relativePath: "src/consumer.ts", occurrences: [occ(HASH, false)] }),
      create(DocumentSchema, { relativePath: "src/sink.ts", occurrences: [occ(CHARGE, true)] }),
    ],
  })
  writeFileSync(join(repo, ".atlas", "index.scip"), serializeSCIP(index))
  return repo
}

/** A wired operator config outside the repo, so the WIRED path (template + provableFirst) is resolved. */
function wiredEnv(slot?: string): NodeJS.ProcessEnv {
  const cfgDir = mkdtempSync(join(tmpdir(), "atlas-pool-slot-cfg-"))
  scratch.push(cfgDir)
  const cfg = join(cfgDir, "model.json")
  writeFileSync(cfg, JSON.stringify({ roles: { propose: { cmd: "echo", args: [] } } }))
  return { ATLAS_MODEL_CONFIG: cfg, ...(slot !== undefined ? { [MINE_SLOT_ENV]: slot } : {}) }
}

const site = (path: string): StructRef => ({
  kind: "file",
  qualifiedPath: path,
  subtreeHash: asSubtreeHash(`st-${path}`),
})

/** What a worker resolves: the pool's context after the thread-boundary clone. */
const acrossBoundary = (repoPath: string, env: NodeJS.ProcessEnv, slot?: MineSlot) =>
  resolveWorkerProposer(structuredClone({ repoPath, env, ...(slot !== undefined ? { slot } : {}) }))

describe("genesis-hardening A1 — the arm crosses into the proposer worker", () => {
  it("slot `dependency` wins over an advisory env: the worker builds the dependency arm", () => {
    const repo = makeRepo()
    const env = wiredEnv("advisory")
    const worker = acrossBoundary(repo, env, "dependency")
    expect(worker.provableFirst).toBeTypeOf("function")
    expect(worker.provableFirst!(site("src/consumer.ts"))).toBe(true)
    expect(worker.provableFirst!(site("src/lib.ts"))).toBe(false)
    // Same template the in-thread path selects for this arm, and not the advisory one.
    expect(worker.promptDigest).toBe(resolveProposer(repo, env, "dependency").promptDigest)
    expect(worker.promptDigest).not.toBe(resolveProposer(repo, env).promptDigest)
  })

  it("slot `count` wins over an advisory env: the worker builds the count arm", () => {
    const repo = makeRepo()
    const env = wiredEnv("advisory")
    const worker = acrossBoundary(repo, env, "count")
    expect(worker.provableFirst).toBeTypeOf("function")
    expect(worker.provableFirst!(site("src/lib.ts"))).toBe(true)
    expect(worker.provableFirst!(site("src/consumer.ts"))).toBe(false)
    expect(worker.promptDigest).toBe(resolveProposer(repo, env, "count").promptDigest)
    expect(worker.promptDigest).not.toBe(resolveProposer(repo, env).promptDigest)
  })

  it("slot `dependency` wins over a count env (the override, not the env, picks the arm)", () => {
    const repo = makeRepo()
    const worker = acrossBoundary(repo, wiredEnv("count"), "dependency")
    expect(worker.provableFirst!(site("src/consumer.ts"))).toBe(true)
    expect(worker.provableFirst!(site("src/lib.ts"))).toBe(false)
  })

  it("absent slot ⇒ the worker resolves the arm from env, as the in-thread path does", () => {
    const repo = makeRepo()
    const fromEnv = acrossBoundary(repo, wiredEnv("count"))
    expect(fromEnv.provableFirst!(site("src/lib.ts"))).toBe(true)
    const advisory = acrossBoundary(repo, wiredEnv())
    expect(advisory.provableFirst).toBeUndefined()
  })
})
