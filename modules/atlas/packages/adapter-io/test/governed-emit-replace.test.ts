import { describe, it, expect, afterEach } from "vitest"
import { build } from "@atlas/index"
import { join } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { createDiskStore } from "../src/store.js"
import { walkFileTree } from "../src/fs.js"
import { readScip } from "../src/scip.js"
import { assembleHandler } from "../src/wire.js"
import type { WireConfig, WireSeams } from "../src/wire.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"
import {
  mkAdvisory,
  realKey,
  makeStoreSpy,
  HOLDS_GATE,
  POLICY,
  AT,
} from "./harness/governed-fixtures.js"
import type { T0Heuristic, TruthGate } from "@atlas/tools"
import type { GroundedFact, ReconcileApi } from "@atlas/knowledge"

const seams: WireSeams = {
  heuristic: { isCandidate: () => false } as T0Heuristic,
  gate: { gateHolds: () => "HOLDS" } as TruthGate,
  classifier: { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) } as ReconcileApi,
  driftFacts: [] as readonly GroundedFact[],
  resolveAnchorAt: () => undefined,
}

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

describe("governed-emit replace (R8)", () => {
  it("control + replace + schema + direct door", async () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
    writeFileSync(
      join(repo.repoPath, ".atlas", "policy.json"),
      JSON.stringify({ t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["alice"] } } }),
    )
    const casPath = join(repo.repoPath, ".atlas", "cas")
    const axes = build(walkFileTree(repo.repoPath), readScip(scip.scipPath))
    const cfg: WireConfig = { repoPath: repo.repoPath, casPath, scipPath: scip.scipPath, seams, axes, actor: "alice" }
    const handler = assembleHandler(cfg)

    const f1 = mkAdvisory({ id: "nk-r", anchor: "src/util.ts::greet", claimNorm: "first claim", scope: "core" })
    const f2 = mkAdvisory({ id: "nk-r", anchor: "src/util.ts::greet", claimNorm: "second claim", scope: "core" })

    const rowOf = () => createDiskStore(casPath).loadProjection()?.current.get(realKey(f1))

    // 1 CONTROL
    const r1 = handler.handle("atlas-emit", { node: f1, at: "deadbeef" })
    const r2 = handler.handle("atlas-emit", { node: f2, at: "deadbeef" })
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    expect(rowOf()!.claims).toEqual(["first claim", "second claim"])

    // 2 REPLACE (fresh repo)
    const repo2 = makeFixRepo()
    const scip2 = makeFixScip()
    const prevCleanup = cleanup
    cleanup = () => {
      prevCleanup?.()
      repo2.cleanup()
      scip2.cleanup()
    }
    mkdirSync(join(repo2.repoPath, ".atlas"), { recursive: true })
    writeFileSync(
      join(repo2.repoPath, ".atlas", "policy.json"),
      JSON.stringify({ t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["alice"] } } }),
    )
    const casPath2 = join(repo2.repoPath, ".atlas", "cas")
    const axes2 = build(walkFileTree(repo2.repoPath), readScip(scip2.scipPath))
    const cfg2: WireConfig = { repoPath: repo2.repoPath, casPath: casPath2, scipPath: scip2.scipPath, seams, axes: axes2, actor: "alice" }
    const handler2 = assembleHandler(cfg2)
    const rowOf2 = () => createDiskStore(casPath2).loadProjection()?.current.get(realKey(f1))
    handler2.handle("atlas-emit", { node: f1, at: "deadbeef" })
    const rr = handler2.handle("atlas-emit", { node: f2, at: "deadbeef", replace: true })
    expect(rr.ok).toBe(true)
    expect(rowOf2()!.claims).toEqual(["second claim"])

    // 3 SCHEMA
    const rs = handler2.handle("atlas-emit", { node: f2, at: "deadbeef", replace: "yes" })
    expect(rs.ok).toBe(false)
    expect(rowOf2()!.claims).toEqual(["second claim"])

    // 4 DIRECT DOOR
    const spy = makeStoreSpy()
    const emit = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: "alice" }).emit
    emit(f1, AT)
    emit(f2, AT, { replace: true })
    const last = spy.persists()[spy.persists().length - 1]!
    const row = last.current.get(realKey(f1))
    expect(row!.claims).toEqual(["second claim"])
  })
})
