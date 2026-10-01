// @atlas/adapter-io — test/scip.test.ts   (WP-9.1.1-b.SCIP — EPIC-1-b, REQ-ADAPTER-2, ADAPT-SCIP-1)
//
// Acceptance suite for the faithful SCIP reader `readScip` (ADAPT-SCIP-1). It transcribes the three
// frozen goldens (docs/requirements/goldens-adapters.md) against the SHARED fix-scip harness
// (test/harness/fix-scip.ts — CONSUMED, never redefined):
//   • SCN-ADAPTER-2a-1 — the projection equals the oracle: exactly the 3 recorded occurrences  (happy)
//   • SCN-ADAPTER-2b-1 — SYM_MISSING is only a reference, no fabricated definition anywhere    (guard)
//   • SCN-ADAPTER-2c-1 — no synthesized cross-file edge (no compute()/service.py occurrence)   (guard)

import { describe, it, expect, afterEach } from "vitest"
import type { ScipOutput, ScipOccurrence, IndexNode } from "@atlas/index"
import { build } from "@atlas/index"
import { id } from "@atlas/kernel"
import { readScip, planIndexers, mergeScip } from "../src/scip.js"
import { makeFixScip, expectedScipOutput, SYM_GREET, SYM_MISSING } from "./harness/fix-scip.js"
import type { FixScip } from "./harness/fix-scip.js"
import { makeFixScipPy, SYM_COMPUTE } from "./harness/fix-scip-py.js"
import type { FixScipPy } from "./harness/fix-scip-py.js"
import { T_ref } from "./harness/fix-repo.js"

let fx: FixScip | undefined
afterEach(() => {
  fx?.cleanup()
  fx = undefined
})

/** Flatten every occurrence across all documents — for presence/absence assertions. */
function allOccurrences(out: ScipOutput): ScipOccurrence[] {
  return out.documents.flatMap((d) => d.occurrences)
}

/** The build's per-document node hash (build.ts:42 `docHash = id({ file: relativePath })`) — recomputed
 *  here so an edge's `from`/`to` can be pinned to a concrete file without re-deriving it. */
const fileHash = (relativePath: string): string => String(id({ file: relativePath }))

/** Depth-first search for the spatial node whose `key` equals `path` (spatial keys ARE the tree paths). */
function findSpatialNode(node: IndexNode, path: string): IndexNode | undefined {
  if (node.key === path) return node
  for (const c of node.children) {
    const hit = findSpatialNode(c, path)
    if (hit) return hit
  }
  return undefined
}

describe("readScip — faithful SCIP projection (ADAPT-SCIP-1)", () => {
  it("SCN-ADAPTER-2a-1 — projects exactly the recorded occurrences, no more (happy)", () => {
    fx = makeFixScip()
    // teeth: a reader that synthesizes an extra document-level `imports` occurrence diverges here.
    expect(readScip(fx.scipPath)).toStrictEqual(expectedScipOutput)
  })

  it("SCN-ADAPTER-2b-1 — missingHelper stays a dangling reference, greet has a definition (guard)", () => {
    fx = makeFixScip()
    const occ = allOccurrences(readScip(fx.scipPath))

    const missing = occ.filter((o) => o.symbol === SYM_MISSING)
    // teeth: a reader that fabricates a definition for the dangling missingHelper breaks this.
    expect(missing.length).toBeGreaterThan(0)
    expect(missing.every((o) => o.role === "reference")).toBe(true)
    expect(occ.some((o) => o.symbol === SYM_MISSING && o.role === "definition")).toBe(false)

    // greet DOES carry a definition (so it resolves downstream).
    expect(occ.some((o) => o.symbol === SYM_GREET && o.role === "definition")).toBe(true)
  })

  it("SCN-ADAPTER-2c-1 — no synthesized cross-file compute()/service.py edge (guard)", () => {
    fx = makeFixScip()
    const out = readScip(fx.scipPath)
    const occ = allOccurrences(out)

    // teeth: a reader adding a heuristic same-name occurrence would surface a compute/service.py symbol.
    expect(occ.some((o) => o.symbol.includes("compute"))).toBe(false)
    expect(out.documents.some((d) => d.relativePath.includes("service.py"))).toBe(false)
    expect(occ.some((o) => o.symbol.includes("service.py"))).toBe(false)
  })
})

// The two per-language `.scip` fixtures the multilang SCNs merge (RECORDED, not live indexers).
let pyFx: FixScipPy | undefined
afterEach(() => {
  pyFx?.cleanup()
  pyFx = undefined
})

