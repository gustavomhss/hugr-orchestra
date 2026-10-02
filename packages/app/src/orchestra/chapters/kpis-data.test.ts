import { describe, expect, test } from "bun:test"
import { aggregateUsage, loadUsage, usageCsv, UsageUnavailable, type UsageSession } from "./kpis-data"

const session = (id: string, cost = 0, factor = 1): UsageSession => ({
  id,
  title: id,
  cost,
  location: { directory: "/repo" },
  tokens: { input: factor, output: factor * 2, reasoning: factor * 3, cache: { read: factor * 4, write: factor * 5 } },
})

describe("recorded usage", () => {
  test("distinct categories, deduplicated sessions, and deterministic top five", () => {
    const result = aggregateUsage(
      [
        session("b", 1),
        session("a", 2),
        session("a", 2),
        ...["c", "d", "e"].map((id) => session(id, 1)),
        session("f", 1, 2),
      ],
      true,
    )!
    expect(result.sessions).toBe(6)
    expect(result.tokens).toEqual({ input: 7, output: 14, reasoning: 21, read: 28, write: 35 })
    expect(result.total).toBe(105)
    expect(result.cost).toBe(7)
    expect(result.top.map((item) => item.id)).toEqual(["f", "a", "b", "c", "d"])
  })
  test("partial reads have no totals; zero and mixed costs are unavailable", () => {
    expect(aggregateUsage([session("a")], false)).toBeUndefined()
    expect(aggregateUsage([session("a")], true)?.cost).toBeUndefined()
    expect(aggregateUsage([session("a"), session("b", 5)], true)?.cost).toBeUndefined()
    expect(aggregateUsage([session("a"), session("b", 5)], true)?.top.map((item) => item.cost)).toEqual([undefined, 5])
    expect(aggregateUsage([], true)).toMatchObject({ sessions: 0, total: 0, cost: undefined, top: [] })
  })
  test("follows cursor on a short page, targets directory, and only resolves after completion", async () => {
    const progress: number[] = []
    const queries: unknown[] = []
    const result = await loadUsage({
      directory: "/repo",
      signal: new AbortController().signal,
      progress: (count) => progress.push(count),
      list: async (query) => {
        queries.push(query)
        return query.cursor
          ? { data: [session("a"), session("b")], cursor: {} }
          : { data: [session("a")], cursor: { next: "opaque" } }
      },
    })
    expect(queries).toEqual([
      { directory: "/repo", limit: 100, order: "desc", cursor: undefined },
      { directory: "/repo", limit: 100, order: "desc", cursor: "opaque" },
    ])
    expect(progress).toEqual([1, 2])
    expect(result.sessions).toBe(2)
    expect(result.total).toBe(30)
  })
  test("late aborted responses cannot publish progress or totals", async () => {
    const abort = new AbortController()
    const progress: number[] = []
    await expect(
      loadUsage({
        directory: "/repo",
        signal: abort.signal,
        progress: (count) => progress.push(count),
        list: async () => {
          abort.abort()
          return { data: [session("a")], cursor: {} }
        },
      }),
    ).rejects.toThrow()
    expect(progress).toEqual([])
  })
  test("failed continuation, malformed records, wrong directory, and repeated cursors fail closed", async () => {
    for (const mode of ["failure", "missing", "directory", "cursor"]) {
      await expect(
        loadUsage({
          directory: "/repo",
          signal: new AbortController().signal,
          progress: () => {},
          list: async (query) => {
            if (mode === "failure" && query.cursor) throw new Error("offline")
            return {
              data: [
                {
                  ...session("a"),
                  ...(mode === "missing" ? { cost: NaN } : {}),
                  ...(mode === "directory" ? { location: { directory: "/other" } } : {}),
                },
              ],
              cursor: { next: "same" },
            }
          },
        }),
      ).rejects.toThrow(mode === "missing" || mode === "directory" ? UsageUnavailable : Error)
    }
  })
  test("CSV preserves displayed numbers and quotes; neutralizes spreadsheet formulas", () => {
    expect(
      usageCsv([
        ["Sessions", "6"],
        ['a,"b"\nc', 90],
        ["=SUM(A1)", "Unavailable"],
      ]),
    ).toBe('"Sessions","6"\r\n"a,""b""\nc","90"\r\n"\'=SUM(A1)","Unavailable"\r\n')
  })
})
