import { describe, expect, test } from "bun:test"
import { repositoryWorkspaces, workspaceFailure } from "./workspaces-model"

const projects = [
  { worktree: "/repos/orchestra", sandboxes: ["/sandboxes/one", "/sandboxes/two"] },
  { worktree: "/repos/other", sandboxes: ["/sandboxes/unrelated"] },
]

describe("repositoryWorkspaces", () => {
  test("lists only the selected repository, root first, with its initial selection", () => {
    expect(repositoryWorkspaces(projects, "/repos/orchestra")).toEqual([
      { directory: "/repos/orchestra", name: "orchestra", root: true, selected: true },
      { directory: "/sandboxes/one", name: "one", root: false, selected: false },
      { directory: "/sandboxes/two", name: "two", root: false, selected: false },
    ])
  })

  test("resolves a sandbox profile and normalizes paths without changing draft targets", () => {
    expect(
      repositoryWorkspaces([{ worktree: "C:\\repo", sandboxes: ["C:\\trees\\one", "C:/trees/one/"] }], "C:/trees/one/"),
    ).toEqual([
      { directory: "C:\\repo", name: "repo", root: true, selected: false },
      { directory: "C:\\trees\\one", name: "one", root: false, selected: true },
    ])
  })

  test("deduplicates the root and handles a project without sandboxes", () => {
    expect(
      repositoryWorkspaces([{ worktree: "/repo", sandboxes: ["/repo/", "/tree", "/tree"] }], "/repo"),
    ).toHaveLength(2)
    expect(repositoryWorkspaces([{ worktree: "/repo" }], "/repo")).toEqual([
      { directory: "/repo", name: "repo", root: true, selected: true },
    ])
  })

  test("does not fall back to an unrelated project for missing or nested paths", () => {
    expect(repositoryWorkspaces(projects, "/repos/missing")).toEqual([])
    expect(repositoryWorkspaces(projects, "/repos/orchestra/subfolder")).toEqual([])
    expect(repositoryWorkspaces([], "/repos/orchestra")).toEqual([])
  })
})

test("distinguishes unsupported endpoints from transport and server failures", () => {
  for (const status of [404, 405, 501]) {
    expect(workspaceFailure(new Error("UnexpectedStatus", { cause: { status } }))).toBe("unavailable")
    expect(workspaceFailure({ status })).toBe("unavailable")
  }
  expect(workspaceFailure(new Error("UnexpectedStatus", { cause: { status: 500 } }))).toBe("error")
  expect(workspaceFailure(new Error("Transport"))).toBe("error")
  expect(workspaceFailure(null)).toBe("error")
})
