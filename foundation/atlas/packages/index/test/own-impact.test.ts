import { describe, expect, it } from "vitest"
import { build } from "../src/build.js"
import { ownImpact } from "../src/own-impact.js"
import type { FileTree, ScipOutput } from "../src/types.js"

function tree(files: Record<string, string>): FileTree {
  return {
    path: ".",
    children: Object.entries(files).map(([path, content]) => ({ path, content, children: [] })),
  }
}

function scip(reference: "resolved" | "unresolved" = "resolved"): ScipOutput {
  return {
    documents: [
      {
        relativePath: "a.ts",
        occurrences:
          reference === "resolved"
            ? [{ symbol: "sym b", role: "reference" }]
            : [{ symbol: "missing", role: "reference" }],
      },
      { relativePath: "b.ts", occurrences: [{ symbol: "sym b", role: "definition" }] },
    ],
  }
}

describe("Own PR impact receipt", () => {
  it("includes changed units, reverse dependents, ancestors, and fact-drift units", () => {
    const before = build(tree({ "a.ts": "a1", "b.ts": "b1" }), scip())
    const after = build(tree({ "a.ts": "a1", "b.ts": "b2" }), scip())
    const receipt = ownImpact({
      before,
      after,
      baseSnapshot: "base",
      headSnapshot: "head",
      knowledgeChangedUnits: ["a.ts"],
    })

    expect(receipt.coverage).toBe("COMPLETE")
    expect(receipt.changedUnits).toContain("b.ts")
    expect(receipt.impactedUnits).toEqual(expect.arrayContaining([".", "a.ts", "b.ts"]))
    expect(receipt.reverseBlast).toContainEqual(
      expect.objectContaining({ origin: "b.ts", closure: ["a.ts"], underApprox: false }),
    )
  })

  it("holds coverage on unresolved edges in changed blast scope", () => {
    const before = build(tree({ "a.ts": "a1", "b.ts": "b1" }), scip("unresolved"))
    const after = build(tree({ "a.ts": "a2", "b.ts": "b1" }), scip("unresolved"))
    const receipt = ownImpact({ before, after, baseSnapshot: "base", headSnapshot: "head", knowledgeChangedUnits: [] })

    expect(receipt.coverage).toBe("UNDER_APPROX")
    expect(receipt.reverseBlast.find((blast) => blast.origin === "a.ts")?.underApprox).toBe(true)
  })

  it("keeps deleted units in impact so their stale skills must be removed", () => {
    const before = build(tree({ "a.ts": "a1", "b.ts": "b1" }), scip())
    const after = build(tree({ "a.ts": "a1" }), { documents: [{ relativePath: "a.ts", occurrences: [] }] })
    const receipt = ownImpact({ before, after, baseSnapshot: "base", headSnapshot: "head", knowledgeChangedUnits: [] })

    expect(receipt.removedUnits).toContain("b.ts")
    expect(receipt.impactedUnits).toContain("b.ts")
  })

  it("identifies endpoint units and reverse blast for dependency-only graph delta", () => {
    const files = tree({ "a.ts": "a1", "b.ts": "b1" })
    const before = build(files, scip("unresolved"))
    const after = build(files, scip("resolved"))
    const receipt = ownImpact({ before, after, baseSnapshot: "base", headSnapshot: "head", knowledgeChangedUnits: [] })

    expect(receipt.changedUnits).toEqual(["a.ts", "b.ts"])
    expect(receipt.reverseBlast).toContainEqual(expect.objectContaining({ origin: "b.ts", closure: ["a.ts"] }))
    expect(receipt.impactedUnits).toEqual(expect.arrayContaining([".", "a.ts", "b.ts"]))
  })
})
