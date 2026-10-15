import { describe, expect, test } from "bun:test"
import { adjacentTabKey, closeProfileTab, mergeVisibleTabOrder, tabMatchesProfile } from "./titlebar-tab-order"

test("profile visibility uses each tab's server and resolved repository, not a shared path prefix", () => {
  const profile = { server: "remote", directory: "/repo/" }
  expect(tabMatchesProfile({ server: "remote", directory: "/repo/worktree", rootDirectory: "/repo" }, profile)).toBe(
    true,
  )
  expect(tabMatchesProfile({ server: "local", directory: "/repo" }, profile)).toBe(false)
  expect(tabMatchesProfile({ server: "remote", directory: "/repo-other" }, profile)).toBe(false)
  expect(tabMatchesProfile({ server: "remote" }, profile)).toBe(false)
  expect(tabMatchesProfile({ server: "remote", directory: "/other" })).toBe(true)
  expect(tabMatchesProfile({ server: "remote", directory: "/other" }, { server: "remote" })).toBe(true)
})

describe("adjacentTabKey", () => {
  test("follows the visible left-to-right order", () => {
    expect(adjacentTabKey(["c", "a", "b"], "c", 1)).toBe("a")
    expect(adjacentTabKey(["c", "a", "b"], "a", -1)).toBe("c")
  })

  test("skips tabs omitted from the visible order", () => {
    expect(adjacentTabKey(["a", "c"], "a", 1)).toBe("c")
    expect(adjacentTabKey(["a", "c"], "c", 1)).toBe("a")
  })
})

test("merges reordered visible tabs around hidden tabs", () => {
  expect(mergeVisibleTabOrder(["a", "hidden", "b", "c"], ["a", "b", "c"], ["c", "a", "b"])).toEqual([
    "c",
    "hidden",
    "a",
    "b",
  ])
})

test("profile's last tab goes home; background and unscoped closes keep native navigation", async () => {
  const all = ["A1", "B1"]
  const run = async (visible: string[] | undefined, current: string) => {
    const calls: (string | number)[] = []
    await closeProfileTab({
      visible,
      current,
      tab: "A1",
      tabs: { store: all, closeTab: (index) => calls.push(index), select: (tab) => calls.push(tab) },
      home: () => calls.push("/"),
    })
    return calls
  }
  expect(await run(["A1"], "A1")).toEqual([0, "/"])
  expect(await run(["A1"], "B1")).toEqual([0])
  expect(await run(undefined, "A1")).toEqual([0])
})
