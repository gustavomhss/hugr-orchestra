// @atlas/knowledge — test/negation-witness-drift.test.ts  (ADR-0015 D3 · #99b · §3 THE WITNESS TEETH)
//
// THE LOAD-BEARING PROOF of the negation contract's §3 encoding, run end-to-end through the REAL oracles —
// NOTHING pinned by hand:
//   - the REAL `@atlas/index` `build()` mint (the git-tree `foldNodeHash`/`rollupHash` over sorted NAMED
//     children — the directory subtreeHash IS the scope Merkle);
//   - the REAL `@atlas/grounding` `driftDetect` (rides VERBATIM — no oracle change is permitted by the
//     contract, and this test would break if one were made).
//
// The claim §3(i) asserts and this file gives TEETH to:
//   1. a DIRECTORY resolves through `resolveCurrent` (its fold is a real hash, NOT the `subtreeHash===key`
//      absent-sentinel) ⇒ a negation grounded on the scope directory reads FRESH.
//   2. INSERTING a new file into the scope directory changes its named-child set ⇒ its subtreeHash moves ⇒
//      the negation reads DRIFTED. This is exactly "a NEW caller of X entering S drifts the scope hash" —
//      the insertion-sensitivity a per-UNIT hash lacks (ADR-0015 D3), made concrete.
//
// If the directory does not resolve, or does not drift on insertion, that BREAKS §3(i) and is a lead-level
// finding — the assertions below are written to FAIL loudly in that case, never to paper over it.

import { describe, it, expect } from "vitest"
import type { StructRef, NodeKey } from "@atlas/contracts"
import { build, type Axes, type FileTree, type IndexNode, type ScipOutput } from "@atlas/index"
import { driftDetect, type Grounding } from "@atlas/grounding"
import type { NegationNode } from "@atlas/knowledge"
import { negationKey } from "../src/write/router.js"

const NO_SCIP: ScipOutput = { documents: [] }
const SCOPE = "src/pay" // the DIRECTORY key (a `:`/`%`-free path ⇒ mintKey returns it verbatim)

/** Build the real axes for a repo where the `src/pay` directory holds `files` (basename → contents). */
const axesWith = (files: Record<string, string>): Axes => {
  const tree: FileTree = {
    path: ".",
    children: [
      {
        path: "src",
        children: [
          {
            path: SCOPE,
            // a directory node carries NO content — this is what stops its file children from being read as
            // `::`-refinements and what makes its fold a BRANCH over named children (the scope Merkle).
            children: Object.entries(files).map(([name, content]) => ({
              path: `${SCOPE}/${name}`,
              content,
              children: [],
            })),
          },
        ],
      },
    ],
  }
  return build(tree, NO_SCIP)
}

const findNode = (n: IndexNode, key: string): IndexNode | undefined => {
  if (n.key === key) return n
  for (const c of n.children) {
    const hit = findNode(c, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** The scope directory NODE, read out of the real mint (its `subtreeHash` is the branded scope Merkle). */
const dirNodeOf = (axes: Axes): IndexNode => {
  const node = findNode(axes.spatial, SCOPE)
  expect(node, `the mint must produce the scope directory node ${SCOPE}`).toBeDefined()
  return node!
}
/** The scope directory's folded subtreeHash as a plain string, for value comparisons. */
const dirHashOf = (axes: Axes): string => String(dirNodeOf(axes).subtreeHash)

/** A NegationNode grounded by ONE `kind:'directory'` entry at the scope, per §3 (the encoding under test). */
const negationGroundedOn = (dir: IndexNode): NegationNode => {
  const anchor: StructRef = { kind: "directory", qualifiedPath: SCOPE, subtreeHash: dir.subtreeHash }
  const grounding: Grounding = { entries: [{ anchor, path: SCOPE }] }
  const id: NodeKey = negationKey("calls", "scip ts . . `f`().", SCOPE)
  return {
    kind: "negation",
    id,
    tier: "T2",
    relationKind: "calls",
    target: "scip ts . . `f`().",
    scope: SCOPE,
    grounding,
    edgeModel: "scip-typescript@0.0.0-test",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  }
}

describe("§3 WITNESS TEETH — the directory subtreeHash is the insertion-sensitive scope Merkle", () => {
  it("a directory RESOLVES (its fold is a real hash, not the subtreeHash===key absent-sentinel)", () => {
    const axes = axesWith({ "a.ts": "export const a = 1;\n", "b.ts": "export const b = 2;\n" })
    const dirHash = dirHashOf(axes)
    expect(dirHash.length).toBeGreaterThan(0)
    expect(dirHash).not.toBe(SCOPE) // NOT the `subtreeHash===key` sentinel `findByKey` rejects as absent
  })

  it("FRESH at emit, then DRIFTED when a THIRD file is INSERTED into the scope (the whole §3 mechanism)", () => {
    // Emit-time: build the scope with two files, ground the negation on the scope directory's folded hash.
    const axes = axesWith({ "a.ts": "export const a = 1;\n", "b.ts": "export const b = 2;\n" })
    const node = negationGroundedOn(dirNodeOf(axes))

    // The negation is FRESH against the axes it was grounded on (directory resolves + hash matches).
    expect(driftDetect(node.grounding, axes)).toBe("FRESH")

    // INSERT a third file — a brand-new unit ENTERING the scope. A per-FILE hash would be monotone-blind to
    // this (a per-unit subtreeHash of a.ts/b.ts is unchanged). The DIRECTORY hash is a branch over the NAMED
    // child set, so it moves — the exact insertion-sensitivity D3 requires.
    const axesAfter = axesWith({
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 2;\n",
      "c.ts": "export const c = 3;\n", // a NEW caller entering S
    })
    expect(dirHashOf(axesAfter)).not.toBe(dirHashOf(axes)) // the scope Merkle moved on insertion
    expect(driftDetect(node.grounding, axesAfter)).toBe("DRIFTED") // ⇒ re-verify the negative (honest trigger)
  })

  it("DRIFTED also when an in-scope file's BYTES change (a child hash moves ⇒ dir hash moves)", () => {
    const axes = axesWith({ "a.ts": "export const a = 1;\n", "b.ts": "export const b = 2;\n" })
    const node = negationGroundedOn(dirNodeOf(axes))
    const axesEdited = axesWith({ "a.ts": "export const a = 999;\n", "b.ts": "export const b = 2;\n" })
    expect(driftDetect(node.grounding, axesEdited)).toBe("DRIFTED")
  })

  it("the `id` is the minted negationKey over (kind, target, scope), matching the payload", () => {
    const axes = axesWith({ "a.ts": "x", "b.ts": "y" })
    const node = negationGroundedOn(dirNodeOf(axes))
    expect(node.id).toBe(negationKey("calls", node.target, node.scope))
  })
})
