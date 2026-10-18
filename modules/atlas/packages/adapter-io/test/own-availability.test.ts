import { describe, expect, it } from "vitest"
import { availableOwnUnits } from "../src/own-source.js"
import type { Axes, IndexNode } from "@atlas/index"

function node(key: string, children: readonly IndexNode[] = []): IndexNode {
  return { axis: "spatial", level: "module", key, subtreeHash: `hash:${key}` as never, children, objects: [] }
}

describe("post-Genesis Own availability", () => {
  it("lists every structural unit under canonical IDs in deterministic order", () => {
    const spatial = node(".", [node("src", [node("src/a.ts")]), node("README.md")])
    const axes: Axes = {
      spatial,
      territory: { ...spatial, axis: "territory" },
      dependency: { ...spatial, axis: "dependency" },
      edges: [],
    }

    expect(availableOwnUnits(axes)).toEqual([
      { level: "module", id: ".", grounding: "hash:." },
      { level: "module", id: "README.md", grounding: "hash:README.md" },
      { level: "module", id: "src", grounding: "hash:src" },
      { level: "module", id: "src/a.ts", grounding: "hash:src/a.ts" },
    ])
  })
})
