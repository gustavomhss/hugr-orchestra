// @atlas/adapter-io — test/wire-query-envelope.test.ts   (WIRE-LOOP Seam-3: subsumes into query data)
//
// The FIRST production call site of `deriveSubsumes` (it had ZERO callers — GAP-A). The assembled query leg
// now carries `Verdict.data = { pack, subsumes }`: a module-grained fact and a function-grained fact sharing
// an exact claim, slot and family, at nested `::`-anchors, yield the `broader ⊃ narrower` coverage edge IN
// the query result. The store is populated via the REAL knowledge `upsert` + `put`, then the handler is
// assembled over the SAME casPath — so the query reads back the very facts a governed emit would persist.

import { describe, it, expect, afterEach } from "vitest"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { StoreProjection, WriteRequest } from "@atlas/knowledge"
// `QueryEnvelope` is the REAL envelope type. It replaces two hand-written structural re-declarations that
// had drifted from it: both spelled `invariants`/`subsumes` as MUTABLE arrays where the envelope declares
// them `readonly`, and one narrowed `PackInvariant` to `{ nodeId: string }`. A cast to a stale hand-copy of
// a type is not evidence about that type.
import type { TruthGate, T0Heuristic, QueryEnvelope } from "@atlas/tools"
import type { ReconcileApi, GroundedFact } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
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

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

/** Emit one advisory fact durably into `store` (CAS bytes + projection route via the REAL upsert). */
function emit(
  store: DiskStore,
  proj: StoreProjection,
  body: string,
  req: Omit<WriteRequest, "contentHash">,
): StoreProjection {
  const contentHash = store.put({ kind: "advisory", tier: "T1", freshness: "FRESH", body }) as string
  return upsert(proj, { ...req, contentHash }).store
}

describe("assembleHandler — Seam-3 the query Verdict.data carries derived subsumes", () => {
  it('module + function sharing an exact claim → the subsumes edge appears in query data (kills the "deriveSubsumes never called" mutant)', () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    const casPath = `${repo.repoPath}/.atlas-cas`

    // ARRANGE — populate the durable store the assembled handler will read back over.
    const store = createDiskStore(casPath)
    let proj = emptyStore()
    proj = emit(store, proj, "mod", {
      nodeKey: "k:mod",
      family: "advisory",
      claimNorm: "io path is covered",
      primaryAnchor: "src::mod",
      slot: "invariant",
    })
    proj = emit(store, proj, "fn", {
      nodeKey: "k:fn",
      family: "advisory",
      claimNorm: "io path is covered",
      primaryAnchor: "src::mod::fn",
      slot: "invariant",
    })
    store.persistProjection(proj)

    const cfg: WireConfig = { repoPath: repo.repoPath, casPath, scipPath: scip.scipPath, seams }
    const handler = assembleHandler(cfg)

    // ACT
    const v = handler.handle("atlas-query", { scope: "src" })
    expect(v.ok).toBe(true)
    const data = v.data as QueryEnvelope

    // ASSERT — both facts appear in the pack (Seam-1) AND the coverage edge is derived (Seam-3).
    expect(data.pack.invariants.map((i) => i.nodeId).sort()).toEqual(["k:fn", "k:mod"])
    // TEETH: `deriveSubsumes` had ZERO prod callers — a mutant that never wires it yields `subsumes: []`.
    expect(data.subsumes).toEqual([{ broader: "k:mod", narrower: "k:fn" }])
  })

  it("subsumes is filtered to under-scope nodes — an out-of-scope pair yields no edge in the pack scope", () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    const casPath = `${repo.repoPath}/.atlas-cas`

    const store = createDiskStore(casPath)
    let proj = emptyStore()
    // a module/function pair anchored under `api`, NOT under `src` — deriveSubsumes still relates them,
    // but the `src`-scoped query must NOT surface an edge whose nodes lie outside the covering scope.
    proj = emit(store, proj, "amod", {
      nodeKey: "k:amod",
      family: "advisory",
      claimNorm: "compute is covered",
      primaryAnchor: "api::svc",
      slot: "invariant",
    })
    proj = emit(store, proj, "afn", {
      nodeKey: "k:afn",
      family: "advisory",
      claimNorm: "compute is covered",
      primaryAnchor: "api::svc::compute",
      slot: "invariant",
    })
    store.persistProjection(proj)

    const cfg: WireConfig = { repoPath: repo.repoPath, casPath, scipPath: scip.scipPath, seams }
    const v = assembleHandler(cfg).handle("atlas-query", { scope: "src" })
    const data = v.data as QueryEnvelope
    // TEETH: dropping the under-scope filter would leak the api-anchored edge into the src-scoped result.
    expect(data.subsumes).toEqual([])
    expect(data.pack.invariants).toEqual([])
  })
})
