export * as ActivityWorktreeState from "./activity-worktree-state"

import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { ActivityWorktree } from "./activity-worktree"

export interface State {
  readonly snapshot: () => ActivityMonitor.WorktreeSnapshot
  readonly reconcile: (rows: ReadonlyArray<ActivityWorktree.Registration>) => void
  readonly get: (recordID: string) => ActivityMonitor.WorktreeRecord | undefined
  readonly publish: (record: ActivityMonitor.WorktreeRecord, attempt: ActivityMonitor.DiskAttempt) => boolean
}

export function make(): State {
  const instanceID = crypto.randomUUID()
  const state: {
    revision: bigint
    inventoryAt?: number
    records: Map<string, ActivityMonitor.WorktreeRecord>
  } = { revision: 0n, records: new Map() }

  return {
    snapshot: () => ({
      instanceID,
      snapshotRevision: String(state.revision),
      readAt: Date.now(),
      ...(state.inventoryAt === undefined ? {} : { inventoryAt: state.inventoryAt }),
      source: "node.fs.lstat",
      coverage: "registered-git-worktrees",
      records: structuredClone([...state.records.values()]),
    }),
    reconcile(rows) {
      const registrations = new Map<string, ActivityWorktree.Registration>()
      rows.forEach((row) => {
        if (!row.projectID || !row.directory || !row.registrationID)
          throw new Error("Worktree registration identity is unavailable")
        const key = JSON.stringify([row.projectID, row.directory])
        const previous = registrations.get(key)
        if (previous && (previous.registrationID !== row.registrationID || previous.strategy !== row.strategy))
          throw new Error("Conflicting worktree registration identities")
        registrations.set(key, row)
      })
      const previous = new Map(
        [...state.records.values()].map((record) => [
          JSON.stringify([record.projectID, record.directory, record.registrationID]),
          record,
        ]),
      )
      // Stage the whole source before committing; invalid data cannot retire valid readings.
      const records = [...registrations.values()]
        .filter((row) => row.strategy === "git_worktree")
        .map(
          (row): ActivityMonitor.WorktreeRecord =>
            previous.get(JSON.stringify([row.projectID, row.directory, row.registrationID])) ?? {
              recordID: crypto.randomUUID(),
              projectID: row.projectID,
              registrationID: row.registrationID,
              directory: row.directory,
              owner: "",
            },
        )
      state.records = new Map(records.map((record) => [record.recordID, record]))
      state.inventoryAt = Date.now()
      state.revision++
    },
    get: (recordID) => state.records.get(recordID),
    publish(record, attempt) {
      // A walk holds the exact prevalidated object; retired incarnations cannot publish.
      if (state.records.get(record.recordID) !== record) return false
      state.records.set(record.recordID, {
        ...record,
        attempt: structuredClone(attempt),
        ...(attempt.state === "complete"
          ? { logical: { bytes: attempt.observedBytes, sampledAt: attempt.sampledAt } }
          : {}),
      })
      state.revision++
      return true
    },
  }
}
