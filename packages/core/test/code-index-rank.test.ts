import { describe, expect, test } from "bun:test"
import { CodeIndexRank } from "@orchestra/core/research-toolkit/code-index/rank"

// T-X7: import-graph PageRank, one rank per document, no caps.
describe("code index rank", () => {
  test("files imported by many others rank higher, and the ranks sum to one", () => {
    const documents = ["a.ts", "b.ts", "c.ts", "core.ts"].map((path) => ({ path, lines: 10, bytes: 100 }))
    const rows = CodeIndexRank.ranks(documents, [
      { fromPath: "a.ts", toPath: "core.ts" },
      { fromPath: "b.ts", toPath: "core.ts" },
      { fromPath: "c.ts", toPath: "core.ts" },
      { fromPath: "c.ts", toPath: "b.ts" },
    ])
    const rank = new Map(rows.map((row) => [row.path, row.rank]))
    expect(rank.get("core.ts")!).toBeGreaterThan(rank.get("b.ts")!)
    expect(rank.get("b.ts")!).toBeGreaterThan(rank.get("a.ts")!)
    expect(rows.reduce((sum, row) => sum + row.rank, 0)).toBeCloseTo(1, 9)
    expect(rows.map((row) => [row.loc, row.bytes])).toEqual(documents.map(() => [10, 100]))
  })

  test("self, unresolved and out-of-shard imports give no edge", () => {
    const documents = ["a.ts", "b.ts"].map((path) => ({ path, lines: 1, bytes: 1 }))
    const rows = CodeIndexRank.ranks(documents, [
      { fromPath: "a.ts", toPath: "a.ts" },
      { fromPath: "a.ts" },
      { fromPath: "a.ts", toPath: "elsewhere/x.ts" },
    ])
    expect(rows[0]!.rank).toBeCloseTo(0.5, 9)
    expect(rows[1]!.rank).toBeCloseTo(0.5, 9)
  })

  test("matches the techlead's two-node fixed point after 20 iterations", () => {
    // a → b, b dangling: b keeps (1-d)/2 + d·r(a) + d·r(b)/2 each step.
    const rank = CodeIndexRank.computePageRank(["a", "b"], [{ fromPath: "a", toPath: "b" }])
    const expected = Array.from({ length: 20 }).reduce<[number, number]>(([a, b]) =>
      [0.075 + (0.85 * b) / 2, 0.075 + 0.85 * a + (0.85 * b) / 2], [0.5, 0.5])
    expect(rank.get("a")!).toBeCloseTo(expected[0], 12)
    expect(rank.get("b")!).toBeCloseTo(expected[1], 12)
  })

  test("every document is ranked, past the Arsenal's 40-entry caps", () => {
    const documents = Array.from({ length: 500 }, (_, index) => ({ path: `f${index}.ts`, lines: 1, bytes: 1 }))
    const rows = CodeIndexRank.ranks(documents, documents.slice(1).map((document) => ({ fromPath: document.path, toPath: "f0.ts" })))
    expect(rows).toHaveLength(500)
    expect(rows.every((row) => row.rank > 0)).toBe(true)
    expect(Math.max(...rows.map((row) => row.rank))).toBe(rows[0]!.rank)
  })

  test("test scaffolding paths are recognized", () => {
    expect(CodeIndexRank.isTestPath("packages/a/test/x.ts")).toBe(true)
    expect(CodeIndexRank.isTestPath("src/x.test.ts")).toBe(true)
    expect(CodeIndexRank.isTestPath("src/x.ts")).toBe(false)
  })
})
