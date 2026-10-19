import { describe, expect, test } from "bun:test"
import { shortUnit, sortUnits, toSort, unitTone } from "./explore-units"

const units = [
  { id: "packages/a", facts: 10, drifted: 1 },
  { id: "packages/b", facts: 4, drifted: 2 },
  { id: "docs/c", facts: 6, drifted: 0 },
  { id: "(root)", facts: 2, drifted: 1 },
]
const ids = (list: readonly { id: string }[]) => list.map((unit) => unit.id)
const short = (id: string) => shortUnit(id, "top-level")

describe("atlas explore units", () => {
  test("short names drop the first segment and name the root unit", () => {
    expect(["packages/knowledge", "packages/a/b", "(root)", "packages"].map(short)).toEqual(["knowledge", "a/b", "top-level", "packages"])
  })

  test("tones follow the share that changed", () => {
    expect(units.map(unitTone)).toEqual(["mixed", "warm", "good", "warm"])
  })

  test("sorts by facts, changed, share and name without touching the input", () => {
    expect(ids(sortUnits(units, "facts", short))).toEqual(["packages/a", "docs/c", "packages/b", "(root)"])
    expect(ids(sortUnits(units, "changed", short))).toEqual(["packages/b", "packages/a", "(root)", "docs/c"])
    expect(ids(sortUnits(units, "share", short))).toEqual(["packages/b", "(root)", "packages/a", "docs/c"])
    expect(ids(sortUnits(units, "name", short))).toEqual(["packages/a", "packages/b", "docs/c", "(root)"])
    expect(ids(units)).toEqual(["packages/a", "packages/b", "docs/c", "(root)"])
  })

  test("reads the sort from the query", () => {
    expect([undefined, "", "changed", "share", "name", "bogus"].map(toSort)).toEqual(["facts", "facts", "changed", "share", "name", "facts"])
  })
})
