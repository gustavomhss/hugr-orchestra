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

export function repositoryWorkspaces(project: { worktree: string; sandboxes?: readonly string[] }) {
  return [project.worktree, ...(project.sandboxes ?? [])]
    .filter(
      (directory, index, directories) =>
        directories.findIndex((item) => pathKey(item) === pathKey(directory)) === index,
    )
    .map((directory, index) => ({
      directory,
      folder: pathKey(directory).split("/").filter(Boolean).at(-1) ?? directory,
      root: index === 0,
    }))
}

// A stored choice counts only while it still names one of this repository's workspaces; otherwise the root is active.
export function activeWorkspace(workspaces: readonly { directory: string }[], stored?: string) {
  const key = stored === undefined ? undefined : pathKey(stored)
  return (workspaces.find((workspace) => pathKey(workspace.directory) === key) ?? workspaces[0])?.directory
}

// New drafts may only default to a sandbox the project still reports, spelled exactly as the project lists it.
export function preferredSandbox(sandboxes: readonly string[], stored?: string) {
  if (stored === undefined) return
  const key = pathKey(stored)
  return sandboxes.find((sandbox) => pathKey(sandbox) === key)
}

// V1 lists git worktrees the server can remove; V2 can remove only directories it created with a copy strategy.
export function removableWorkspaces(
  protocol: "v1" | "v2",
  directories: readonly { directory: string; strategy?: string }[],
) {
  return directories
    .filter((item) => protocol === "v1" || item.strategy !== undefined)
    .map((item): string => pathKey(item.directory))
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

export function workspaceFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : error
  const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
  return status === 404 || status === 405 || status === 501 ? "unavailable" : "error"
}