describe("planIndexers + mergeScip — multi-language dispatch & honest hole (ADAPT-SCIP-2)", () => {
  it("SCN-ADAPTER-3a-1 — each language runs its indexer and the outputs merge (happy)", () => {
    // ── dispatch: total + mutually-exclusive over the repo's langs ──────────────────────────────
    const plans = planIndexers(["ts", "py", "rb"])
    expect(plans).toHaveLength(3) // exactly one plan per input lang (totality + no duplication)

    const byLang = (l: string) => plans.filter((p) => p.lang === l)
    expect(byLang("ts")).toHaveLength(1)
    expect(byLang("py")).toHaveLength(1)
    expect(byLang("rb")).toHaveLength(1)
    expect(byLang("ts")[0]!.tool).toBe("scip-typescript")
    expect(byLang("py")[0]!.tool).toBe("scip-python")
    // teeth: `rb` routed to the ts indexer (not the honest-hole) fails HERE — a lang at the wrong indexer.
    expect(byLang("rb")[0]!.tool).toBe("honest-hole")
    // the stale core `MECHANISMS` mechanism must NOT leak into the live dispatch (D1: no stack-graphs).
    expect(plans.some((p) => p.tool === "stack-graphs")).toBe(false)

    // ── merge: two per-language `.scip` outputs concat, then build over the shared file tree ──────
    fx = makeFixScip()
    pyFx = makeFixScipPy()
    const merged = mergeScip([readScip(fx.scipPath), readScip(pyFx.scipPath)])
    const axes = build(T_ref, merged)

    // the ts edge `app.ts → util/greet()` is resolvable (util.ts defines greet) ⇒ a `resolved` edge.
    const tsEdge = axes.edges.some(
      (e) =>
        e.kind === "resolved" && String(e.from) === fileHash("src/app.ts") && String(e.to) === fileHash("src/util.ts"),
    )
    expect(tsEdge).toBe(true)
    // the merged documents carry the py `service.py/compute().` definition (from its own indexer).
    expect(
      merged.documents.some(
        (d) =>
          d.relativePath === "api/service.py" &&
          d.occurrences.some((o) => o.symbol === SYM_COMPUTE && o.role === "definition"),
      ),
    ).toBe(true)
  })

  it("SCN-ADAPTER-3b-1 — the un-indexed language is files-only (guard)", () => {
    fx = makeFixScip()
    pyFx = makeFixScipPy()
    const merged = mergeScip([readScip(fx.scipPath), readScip(pyFx.scipPath)])
    const axes = build(T_ref, merged)

    // `legacy/report.rb` is present as a spatial node (from the FileTree) — never dropped.
    // teeth: if `rb`'s missing indexer dropped the file, this spatial node would be absent ⇒ fail.
    const rbNode = findSpatialNode(axes.spatial, "legacy/report.rb")
    expect(rbNode).toBeDefined()
    expect(rbNode!.children).toHaveLength(0) // a leaf file node

    // …but it contributes 0 edges (an honest structural hole — no indexer saw it).
    const rbHash = fileHash("legacy/report.rb")
    expect(axes.edges.some((e) => String(e.from) === rbHash || (e.to !== null && String(e.to) === rbHash))).toBe(false)
  })

  it("SCN-ADAPTER-3c-1 — the un-indexed language corrupts no other language (guard)", () => {
    fx = makeFixScip()
    pyFx = makeFixScipPy()
    const merged = mergeScip([readScip(fx.scipPath), readScip(pyFx.scipPath)])
    const axes = build(T_ref, merged)

    // teeth: a merge that aborts on the rb hole and drops the ts edge fails BOTH assertions below.
    const tsEdge = axes.edges.some(
      (e) =>
        e.kind === "resolved" && String(e.from) === fileHash("src/app.ts") && String(e.to) === fileHash("src/util.ts"),
    )
    expect(tsEdge).toBe(true) // ts edge intact
    expect(allOccurrences(merged).some((o) => o.symbol === SYM_COMPUTE && o.role === "definition")).toBe(true) // py compute intact

    // and the greet reference/definition pair survived the cross-language merge unaltered.
    expect(allOccurrences(merged).some((o) => o.symbol === SYM_GREET && o.role === "definition")).toBe(true)
    expect(allOccurrences(merged).some((o) => o.symbol === SYM_GREET && o.role === "reference")).toBe(true)
  })
})
