export * as WorktreeReading from "./worktree-reading"

import type { Orchestra } from "@orchestra/client"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Schema } from "effect"
import { createStore, reconcile } from "solid-js/store"

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

export function make(input: {
  api: Pick<ReturnType<typeof Orchestra.make>["activity"], "worktrees" | "readWorktree">
  now?: () => number
  report?: (error: unknown) => void
}): Controller {
  const clock = input.now ?? (() => performance.now())
  const report = input.report ?? ((error: unknown) => console.error("[activity] worktree reading failed", error))
  const decode = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)
  const [state, setState] = createStore({
    snapshot: undefined as ActivityMonitor.WorktreeSnapshot | undefined,
    receivedAt: undefined as number | undefined,
    now: clock(),
    inventory: { busy: false, failed: false },
    reads: {} as Record<string, { busy: boolean; failed: boolean }>,
  })
  type Flight = {
    readonly epoch: number
    readonly controller: AbortController
    readonly revision: string | undefined
    readonly promise: Promise<void>
  }
  const pending = {
    epoch: 0,
    disposed: false,
    inventory: undefined as Flight | undefined,
    reads: new Map<string, Flight>(),
    controllers: new Set<AbortController>(),
  }

  function owns(flight: Flight, recordID: string | undefined) {
    return (
      !pending.disposed &&
      flight.epoch === pending.epoch &&
      (recordID === undefined ? pending.inventory === flight : pending.reads.get(recordID) === flight)
    )
  }

  function pruneReads() {
    const members = new Set(state.snapshot?.records.map((record) => record.recordID))
    setState(
      "reads",
      reconcile(
        Object.fromEntries(
          Object.entries(state.reads).filter(([recordID]) => members.has(recordID) || pending.reads.has(recordID)),
        ),
      ),
    )
  }

  function retire() {
    pending.epoch++
    pending.controllers.forEach((controller) => controller.abort())
    pending.controllers.clear()
    pending.inventory = undefined
    pending.reads.clear()
    setState({ snapshot: undefined, receivedAt: undefined, inventory: { busy: false, failed: false } })
    setState("reads", reconcile({}))
  }

  async function execute(flight: Flight, recordID: string | undefined) {
    try {
      if (!owns(flight, recordID)) return
      const response = await (recordID === undefined
        ? input.api.worktrees({ signal: flight.controller.signal })
        : input.api.readWorktree({ recordID }, { signal: flight.controller.signal }))
      if (!owns(flight, recordID)) return
      const snapshot = decode(response)
      if (state.snapshot && state.snapshot.instanceID !== snapshot.instanceID) {
        // A mismatched payload only retires the context; the fresh GET establishes its replacement.
        retire()
        await refresh()
        return
      }
      if (state.snapshot && BigInt(snapshot.snapshotRevision) <= BigInt(state.snapshot.snapshotRevision)) return
      const receivedAt = clock()
      setState((current) => ({
        snapshot:
          current.snapshot?.instanceID === snapshot.instanceID
            ? reconcile(snapshot, { key: "recordID" })(current.snapshot)
            : snapshot,
        receivedAt,
        now: Math.max(current.now, receivedAt),
      }))
      pruneReads()
    } catch (error) {
      if (!owns(flight, recordID)) return
      // Inventory errors are obsolete once another operation has admitted newer full facts.
      if (recordID === undefined && flight.revision !== state.snapshot?.snapshotRevision) return
      if (recordID === undefined) setState("inventory", "failed", true)
      if (recordID !== undefined) setState("reads", recordID, "failed", true)
      report(error)
    } finally {
      if (owns(flight, recordID)) {
        pending.controllers.delete(flight.controller)
        if (recordID === undefined) {
          pending.inventory = undefined
          setState("inventory", "busy", false)
        }
        if (recordID !== undefined) {
          pending.reads.delete(recordID)
          setState("reads", recordID, "busy", false)
          pruneReads()
        }
      }
    }
  }

  function start(recordID: string | undefined) {
    const flight: Flight = {
      epoch: pending.epoch,
      controller: new AbortController(),
      revision: state.snapshot?.snapshotRevision,
      // The microtask starts only after ownership and status have been installed.
      promise: Promise.resolve().then(() => execute(flight, recordID)),
    }
    pending.controllers.add(flight.controller)
    if (recordID === undefined) {
      pending.inventory = flight
      setState("inventory", { busy: true, failed: false })
    }
    if (recordID !== undefined) {
      pending.reads.set(recordID, flight)
      setState("reads", recordID, { busy: true, failed: false })
    }
    return flight.promise
  }

  function refresh() {
    if (pending.disposed) return Promise.resolve()
    return pending.inventory?.promise ?? start(undefined)
  }

  return {
    state,
    refresh,
    read(recordID) {
      if (pending.disposed) return Promise.resolve()
      const active = pending.reads.get(recordID)
      if (active) return active.promise
      if (!state.snapshot?.records.some((record) => record.recordID === recordID)) return Promise.resolve()
      return start(recordID)
    },
    tick() {
      if (!pending.disposed) setState("now", Math.max(state.now, clock()))
    },
    dispose() {
      if (pending.disposed) return
      pending.disposed = true
      pending.epoch++
      pending.controllers.forEach((controller) => controller.abort())
      pending.controllers.clear()
      pending.inventory = undefined
      pending.reads.clear()
    },
  }
}

export function matching(
  rows: readonly ActivityMonitor.WorktreeRecord[],
  query: string,
): readonly ActivityMonitor.WorktreeRecord[] {
  const needle = query.trim().toLowerCase()
  return rows.filter(
    (row) => row.directory.toLowerCase().includes(needle) || row.projectID.toLowerCase().includes(needle),
  )
}
