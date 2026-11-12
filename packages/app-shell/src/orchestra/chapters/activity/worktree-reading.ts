export * as WorktreeReading from "./worktree-reading"

import type { Orchestra } from "@orchestra/client"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"

export interface Status {
  readonly busy: boolean
  readonly failed: boolean
}

export interface State {
  readonly snapshot: ActivityMonitor.WorktreeSnapshot | undefined
  readonly receivedAt: number | undefined
  readonly now: number
  readonly inventory: Status
  readonly reads: Readonly<Record<string, Status>>
}

export interface Controller {
  readonly state: State
  readonly refresh: () => Promise<void>
  readonly read: (recordID: string) => Promise<void>
  readonly tick: () => void
  readonly dispose: () => void
}

// Acceptance anchor only; the component cannot use it before W3's hosted red gate.
export function make(_input: {
  api: Pick<ReturnType<typeof Orchestra.make>["activity"], "worktrees" | "readWorktree">
  now?: () => number
  report?: (error: unknown) => void
}): Controller {
  throw new Error("Worktree reading request admission is not implemented")
}

export function matching(
  _rows: readonly ActivityMonitor.WorktreeRecord[],
  _query: string,
): readonly ActivityMonitor.WorktreeRecord[] {
  throw new Error("Worktree reading filtering is not implemented")
}
