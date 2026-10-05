import { describe, expect, test } from "bun:test"
import { preferredSandbox } from "@/orchestra/chapters/workspaces-model"
import {
  normalizeNewSessionWorktree,
  resolveNewSessionBranch,
  resolveNewSessionWorktree,
} from "./new-session-workspace-controller"

describe("new session workspace selection", () => {
  test("uses main when the workspace bar is unavailable", () => {
    expect(
      resolveNewSessionWorktree({
        enabled: false,
        selected: "/project/feature",
        directory: "/project/feature",
        projectWorktree: "/project",
      }),
    ).toBe("main")
  })

  test("derives an existing worktree from the current directory", () => {
    expect(
      resolveNewSessionWorktree({ enabled: true, directory: "/project/feature", projectWorktree: "/project" }),
    ).toBe("/project/feature")
    expect(resolveNewSessionWorktree({ enabled: true, directory: "/project", projectWorktree: "/project" })).toBe(
      "main",
    )
  })

  test("a root draft starts in the profile's preferred workspace unless the draft chose otherwise", () => {
    const root = { enabled: true, directory: "/project", projectWorktree: "/project", preferred: "/project/feature" }
    expect(resolveNewSessionWorktree(root)).toBe("/project/feature")
    expect(resolveNewSessionWorktree({ ...root, selected: "main" })).toBe("main")
    expect(resolveNewSessionWorktree({ ...root, selected: "create" })).toBe("create")
    expect(resolveNewSessionWorktree({ ...root, directory: "/project/other" })).toBe("/project/other")
    expect(resolveNewSessionWorktree({ ...root, enabled: false })).toBe("main")
    expect(resolveNewSessionWorktree({ ...root, preferred: undefined })).toBe("main")
  })

  test("the profile default composes with the saved choice: stale, explicit pick and other servers", () => {
    const draft = { enabled: true, directory: "/project", projectWorktree: "/project" }
    const listed = { ready: true, sandboxes: ["/project/feature"], known: ["/copies/review"] }
    const preferred = (stored?: string, ready = true) => preferredSandbox({ ...listed, ready, stored })
    expect(resolveNewSessionWorktree({ ...draft, preferred: preferred("/copies/review") })).toBe("/copies/review")
    // A workspace removed since it was chosen no longer steers new drafts.
    expect(resolveNewSessionWorktree({ ...draft, preferred: preferred("/project/removed") })).toBe("main")
    // Until the saved choice loads, nothing is guessed.
    expect(resolveNewSessionWorktree({ ...draft, preferred: preferred("/project/feature", false) })).toBe("main")
    // Picking Local in the draft's own menu wins over the profile default.
    const picked = normalizeNewSessionWorktree("main", draft.directory, draft.projectWorktree)
    expect(resolveNewSessionWorktree({ ...draft, selected: picked, preferred: preferred("/project/feature") })).toBe(
      "main",
    )
    // Another server keeps its own store: no saved choice means its root drafts stay Local.
    expect(resolveNewSessionWorktree({ ...draft, preferred: preferred(undefined) })).toBe("main")
  })

  test("normalizes main to the project root outside the main worktree", () => {
    expect(normalizeNewSessionWorktree("main", "/project/feature", "/project")).toBe("/project")
    expect(normalizeNewSessionWorktree("main", "/project", "/project")).toBe("main")
  })

  test("falls back to the local branch for main, create, and unknown worktrees", () => {
    const branch = (worktree: string) => (worktree === "/project/feature" ? "feature" : undefined)
    expect(resolveNewSessionBranch({ worktree: "main", local: "dev", worktreeBranch: branch })).toBe("dev")
    expect(resolveNewSessionBranch({ worktree: "create", local: "dev", worktreeBranch: branch })).toBe("dev")
    expect(resolveNewSessionBranch({ worktree: "/project/feature", local: "dev", worktreeBranch: branch })).toBe(
      "feature",
    )
    expect(resolveNewSessionBranch({ worktree: "/missing", local: "dev", worktreeBranch: branch })).toBe("dev")
  })
})
