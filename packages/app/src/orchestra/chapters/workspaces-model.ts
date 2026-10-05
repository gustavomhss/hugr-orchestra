import { pathKey } from "@/utils/path-key"

export const WORKTREE_STRATEGY = "git_worktree"

// The profile directory may be the repository root or one of its sandboxes; nested paths do not match.
export function repositoryProject<T extends { worktree: string; sandboxes?: readonly string[] }>(
  projects: readonly T[],
  directory: string,
) {
  const key = pathKey(directory)
  return projects.find(
    (project) => pathKey(project.worktree) === key || project.sandboxes?.some((sandbox) => pathKey(sandbox) === key),
  )
}

type Entry = { directory: string; strategy?: string }

// V1 reports a project's sandboxes (every directory it opened for the repository). V2 records workspaces in the
// project's directory table instead, including the copies it creates, so pass `directories` on V2 and omit it on V1.
export function repositoryWorkspaces(
  project: { id: string; worktree: string; sandboxes?: readonly string[] },
  directories?: readonly Entry[],
) {
  const entries = [
    { directory: project.worktree },
    ...(directories ?? (project.sandboxes ?? []).map((directory) => ({ directory }))),
  ]
  return entries
    .filter(
      (entry, index) => entries.findIndex((item) => pathKey(item.directory) === pathKey(entry.directory)) === index,
    )
    .map((entry, index) => ({
      directory: entry.directory,
      folder: pathKey(entry.directory).split("/").filter(Boolean).at(-1) ?? entry.directory,
      root: index === 0,
      removable:
        index > 0 &&
        (directories ? "strategy" in entry && !!entry.strategy : serverWorktree(project.id, entry.directory)),
    }))
}

// V1 creates worktrees only at `<data>/worktree/<projectID>/<name>` (opencode `Worktree.makeWorktreeInfo`). Its remove
// deletes any other directory outright when git does not list it, so nothing outside that folder is offered.
function serverWorktree(projectID: string, directory: string) {
  const parts = pathKey(directory).split("/")
  return parts.length > 3 && parts.at(-3) === "worktree" && parts.at(-2) === projectID
}

// A stored choice counts only while it still names one of this repository's workspaces; otherwise the root is active.
export function activeWorkspace(workspaces: readonly { directory: string }[], stored?: string) {
  const key = stored === undefined ? undefined : pathKey(stored)
  return (workspaces.find((workspace) => pathKey(workspace.directory) === key) ?? workspaces[0])?.directory
}

// A root draft's default workspace: unknown until the saved choice has loaded, and only while the server still lists
// it, as a V1 sandbox or a copy the Workspaces screen last listed. The project's own spelling wins.
export function preferredSandbox(input: {
  ready: boolean
  sandboxes: readonly string[]
  known?: readonly string[]
  stored?: string
}) {
  if (!input.ready || input.stored === undefined) return
  const key = pathKey(input.stored)
  return [...input.sandboxes, ...(input.known ?? [])].find((sandbox) => pathKey(sandbox) === key)
}

// V2 creates a copy named `name` inside `parent`; both must be non-empty.
export function copyTarget(parent: string, name: string) {
  const directory = parent.trim().replace(/[\\/]+$/, "")
  const leaf = name.trim()
  if (!directory || !leaf || /[\\/]/.test(leaf)) return
  return { directory, name: leaf }
}

export function defaultCopyParent(root: string) {
  const trimmed = root.replace(/[\\/]+$/, "")
  return `${trimmed}-workspaces`
}

export function homeRelative(directory: string, home?: string) {
  if (!home) return directory
  const base = home.replace(/[\\/]+$/, "")
  if (directory === base) return "~"
  if (!directory.startsWith(base) || !/[\\/]/.test(directory.charAt(base.length))) return directory
  return `~${directory.slice(base.length)}`
}

// V2 refuses to remove a copy with uncommitted changes unless the request is forced.
export function forceRequired(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false
  const data = error.data
  return !!data && typeof data === "object" && "forceRequired" in data && data.forceRequired === true
}

export function workspaceFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : error
  const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
  return status === 404 || status === 405 || status === 501 ? "unavailable" : "error"
}
