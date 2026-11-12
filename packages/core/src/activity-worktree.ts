export * as ActivityWorktree from "./activity-worktree"

import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { ProjectDirectories } from "./project/directories"
import { ActivityDisk } from "./activity-disk"
import { ActivityWorktreeState } from "./activity-worktree-state"

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

export function make(source: Source): Monitor {
  const state = ActivityWorktreeState.make()
  const inFlight = new Map<string, Promise<ActivityMonitor.WorktreeSnapshot | undefined>>()
  let tail = Promise.resolve()
  let inventoryFlight: Promise<ActivityMonitor.WorktreeSnapshot> | undefined

  function serial<A>(task: () => Promise<A>) {
    const result = tail.then(task)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async function refresh() {
    state.reconcile(await source.registrations())
  }

  return {
    snapshot: state.snapshot,
    inventory() {
      if (inventoryFlight) return inventoryFlight
      inventoryFlight = serial(async () => {
        await refresh()
        return state.snapshot()
      }).finally(() => {
        inventoryFlight = undefined
      })
      return inventoryFlight
    },
    read(recordID) {
      const active = inFlight.get(recordID)
      if (active) return active
      if (!state.get(recordID)) return Promise.resolve(undefined)
      if (inFlight.size >= 4) return Promise.reject(new ReadCapacityError())
      const request = serial(async () => {
        await refresh()
        return state.get(recordID)
      })
        .then(async (record) => {
          if (!record) return undefined
          const attempt = await (source.measure ?? ActivityDisk.measure)(record.directory)
          return serial(async () => {
            await refresh()
            return state.publish(record, attempt) ? state.snapshot() : undefined
          })
        })
        .finally(() => {
          inFlight.delete(recordID)
        })
      inFlight.set(recordID, request)
      return request
    },
  }
}
