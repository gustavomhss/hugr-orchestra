import { describe, expect, test } from "bun:test"
import {
  activeWorkspace,
  copyTarget,
  defaultCopyParent,
  homeRelative,
  preferredSandbox,
  removableWorkspaces,
  repositoryProject,
  repositoryWorkspaces,
  workspaceFailure,
} from "./workspaces-model"

const projects = [
  { id: "orchestra", worktree: "/repos/orchestra", sandboxes: ["/sandboxes/one", "/sandboxes/two"] },
  { id: "other", worktree: "/repos/other", sandboxes: ["/sandboxes/unrelated"] },
]

describe("repositoryProject", () => {
  test("resolves the profile's repository from its root or one of its sandboxes", () => {
    expect(repositoryProject(projects, "/repos/orchestra")?.id).toBe("orchestra")
    expect(repositoryProject(projects, "/sandboxes/two/")?.id).toBe("orchestra")
    expect(repositoryProject(projects, "/sandboxes/unrelated")?.id).toBe("other")
  })

  test("does not fall back to an unrelated project for missing or nested paths", () => {
    expect(repositoryProject(projects, "/repos/missing")).toBeUndefined()
    expect(repositoryProject(projects, "/repos/orchestra/subfolder")).toBeUndefined()
    expect(repositoryProject([], "/repos/orchestra")).toBeUndefined()
  })
})

describe("repositoryWorkspaces", () => {
  test("lists the root first, then its sandboxes, with folder names", () => {
    expect(repositoryWorkspaces(projects[0])).toEqual([
      { directory: "/repos/orchestra", folder: "orchestra", root: true },
      { directory: "/sandboxes/one", folder: "one", root: false },
      { directory: "/sandboxes/two", folder: "two", root: false },
    ])
  })

  test("normalizes Windows paths for names and deduplication without changing directories", () => {
    expect(repositoryWorkspaces({ worktree: "C:\\repo", sandboxes: ["C:\\trees\\one", "C:/trees/one/"] })).toEqual([
      { directory: "C:\\repo", folder: "repo", root: true },
      { directory: "C:\\trees\\one", folder: "one", root: false },
    ])
  })

  test("deduplicates the root and handles a project without sandboxes", () => {
    expect(repositoryWorkspaces({ worktree: "/repo", sandboxes: ["/repo/", "/tree", "/tree"] })).toHaveLength(2)
    expect(repositoryWorkspaces({ worktree: "/repo" })).toEqual([{ directory: "/repo", folder: "repo", root: true }])
  })
})

describe("active workspace", () => {
  const workspaces = repositoryWorkspaces(projects[0])

  test("defaults to the root and follows a stored choice that still exists", () => {
    expect(activeWorkspace(workspaces)).toBe("/repos/orchestra")
    expect(activeWorkspace(workspaces, "/sandboxes/two/")).toBe("/sandboxes/two")
    expect(activeWorkspace(workspaces, "/sandboxes/removed")).toBe("/repos/orchestra")
    expect(activeWorkspace([], "/sandboxes/two")).toBeUndefined()
  })

  test("new drafts default only to a sandbox the project still lists, spelled as listed", () => {
    expect(preferredSandbox(["C:\\trees\\one"], "C:/trees/one/")).toBe("C:\\trees\\one")
    expect(preferredSandbox(projects[0].sandboxes, "/repos/orchestra")).toBeUndefined()
    expect(preferredSandbox(projects[0].sandboxes, "/sandboxes/removed")).toBeUndefined()
    expect(preferredSandbox(projects[0].sandboxes)).toBeUndefined()
  })
})

test("only server-removable directories offer deletion", () => {
  const directories = [{ directory: "/sandboxes/one", strategy: "git_worktree" }, { directory: "/sandboxes/two/" }]
  expect(removableWorkspaces("v1", directories)).toEqual(["/sandboxes/one", "/sandboxes/two"])
  expect(removableWorkspaces("v2", directories)).toEqual(["/sandboxes/one"])
  expect(removableWorkspaces("v2", [])).toEqual([])
})

test("V2 copies need a parent directory and a single path segment", () => {
  expect(copyTarget(" /repos/orchestra-workspaces/ ", " pr-231 ")).toEqual({
    directory: "/repos/orchestra-workspaces",
    name: "pr-231",
  })
  expect(copyTarget("", "pr-231")).toBeUndefined()
  expect(copyTarget("/repos", "  ")).toBeUndefined()
  expect(copyTarget("/repos", "nested/name")).toBeUndefined()
  expect(copyTarget("/repos", "nested\\name")).toBeUndefined()
  expect(defaultCopyParent("/repos/orchestra/")).toBe("/repos/orchestra-workspaces")
})

test("shows home-relative paths only for real descendants of home", () => {
  expect(homeRelative("/Users/me/Documents/repo", "/Users/me")).toBe("~/Documents/repo")
  expect(homeRelative("/Users/me", "/Users/me/")).toBe("~")
  expect(homeRelative("/Users/meow/repo", "/Users/me")).toBe("/Users/meow/repo")
  expect(homeRelative("/srv/repo", "")).toBe("/srv/repo")
  expect(homeRelative("C:\\Users\\me\\repo", "C:\\Users\\me")).toBe("~\\repo")
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
