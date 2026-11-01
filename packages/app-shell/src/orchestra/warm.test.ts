import { describe, expect, test } from "bun:test"
import { createWarm } from "./warm"

describe("createWarm", () => {
  test("returns what was written for a key", () => {
    const warm = createWarm<string[]>(4)

    warm.write("a", ["one"])

    expect(warm.read("a")).toEqual(["one"])
    expect(warm.read("b")).toBeUndefined()
  })

  test("a later write replaces the earlier one", () => {
    const warm = createWarm<number>(4)

    warm.write("a", 1)
    warm.write("a", 2)

    expect(warm.read("a")).toBe(2)
  })

  test("drops the oldest key past the limit", () => {
    const warm = createWarm<number>(2)

    warm.write("a", 1)
    warm.write("b", 2)
    warm.write("a", 3)
    warm.write("c", 4)

    expect(warm.read("b")).toBeUndefined()
    expect(warm.read("a")).toBe(3)
    expect(warm.read("c")).toBe(4)
  })
})
