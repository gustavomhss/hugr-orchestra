import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createRefCountMap } from "./refcount"
import { pathKey } from "./path-key"

describe("createRefCountMap", () => {
  test("removes an item after its last owner is disposed", () => {
    const removed: string[] = []
    const map = createRefCountMap(
      (key) => key,
      (key) => removed.push(key),
    )
    const first = createRoot((dispose) => {
      map("/project")
      return dispose
    })
    const second = createRoot((dispose) => {
      map("/project")
      return dispose
    })

    first()
    expect(removed).toEqual([])
    second()
    expect(removed).toEqual(["/project"])
  })

  test("keeps equivalent path consumers until the last owner is disposed", () => {
    const removed: string[] = []
    const map = createRefCountMap(
      (key) => key,
      (key) => removed.push(key),
      pathKey,
    )
    const first = createRoot((dispose) => {
      map("C:\\repo")
      return dispose
    })
    const second = createRoot((dispose) => {
      map("C:/repo/")
      return dispose
    })

    first()
    expect(removed).toEqual([])
    second()
    expect(removed).toEqual(["C:/repo"])
  })
})

describe("reference acquisition lifecycle", () => {
  test("a failed owner's later disposal cannot release another owner's successful acquisition", () => {
    const removed: string[] = []
    const attempts = { count: 0 }
    const failure = new Error("creation failed")
    const map = createRefCountMap((key) => {
      if (++attempts.count === 1) throw failure
      return { key }
    }, (key) => removed.push(key))
    const failed = createRoot((dispose) => {
      expect(() => map("/project")).toThrow(failure)
      return dispose
    })
    const owner = createRoot((dispose) => ({ value: map("/project"), dispose }))
    failed()
    expect(removed).toEqual([])
    const joined = createRoot((dispose) => ({ value: map("/project"), dispose }))
    expect(joined.value).toBe(owner.value)
    expect(attempts.count).toBe(2)
    joined.dispose()
    expect(removed).toEqual([])
    owner.dispose()
    expect(removed).toEqual(["/project"])
  })

  test("final removal can reacquire a fresh entry that survives the old cleanup", () => {
    const removed: string[] = []
    const state: { count: number; reacquired?: { value: { generation: number }; dispose: VoidFunction } } = { count: 0 }
    const map = createRefCountMap(() => ({ generation: ++state.count }), (key) => {
      removed.push(key)
      if (state.count === 1)
        state.reacquired = createRoot((dispose) => ({ value: map(key), dispose }))
    })
    const first = createRoot((dispose) => ({ value: map("/project"), dispose }))
    first.dispose()
    expect(removed).toEqual(["/project"])
    expect(state.reacquired).toBeDefined()
    expect(state.reacquired?.value).not.toBe(first.value)
    expect(state.reacquired?.value.generation).toBe(2)
    const joined = createRoot((dispose) => ({ value: map("/project"), dispose }))
    expect(joined.value).toBe(state.reacquired?.value)
    expect(state.count).toBe(2)
    joined.dispose()
    expect(removed).toEqual(["/project"])
    state.reacquired?.dispose()
    expect(removed).toEqual(["/project", "/project"])
  })
})
