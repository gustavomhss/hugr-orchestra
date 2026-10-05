// @atlas/adapter-io — test/wire-retrieval-freshness.test.ts  (N2 bobby-fix: --by dependency is PER-QUERY fresh)
//
// The staleness teeth. The pre-fix code built the retrieval read model ONCE at `composeRuntime` startup and
// froze it, so on a long-lived handler an in-session store change was reflected by `--by scope` (which
// rehydrates per query) but NOT by `--by dependency` (frozen snapshot) — a shipped divergence. This test
// assembles ONE handler, queries `--by dependency` BEFORE any fact exists (empty), then writes a fact to the
// SAME durable store the handler reads, and queries `--by dependency` AGAIN through the SAME handler — the new
// fact MUST appear. RED with the frozen snapshot (the second query still sees empty); GREEN with the
// per-query rebuild. The dependency edge is the fix-scip corpus (`src/app.ts` → `src/util.ts`).

import { describe, it, expect, afterEach } from "vitest"
import { build } from "@atlas/index"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { StoreProjection, WriteRequest } from "@atlas/knowledge"
import type { TruthGate, T0Heuristic } from "@atlas/tools"
import type { ReconcileApi, GroundedFact } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { walkFileTree } from "../src/fs.js"
import { readScip } from "../src/scip.js"
import { assembleHandler } from "../src/wire.js"
import type { WireConfig, WireSeams } from "../src/wire.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

const seams: WireSeams = {
  heuristic: { isCandidate: () => false } as T0Heuristic,
  gate: { gateHolds: () => "NA" } as TruthGate,
  classifier: { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) } as ReconcileApi,
  driftFacts: [] as readonly GroundedFact[],
  resolveAnchorAt: () => undefined,
}

/** Persist one advisory fact durably into `store` (CAS bytes + projection route via the REAL upsert). */
function emit(
  store: DiskStore,
  proj: StoreProjection,
  body: string,
  req: Omit<WriteRequest, "contentHash">,
): StoreProjection {
  const contentHash = store.put({ kind: "advisory", tier: "T1", freshness: "FRESH", body }) as string
  return upsert(proj, { ...req, contentHash }).store
}

/** The rendered pack invariants of a `--by dependency` query verdict. */
function invNodeIds(v: { data?: unknown }): string[] {
  const data = v.data as { pack?: { invariants?: { nodeId: string }[] } } | undefined
  return (data?.pack?.invariants ?? []).map((i) => i.nodeId)
}

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

describe("assembleHandler — `--by dependency` is rebuilt PER QUERY (freshness parity with scope)", () => {
  it("an in-session write to the SAME store is reflected by a later --by dependency query (frozen-snapshot teeth)", () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    const casPath = `${repo.repoPath}/.atlas-cas`

    // The structural axes carry the fix-scip edge `src/app.ts` → `src/util.ts` (a resolved depends-on edge),
    // so reverseClosure(util) = {app}: a fact anchored at src/app.ts is dependency-reachable from src/util.ts.
    const axes = build(walkFileTree(repo.repoPath), readScip(scip.scipPath))
    const cfg: WireConfig = { repoPath: repo.repoPath, casPath, scipPath: scip.scipPath, seams, axes }

    // Seed ONE fact anchored at src/util.ts — the query anchor (a blast-radius key exists only for a path that
    // itself carries a fact). It has NO dependents yet.
    const store = createDiskStore(casPath)
    let proj = emit(store, emptyStore(), "util", {
      nodeKey: "k:util",
      family: "advisory",
      claimNorm: "util base",
      primaryAnchor: "src/util.ts",
      slot: "invariant",
    })
    store.persistProjection(proj)

    const handler = assembleHandler(cfg) // assembled ONCE — the long-lived process shape (the snapshot moment).

    // BEFORE — util has a fact but NO dependent fact yet ⇒ the dependency pack is empty.
    const before = handler.handle("atlas-query", { scope: "src/util.ts", by: "dependency" })
    expect(before.ok).toBe(true)
    expect(invNodeIds(before)).toEqual([])

    // IN-SESSION WRITE — persist a DEPENDENT fact (anchored at src/app.ts, which depends on util) into the SAME
    // durable store the handler reads, AFTER the handler was assembled.
    proj = emit(store, proj, "app", {
      nodeKey: "k:app",
      family: "advisory",
      claimNorm: "app fact",
      primaryAnchor: "src/app.ts",
      slot: "invariant",
    })
    store.persistProjection(proj)

    // AFTER — the SAME assembled handler now surfaces the freshly-written dependent in --by dependency.
    // TEETH: with the frozen startup snapshot (model built at assemble time, before this write), this second
    // query would STILL be empty — the per-query rebuild is what makes it appear.
    const after = handler.handle("atlas-query", { scope: "src/util.ts", by: "dependency" })
    expect(after.ok).toBe(true)
    expect(invNodeIds(after)).toEqual(["k:app"])
  })
})
