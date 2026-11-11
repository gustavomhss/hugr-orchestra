import { expect, test } from "bun:test"
import { matchingWorktrees, registeredWorktrees } from "./inventory"

test("only recorded git worktrees enter the inventory, without inferred owners", () => {
  const rows = registeredWorktrees(
    { name: "Project", worktree: "/repo" },
    [
      { directory: "/repo" },
      { directory: "/tmp/session-looking-folder", strategy: "copy" },
      { directory: "/tmp/session-a", strategy: "git_worktree" },
      { directory: "/tmp/session-a/", strategy: "git_worktree" },
    ],
    123,
  )
  expect(rows).toEqual([{ directory: "/tmp/session-a", project: "Project", owner: "", sampledAt: 123 }])
})

test("Windows separators deduplicate without conflating distinct POSIX filenames", () => {
  expect(
    registeredWorktrees(
      { worktree: "C:\\repo" },
      [
        { directory: "C:\\work\\a", strategy: "git_worktree" },
        { directory: "C:/work/a/", strategy: "git_worktree" },
      ],
      100,
    ),
  ).toHaveLength(1)
  expect(
    registeredWorktrees(
      { worktree: "/repo" },
      [
        { directory: "/work/a", strategy: "git_worktree" },
        { directory: "/work/A", strategy: "git_worktree" },
      ],
      100,
    ),
  ).toHaveLength(2)
})

test("filter searches project and full path while preserving recorded facts", () => {
  const rows = registeredWorktrees(
    { worktree: "/Repos/Orchestra" },
    [{ directory: "/tmp/Activity-Monitor", strategy: "git_worktree" }],
    456,
  )
  expect(matchingWorktrees(rows, " ORCHESTRA ")).toEqual(rows)
  expect(matchingWorktrees(rows, "activity")).toEqual(rows)
  expect(matchingWorktrees(rows, "missing")).toEqual([])
  expect(rows[0]?.sampledAt).toBe(456)
  expect(rows[0]?.owner).toBe("")
})
