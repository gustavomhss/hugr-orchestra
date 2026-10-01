// @atlas/adapter-io — test/wire-precomputed-parity.test.ts   (DEDUP-COMPOSITION #241 — the divergence guard)
//
// `WireConfig` (wire.ts) now carries OPTIONAL precomputed artifacts (`rawTree`/`fileTree`/`scipOutput`/
// `indexerName`/`symbolReverse`/`targetEscapes`/`dynamicReach`) so `composeRuntime` (compose.ts) can hand
// `assembleHandler` the SAME objects it already built, instead of forcing a second independent rebuild of
// each one from `repoPath`/`scipPath`. Two code paths now exist inside `assembleHandler` for every one of
// those fields — "use what was supplied" vs "build it here" — and the risk two-paths-for-one-question
// always carries in this repo (N10, task #186) is that they silently diverge.
//
// This suite is the guard: it builds a handler TWO ways over the identical fixture repo — (A) the bare
// WIRE path (every optional field OMITTED, `assembleHandler` builds everything itself, exactly as it did
// before #241) and (B) EVERY field precomputed using `composeRuntime`'s OWN recipe (the exact sequence
// compose.ts runs: `walkFileTree` → `foldAstUnits` → `readScipOrEmpty` → `readScipIndexerName` → `build` →
// `createSymbolReverse` → `buildTargetEscapes`/`buildDynamicReach`) — and asserts the two handlers answer
// every read leg IDENTICALLY. If a future edit changes how `assembleHandler` DERIVES one of these fields
// internally without updating `composeRuntime`'s construction to match (or vice versa), this test is the
// one that goes red — see the `WireConfig` doc block in wire.ts for the coherence obligation this pins.

import { describe, it, expect, afterEach } from "vitest"
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { build, createSymbolReverse } from "@atlas/index"
import type { ReconcileApi, GroundedFact } from "@atlas/knowledge"
import type { TruthGate, T0Heuristic } from "@atlas/tools"
import { GOVERNANCE_SURFACE } from "@atlas/tools"
import type { Tool } from "@atlas/tools"
import { assembleHandler } from "../src/wire.js"
import type { WireConfig, WireSeams } from "../src/wire.js"
import { walkFileTree } from "../src/fs.js"
import { foldAstUnits } from "../src/ast.js"
import { readScipOrEmpty, readScipIndexerName } from "../src/scip.js"
import { buildTargetEscapes } from "../src/escape/target-escapes.js"
import { buildDynamicReach } from "../src/escape/dynamic-reach.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

// ── stubbed seams, byte-identical for both builds (behavior of THESE is out of scope; see wire-scip-guard.test.ts) ──
const seams: WireSeams = {
  heuristic: { isCandidate: () => false } satisfies T0Heuristic,
  gate: { gateHolds: () => "NA" } satisfies TruthGate,
  classifier: {
    reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }),
  } satisfies ReconcileApi,
  driftFacts: [] as readonly GroundedFact[],
  resolveAnchorAt: () => undefined,
}

let repo: ReturnType<typeof makeFixRepo> | undefined
let scip: ReturnType<typeof makeFixScip> | undefined
afterEach(() => {
  scip?.cleanup()
  repo?.cleanup()
  scip = undefined
  repo = undefined
})

/** Every leg's rejected-or-not verdict, keyed by tool — a stable, order-independent comparison shape. */
function legShapes(handler: ReturnType<typeof assembleHandler>, args: Record<string, unknown>) {
  return Object.fromEntries(
    GOVERNANCE_SURFACE.map((tool) => {
      const v = handler.handle(tool as Tool, args[tool as string] ?? {})
      return [tool, { ok: v.ok, rejected: v.rejected }]
    }),
  )
}

