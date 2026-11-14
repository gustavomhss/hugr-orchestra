import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createNewSessionDraftWorkspace } from "./new-session-workspace-controller"
import { preferredSandbox } from "@/orchestra/chapters/workspaces-model"
import {
  normalizeNewSessionWorktree,
  resolveNewSessionBranch,
  resolveNewSessionWorktree,
} from "./new-session-workspace-controller"

describe("new session workspace selection", () => {
  test("preserves an explicitly selected direct workspace", () => {
    expect(
      resolveNewSessionWorktree({
        selected: "/project/feature",
        directory: "/project/feature",
        projectWorktree: "/project",
      }),
    ).toBe("/project/feature")
  })

  test("derives an existing worktree from the current directory", () => {
    expect(
      resolveNewSessionWorktree({ directory: "/project/feature", projectWorktree: "/project" }),
    ).toBe("/project/feature")
    expect(resolveNewSessionWorktree({ directory: "/project", projectWorktree: "/project" })).toBe(
      "main",
    )
  })

  test("a root draft starts in the profile's preferred workspace unless the draft chose otherwise", () => {
    const root = { directory: "/project", projectWorktree: "/project", preferred: "/project/feature" }
    expect(resolveNewSessionWorktree(root)).toBe("/project/feature")
    expect(resolveNewSessionWorktree({ ...root, selected: "main" })).toBe("main")
    expect(resolveNewSessionWorktree({ ...root, selected: "create" })).toBe("create")
    expect(resolveNewSessionWorktree({ ...root, directory: "/project/other" })).toBe("/project/other")
    expect(resolveNewSessionWorktree({ ...root, preferred: undefined })).toBe("main")
  })

  test("the profile default composes with the saved choice: stale, explicit pick and other servers", () => {
    const draft = { directory: "/project", projectWorktree: "/project" }
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

test("explicit workspace choices belong to the persisted draft and survive navigation and reload", () => {
  createRoot((dispose) => {
    const [state, setState] = createStore({
      active: "A",
      drafts: [
        { id: "A", worktree: undefined as string | undefined },
        { id: "B", worktree: undefined as string | undefined },
      ],
    })
    const selection = createNewSessionDraftWorkspace({
      draft: () => state.drafts.find((draft) => draft.id === state.active),
      update: (worktree) => setState("drafts", (draft) => draft.id === state.active, "worktree", worktree),
      directory: () => "/project",
      projectWorktree: () => "/project",
      workspaces: () => ["/project/feature"],
    })
    selection.set("main")
    setState("active", "B")
    selection.set("/project/feature")
    setState("active", "A")
    expect(selection.value()).toBe("main")
    const saved = JSON.parse(JSON.stringify(state.drafts)) as typeof state.drafts
    const restored = createNewSessionDraftWorkspace({
      draft: () => saved[1],
      update: () => {},
      directory: () => "/project",
      projectWorktree: () => "/project",
      workspaces: () => ["/project/feature"],
    })
    expect(restored.value()).toBe("/project/feature")
    saved[1].worktree = "/removed"
    expect(restored.value()).toBeUndefined()
    selection.reset()
    expect(selection.value()).toBeUndefined()
    dispose()
  })
})

test("restoration waits for current workspaces and retains the saved choice across read failures", async () => {
  const draft = { worktree: "/project/feature" }
  const first = Promise.withResolvers<readonly string[]>()
  const state = { reads: 0 }
  const selection = createNewSessionDraftWorkspace({
    draft: () => draft,
    update: () => {},
    directory: () => "/project",
    projectWorktree: () => "/project",
    workspaces: () => ["/project/feature"],
    loadWorkspaces: async () => (++state.reads === 1 ? first.promise : []),
  })
  const failed = selection.ready.promise
  expect(selection.ready()).toBe(false)
  expect(selection.value()).toBe("/project/feature")
  first.reject(new Error("temporary directory read failure"))
  await expect(failed).rejects.toThrow("temporary directory read failure")
  expect(draft.worktree).toBe("/project/feature")
  expect(selection.value()).toBe("/project/feature")
  await selection.ready.promise
  expect(state.reads).toBe(2)
  expect(selection.ready()).toBe(true)
  expect(selection.value()).toBeUndefined()
  expect(draft.worktree).toBe("/project/feature")
})

test("a workspace added after restoration can be selected from the live catalogue", async () => {
  const [state, setState] = createStore({ worktree: "/project/feature", workspaces: ["/project/feature"] })
  const selection = createNewSessionDraftWorkspace({
    draft: () => state,
    update: (worktree) => setState("worktree", worktree!),
    directory: () => "/project",
    projectWorktree: () => "/project",
    workspaces: () => state.workspaces,
    loadWorkspaces: async () => ["/project/feature"],
  })
  await selection.ready.promise
  setState("workspaces", ["/project/feature", "/project/new"])
  selection.set("/project/new")
  expect(selection.value()).toBe("/project/new")
  expect(selection.ready()).toBe(true)
})

test("an initial project lookup in flight does not validate an empty workspace list", async () => {
  const pending = Promise.withResolvers<readonly string[]>()
  const state = { project: undefined as string | undefined, worktree: "/project/feature" }
  const selection = createNewSessionDraftWorkspace({
    draft: () => state,
    update: () => {},
    directory: () => "/project",
    projectWorktree: () => state.project,
    workspaces: () => [],
    loadWorkspaces: () => pending.promise,
  })
  const wait = selection.ready.promise
  expect(selection.ready()).toBe(false)
  expect(selection.value()).toBe("/project/feature")
  state.project = "/project"
  pending.resolve(["/project/feature"])
  await wait
  expect(selection.ready()).toBe(true)
  expect(selection.value()).toBe("/project/feature")
})


test("draft placement validates a saved pick independently of picker visibility", async () => {
  const draft = { worktree: "/project/feature" }
  const validation = { calls: 0 }
  const selection = createNewSessionDraftWorkspace({
    draft: () => draft, update: () => {}, directory: () => "/project", projectWorktree: () => "/project",
    workspaces: () => [], loadWorkspaces: async () => { validation.calls++; return ["/project/feature"] },
  })
  await selection.ready.promise
  expect(selection.ready()).toBe(true)
  expect(selection.value()).toBe("/project/feature")
  expect(draft.worktree).toBe("/project/feature")
  expect(validation.calls).toBe(1)
})
