export * as ActivityWorktreeState from "./activity-worktree-state"

import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { ActivityWorktree } from "./activity-worktree"

export interface State {
  readonly snapshot: () => ActivityMonitor.WorktreeSnapshot
  readonly reconcile: (rows: ReadonlyArray<ActivityWorktree.Registration>) => void
  readonly get: (recordID: string) => ActivityMonitor.WorktreeRecord | undefined
  readonly publish: (record: ActivityMonitor.WorktreeRecord, attempt: ActivityMonitor.DiskAttempt) => boolean
}

// Pure state and async coordination are separate bounded implementation tasks.
export function make(): State {
  throw new Error("Worktree reading state is not implemented")
}