describe("assembleHandler — precomputed vs bare-rebuilt WireConfig answer IDENTICALLY (DEDUP-COMPOSITION #241)", () => {
  it("SCN-PARITY-1 — query + init + reconcile leg shapes match, both builds over the SAME repo", () => {
    repo = makeFixRepo()
    scip = makeFixScip()
    const atlasDir = join(repo.repoPath, ".atlas")
    mkdirSync(atlasDir, { recursive: true })
    const scipPath = join(atlasDir, "index.scip")
    copyFileSync(scip.scipPath, scipPath)

    const baseConfig: WireConfig = {
      repoPath: repo.repoPath,
      casPath: `${repo.repoPath}/.atlas-cas-bare`,
      scipPath,
      seams,
    }
    const bare = assembleHandler(baseConfig)

    // (B) — composeRuntime's OWN recipe, precomputed here and threaded, exactly as compose.ts does.
    const rawTree = walkFileTree(repo.repoPath)
    const fileTree = foldAstUnits(rawTree)
    const scipOutput = readScipOrEmpty(scipPath)
    const indexerName = readScipIndexerName(scipPath)
    const axes = build(fileTree, scipOutput)
    const symbolReverse = createSymbolReverse(scipOutput, { indexerName })
    const targetEscapes = buildTargetEscapes({ scipPath, repoPath: repo.repoPath })
    const dynamicReach = buildDynamicReach(rawTree)

    const precomputedConfig: WireConfig = {
      repoPath: repo.repoPath,
      casPath: `${repo.repoPath}/.atlas-cas-precomputed`,
      scipPath,
      seams,
      axes,
      rawTree,
      fileTree,
      scipOutput,
      symbolReverse,
      ...(indexerName !== undefined ? { indexerName } : {}),
      ...(targetEscapes !== undefined ? { targetEscapes } : {}),
      ...(dynamicReach !== undefined ? { dynamicReach } : {}),
    }
    const precomputed = assembleHandler(precomputedConfig)

    // NON-VACUITY: the precomputed build really did carry real artifacts (axes has real edges from the
    // fixture's greet()/missingHelper() SCIP occurrences — an empty-axes precomputed build would prove
    // nothing about coherence).
    expect(axes.edges.length).toBeGreaterThan(0)

    const initArgs = { "atlas-init": { path: "." } }
    const queryArgs = { "atlas-query": { scope: "src" } }
    const reconcileArgs = { "atlas-reconcile": { mergeBase: "deadbeef" } }

    expect(legShapes(bare, initArgs)).toStrictEqual(legShapes(precomputed, initArgs))
    expect(legShapes(bare, queryArgs)).toStrictEqual(legShapes(precomputed, queryArgs))
    expect(legShapes(bare, reconcileArgs)).toStrictEqual(legShapes(precomputed, reconcileArgs))

    // The query PACK payload itself — not just ok/rejected — for the leg the precomputed axes/fileTree
    // actually feed (territory resolution over the SAME fixture tree).
    const bareQuery = bare.handle("atlas-query" as Tool, { scope: "src" })
    const precomputedQuery = precomputed.handle("atlas-query" as Tool, { scope: "src" })
    expect(bareQuery.ok).toBe(true)
    expect(precomputedQuery.ok).toBe(true)
    expect(precomputedQuery.data).toStrictEqual(bareQuery.data)

    const bareInit = bare.handle("atlas-init" as Tool, { path: "." })
    const precomputedInit = precomputed.handle("atlas-init" as Tool, { path: "." })
    expect(bareInit.ok).toBe(true)
    expect(precomputedInit.ok).toBe(true)
    expect(precomputedInit.data).toStrictEqual(bareInit.data)
  })
})

// ── the MUTATION actually performed, recorded rather than embedded ────────────────────────────────────────
//
// To confirm this test is not vacuous, `wire.ts`'s `buildAxes` was manually mutated to IGNORE its precomputed
// `config.axes` on the bare-fallback code path too (`config.axes ?? build({path:'.',children:[]},
// {documents:[]})` instead of `config.axes ?? build(t, s)` — i.e. "wire.ts's own internal recipe silently
// drifted from what compose.ts computes"), and this file re-run:
//   SCN-PARITY-1 → RED: the `atlas-query` leg diverged — `bare` returned `rejected: "cover: no covering
//   territory for scope src"` (built over an artificially-empty tree) while `precomputed` still returned
//   `ok: true` (fed the real fixture's `config.axes`) — exactly the silent divergence this guard exists to
//   catch. The mutation was reverted immediately after, and `npm run build` + this file were re-run GREEN
//   before anything else landed.
