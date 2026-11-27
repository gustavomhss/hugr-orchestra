export * as ActivityMonitor from "./activity-monitor"

import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { Child } from "./omni"
import type { ProcessProvenance } from "./process-provenance"
import { ActivityCPU } from "./activity-cpu"

const FINISHED_KEPT = 32
type Entry = {
  child: WeakRef<Child>
  record: ActivityMonitor.Record
  closed: boolean
  rootSettled: boolean
  sampling?: Promise<void>
}

/** An observer never owns a child or changes its I/O, stop policy, adoption or lifetime. */
export function make() {
  const entries = new Map<string, Entry>()
  const cpu = ActivityCPU.make()
  const status = { instanceID: crypto.randomUUID(), retired: 0 }

  const retire = () => {
    const closed = [...entries.values()].filter((entry) => entry.closed)
    closed.slice(0, Math.max(0, closed.length - FINISHED_KEPT)).forEach((entry) => {
      entries.delete(entry.record.recordID)
      collected.unregister(entry)
      status.retired++
    })
  }

  // Collection means the observation handle is unavailable, never proof that the native tree exited.
  // Retire such metadata even when no Monitor window is open; the observer must not accumulate dead handles.
  const collected = new FinalizationRegistry<Entry>((entry) => {
    if (entry.record.state !== "gone") entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
    entry.closed = true
    retire()
  })

  const sample = (entry: Entry): Promise<void> => {
    if (entry.sampling) return entry.sampling
    const child = entry.child.deref()
    if (!child) {
      // Losing an observation handle does not prove the tree exited.
      entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
      entry.closed = true
      return Promise.resolve()
    }
    entry.sampling = child
      .processes()
      .then(
        (members) => {
          entry.record = {
            ...entry.record,
            state: members.length ? "alive" : "gone",
            inspectionFailed: false,
            source: "omni.processes",
            sampledAt: Date.now(),
            members,
          }
          entry.closed = members.length === 0
        },
        () => {
          // Inspection failure is unknown; preserve the last measured members and their timestamp.
          entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
          entry.closed = entry.rootSettled
        },
      )
      .finally(() => {
        entry.sampling = undefined
      })
    return entry.sampling
  }

  return {
    observe(child: Child, executable: string, owner: string, provenance?: ProcessProvenance.Info) {
      // An older installed addon has no getter. Absence never becomes a PID or an observation UUID.
      const supervisorID = child.treeId
      const entry: Entry = {
        child: new WeakRef(child),
        record: {
          recordID: crypto.randomUUID(),
          ...(typeof supervisorID === "string" && supervisorID.length > 0 ? { supervisorID } : {}),
          pid: child.pid,
          executable: executable.split(/[/\\]/).at(-1) ?? executable,
          ...(provenance
            ? {
                sessionID: provenance.sessionID,
                agentID: provenance.agentID,
                tool: provenance.tool,
                callID: provenance.callID,
              }
            : {}),
          owner,
          startedAt: Date.now(),
          state: "alive",
          inspectionFailed: false,
        },
        closed: false,
        rootSettled: false,
      }
      entries.set(entry.record.recordID, entry)
      collected.register(child, entry, entry)
      // Root exit is not tree exit. Membership remains an explicitly requested reading.
      const rootExited = () => {
        entry.rootSettled = true
        if (entry.record.state !== "gone") entry.record = { ...entry.record, state: "unknown" }
      }
      void child.wait().then(rootExited, rootExited)
      return entry.record.recordID
    },
    async inspect(recordID: string) {
      const entry = entries.get(recordID)
      if (!entry) return false
      if (entry.closed && entry.record.state === "gone") return true
      // Only explicit inspection asks the native supervisor for membership. On Unix that API scans the OS table.
      const pending = sample(entry)
      const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined }
      await Promise.race([
        pending,
        new Promise<void>((resolve) => {
          timer.id = setTimeout(() => {
            if (entry.sampling) entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
            resolve()
          }, 2000)
        }),
      ]).finally(() => clearTimeout(timer.id))
      retire()
      return true
    },
    async snapshot(): Promise<ActivityMonitor.Snapshot> {
      // A paint/refresh reads only the ledger and logical-CPU counters; it never enumerates OS processes.
      entries.forEach((entry) => {
        if (!entry.closed && !entry.child.deref()) {
          entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
          entry.closed = true
        }
      })
      retire()
      const reading = cpu()
      return structuredClone({
        instanceID: status.instanceID,
        ...(reading ? { cpu: reading } : {}),
        readAt: Date.now(),
        source: "orchestra.omni.ledger" as const,
        coverage: "server-pipe-spawns" as const,
        retired: status.retired,
        records: [...entries.values()].map((entry) => entry.record),
      })
    },
  }
}

const monitor = make()
export const observe = monitor.observe
export const snapshot = monitor.snapshot
export const inspect = monitor.inspect
