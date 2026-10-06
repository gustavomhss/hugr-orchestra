import { describe, expect, test } from "bun:test"
import {
  activeWorkspace,
  copyTarget,
  defaultCopyParent,
  forceRequired,
  homeRelative,
  preferredSandbox,
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
  test("V1 lists the root first, then its sandboxes, with folder names", () => {
    expect(repositoryWorkspaces(projects[0])).toEqual([
      { directory: "/repos/orchestra", folder: "orchestra", root: true, removable: false },
      { directory: "/sandboxes/one", folder: "one", root: false, removable: false },
      { directory: "/sandboxes/two", folder: "two", root: false, removable: false },
    ])
  })

  test("V1 offers deletion only for worktrees in the server's own worktree folder for this project", () => {
    const project = {
      id: "abc",
      worktree: "/repos/orchestra",
      sandboxes: [
        "/data/opencode/worktree/abc/feature",
        "/data/opencode/worktree/other/feature",
        "/repos/orchestra-clone",
        "/data/opencode/worktree/abc/feature/nested",
        "C:\\data\\opencode\\worktree\\abc\\fix",
      ],
    }
    expect(repositoryWorkspaces(project).map((item) => [item.folder, item.removable])).toEqual([
      ["orchestra", false],
      ["feature", true],
      ["feature", false],
      ["orchestra-clone", false],
      ["nested", false],
      ["fix", true],
    ])
  })

  test("V2 lists the project's directory table, including copies missing from sandboxes", () => {
    const directories = [
      { directory: "/copies/new", strategy: "git_worktree" },
      { directory: "/repos/orchestra/" },
      { directory: "/repos/opened" },
    ]
    expect(repositoryWorkspaces({ ...projects[0], sandboxes: [] }, directories)).toEqual([
      { directory: "/repos/orchestra", folder: "orchestra", root: true, removable: false },
      { directory: "/copies/new", folder: "new", root: false, removable: true },
      { directory: "/repos/opened", folder: "opened", root: false, removable: false },
    ])
    expect(repositoryWorkspaces(projects[0], [])).toEqual([
      { directory: "/repos/orchestra", folder: "orchestra", root: true, removable: false },
    ])
  })

  test("normalizes Windows paths for names and deduplication without changing directories", () => {
    const project = { id: "p", worktree: "C:\\repo", sandboxes: ["C:\\trees\\one", "C:/trees/one/"] }
    expect(repositoryWorkspaces(project).map((item) => [item.directory, item.folder])).toEqual([
      ["C:\\repo", "repo"],
      ["C:\\trees\\one", "one"],
    ])
  })

  test("deduplicates the root and handles a project without sandboxes", () => {
    expect(repositoryWorkspaces({ id: "p", worktree: "/repo", sandboxes: ["/repo/", "/tree", "/tree"] })).toHaveLength(
      2,
    )
    expect(repositoryWorkspaces({ id: "p", worktree: "/repo" })).toEqual([
      { directory: "/repo", folder: "repo", root: true, removable: false },
    ])
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

  test("a root draft defaults only to a listed workspace, and only once the saved choice has loaded", () => {
    const listed = { ready: true, sandboxes: ["C:\\trees\\one"], known: ["/copies/new"] }
    expect(preferredSandbox({ ...listed, stored: "C:/trees/one/" })).toBe("C:\\trees\\one")
    expect(preferredSandbox({ ...listed, stored: "/copies/new" })).toBe("/copies/new")
    expect(preferredSandbox({ ...listed, stored: "/copies/new", ready: false })).toBeUndefined()
    expect(preferredSandbox({ ...listed, stored: "/sandboxes/removed" })).toBeUndefined()
    expect(preferredSandbox({ ...listed, stored: undefined })).toBeUndefined()
    expect(preferredSandbox({ ready: true, sandboxes: [], stored: "/copies/new" })).toBeUndefined()
  })
})

test("recognizes only V2's dirty-tree refusal as a request to force", () => {
  expect(forceRequired({ name: "ProjectCopyError", data: { message: "dirty", forceRequired: true } })).toBe(true)
  expect(forceRequired({ name: "ProjectCopyError", data: { message: "missing" } })).toBe(false)
  expect(forceRequired({ data: { forceRequired: "true" } })).toBe(false)
  expect(forceRequired(new Error("Transport"))).toBe(false)
  expect(forceRequired(undefined)).toBe(false)
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
