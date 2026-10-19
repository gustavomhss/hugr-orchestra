import { describe, expect, test } from "bun:test"
import { createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import { packTree, sweepIndex } from "./explore-pack"

const name = (id: string) => (id === "(root)" ? "top-level" : id.split("/").slice(1).join("/"))
const leaf = (fileName: string, path: string, facts: number, drifted: number) => ({ name: fileName, path, leaf: true, facts, drifted, children: [] })

describe("atlas explore map tree", () => {
  test("units hold folders hold files, and files count facts and changes", () => {
    const model = createAtlasModel(atlasFixture())
    const tree = packTree(model, model.units().map((unit) => unit.id), name)
    expect(tree).toEqual({
      name: "",
      path: "",
      leaf: false,
      facts: 0,
      drifted: 0,
      children: [
        {
          name: "a",
          path: "packages/a",
          unit: "packages/a",
          leaf: false,
          facts: 0,
          drifted: 0,
          children: [
            { name: "src", path: "packages/a/src", leaf: false, facts: 0, drifted: 0, children: [leaf("x.ts", "packages/a/src/x.ts", 2, 1)] },
          ],
        },
        {
          name: "b",
          path: "packages/b",
          unit: "packages/b",
          leaf: false,
          facts: 0,
          drifted: 0,
          children: [
            { name: "src", path: "packages/b/src", leaf: false, facts: 0, drifted: 0, children: [leaf("y.ts", "packages/b/src/y.ts", 1, 0)] },
          ],
        },
        {
          name: "top-level",
          path: "(root)",
          unit: "(root)",
          leaf: false,
          facts: 0,
          drifted: 0,
          children: [leaf("README.md", "README.md", 1, 0)],
        },
      ],
    })
  })

  test("only the given units are drawn", () => {
    const model = createAtlasModel(atlasFixture())
    expect(packTree(model, ["packages/b"], name).children.map((child) => child.name)).toEqual(["b"])
  })

  test("neighbouring ring tones never match", () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => sweepIndex(n, 6))).toEqual([0, 1, 2, 3, 4, 2])
    expect([0, 1, 2, 3, 4].map((n) => sweepIndex(n, 5))).toEqual([0, 1, 2, 3, 4])
    expect(sweepIndex(0, 1)).toBe(0)
    expect(sweepIndex(10, 11)).toBe(2)
    expect(sweepIndex(10, 12)).toBe(0)
  })
})
