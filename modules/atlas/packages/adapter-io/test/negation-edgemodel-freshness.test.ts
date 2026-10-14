// @atlas/adapter-io — test/negation-edgemodel-freshness.test.ts  (#99b N4 · billy F1 — THE edgeModel TEETH)
//
// THE PROOF the dormant honesty guard is now LIVE. Before N4, `edgeModel` was stamped on an admitted negation
// at emit but READ NOWHERE: a negation admitted under edge-model E1 stayed FRESH forever, because an extractor
// upgrade E1→E2 changes NO file bytes, so `driftDetect` (which only sees the scope-directory subtreeHash) never
// drifts it — even when E2 newly resolves a caller of X. N4 wires the §3 clause-4 conjunct into the ONE
// family-aware freshness oracle (`bindFreshnessOracle`, wire.ts), threaded into the negation read leg.
//
// The teeth: a negation admitted under `edgeModel='E1'` reads FRESH while the current edge model is E1, and
// DRIFTED once it is E2 — with NO byte change in the scope (the scope-directory hash is IDENTICAL across both
// reads). The mutant this KILLS: drop the `edgeModel === currentEdgeModel` conjunct and the E2 read falsely
// returns FRESH (the negation would silently claim to still hold under an extractor that can now see the caller).
//
// It emits through the REAL composed door (real DiskStore, real gates) so the `edgeModel` on the stored fact is
// the one the door stamped, and reads through the REAL `createNegationLeg` — the shipped path, not a model.

import { describe, it, expect, afterEach } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { NegationNode, RelationKind } from "@atlas/knowledge"
import type { Axes, Axis, IndexNode, SymbolReverseApi } from "@atlas/index"
import type { Hash, Tier } from "@atlas/contracts"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createNegationLeg } from "../src/negation-source.js"
import { bindFreshnessOracle } from "../src/wire.js"
import { HOLDS, freshWorkspace, policyOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

const S = "src/pay"
const TARGET = "scip:X#" // a GLOBAL SCIP symbol (not `local `)
const KIND: RelationKind = "calls"
const E1 = "ts@0.4.0" // the edge model at emit
const E2 = "ts@0.5.0" // a later extractor release — changes no file bytes, but could newly resolve a caller

// nodeHashOfPath = IDENTITY (as in negation-door.test): a path's docHash IS the path.
const nodeHashOfPath = (p: string): Hash => p as unknown as Hash

const inode = (key: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial" as Axis,
  level: "file",
  key,
  subtreeHash: asSubtreeHash("sh-" + key),
  children,
  objects: [],
})

/** Fake axes carrying the scope directory `src/pay` with two files — so `resolveCurrent(axes,'src/pay')`
 *  returns the real folded hash `sh-src/pay` and the negation grounds + re-derives FRESH against it. */
function axesWithScope(): Axes {
  const spatial = inode(".", [inode(S, [inode("src/pay/a.ts"), inode("src/pay/b.ts")]), inode("src/other.ts")])
  const empty = inode(".")
  return { spatial, territory: empty, dependency: empty, edges: [] }
}

/** Fake axes where the scope directory's fold has MOVED (a file entered/left) — the driftDetect leg drifts. */
function axesDrifted(): Axes {
  const dir: IndexNode = {
    axis: "spatial" as Axis,
    level: "file",
    key: S,
    subtreeHash: asSubtreeHash("sh-MOVED-" + S),
    children: [inode("src/pay/a.ts")],
    objects: [],
  }
  const spatial = inode(".", [dir])
  const empty = inode(".")
  return { spatial, territory: empty, dependency: empty, edges: [] }
}

// `resolves: () => true`: TARGET is a real, in-index-defined symbol that simply has no callers — the genuine
// closed-empty scoped-negative this suite ADMITS (#220 gate 1c0 passes; the defect it guards is a phantom target).
const emptyFeed: SymbolReverseApi = {
  reverseCallers: () => [],
  holeSources: () => [],
  opaqueRefSources: () => [],
  resolves: () => true,
  definesAt: () => "src/x.ts" as unknown as Hash,
}

function negation(): NegationNode {
  return {
    kind: "negation",
    id: "ignored" as unknown as NegationNode["id"],
    tier: "T2" as Tier,
    relationKind: KIND,
    target: TARGET,
    scope: S,
    grounding: { entries: [] },
    edgeModel: "ignored",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  } as unknown as NegationNode
}

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** Admit a closed-empty negation through the REAL door under `edgeModel`, returning the workspace. */
function admitUnder(edgeModel: string): Workspace {
  ws = freshWorkspace()
  const out = createGovernedEmit({
    store: ws.store,
    gate: HOLDS,
    policy: policyOf({ [S]: ["bob"] }),
    actor: "bob",
    ratifyToken: "billy",
    symbolReverse: () => emptyFeed,
    axes: axesWithScope(),
    nodeHashOfPath,
    edgeModel,
  }).emit(negation(), NaN as unknown as Hash)
  expect(out.emitted).toBe(true) // the closed-empty case ADMITS
  return ws
}

describe("#99b N4 — the edgeModel completeness conjunct is LIVE on the negation read surface", () => {
  it("THE TEETH: a negation admitted under E1 reads FRESH under E1 but DRIFTED under E2 — no byte change in S", () => {
    const w = admitUnder(E1)

    // Read with the current edge model STILL E1 (the door stamped E1) and the SAME axes it grounded on: FRESH.
    const underE1 = createNegationLeg(w.store, bindFreshnessOracle(axesWithScope(), E1))(S)
    expect(underE1.negations).toHaveLength(1)
    expect(underE1.negations[0]!.freshness).toBe("FRESH")

    // Read with the current edge model bumped to E2 — the scope-directory hash is IDENTICAL (same axes, no
    // byte change), so `driftDetect` alone stays FRESH. The §3 clause-4 conjunct is what flips it to DRIFTED.
    // MUTANT: drop `edgeModel === currentEdgeModel` from `bindFreshnessOracle` and this reads FRESH (a lie).
    const underE2 = createNegationLeg(w.store, bindFreshnessOracle(axesWithScope(), E2))(S)
    expect(underE2.negations).toHaveLength(1)
    expect(underE2.negations[0]!.freshness).toBe("DRIFTED") // the dormant guard fired
  })

  it("the driftDetect leg is UNCHANGED: a moved scope-directory hash reads DRIFTED even at the SAME edge model", () => {
    const w = admitUnder(E1)
    // Same edge model E1, but the scope directory's fold MOVED (a file entered/left S). driftDetect drifts.
    const drifted = createNegationLeg(w.store, bindFreshnessOracle(axesDrifted(), E1))(S)
    expect(drifted.negations[0]!.freshness).toBe("DRIFTED")
  })

  it("BOTH conjuncts required for FRESH: a matching edge model over a drifted scope is still DRIFTED", () => {
    const w = admitUnder(E1)
    const both = createNegationLeg(w.store, bindFreshnessOracle(axesDrifted(), E2))(S)
    expect(both.negations[0]!.freshness).toBe("DRIFTED")
  })

  it('ABSENT oracle (bare-WIRE) ⇒ DRIFTED, fail-closed — never a silent "always fresh"', () => {
    const w = admitUnder(E1)
    const bare = createNegationLeg(w.store)(S) // no oracle threaded
    expect(bare.negations[0]!.freshness).toBe("DRIFTED")
  })
})
