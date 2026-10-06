import { createMemo, createSignal } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { preferredSandbox } from "@/orchestra/chapters/workspaces-model"
import { persistedWorkspaces } from "@/orchestra/chapters/workspaces-store"
import { pathKey } from "@/utils/path-key"

const workspaceBarEnabled = import.meta.env.VITE_OPENCODE_CHANNEL !== "prod"

export function resolveNewSessionWorktree(input: {
  enabled: boolean
  selected?: string
  directory: string
  projectWorktree?: string
  // The repository profile's active workspace (Orchestra Workspaces), already validated against its sandboxes.
  preferred?: string
}) {
  if (!input.enabled) return "main"
  if (input.selected) return input.selected
  if (input.projectWorktree && input.directory !== input.projectWorktree) return input.directory
  if (input.preferred) return input.preferred
  return "main"
}

export function normalizeNewSessionWorktree(value: string, directory: string, projectWorktree?: string) {
  if (value === "main" && projectWorktree !== directory) return projectWorktree
  return value
}

export function resolveNewSessionBranch(input: {
  worktree: string
  local?: string
  worktreeBranch: (worktree: string) => string | undefined
}) {
  if (input.worktree === "main" || input.worktree === "create") return input.local
  return input.worktreeBranch(input.worktree) ?? input.local
}

export function createNewSessionWorkspaceController() {
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const [workspaces, , , workspacesReady] = persistedWorkspaces(useServerSDK()().scope)
  const [worktree, setWorktree] = createSignal<string>()
  const visible = createMemo(() => workspaceBarEnabled && sync().project?.vcs === "git")
  const projectRoot = createMemo(() => sync().project?.worktree ?? sdk().directory)
  const value = createMemo(() =>
    resolveNewSessionWorktree({
      enabled: visible(),
      selected: worktree(),
      directory: sdk().directory,
      projectWorktree: sync().project?.worktree,
      preferred: preferredSandbox({
        ready: workspacesReady(),
        sandboxes: sync().project?.sandboxes ?? [],
        known: workspaces.known[pathKey(projectRoot())],
        stored: workspaces.active[pathKey(projectRoot())],
      }),
    }),
  )
  const localBranch = createMemo(() => serverSync().child(projectRoot())[0].vcs?.branch)
  const branch = createMemo(() =>
    resolveNewSessionBranch({
      worktree: value(),
      local: localBranch(),
      worktreeBranch: (worktree) => serverSync().child(worktree)[0].vcs?.branch,
    }),
  )

  return {
    selection: {
      value,
      reset: () => setWorktree(),
      set: (worktree: string) =>
        setWorktree(normalizeNewSessionWorktree(worktree, sdk().directory, sync().project?.worktree)),
    },
    project: {
      root: projectRoot,
      workspaces: () => sync().project?.sandboxes ?? [],
      git: () => sync().project?.vcs === "git",
    },
    bar: {
      visible,
      branch,
    },
    // The profile's saved workspace choice; the page waits for it so a root draft never flips after rendering.
    ready: workspacesReady,
  }
}

export type NewSessionWorkspaceController = ReturnType<typeof createNewSessionWorkspaceController>
