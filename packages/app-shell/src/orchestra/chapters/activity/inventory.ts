import type { ServerApi } from "@/server-api"
import { pathKey } from "@/utils/path-key"

export type WorktreeRecord = {
  directory: string
  project: string
  owner: ""
  sampledAt: number
}

// A directory registry is evidence of registration, never of disk usage, idleness or session ownership.
export function registeredWorktrees(
  project: { name?: string; worktree: string },
  directories: readonly { directory: string; strategy?: string }[],
  sampledAt: number,
): WorktreeRecord[] {
  return directories
    .filter((entry) => entry.strategy === "git_worktree")
    .filter(
      (entry, index, entries) =>
        entries.findIndex((item) => pathKey(item.directory) === pathKey(entry.directory)) === index,
    )
    .map((entry) => ({ directory: entry.directory, project: project.name ?? project.worktree, owner: "", sampledAt }))
}

export function matchingWorktrees(rows: readonly WorktreeRecord[], query: string) {
  const needle = query.trim().toLowerCase()
  return rows.filter((row) => `${row.directory}\n${row.project}`.toLowerCase().includes(needle))
}

export async function readWorktrees(api: ServerApi["project"], signal: AbortSignal) {
  const projects = (await api.list({ signal })).filter((project) => project.vcs === "git")
  const rows: WorktreeRecord[] = []
  // Bound registry fanout. No refresh mutates the registry or walks the filesystem.
  for (let offset = 0; offset < projects.length; offset += 4) {
    signal.throwIfAborted()
    const batch = await Promise.all(
      projects
        .slice(offset, offset + 4)
        .map(async (project) =>
          registeredWorktrees(project, await api.directories({ projectID: project.id }, { signal }), Date.now()),
        ),
    )
    rows.push(...batch.flat())
  }
  // Publish atomically: a failed project read cannot turn a partial inventory into an empty server.
  return rows
}
