export * as ActivityWorktree from "./activity-worktree"

import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { ProjectDirectories } from "./project/directories"
import type { ActivityDisk } from "./activity-disk"

export interface Registration extends ProjectDirectories.Registration {
  readonly projectID: string
}

export interface Source {
  readonly registrations: () => Promise<ReadonlyArray<Registration>>
  readonly measure?: typeof ActivityDisk.measure
}

export interface Monitor {
  readonly snapshot: () => ActivityMonitor.WorktreeSnapshot
  readonly inventory: () => Promise<ActivityMonitor.WorktreeSnapshot>
  readonly read: (recordID: string) => Promise<ActivityMonitor.WorktreeSnapshot | undefined>
}

export class ReadCapacityError extends Error {
  constructor() {
    super("The four worktree reading slots are occupied")
    this.name = "ActivityWorktreeReadCapacityError"
  }
}

// Compilable unavailable anchor for the hosted failing acceptance baseline.
export function make(_source: Source): Monitor {
  throw new Error("Worktree disk collection is not implemented")
}
