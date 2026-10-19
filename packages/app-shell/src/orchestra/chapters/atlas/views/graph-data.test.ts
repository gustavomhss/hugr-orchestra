import { describe, expect, test } from "bun:test"
import { closureOf, foldLinks } from "./graph-data"

describe("atlas graph data", () => {
  test("folds repeated pairs, drops self links and unknown ends", () => {
    expect(
      foldLinks(new Set(["a", "b", "c"]), [
        { source: "a", target: "b", w: 1 },
        { source: "a", target: "b", w: 2 },
        { source: "b", target: "b", w: 1 },
        { source: "a", target: "z", w: 1 },
        { source: "c", target: "a" },
      ]),
    ).toEqual([
      { source: "a", target: "b", w: 3 },
      { source: "c", target: "a", w: 1 },
    ])
  })

  test("the closure walks what depends on a node, transitively", () => {
    const links = [
      { source: "a", target: "b", w: 1 },
      { source: "c", target: "a", w: 1 },
      { source: "d", target: "c", w: 1 },
      { source: "b", target: "e", w: 1 },
    ]
    expect([...closureOf(links, "b")].sort()).toEqual(["a", "b", "c", "d"])
    expect([...closureOf(links, "d")]).toEqual(["d"])
    expect([...closureOf(links, "e")].sort()).toEqual(["a", "b", "c", "d", "e"])
  })

  test("a cycle ends", () => {
    const links = [
      { source: "a", target: "b", w: 1 },
      { source: "b", target: "a", w: 1 },
    ]
    expect([...closureOf(links, "a")].sort()).toEqual(["a", "b"])
  })
})
