import { useSearchParams } from "@solidjs/router"
import { useTabs, type DraftTab } from "@/context/tabs"
import { createStore } from "solid-js/store"
import { createMemo } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { preferredSandbox, repositoryProject } from "@/orchestra/chapters/workspaces-model"
import { persistedWorkspaces } from "@/orchestra/chapters/workspaces-store"
import { pathKey } from "@/utils/path-key"

const workspaceBarEnabled = import.meta.env.VITE_ORCHESTRA_CHANNEL !== "prod"

export function resolveNewSessionWorktree(input: {
  selected?: string
  directory: string
  projectWorktree?: string
  // The repository profile's active workspace (Orchestra Workspaces), already validated against its sandboxes.
  preferred?: string
}) {
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

export function createNewSessionDraftWorkspace(input: {
  draft: () => { worktree?: string } | undefined
  update: (worktree: string | undefined) => void
  directory: () => string
  projectWorktree: () => string | undefined
  workspaces: () => readonly string[]
  loadWorkspaces?: () => Promise<readonly string[]>
  ready?: (() => boolean) & { promise: Promise<unknown> | undefined }
}) {
  const [restoration, setRestoration] = createStore<{
    ready: boolean
    workspaces?: readonly string[]
    picked?: string
  }>({
    ready: false,
  })
  const validation = { pending: undefined as Promise<void> | undefined }
  const validate = () => {
    if (restoration.ready) return Promise.resolve()
    if (validation.pending) return validation.pending
    validation.pending = (async () => {
      await input.ready?.promise
      const selected = input.draft()?.worktree
      if (
        selected &&
        selected !== "main" &&
        selected !== "create" &&
        selected !== input.projectWorktree() &&
        input.loadWorkspaces
      ) {
        const workspaces = await input.loadWorkspaces()
        if (input.draft()?.worktree === selected && !restoration.picked) setRestoration("workspaces", workspaces)
      }
      setRestoration("ready", true)
    })().finally(() => {
      validation.pending = undefined
    })
    return validation.pending
  }
  const ready = Object.defineProperty(() => (input.ready?.() ?? true) && restoration.ready, "promise", {
    get: validate,
  }) as (() => boolean) & { promise: Promise<void> }
  return {
    value: () => {
      const selected = input.draft()?.worktree
      if (
        (!restoration.ready && input.loadWorkspaces && selected) ||
        selected === restoration.picked ||
        selected === "main" ||
        selected === "create" ||
        selected === input.projectWorktree() ||
        (restoration.workspaces ?? input.workspaces()).some((worktree) => pathKey(worktree) === pathKey(selected ?? ""))
      )
        return selected
    },
    set: (worktree: string) => {
      const selected = normalizeNewSessionWorktree(worktree, input.directory(), input.projectWorktree())
      const valid =
        selected === "main" ||
        selected === "create" ||
        selected === input.projectWorktree() ||
        input.workspaces().some((worktree) => pathKey(worktree) === pathKey(selected ?? ""))
      setRestoration({ picked: valid ? selected : undefined, workspaces: undefined, ready: valid })
      input.update(selected)
    },
    reset: () => input.update(undefined),
    ready,
  }
}

export function createNewSessionWorkspaceController() {
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const serverSDK = useServerSDK()
  const [workspaces, , , workspacesReady] = persistedWorkspaces(serverSDK().scope)
  const tabs = useTabs()
  const [search] = useSearchParams<{ draftId?: string }>()
  const draft = () => tabs.store.find((tab): tab is DraftTab => tab.type === "draft" && tab.draftID === search.draftId)
  const selection = createNewSessionDraftWorkspace({
    draft,
    update: (worktree) => {
      if (search.draftId) tabs.updateDraft(search.draftId, { worktree })
    },
    directory: () => sdk().directory,
    projectWorktree: () => sync().project?.worktree,
    workspaces: () => sync().project?.sandboxes ?? [],
    ready: workspacesReady,
    loadWorkspaces: async () => {
      await serverSDK().ready
      const project = sync().project ?? repositoryProject(await serverSDK().api.project.list(), sdk().directory)
      if (!project) return []
      return [project.worktree, ...(await serverSDK().api.project.directories({ projectID: project.id })).map((entry) => entry.directory)]
    },
  })
  const visible = createMemo(() => workspaceBarEnabled && sync().project?.vcs === "git")
  const projectRoot = createMemo(() => sync().project?.worktree ?? sdk().directory)
  // Release channels hide the picker; placement still follows the draft and verified profile preference.
  const value = createMemo(() =>
    resolveNewSessionWorktree({
      selected: selection.value(),
      directory: sdk().directory,
      projectWorktree: sync().project?.worktree,
      preferred:
        draft()?.worktree && !selection.value()
          ? undefined
          : preferredSandbox({
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
      reset: selection.reset,
      set: selection.set,
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
    ready: selection.ready,
  }
}

export type NewSessionWorkspaceController = ReturnType<typeof createNewSessionWorkspaceController>
