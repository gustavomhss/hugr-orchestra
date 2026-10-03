import { pathKey } from "@/utils/path-key"

export function repositoryWorkspaces(
  projects: readonly { worktree: string; sandboxes?: readonly string[] }[],
  directory: string,
) {
  const key = pathKey(directory)
  const project = projects.find(
    (project) => pathKey(project.worktree) === key || project.sandboxes?.some((sandbox) => pathKey(sandbox) === key),
  )
  if (!project) return []
  return [project.worktree, ...(project.sandboxes ?? [])]
    .filter(
      (directory, index, directories) =>
        directories.findIndex((item) => pathKey(item) === pathKey(directory)) === index,
    )
    .map((directory, index) => ({
      directory,
      name: pathKey(directory).split("/").filter(Boolean).at(-1) ?? directory,
      root: index === 0,
      selected: pathKey(directory) === key,
    }))
}

export function workspaceFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : error
  const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
  return status === 404 || status === 405 || status === 501 ? "unavailable" : "error"
}
