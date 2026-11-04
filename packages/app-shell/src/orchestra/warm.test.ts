import { describe, expect, test } from "bun:test"
import { createStore, reconcile, unwrap } from "solid-js/store"
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

  describe("detach", () => {
    test("a store reconciled from a read leaves the cached value alone", () => {
      const warm = createWarm<{ issues: { id: string; title: string }[] }>(4, { detach: true })
      warm.write("a", { issues: [{ id: "1", title: "first" }] })
      const [store, setStore] = createStore({ board: warm.read("a") })

      setStore("board", reconcile({ issues: [{ id: "1", title: "renamed" }, { id: "2", title: "new" }] }, { key: "id" }))

      expect(store.board?.issues.map((issue) => issue.title)).toEqual(["renamed", "new"])
      expect(warm.read("a")).toEqual({ issues: [{ id: "1", title: "first" }] })
    })

    test("a write after the store changed does not carry later store writes into the cache", () => {
      const warm = createWarm<{ trail: { sha: string } }>(4, { detach: true })
      const [store, setStore] = createStore({ board: { trail: { sha: "a" } } })
      warm.write("a", unwrap(store.board))

      setStore("board", "trail", "sha", "b")

      expect(warm.read("a")).toEqual({ trail: { sha: "a" } })
    })

    test("an undetached cache hands out the stored object", () => {
      const warm = createWarm<{ value: number }>(4)
      const value = { value: 1 }
      warm.write("a", value)

      expect(warm.read("a")).toBe(value)
    })
  })
})
